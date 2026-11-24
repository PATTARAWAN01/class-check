import * as XLSX from "xlsx";
import { Teacher, Subject, TimetableEntry, AttendanceRecord } from "@/types";
import { getThaiDateString } from "@/lib/dateUtils";

// ==================== 1. TEACHER TEMPLATE & PARSER ====================

export function downloadTeacherTemplate() {
  const sampleData = [
    {
      "รหัสครู": "T101",
      "คำนำหน้า": "นาย",
      "ชื่อ-นามสกุล": "สมชาย รักเรียน",
      "กลุ่มสาระการเรียนรู้": "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี",
    },
    {
      "รหัสครู": "T102",
      "คำนำหน้า": "นางสาว",
      "ชื่อ-นามสกุล": "กาญจนา เด่นดวง",
      "กลุ่มสาระการเรียนรู้": "กลุ่มสาระการเรียนรู้คณิตศาสตร์",
    },
    {
      "รหัสครู": "T103",
      "คำนำหน้า": "นาย",
      "ชื่อ-นามสกุล": "ณรงค์เดช เจริญผล",
      "กลุ่มสาระการเรียนรู้": "กลุ่มสาระการเรียนรู้ภาษาไทย",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "รายชื่อครู");
  XLSX.writeFile(workbook, "แบบฟอร์มนำเข้ารายชื่อครู.xlsx");
}

export async function parseTeacherExcel(file: File): Promise<Teacher[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

  return rows
    .filter((r) => r["ชื่อ-นามสกุล"] || r["FullName"])
    .map((r, index) => ({
      id: `tch_imp_${Date.now()}_${index}`,
      code: String(r["รหัสครู"] || r["Code"] || `T${100 + index}`).trim(),
      prefix: String(r["คำนำหน้า"] || r["Prefix"] || "ครู").trim(),
      fullName: String(r["ชื่อ-นามสกุล"] || r["FullName"]).trim(),
      department: String(
        r["กลุ่มสาระการเรียนรู้"] || r["Department"] || "ทั่วไป"
      ).trim(),
    }));
}

// ==================== 2. SUBJECT TEMPLATE & PARSER ====================

export function downloadSubjectTemplate() {
  const sampleData = [
    {
      "รหัสวิชา": "ว21101",
      "ชื่อรายวิชา": "วิทยาศาสตร์ 1",
      "กลุ่มสาระการเรียนรู้": "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี",
    },
    {
      "รหัสวิชา": "ค21101",
      "ชื่อรายวิชา": "คณิตศาสตร์พื้นฐาน 1",
      "กลุ่มสาระการเรียนรู้": "กลุ่มสาระการเรียนรู้คณิตศาสตร์",
    },
    {
      "รหัสวิชา": "ท21101",
      "ชื่อรายวิชา": "ภาษาไทย 1",
      "กลุ่มสาระการเรียนรู้": "กลุ่มสาระการเรียนรู้ภาษาไทย",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "รายวิชา");
  XLSX.writeFile(workbook, "แบบฟอร์มนำเข้ารายวิชา.xlsx");
}

export async function parseSubjectExcel(file: File): Promise<Subject[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

  return rows
    .filter((r) => r["รหัสวิชา"] || r["Code"])
    .map((r, index) => ({
      id: `subj_imp_${Date.now()}_${index}`,
      code: String(r["รหัสวิชา"] || r["Code"]).trim(),
      name: String(r["ชื่อรายวิชา"] || r["Name"]).trim(),
      department: String(
        r["กลุ่มสาระการเรียนรู้"] || r["Department"] || "ทั่วไป"
      ).trim(),
    }));
}

// ==================== 3. TIMETABLE TEMPLATE & PARSER ====================

export function downloadTimetableTemplate() {
  const sampleData = [
    {
      "วัน (1=จันทร์, 2=อังคาร, 3=พุธ, 4=พฤหัสฯ, 5=ศุกร์)": 1,
      "คาบเริ่มต้น": 1,
      "คาบสิ้นสุด (กรณีคาบคู่)": 1,
      "ห้องเรียน (เช่น ม.1/1)": "ม.1/1",
      "รหัสวิชา": "ค21101",
      "ชื่อวิชา": "คณิตศาสตร์พื้นฐาน 1",
      "ชื่อครูผู้สอน": "ครูกาญจนา เด่นดวง",
    },
    {
      "วัน (1=จันทร์, 2=อังคาร, 3=พุธ, 4=พฤหัสฯ, 5=ศุกร์)": 1,
      "คาบเริ่มต้น": 2,
      "คาบสิ้นสุด (กรณีคาบคู่)": 3,
      "ห้องเรียน (เช่น ม.1/1)": "ม.1/1",
      "รหัสวิชา": "ว21101",
      "ชื่อวิชา": "วิทยาศาสตร์ 1",
      "ชื่อครูผู้สอน": "ครูสมชาย รักเรียน",
    },
    {
      "วัน (1=จันทร์, 2=อังคาร, 3=พุธ, 4=พฤหัสฯ, 5=ศุกร์)": 2,
      "คาบเริ่มต้น": 1,
      "คาบสิ้นสุด (กรณีคาบคู่)": 1,
      "ห้องเรียน (เช่น ม.1/1)": "ม.1/1",
      "รหัสวิชา": "ส21101",
      "ชื่อวิชา": "สังคมศึกษา 1",
      "ชื่อครูผู้สอน": "ครูประสิทธิ์ ยิ้มแย้ม",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ตารางสอน");
  XLSX.writeFile(workbook, "แบบฟอร์มนำเข้าตารางสอน.xlsx");
}

export async function parseTimetableExcel(
  file: File,
  termId: string
): Promise<TimetableEntry[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  // Read across all sheets in the template workbook
  const allRows: any[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    const sheetRows: any[] = XLSX.utils.sheet_to_json(worksheet);
    allRows.push(...sheetRows);
  }

  return allRows
    .filter((r) => r["ห้องเรียน (เช่น ม.1/1)"] || r["Classroom"] || r["ห้อง"])
    .map((r) => {
      const pStart = Number(
        r["คาบเริ่มต้น"] || r["PeriodStart"] || r["คาบ"] || 1
      );
      const pEndRaw = Number(
        r["คาบสิ้นสุด (กรณีคาบคู่)"] || r["PeriodEnd"] || pStart
      );
      const pEnd = pEndRaw >= pStart ? pEndRaw : pStart;
      const dayRaw = Number(
        r["วัน (1=จันทร์, 2=อังคาร, 3=พุธ, 4=พฤหัสฯ, 5=ศุกร์)"] || r["Day"] || 1
      );
      const dayOfWeek = dayRaw >= 1 && dayRaw <= 5 ? dayRaw : 1;

      const rawRoom = String(
        r["ห้องเรียน (เช่น ม.1/1)"] || r["Classroom"] || r["ห้อง"] || "ม.1/1"
      ).trim();
      const roomMatch = rawRoom.match(/(?:ม\.?\s*)?(\d+)\s*\/\s*(\d+)/);
      const gradeRoom = roomMatch ? `ม.${roomMatch[1]}/${roomMatch[2]}` : rawRoom;
      const classroomId = roomMatch
        ? `m${roomMatch[1]}_${roomMatch[2]}`
        : rawRoom.replace(/[\s\.\/]/g, "_");

      const subjectCode = String(r["รหัสวิชา"] || r["SubjectCode"] || "").trim();
      const subjectName = String(r["ชื่อวิชา"] || r["SubjectName"] || "").trim();
      const teacherName = String(
        r["ชื่อครูผู้สอน"] || r["TeacherName"] || r["ครู"] || ""
      ).trim();
      const cleanTeacherBare = teacherName
        .replace(/^(นางสาว|นาย|นาง|ครู)\s*/, "")
        .trim();
      const roomLocation = String(
        r["สถานที่"] || r["ห้องเรียน/สถานที่"] || r["RoomLocation"] || ""
      ).trim();

      const periodSuffix = pStart === pEnd ? `p${pStart}` : `p${pStart}_${pEnd}`;

      return {
        id: `tt_${classroomId}_d${dayOfWeek}_${periodSuffix}`,
        termId,
        dayOfWeek,
        periodStart: pStart,
        periodEnd: pEnd,
        classroomId,
        gradeRoom,
        subjectId: `subj_${subjectCode}`,
        subjectCode,
        subjectName,
        teacherId: `tch_${cleanTeacherBare.replace(/\s+/g, "_")}`,
        teacherName,
        ...(roomLocation ? { roomLocation } : {}),
      };
    });
}

// ==================== 4. EXPORT ATTENDANCE LOGS TO EXCEL ====================

export function exportAttendanceToExcel(
  records: AttendanceRecord[],
  schoolName: string,
  termLabel: string
) {
  const statusLabels: Record<string, string> = {
    on_time: "เข้าสอนตรงเวลา",
    late: "เข้าสอนหลัง 10 นาที (สาย)",
    absent: "ไม่เข้าสอน",
  };

  const reasonLabels: Record<string, string> = {
    personal: "ลากิจ",
    sick: "ลาป่วย",
    official: "ไปราชการ",
    other: "อื่นๆ",
  };

  const data = records.map((r, index) => ({
    "ลำดับ": index + 1,
    "วันที่": r.date,
    "คาบที่": r.periodStart === r.periodEnd ? `${r.periodStart}` : `${r.periodStart}-${r.periodEnd}`,
    "จำนวนคาบ": r.periodCount,
    "ห้องเรียน": r.gradeRoom,
    "รหัสวิชา": r.subjectCode || (r.subjectId ? r.subjectId.replace(/^subj_/, "") : "-"),
    "ชื่อวิชา": r.subjectName || r.subjectCode || (r.subjectId ? r.subjectId.replace(/^subj_/, "") : "-"),
    "ชื่อครูผู้สอน": r.teacherName,
    "สถานะการเข้าสอน": statusLabels[r.status] || r.status,
    "สาเหตุการไม่เข้าสอน": r.absenceReason ? reasonLabels[r.absenceReason] || r.absenceReason : "-",
    "หมายเหตุเพิ่มเติม": r.absenceNote || "-",
    "นักเรียนผู้บันทึก": r.recordedByStudent,
    "เวลาที่บันทึก": new Date(r.createdAt).toLocaleString("th-TH"),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ข้อมูลการเข้าสอน");
  const todayStr = getThaiDateString();
  XLSX.writeFile(workbook, `รายงานการเข้าสอนครู_${todayStr}.xlsx`);
}

// ==================== 5. EXPORT SUBSTITUTE STATS TO EXCEL ====================

export function exportSubstituteStatsToExcel(
  stats: Array<{
    teacherName: string;
    department: string;
    totalPeriods: number;
    replacedTeachers: string[];
    rooms: string[];
  }>,
  schoolName: string,
  timeRangeLabel: string
) {
  const data = stats.map((s, idx) => ({
    "ลำดับ": idx + 1,
    "ชื่อ-สกุล ครูผู้สอนแทน": s.teacherName,
    "กลุ่มสาระการเรียนรู้": s.department,
    "จำนวนคาบที่เข้าสอนแทน": s.totalPeriods,
    "ปฏิบัติหน้าที่แทนครู": s.replacedTeachers.join(", "),
    "ห้องเรียนที่สอนแทน": s.rooms.join(", "),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "สถิติครูผู้สอนแทน");
  const todayStr = getThaiDateString();
  XLSX.writeFile(workbook, `รายงานสรุปสอนแทนสะสมรายบุคคล_${todayStr}.xlsx`);
}
