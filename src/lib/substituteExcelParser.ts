import * as XLSX from "xlsx";
import { Teacher, Classroom, Subject, TimetableEntry, SubstituteAssignment, SubstituteLeaveType } from "@/types";
import { getThaiDateString } from "@/lib/dateUtils";

export interface ParsedExcelSubstituteRow {
  index: number;
  date: string; // YYYY-MM-DD
  rawDate: string;
  department: string;
  originalTeacherName: string;
  originalTeacherId: string;
  leaveType: SubstituteLeaveType;
  periodStart: number;
  periodEnd: number;
  timeRange: string;
  subjectCode: string;
  subjectName: string;
  gradeRoom: string;
  classroomId: string;
  roomLocation: string;
  substituteTeacherName: string;
  substituteTeacherId: string;
  substituteDepartment: string;
  isJointCare: boolean;
  notes: string;
}

export interface SubstituteExcelParseResult {
  date: string;
  academicYear: number;
  termNumber: number;
  items: ParsedExcelSubstituteRow[];
  totalPeriods: number;
  assignedCount: number;
  unassignedCount: number;
}

// Convert Thai Date like "จันทร์ 16 พ.ย. 2569" or "16 พ.ย. 2569" to "2026-11-16"
export function parseThaiDateStringToIso(raw: string): string {
  if (!raw) return "";
  const str = String(raw).trim();

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const thaiMonths: Record<string, string> = {
    "ม.ค.": "01", "มกราคม": "01",
    "ก.พ.": "02", "กุมภาพันธ์": "02",
    "มี.ค.": "03", "มีนาคม": "03",
    "เม.ย.": "04", "เมษายน": "04",
    "พ.ค.": "05", "พฤษภาคม": "05",
    "มิ.ย.": "06", "มิถุนายน": "06",
    "ก.ค.": "07", "กรกฎาคม": "07",
    "ส.ค.": "08", "สิงหาคม": "08",
    "ก.ย.": "09", "กันยายน": "09",
    "ต.ค.": "10", "ตุลาคม": "10",
    "พ.ย.": "11", "พฤศจิกายน": "11",
    "ธ.ค.": "12", "ธันวาคม": "12",
  };

  const match = str.match(/(\d{1,2})\s*([^\d\s]+)\s*(\d{4})/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const mStr = match[2];
    const yearBE = parseInt(match[3], 10);
    const yearAD = yearBE > 2400 ? yearBE - 543 : yearBE;

    const monthKey = Object.keys(thaiMonths).find((k) => mStr.includes(k));
    const month = monthKey ? thaiMonths[monthKey] : "11";

    return `${yearAD}-${month}-${day}`;
  }

  // Handle DD/MM/YYYY or DD/MM/BE
  const slashMatch = str.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, "0");
    const month = slashMatch[2].padStart(2, "0");
    let year = parseInt(slashMatch[3], 10);
    if (year > 2400) year -= 543;
    return `${year}-${month}-${day}`;
  }

  return "";
}

export async function parseSubstituteExcelFile(
  file: File,
  teachers: Teacher[] = [],
  classrooms: Classroom[] = [],
  subjects: Subject[] = [],
  timetable: TimetableEntry[] = []
): Promise<SubstituteExcelParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert worksheet to 2D array of rows
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  let headerRowIndex = -1;
  let colIndexMap: Record<string, number> = {};

  // Find header row that contains keywords: "ที่", "วันที่", "ครูที่ไม่อยู่"
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

    const strRow = row.map((cell) => String(cell || "").trim());
    const hasIdx = strRow.some((c) => c === "ที่" || c === "ลำดับ" || c === "No.");
    const hasTeacher = strRow.some((c) => c.includes("ครูที่ไม่อยู่") || c.includes("ครูที่ลา") || c.includes("ครูผู้สอน"));
    const hasSub = strRow.some((c) => c.includes("ผู้สอนแทน") || c.includes("ครูผู้สอนแทน"));

    if (hasIdx && (hasTeacher || hasSub)) {
      headerRowIndex = r;
      strRow.forEach((c, idx) => {
        if (c === "ที่" || c === "ลำดับ") colIndexMap["index"] = idx;
        else if (c.includes("วันที่")) colIndexMap["date"] = idx;
        else if (c.includes("กลุ่มสาระ")) colIndexMap["department"] = idx;
        else if (c.includes("ครูที่ไม่อยู่") || c.includes("ครูที่ลา") || c.includes("ครูประจำวิชา")) colIndexMap["originalTeacher"] = idx;
        else if (c.includes("ประเภท") || c.includes("สาเหตุ")) colIndexMap["leaveType"] = idx;
        else if (c.includes("คาบ")) colIndexMap["period"] = idx;
        else if (c.includes("เวลา")) colIndexMap["time"] = idx;
        else if (c.includes("รหัสวิชา") || c.includes("วิชา")) colIndexMap["subject"] = idx;
        else if (c.includes("ชั้น")) colIndexMap["gradeRoom"] = idx;
        else if (c.includes("ห้อง")) colIndexMap["roomLocation"] = idx;
        else if (c.includes("ผู้สอนแทน")) colIndexMap["substituteTeacher"] = idx;
        else if (c.includes("ดูแลควบ") || c.includes("ควบ")) colIndexMap["jointCare"] = idx;
      });
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("ไม่พบคอลัมน์หัวตารางที่ถูกต้องในไฟล์ Excel (ต้องมีคอลัมน์: ที่, วันที่, ครูที่ไม่อยู่, คาบ, รหัสวิชา, ชั้น, ผู้สอนแทน)");
  }

  const items: ParsedExcelSubstituteRow[] = [];
  let extractedDate = "";

  // Helper teacher matcher
  const matchTeacher = (name: string): Teacher | null => {
    if (!name) return null;
    const clean = name.replace(/\s+/g, "").toLowerCase();
    return (
      teachers.find((t) => {
        const full = `${t.prefix}${t.fullName}`.replace(/\s+/g, "").toLowerCase();
        const bare = t.fullName.replace(/\s+/g, "").toLowerCase();
        return clean.includes(bare) || bare.includes(clean) || clean.includes(full);
      }) || null
    );
  };

  // Helper classroom matcher
  const matchRoom = (gr: string): Classroom | null => {
    if (!gr) return null;
    const clean = gr.replace(/\s+/g, "").toLowerCase();
    return (
      classrooms.find((c) => {
        const cClean = c.gradeRoom.replace(/\s+/g, "").toLowerCase();
        return cClean === clean;
      }) || null
    );
  };

  // Helper subject matcher
  const matchSubject = (code: string): Subject | null => {
    if (!code) return null;
    const clean = code.replace(/\s+/g, "").toUpperCase();
    return (
      subjects.find((s) => s.code.replace(/\s+/g, "").toUpperCase() === clean) || null
    );
  };

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;

    // Check if empty row or end of table
    const idxVal = row[colIndexMap["index"]];
    const origTeacherVal = row[colIndexMap["originalTeacher"]];
    if (!idxVal && !origTeacherVal) continue;

    // Check if summary row at the bottom
    const firstCell = String(row[0] || "").trim();
    if (firstCell.includes("รวม") || firstCell.includes("รายงาน") || firstCell.includes("กลุ่มสาระ")) {
      continue;
    }

    const rawDate = String(row[colIndexMap["date"]] || "").trim();
    const isoDate = parseThaiDateStringToIso(rawDate);
    if (isoDate && !extractedDate) extractedDate = isoDate;

    const rawOrigTeacher = String(row[colIndexMap["originalTeacher"]] || "").trim();
    const matchedOrig = matchTeacher(rawOrigTeacher);

    const rawDept = String(row[colIndexMap["department"]] || (matchedOrig?.department || "")).trim();

    const rawLeave = String(row[colIndexMap["leaveType"]] || "").trim();
    let leaveType: SubstituteLeaveType = "personal";
    if (rawLeave.includes("ป่วย")) leaveType = "sick";
    else if (rawLeave.includes("ราชการ")) leaveType = "official";

    const rawPeriod = parseInt(String(row[colIndexMap["period"]] || "1"), 10) || 1;
    const rawTime = String(row[colIndexMap["time"]] || "").trim();

    const rawSubj = String(row[colIndexMap["subject"]] || "").trim();
    const matchedSubj = matchSubject(rawSubj);

    const rawGradeRoom = String(row[colIndexMap["gradeRoom"]] || "").trim();
    const matchedCls = matchRoom(rawGradeRoom);

    const rawRoomLoc = String(row[colIndexMap["roomLocation"]] || "").trim();

    const rawSubTeacher = String(row[colIndexMap["substituteTeacher"]] || "").trim();
    const isUnassigned =
      !rawSubTeacher ||
      rawSubTeacher.includes("ยังไม่มี") ||
      rawSubTeacher.includes("ไม่มี") ||
      rawSubTeacher === "-";

    const matchedSub = !isUnassigned ? matchTeacher(rawSubTeacher) : null;

    const rawJoint = String(row[colIndexMap["jointCare"]] || "").trim();
    const isJointCare = rawJoint.includes("ควบ") || rawJoint.includes("ดูแล");

    items.push({
      index: items.length + 1,
      date: isoDate || extractedDate || getThaiDateString(),
      rawDate,
      department: rawDept,
      originalTeacherName: matchedOrig ? `${matchedOrig.prefix}${matchedOrig.fullName}` : rawOrigTeacher,
      originalTeacherId: matchedOrig?.id || "",
      leaveType,
      periodStart: rawPeriod,
      periodEnd: rawPeriod,
      timeRange: rawTime,
      subjectCode: rawSubj,
      subjectName: matchedSubj?.name || "",
      gradeRoom: matchedCls?.gradeRoom || rawGradeRoom,
      classroomId: matchedCls?.id || "",
      roomLocation: rawRoomLoc,
      substituteTeacherName: isUnassigned ? "" : matchedSub ? `${matchedSub.prefix}${matchedSub.fullName}` : rawSubTeacher,
      substituteTeacherId: matchedSub?.id || "",
      substituteDepartment: matchedSub?.department || rawDept,
      isJointCare,
      notes: isJointCare ? "ดูแลควบ" : "",
    });
  }

  const assignedCount = items.filter((i) => i.substituteTeacherName.trim().length > 0).length;
  const unassignedCount = items.length - assignedCount;

  return {
    date: extractedDate || getThaiDateString(),
    academicYear: 2569,
    termNumber: 2,
    items,
    totalPeriods: items.length,
    assignedCount,
    unassignedCount,
  };
}
