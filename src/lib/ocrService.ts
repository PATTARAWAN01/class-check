import { createWorker } from "tesseract.js";
import { SCHOOL_TEACHERS, SCHOOL_SUBJECTS, SCHOOL_CLASSROOMS } from "./schoolData2569";
import { Teacher, Subject, Classroom } from "@/types";

export interface ParsedSubstituteItem {
  id: string;
  periodStart: number;
  periodEnd: number;
  timeRange: string;
  gradeRoom: string;
  classroomId: string;
  roomLocation: string;
  subjectCode: string;
  subjectName: string;
  leaveType: "sick" | "personal" | "official";
  originalTeacherId: string;
  originalTeacherName: string;
  originalTeacherDept: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  substituteTeacherDept: string;
  isAssigned?: boolean;
  note?: string;
}

export interface OcrResult {
  success: boolean;
  department: string;
  thaiDisplayDate: string;
  isoDate: string;
  dayOfWeek: number;
  rawText: string;
  items: ParsedSubstituteItem[];
  error?: string;
}

// Extract JPEG streams embedded in PDF buffers or handle raw images
export function extractJpegFromPdf(pdfBuffer: Buffer): Buffer[] {
  // Check if buffer is already a JPEG
  if (pdfBuffer[0] === 0xff && pdfBuffer[1] === 0xd8) {
    return [pdfBuffer];
  }
  // Check if buffer is a PNG
  if (
    pdfBuffer[0] === 0x89 &&
    pdfBuffer[1] === 0x50 &&
    pdfBuffer[2] === 0x4e &&
    pdfBuffer[3] === 0x47
  ) {
    return [pdfBuffer];
  }

  const jpegHeader = Buffer.from([0xff, 0xd8]);
  const jpegEOF = Buffer.from([0xff, 0xd9]);

  let offset = 0;
  const images: Buffer[] = [];
  while (offset < pdfBuffer.length) {
    const startIdx = pdfBuffer.indexOf(jpegHeader, offset);
    if (startIdx === -1) break;
    const endIdx = pdfBuffer.indexOf(jpegEOF, startIdx + 2);
    if (endIdx === -1) break;

    const imgBuf = pdfBuffer.subarray(startIdx, endIdx + 2);
    if (imgBuf.length > 40000) {
      images.push(imgBuf);
    }
    offset = endIdx + 2;
  }
  return images;
}

export function normalizeThai(str: string): string {
  if (!str) return "";
  return str.replace(/[^ก-๙a-zA-Z0-9]/g, "");
}

export function matchTeacher(
  ocrName: string,
  teachers: Teacher[] = SCHOOL_TEACHERS
): Teacher | null {
  if (!ocrName) return null;
  const cleanOcr = normalizeThai(ocrName);
  if (!cleanOcr || cleanOcr.length < 3) return null;

  let bestTeacher: Teacher | null = null;
  let bestScore = 0;

  for (const t of teachers) {
    const nameOnly = normalizeThai(t.fullName);
    if (cleanOcr.includes(nameOnly) || nameOnly.includes(cleanOcr)) {
      return t;
    }

    let hits = 0;
    for (let i = 0; i < nameOnly.length; i++) {
      if (cleanOcr.includes(nameOnly[i])) hits++;
    }
    const score = hits / Math.max(nameOnly.length, cleanOcr.length);
    if (score > bestScore && score >= 0.45) {
      bestScore = score;
      bestTeacher = t;
    }
  }

  return bestTeacher;
}

export function matchClassroom(
  gradeRoom: string,
  classrooms: Classroom[] = SCHOOL_CLASSROOMS
): Classroom | null {
  if (!gradeRoom) return null;
  const clean = gradeRoom.replace(/\s+/g, "");
  return (
    classrooms.find((c) => c.gradeRoom.replace(/\s+/g, "") === clean) ||
    null
  );
}

export function matchSubject(
  subjectCode: string,
  subjects: Subject[] = SCHOOL_SUBJECTS
): Subject | null {
  if (!subjectCode) return null;
  const clean = subjectCode.replace(/\s+/g, "").toUpperCase();
  return (
    subjects.find((s) => s.code.replace(/\s+/g, "").toUpperCase() === clean) ||
    null
  );
}

// Clean and normalize subject codes from OCR (handles character misreads like 8 -> อ, 2 -> ว, 0 -> อ)
export function cleanSubjectCode(
  rawCode: string,
  dept?: string,
  subjectsList: Subject[] = SCHOOL_SUBJECTS
): string {
  if (!rawCode) return "";
  let clean = rawCode.replace(/\s+/g, "").toUpperCase();

  // If already exact match in subject database
  if (subjectsList.some((s) => s.code.replace(/\s+/g, "").toUpperCase() === clean)) {
    return clean;
  }

  // If OCR misread 'อ' as '8', '0', 'O', or 'o' before 5 digits (e.g. 831202 -> อ31202, 833222 -> อ33222, 821202 -> อ21202)
  if (/^[80Oo]\d{5}$/i.test(clean)) {
    const candidate = "อ" + clean.substring(1);
    if (subjectsList.some((s) => s.code.replace(/\s+/g, "").toUpperCase() === candidate)) {
      return candidate;
    }
  }

  // If OCR misread 'ว' as '2' before 5 digits (e.g. 231102 -> ว31102)
  if (/^[2]\d{5}$/.test(clean)) {
    const candidate = "ว" + clean.substring(1);
    if (subjectsList.some((s) => s.code.replace(/\s+/g, "").toUpperCase() === candidate)) {
      return candidate;
    }
  }

  // If 5 digits without prefix letter (e.g. 31202)
  if (/^\d{5}$/.test(clean)) {
    const deptPrefixMap: Record<string, string> = {
      "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ": "อ",
      "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี": "ว",
      "กลุ่มสาระการเรียนรู้คณิตศาสตร์": "ค",
      "กลุ่มสาระการเรียนรู้ภาษาไทย": "ท",
      "กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม": "ส",
      "กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา": "พ",
      "กลุ่มสาระการเรียนรู้ศิลปะ": "ศ",
      "กลุ่มสาระการเรียนรู้การงานอาชีพ": "ง",
    };
    const prefix = (dept && deptPrefixMap[dept]) || "อ";
    const candidate = prefix + clean;
    if (subjectsList.some((s) => s.code.replace(/\s+/g, "").toUpperCase() === candidate)) {
      return candidate;
    }
  }

  // Fallback for foreign language department starting with 8/0
  if (/^[80Oo]\d{5}$/i.test(clean) && dept?.includes("ภาษาต่างประเทศ")) {
    return "อ" + clean.substring(1);
  }

  return clean;
}

export function parseThaiDate(text: string): {
  isoDate: string;
  thaiDisplayDate: string;
  dayOfWeek: number;
} | null {
  const m = text.match(
    /(?:วัน([^\s]+)\s+)?(\d{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|พ\.ย\.|ธ\.ค\.|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.)\s+(\d{2,4})/
  );
  if (!m) return null;

  const dayStr = m[2];
  const monthName = m[3];
  let yearNum = parseInt(m[4], 10);
  if (yearNum > 2500) yearNum -= 543;
  else if (yearNum < 100) yearNum += 2000;

  const monthMap: Record<string, string> = {
    มกราคม: "01",
    "ม.ค.": "01",
    กุมภาพันธ์: "02",
    "ก.พ.": "02",
    มีนาคม: "03",
    "มี.ค.": "03",
    เมษายน: "04",
    "เม.ย.": "04",
    พฤษภาคม: "05",
    "พ.ค.": "05",
    มิถุนายน: "06",
    "มิ.ย.": "06",
    กรกฎาคม: "07",
    "ก.ค.": "07",
    สิงหาคม: "08",
    "ส.ค.": "08",
    กันยายน: "09",
    "ก.ย.": "09",
    ตุลาคม: "10",
    "ต.ค.": "10",
    พฤศจิกายน: "11",
    "พ.ย.": "11",
    ธันวาคม: "12",
    "ธ.ค.": "12",
  };

  const month = monthMap[monthName] || "11";
  const day = String(parseInt(dayStr, 10)).padStart(2, "0");
  const isoDate = `${yearNum}-${month}-${day}`;

  const d = new Date(isoDate);
  const jsDay = d.getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  return {
    isoDate,
    thaiDisplayDate: m[0].trim(),
    dayOfWeek,
  };
}

export function parseDepartment(text: string): string {
  if (text.includes("วิทยาศาสตร์"))
    return "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี";
  if (text.includes("คณิตศาสตร์")) return "กลุ่มสาระการเรียนรู้คณิตศาสตร์";
  if (text.includes("ภาษาไทย")) return "กลุ่มสาระการเรียนรู้ภาษาไทย";
  if (text.includes("ภาษาต่างประเทศ"))
    return "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ";
  if (text.includes("สังคม"))
    return "กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม";
  if (text.includes("สุขศึกษา") || text.includes("พลศึกษา"))
    return "กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา";
  if (text.includes("ศิลปะ")) return "กลุ่มสาระการเรียนรู้ศิลปะ";
  if (text.includes("การงาน")) return "กลุ่มสาระการเรียนรู้การงานอาชีพ";
  return "กลุ่มสาระการเรียนรู้";
}

// Parse text lines to extract substitute assignments
export function parseOcrTextToItems(
  fullOcrText: string,
  department: string,
  teachers: Teacher[] = SCHOOL_TEACHERS,
  subjects: Subject[] = SCHOOL_SUBJECTS,
  classrooms: Classroom[] = SCHOOL_CLASSROOMS
): ParsedSubstituteItem[] {
  const lines = fullOcrText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsedItems: ParsedSubstituteItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeMatch = line.match(
      /(\d{1,2}[.:]\d{2})\s*-\s*(\d{1,2}[.:]\d{2})/
    );
    const leaveMatch = line.match(/(ลาป่วย|ลากิจ|ไปราชการ)/);

    if (timeMatch && leaveMatch) {
      const subLine = line;
      let mainLine = "";
      for (let k = 1; k <= 2; k++) {
        if (i - k >= 0) {
          const prev = lines[i - k];
          if (
            !prev.includes("รายงาน") &&
            !prev.includes("โรงเรียน") &&
            !prev.includes("สรุป") &&
            !prev.includes("วันจันทร์") &&
            !prev.includes("วันอังคาร") &&
            !prev.includes("วันพุธ") &&
            !prev.includes("วันพฤหัส") &&
            !prev.includes("วันศุกร์")
          ) {
            mainLine = prev;
            break;
          }
        }
      }

      const combinedText = `${mainLine} ${subLine}`;
      const timeRange = `${timeMatch[1]}-${timeMatch[2]}`;
      let period = 1;
      if (timeRange.startsWith("08")) period = 1;
      else if (timeRange.startsWith("09")) period = 2;
      else if (timeRange.startsWith("10")) period = 3;
      else if (timeRange.startsWith("11")) period = 4;
      else if (timeRange.startsWith("13.00") || timeRange.startsWith("13:00"))
        period = 5;
      else if (timeRange.startsWith("13.50") || timeRange.startsWith("13:50"))
        period = 6;
      else if (timeRange.startsWith("14") || timeRange.startsWith("15"))
        period = 7;

      let leaveType: "sick" | "personal" | "official" = "sick";
      if (combinedText.includes("ลากิจ")) leaveType = "personal";
      else if (combinedText.includes("ไปราชการ")) leaveType = "official";

      const roomMatch = combinedText.match(/ม\.\s*([1-6])\s*[\/./]\s*([1-5])/);
      const gradeRoom = roomMatch ? `ม.${roomMatch[1]}/${roomMatch[2]}` : "";
      const matchedCls = matchClassroom(gradeRoom, classrooms);

      const locMatch = combinedText.match(/ห้อง\s*(\d+)/);
      const roomLocation = locMatch ? `ห้อง ${locMatch[1]}` : "";

      // Match subject code with OCR correction (e.g. 831202 -> อ31202)
      let rawSubject = "";
      const subjMatch = combinedText.match(/([ก-ฮA-Za-z0-9]\s*\d{5})/);
      if (subjMatch) {
        rawSubject = subjMatch[1];
      }
      const subjectCode = cleanSubjectCode(rawSubject, department, subjects);
      const matchedSubj = matchSubject(subjectCode, subjects);

      const isExplicitlyUnassigned =
        combinedText.includes("ยังไม่มีผู้สอนแทน") ||
        combinedText.includes("ไม่มีผู้สอนแทน");

      // Scan all known teachers in mainLine and combinedText
      const mainNorm = normalizeThai(mainLine);
      const matchedTeachers: { teacher: Teacher; pos: number }[] = [];
      for (const t of teachers) {
        const norm = normalizeThai(t.fullName);
        const idx = mainNorm.indexOf(norm);
        if (idx !== -1) {
          matchedTeachers.push({ teacher: t, pos: idx });
        }
      }
      matchedTeachers.sort((a, b) => a.pos - b.pos);

      let absentTch = matchedTeachers[0] ? matchedTeachers[0].teacher : null;
      let subTch: Teacher | null = null;

      if (!isExplicitlyUnassigned) {
        if (matchedTeachers.length > 1) {
          subTch = matchedTeachers[1].teacher;
        } else if (subjMatch) {
          const parts = mainLine.split(subjMatch[0]);
          if (parts.length > 1) {
            subTch = matchTeacher(parts[1], teachers);
          }
        }
      }

      // If absentTch was not found in mainLine, search subLine or matchTeacher on parts[0]
      if (!absentTch) {
        if (subjMatch) {
          const parts = mainLine.split(subjMatch[0]);
          absentTch = matchTeacher(parts[0], teachers);
        } else {
          absentTch = matchTeacher(mainLine, teachers);
        }
      }

      const isAssigned = Boolean(subTch && !isExplicitlyUnassigned);

      parsedItems.push({
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        periodStart: period,
        periodEnd: period,
        timeRange,
        gradeRoom: gradeRoom || (matchedCls ? matchedCls.gradeRoom : "ม.1/1"),
        classroomId: matchedCls ? matchedCls.id : "m1_1",
        roomLocation,
        subjectCode: subjectCode || (matchedSubj ? matchedSubj.code : ""),
        subjectName: matchedSubj ? matchedSubj.name : "รายวิชาตามตารางสอน",
        leaveType,
        originalTeacherId: absentTch ? absentTch.id : "",
        originalTeacherName: absentTch
          ? `${absentTch.prefix}${absentTch.fullName}`
          : "",
        originalTeacherDept: absentTch ? absentTch.department : department,
        substituteTeacherId: subTch ? subTch.id : "",
        substituteTeacherName: isExplicitlyUnassigned
          ? "ยังไม่มีผู้สอนแทน"
          : subTch
          ? `${subTch.prefix}${subTch.fullName}`
          : "ยังไม่มีผู้สอนแทน",
        substituteTeacherDept: subTch ? subTch.department : department,
        isAssigned,
        note: isExplicitlyUnassigned ? "ยังไม่มีผู้สอนแทนในเอกสาร" : undefined,
      });
    }
  }

  return parsedItems;
}

// Process OCR from a Buffer directly in Next.js Serverless runtime
export async function processOcrBuffer(
  fileBuf: Buffer,
  teachers: Teacher[] = SCHOOL_TEACHERS,
  subjects: Subject[] = SCHOOL_SUBJECTS,
  classrooms: Classroom[] = SCHOOL_CLASSROOMS
): Promise<OcrResult> {
  const images = extractJpegFromPdf(fileBuf);
  if (images.length === 0) {
    throw new Error("ไม่สามารถแยกรูปภาพออกจากไฟล์ PDF หรือไฟล์รูปภาพนี้ได้");
  }

  const worker = await createWorker("tha+eng");
  let fullOcrText = "";
  try {
    for (let idx = 0; idx < Math.min(images.length, 2); idx++) {
      const res = await worker.recognize(images[idx]);
      fullOcrText += "\n" + res.data.text;
    }
  } finally {
    await worker.terminate();
  }

  const parsedDate = parseThaiDate(fullOcrText);
  const department = parseDepartment(fullOcrText);

  const isoDate = parsedDate ? parsedDate.isoDate : new Date().toISOString().split("T")[0];
  const thaiDisplayDate = parsedDate ? parsedDate.thaiDisplayDate : "วันที่ระบุในเอกสาร";
  const dayOfWeek = parsedDate ? parsedDate.dayOfWeek : 1;

  const items = parseOcrTextToItems(fullOcrText, department, teachers, subjects, classrooms);

  return {
    success: true,
    department,
    thaiDisplayDate,
    isoDate,
    dayOfWeek,
    rawText: fullOcrText,
    items,
  };
}
