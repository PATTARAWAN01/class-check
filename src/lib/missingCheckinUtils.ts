import type {
  AttendanceRecord,
  Classroom,
  PeriodSetting,
  SchoolHoliday,
  TimetableEntry,
} from "@/types";
import { getSpecialNonCheckedPeriodInfo } from "@/lib/attendanceUtils";
import { getThaiDateString, formatThaiDateShort } from "@/lib/dateUtils";

export interface MissingPeriodDetail {
  period: number;
  subjectCode: string;
  subjectName: string;
  teacherName: string;
  roomLocation?: string;
}

export interface RoomDailyMissingStatus {
  classroom: Classroom;
  expectedCount: number;
  checkedCount: number;
  missingPeriods: MissingPeriodDetail[];
  isComplete: boolean;
}

export interface DailyMissingSummary {
  date: string;
  dayOfWeek: number;
  isWeekend: boolean;
  fullDayHoliday: SchoolHoliday | null;
  partialHolidays: SchoolHoliday[];
  rooms: RoomDailyMissingStatus[];
  completeRooms: number;
  incompleteRooms: number;
  totalMissingPeriods: number;
}

export interface RoomMissingDayGroup {
  date: string;
  dayOfWeek: number;
  missingPeriods: MissingPeriodDetail[];
}

export function getThaiCurrentHHMM(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value || "00";
  const m = parts.find((p) => p.type === "minute")?.value || "00";
  return `${h}:${m}`;
}

export function getDayOfWeekThai(dateStr: string): number {
  if (!dateStr) return 1;
  return new Date(`${dateStr}T12:00:00+07:00`).getDay();
}

export function isDateFullHoliday(
  holidays: SchoolHoliday[],
  dateStr: string
): SchoolHoliday | null {
  return holidays.find((h) => h.date === dateStr && h.scope === "all_day") || null;
}

export function getHolidayForDatePeriod(
  holidays: SchoolHoliday[],
  dateStr: string,
  period?: number
): SchoolHoliday | null {
  const full = isDateFullHoliday(holidays, dateStr);
  if (full) return full;
  if (typeof period === "number") {
    return (
      holidays.find(
        (h) =>
          h.date === dateStr &&
          h.scope === "periods" &&
          Array.isArray(h.periods) &&
          h.periods.includes(period)
      ) || null
    );
  }
  return null;
}

function parseRoomOrder(gradeRoom: string): number {
  const m = (gradeRoom || "").match(/(\d+)\/(\d+)/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 9999;
}

/**
 * Returns the periods that REQUIRE check-in for a specific classroom on a specific date.
 * Automatically excludes weekends, holidays/cancelled periods, special activity periods,
 * free periods, and (for today) periods whose startTime has not arrived yet.
 */
export function getExpectedPeriodsForRoomOnDate(params: {
  classroom: Classroom;
  dateStr: string;
  timetable: TimetableEntry[];
  holidays: SchoolHoliday[];
  periods: PeriodSetting[];
  onlyElapsedToday?: boolean;
  todayStr?: string;
  currentHHMM?: string;
}): MissingPeriodDetail[] {
  const {
    classroom,
    dateStr,
    timetable,
    holidays,
    periods,
    onlyElapsedToday = true,
  } = params;

  const dayOfWeek = getDayOfWeekThai(dateStr);
  if (dayOfWeek === 0 || dayOfWeek === 6) return [];
  if (isDateFullHoliday(holidays, dateStr)) return [];

  const todayStr = params.todayStr || getThaiDateString();
  const isToday = dateStr === todayStr;
  const currentHHMM = params.currentHHMM || getThaiCurrentHHMM();

  const roomTT = timetable.filter(
    (tt) =>
      tt.dayOfWeek === dayOfWeek &&
      (tt.classroomId === classroom.id || tt.gradeRoom === classroom.gradeRoom)
  );

  // Check periods 1..7 (and 8 only if explicitly scheduled in timetable)
  const hasPeriod8 = roomTT.some((tt) => tt.periodEnd >= 8);
  const maxPeriod = hasPeriod8 ? 8 : 7;

  const expected: MissingPeriodDetail[] = [];

  for (let p = 1; p <= maxPeriod; p++) {
    // Skip cancelled period holiday
    if (getHolidayForDatePeriod(holidays, dateStr, p)) continue;

    // For today, only check periods that have already started
    if (isToday && onlyElapsedToday) {
      const pSetting = periods.find((ps) => ps.periodNumber === p);
      if (pSetting?.startTime && currentHHMM < pSetting.startTime) {
        continue;
      }
    }

    const ttEntry = roomTT.find((tt) => p >= tt.periodStart && p <= tt.periodEnd);
    const special = getSpecialNonCheckedPeriodInfo(
      classroom.id,
      classroom.gradeRoom,
      dayOfWeek,
      p,
      ttEntry,
      true
    );
    if (special?.isExcluded) continue;
    if (!ttEntry) continue;

    expected.push({
      period: p,
      subjectCode: ttEntry.subjectCode,
      subjectName: ttEntry.subjectName,
      teacherName: ttEntry.teacherName,
      roomLocation: ttEntry.roomLocation,
    });
  }

  return expected;
}

function isPeriodChecked(
  roomLogsOnDate: AttendanceRecord[],
  period: number
): boolean {
  return roomLogsOnDate.some((r) => {
    const pStart = r.periodStart || 1;
    const pEnd = r.periodEnd || pStart;
    return period >= pStart && period <= pEnd;
  });
}

/**
 * Computes daily missing check-in summary across all classrooms for Admin Monitor.
 */
export function computeDailyMissingSummary(params: {
  dateStr: string;
  classrooms: Classroom[];
  timetable: TimetableEntry[];
  attendanceLogs: AttendanceRecord[];
  holidays: SchoolHoliday[];
  periods: PeriodSetting[];
  onlyElapsedToday?: boolean;
}): DailyMissingSummary {
  const {
    dateStr,
    classrooms,
    timetable,
    attendanceLogs,
    holidays,
    periods,
    onlyElapsedToday = true,
  } = params;

  const dayOfWeek = getDayOfWeekThai(dateStr);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const fullDayHoliday = isDateFullHoliday(holidays, dateStr);
  const partialHolidays = holidays.filter(
    (h) => h.date === dateStr && h.scope === "periods"
  );

  const sortedRooms = [...classrooms].sort(
    (a, b) => parseRoomOrder(a.gradeRoom) - parseRoomOrder(b.gradeRoom)
  );

  if (isWeekend || fullDayHoliday) {
    return {
      date: dateStr,
      dayOfWeek,
      isWeekend,
      fullDayHoliday,
      partialHolidays,
      rooms: [],
      completeRooms: 0,
      incompleteRooms: 0,
      totalMissingPeriods: 0,
    };
  }

  const todayStr = getThaiDateString();
  const currentHHMM = getThaiCurrentHHMM();
  const dateLogs = attendanceLogs.filter((r) => r.date === dateStr);

  const rooms: RoomDailyMissingStatus[] = [];
  let completeRooms = 0;
  let incompleteRooms = 0;
  let totalMissingPeriods = 0;

  for (const classroom of sortedRooms) {
    const expected = getExpectedPeriodsForRoomOnDate({
      classroom,
      dateStr,
      timetable,
      holidays,
      periods,
      onlyElapsedToday,
      todayStr,
      currentHHMM,
    });

    const roomDateLogs = dateLogs.filter(
      (r) => r.classroomId === classroom.id || r.gradeRoom === classroom.gradeRoom
    );

    const missingPeriods = expected.filter(
      (exp) => !isPeriodChecked(roomDateLogs, exp.period)
    );
    const checkedCount = expected.length - missingPeriods.length;
    const isComplete = missingPeriods.length === 0;

    if (expected.length > 0) {
      if (isComplete) completeRooms += 1;
      else incompleteRooms += 1;
    }
    totalMissingPeriods += missingPeriods.length;

    rooms.push({
      classroom,
      expectedCount: expected.length,
      checkedCount,
      missingPeriods,
      isComplete,
    });
  }

  return {
    date: dateStr,
    dayOfWeek,
    isWeekend,
    fullDayHoliday,
    partialHolidays,
    rooms,
    completeRooms,
    incompleteRooms,
    totalMissingPeriods,
  };
}

/**
 * Computes missing check-in days for a SINGLE classroom from trackingStartDate up to today.
 * Used for the Student Login Popup on /check.
 */
export function computeRoomMissingHistory(params: {
  classroom: Classroom;
  timetable: TimetableEntry[];
  roomLogs: AttendanceRecord[];
  holidays: SchoolHoliday[];
  periods: PeriodSetting[];
  trackingStartDate?: string;
}): { days: RoomMissingDayGroup[]; totalMissingPeriods: number; effectiveStartDate: string } {
  const { classroom, timetable, roomLogs, holidays, periods, trackingStartDate } = params;
  const todayStr = getThaiDateString();
  const currentHHMM = getThaiCurrentHHMM();

  // Determine effective start date: explicit Admin setting, or earliest log date, or 7 days ago
  let startStr = trackingStartDate || "";
  if (!startStr) {
    const validDates = roomLogs
      .map((r) => r.date)
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (validDates.length > 0) {
      startStr = validDates[0];
    } else {
      const d = new Date(`${todayStr}T12:00:00+07:00`);
      d.setDate(d.getDate() - 7);
      startStr = d.toISOString().slice(0, 10);
    }
  }

  // Clamp to at most 120 calendar days to stay fast even at end of semester
  const startDateObj = new Date(`${startStr}T12:00:00+07:00`);
  const todayObj = new Date(`${todayStr}T12:00:00+07:00`);
  const minAllowed = new Date(todayObj);
  minAllowed.setDate(minAllowed.getDate() - 120);
  const iterStart = startDateObj < minAllowed ? minAllowed : startDateObj;

  if (iterStart > todayObj) {
    return { days: [], totalMissingPeriods: 0, effectiveStartDate: startStr };
  }

  // Group roomLogs by date for O(1) lookup
  const logsByDate = new Map<string, AttendanceRecord[]>();
  for (const log of roomLogs) {
    if (!logsByDate.has(log.date)) logsByDate.set(log.date, []);
    logsByDate.get(log.date)!.push(log);
  }

  const days: RoomMissingDayGroup[] = [];
  let totalMissingPeriods = 0;

  const cursor = new Date(todayObj);
  while (cursor >= iterStart) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${dd}`;

    const dayOfWeek = cursor.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5 && !isDateFullHoliday(holidays, dateStr)) {
      const expected = getExpectedPeriodsForRoomOnDate({
        classroom,
        dateStr,
        timetable,
        holidays,
        periods,
        onlyElapsedToday: true,
        todayStr,
        currentHHMM,
      });

      if (expected.length > 0) {
        const logsOnDay = logsByDate.get(dateStr) || [];
        const missingPeriods = expected.filter(
          (exp) => !isPeriodChecked(logsOnDay, exp.period)
        );
        if (missingPeriods.length > 0) {
          days.push({
            date: dateStr,
            dayOfWeek,
            missingPeriods,
          });
          totalMissingPeriods += missingPeriods.length;
        }
      }
    }

    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    days,
    totalMissingPeriods,
    effectiveStartDate: startStr,
  };
}

/**
 * Formats a clean Thai LINE notification message summarizing incomplete classrooms.
 */
export function formatMissingLineMessage(
  summary: DailyMissingSummary,
  gradeFilter: string = "all",
  schoolName: string = "โรงเรียนหนองวัวซอพิทยาคม"
): string {
  const dateLabel = formatThaiDateShort(summary.date);
  const targetRooms = summary.rooms.filter(
    (r) =>
      !r.isComplete &&
      r.expectedCount > 0 &&
      (gradeFilter === "all" || r.classroom.grade === gradeFilter)
  );

  if (targetRooms.length === 0) {
    return `✅ แจ้งผลการเช็คเข้าสอนครู ประจำวันที่ ${dateLabel}\nทุกห้องเรียน${
      gradeFilter !== "all" ? ` ระดับชั้น ${gradeFilter}` : ""
    } บันทึกครบถ้วนเรียบร้อยแล้วครับ ขอบคุณมากครับ 🙏`;
  }

  const lines: string[] = [
    `📢 แจ้งเตือนการบันทึกเช็คเข้าสอนครู (${schoolName})`,
    `📅 ประจำวันที่ ${dateLabel}${gradeFilter !== "all" ? ` • ระดับชั้น ${gradeFilter}` : ""}`,
    `⚠️ พบห้องที่ยังบันทึกไม่ครบ ${targetRooms.length} ห้อง ดังนี้:`,
    "",
  ];

  // Group by grade
  const grades = Array.from(new Set(targetRooms.map((r) => r.classroom.grade)));
  for (const g of grades) {
    const roomsInGrade = targetRooms.filter((r) => r.classroom.grade === g);
    lines.push(`▸ ระดับชั้น ${g}`);
    for (const r of roomsInGrade) {
      const pList = r.missingPeriods
        .map((mp) => `คาบ ${mp.period} (${mp.subjectCode})`)
        .join(", ");
      lines.push(`  • ห้อง ${r.classroom.gradeRoom}: ค้าง ${pList}`);
    }
    lines.push("");
  }

  lines.push("🙏 รบกวนหัวหน้าห้อง/ตัวแทนห้องช่วยเข้าไปบันทึกให้ครบด้วยนะครับ");
  return lines.join("\n").trim();
}

/**
 * Generates standard Thai public holidays for a given Gregorian year (CE)
 * so Admin can populate holidays in 1 click and edit/remove as needed.
 */
export function getPresetThaiHolidays(ceYear: number): Omit<SchoolHoliday, "createdAt">[] {
  const beYear = ceYear + 543;
  const fixed: { mmdd: string; title: string }[] = [
    { mmdd: "01-01", title: `วันขึ้นปีใหม่ (${beYear})` },
    { mmdd: "01-16", title: "วันครูแห่งชาติ" },
    { mmdd: "04-06", title: "วันจักรี" },
    { mmdd: "04-13", title: "วันสงกรานต์" },
    { mmdd: "04-14", title: "วันสงกรานต์" },
    { mmdd: "04-15", title: "วันสงกรานต์" },
    { mmdd: "05-04", title: "วันฉัตรมงคล" },
    { mmdd: "06-03", title: "วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี" },
    { mmdd: "07-28", title: "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว" },
    { mmdd: "08-12", title: "วันแม่แห่งชาติ" },
    { mmdd: "10-13", title: "วันนวมินทรมหาราช" },
    { mmdd: "10-23", title: "วันปิยมหาราช" },
    { mmdd: "12-05", title: "วันพ่อแห่งชาติ / วันชาติ" },
    { mmdd: "12-10", title: "วันรัฐธรรมนูญ" },
    { mmdd: "12-31", title: "วันสิ้นปี" },
  ];

  return fixed.map((item) => {
    const date = `${ceYear}-${item.mmdd}`;
    return {
      id: `hol_${date}_all`,
      date,
      title: item.title,
      scope: "all_day",
      note: "วันหยุดราชการไทย (เพิ่มอัตโนมัติ)",
    };
  });
}
