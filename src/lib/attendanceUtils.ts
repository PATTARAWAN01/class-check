import { AttendanceRecord, TimetableEntry } from "@/types";

export interface SpecialPeriodInfo {
  isExcluded: boolean;
  label: string; // "ชุมนุม", "ลูกเสือ", "ผู้บำเพ็ญ", "ทักษะชีวิต", "ติว O-NET", "เลือกเสรี", "ซ่อมเสริม", "คาบว่าง"
  description: string;
}

/**
 * Identifies special activity periods or free periods that DO NOT require attendance check-in.
 * 
 * Rules based on Nong Wua So Phitthayakhom Curriculum & Schedule:
 * - พุธ คาบ 6: ชุมนุม (ทุกห้อง ทุกระดับชั้น)
 * - พุธ คาบ 7: ลูกเสือ (ม.1-3) / ผู้บำเพ็ญ (ม.4-6)
 * - ศุกร์ คาบ 1: ทักษะชีวิต (ทุกระดับชั้น ยกเว้น ม.1/1, ม.2/1, ม.4/1, ม.5/1 ที่มีตารางเรียนวิชาปกติ)
 * - อังคาร คาบ 7: ติวโอเน็ต สำหรับ ม.3 ทุกห้อง
 * - ม.ต้น เลือกเสรี: ม.1 (อังคาร คาบ 6-7), ม.2 (พฤหัสฯ คาบ 6-7) เป็นคาบคู่ ไม่ต้องเช็ค
 * - ม.ปลาย ซ่อมเสริม: ม.6 (อังคาร คาบ 7, ศุกร์ คาบ 7) ไม่ต้องเช็ค
 * - คาบว่าง: คาบที่ในตารางเรียนว่างเปล่า ไม่มีการจัดวิชาเรียน
 * 
 * MANDATORY CHECKED:
 * - "แนะแนว" และ "ต้านทุจริต / ป้องกันทุจริต" ต้องเช็คเข้าสอนตามปกติ 100%
 */
export function getSpecialNonCheckedPeriodInfo(
  classroomId: string,
  gradeRoom: string,
  dayOfWeek: number, // 1 = จันทร์ ... 5 = ศุกร์
  period: number, // 1 - 7
  timetableEntry?: TimetableEntry,
  allowFreePeriodFallback: boolean = true
): SpecialPeriodInfo | null {
  const grade = gradeRoom.startsWith("ม.") ? gradeRoom.substring(0, 3) : "";

  // 1. Mandatory Checked Subjects (Never excluded!)
  if (timetableEntry) {
    const sName = timetableEntry.subjectName || "";
    const sCode = timetableEntry.subjectCode || "";
    // แนะแนว (รหัสขึ้นต้นด้วย ก) และ ต้านทุจริต/ป้องกันทุจริต ต้องเช็คเข้าสอนเสมอ
    if (sName.includes("แนะแนว") || sCode.startsWith("ก")) {
      return null;
    }
    if (
      sName.includes("ทุจริต") ||
      sName.includes("ป้องกันทุจริต") ||
      sName.includes("ต้านทุจริต")
    ) {
      return null;
    }

    // Explicit activity keywords inside subject name
    if (sName.includes("ชุมนุม")) {
      return { isExcluded: true, label: "ชุมนุม", description: "คาบชุมนุม (ไม่ต้องเช็คเข้าสอน)" };
    }
    if (sName.includes("ลูกเสือ") || sName.includes("เนตรนารี") || sName.includes("ยุวกาชาด")) {
      return { isExcluded: true, label: "ลูกเสือ", description: "คาบลูกเสือ/เนตรนารี/ยุวกาชาด (ไม่ต้องเช็คเข้าสอน)" };
    }
    if (sName.includes("บำเพ็ญ") || sName.includes("ผู้บำเพ็ญ")) {
      return { isExcluded: true, label: "ผู้บำเพ็ญ", description: "คาบผู้บำเพ็ญประโยชน์ (ไม่ต้องเช็คเข้าสอน)" };
    }
    if (sName.includes("ทักษะชีวิต")) {
      return { isExcluded: true, label: "ทักษะชีวิต", description: "คาบพัฒนาทักษะชีวิต (ไม่ต้องเช็คเข้าสอน)" };
    }
    if (sName.includes("ติว") || sName.includes("โอเน็ต") || sName.includes("O-NET")) {
      return { isExcluded: true, label: "ติว O-NET", description: "คาบติวโอเน็ต (ไม่ต้องเช็คเข้าสอน)" };
    }
    if (sName.includes("เลือกเสรี")) {
      return { isExcluded: true, label: "เลือกเสรี", description: "วิชาเลือกเสรี (ไม่ต้องเช็คเข้าสอน)" };
    }
    if (sName.includes("ซ่อมเสริม")) {
      return { isExcluded: true, label: "ซ่อมเสริม", description: "คาบซ่อมเสริม (ไม่ต้องเช็คเข้าสอน)" };
    }
  }

  // 2. Fixed School Schedule by Day, Grade, and Period
  // วันพุธ คาบ 6: คาบชุมนุม (ทุกห้องเรียน ทุกระดับชั้น)
  if (dayOfWeek === 3 && period === 6) {
    return { isExcluded: true, label: "ชุมนุม", description: "คาบชุมนุม (ทุกห้องไม่ต้องเช็คเข้าสอน)" };
  }

  // วันพุธ คาบ 7: ม.1-3 คาบลูกเสือ, ม.4-6 คาบผู้บำเพ็ญ
  if (dayOfWeek === 3 && period === 7) {
    const isJunior = ["ม.1", "ม.2", "ม.3"].includes(grade);
    return isJunior
      ? { isExcluded: true, label: "ลูกเสือ", description: "คาบลูกเสือ/เนตรนารี/ยุวกาชาด สำหรับ ม.1-3 (ไม่ต้องเช็คเข้าสอน)" }
      : { isExcluded: true, label: "ผู้บำเพ็ญ", description: "คาบผู้บำเพ็ญประโยชน์ สำหรับ ม.4-6 (ไม่ต้องเช็คเข้าสอน)" };
  }

  // วันศุกร์ คาบ 1: ทักษะชีวิต (ทุกระดับชั้น ไม่ต้องเช็ค ยกเว้น ม.1/1, ม.2/1, ม.4/1, ม.5/1 ที่มีตารางเรียนวิชาปกติ)
  if (dayOfWeek === 5 && period === 1) {
    const normGradeRoom = (gradeRoom || "").trim();
    const normClassroomId = (classroomId || "").trim();
    const isAcademicException =
      ["ม.1/1", "ม.2/1", "ม.4/1", "ม.5/1"].includes(normGradeRoom) ||
      ["m1_1", "m2_1", "m4_1", "m5_1"].includes(normClassroomId) ||
      ["1/1", "2/1", "4/1", "5/1"].includes(normGradeRoom.replace("ม.", ""));

    if (!isAcademicException) {
      return { isExcluded: true, label: "ทักษะชีวิต", description: "คาบพัฒนาทักษะชีวิต (ทุกระดับชั้นไม่ต้องเช็คเข้าสอน)" };
    }
  }

  // วันอังคาร คาบ 7: ม.3 ทุกห้อง ติวโอเน็ต (ไม่ต้องเช็ค)
  if (dayOfWeek === 2 && period === 7 && grade === "ม.3") {
    return { isExcluded: true, label: "ติว O-NET", description: "คาบติวโอเน็ต สำหรับ ม.3 (ไม่ต้องเช็คเข้าสอน)" };
  }

  // ม.ต้น วิชาเลือกเสรี (คาบคู่ ไม่ต้องเช็คทั้ง 2 คาบ):
  // ม.1 (ม.1/2 - ม.1/5): วันอังคาร คาบ 6 และ 7
  if (dayOfWeek === 2 && (period === 6 || period === 7) && ["ม.1/2", "ม.1/3", "ม.1/4", "ม.1/5"].includes(gradeRoom)) {
    return { isExcluded: true, label: "เลือกเสรี", description: "วิชาเลือกเสรี คาบคู่ ม.1 (ไม่ต้องเช็คเข้าสอน)" };
  }
  // ม.2 (ม.2/2 - ม.2/5): วันพฤหัสบดี คาบ 6 และ 7
  if (dayOfWeek === 4 && (period === 6 || period === 7) && ["ม.2/2", "ม.2/3", "ม.2/4", "ม.2/5"].includes(gradeRoom)) {
    return { isExcluded: true, label: "เลือกเสรี", description: "วิชาเลือกเสรี คาบคู่ ม.2 (ไม่ต้องเช็คเข้าสอน)" };
  }

  // ม.ปลาย วิชาซ่อมเสริม:
  // ม.6 (ม.6/1, ม.6/2): วันอังคาร คาบ 7 และ วันศุกร์ คาบ 7
  if (["ม.6/1", "ม.6/2"].includes(gradeRoom) && ((dayOfWeek === 2 && period === 7) || (dayOfWeek === 5 && period === 7))) {
    return { isExcluded: true, label: "ซ่อมเสริม", description: "คาบซ่อมเสริม ม.6 (ไม่ต้องเช็คเข้าสอน)" };
  }

  // 3. คาบที่ว่างเปล่าในตารางเรียน (คาบว่าง - ไม่ต้องเช็ค)
  if (!timetableEntry && allowFreePeriodFallback) {
    return { isExcluded: true, label: "คาบว่าง", description: "คาบว่าง (ไม่มีการเรียนการสอน ไม่ต้องเช็คเข้าสอน)" };
  }

  return null;
}

/**
 * Calculates the true effective period count for an attendance record.
 * Handles erroneous data where periodCount was saved as 2 due to legacy double-period toggle,
 * but the period span or official timetable curriculum defines it as a single period (1 period).
 */
export function getEffectivePeriodCount(
  record: AttendanceRecord,
  timetable?: TimetableEntry[]
): number {
  if (!record) return 1;

  const pStart = record.periodStart || 1;
  const pEnd = record.periodEnd || pStart;

  // 1. If start equals end, it is strictly 1 period by definition
  if (pStart === pEnd) {
    return 1;
  }

  // 2. Cross-reference with timetable if available
  if (timetable && timetable.length > 0 && (record.classroomId || record.gradeRoom)) {
    // Derive day of week from date if dayOfWeek is not explicitly set
    let dOfWeek = record.dayOfWeek;
    if (!dOfWeek && record.date) {
      const parts = record.date.split("-").map(Number);
      if (parts.length >= 3 && !isNaN(parts[0])) {
        dOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
      }
    }

    const match = timetable.find(
      (tt) =>
        (tt.classroomId === record.classroomId || tt.gradeRoom === record.gradeRoom) &&
        (dOfWeek ? tt.dayOfWeek === dOfWeek : true) &&
        (record.subjectCode ? tt.subjectCode === record.subjectCode : true) &&
        pStart >= tt.periodStart &&
        pStart <= tt.periodEnd
    );

    if (match) {
      const ttSpan = match.periodEnd > match.periodStart ? match.periodEnd - match.periodStart + 1 : 1;
      return ttSpan;
    }
  }

  // Fallback: If record explicitly recorded periodCount as 1
  if (record.periodCount === 1) {
    return 1;
  }

  // 3. If periodEnd > periodStart, use the actual period span
  if (pEnd > pStart) {
    return Math.max(1, pEnd - pStart + 1);
  }

  return 1;
}

/**
 * Deduplicates attendance records safely by resolving overlapping period slots per classroom & date,
 * and per teacher & date.
 * Keeps only the latest updated/created record when conflicts or accidental duplicate check-ins occur.
 */
export function deduplicateAttendanceRecords(
  records: AttendanceRecord[]
): AttendanceRecord[] {
  if (!records || records.length === 0) return [];

  // Sort descending by timestamp (newest first)
  const sorted = [...records].sort((a, b) => {
    const timeA = a.updatedAt || a.createdAt || "";
    const timeB = b.updatedAt || b.createdAt || "";
    return timeB.localeCompare(timeA);
  });

  const occupiedSlots = new Set<string>();
  const occupiedTeacherSlots = new Set<string>();
  const result: AttendanceRecord[] = [];

  for (const r of sorted) {
    const roomKey = r.classroomId || r.gradeRoom || "";
    const teacherKey = r.teacherId || r.teacherName || "";
    const pStart = r.periodStart || 1;
    const pEnd = r.periodEnd || pStart;

    let hasOverlap = false;
    for (let p = pStart; p <= pEnd; p++) {
      const slotKey = `${roomKey}_${r.date}_p${p}`;
      const teacherSlotKey = `${teacherKey}_${r.date}_p${p}`;
      if (
        (roomKey && occupiedSlots.has(slotKey)) ||
        (teacherKey && occupiedTeacherSlots.has(teacherSlotKey))
      ) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap) {
      for (let p = pStart; p <= pEnd; p++) {
        if (roomKey) occupiedSlots.add(`${roomKey}_${r.date}_p${p}`);
        if (teacherKey) occupiedTeacherSlots.add(`${teacherKey}_${r.date}_p${p}`);
      }
      result.push(r);
    }
  }

  return result;
}
