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
  department: string
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
      const mainLine = i > 0 ? lines[i - 1] : "";

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
      else if (timeRange.startsWith("14")) period = 7;

      let leaveType: "sick" | "personal" | "official" = "sick";
      if (subLine.includes("ลากิจ")) leaveType = "personal";
      else if (subLine.includes("ไปราชการ")) leaveType = "official";

      const roomMatch = subLine.match(/ม\.\s*([1-6])\s*[\/./]\s*([1-5])/);
      const gradeRoom = roomMatch ? `ม.${roomMatch[1]}/${roomMatch[2]}` : "";
      const matchedCls = matchClassroom(gradeRoom);

      const locMatch = subLine.match(/ห้อง\s*(\d+)/);
      const roomLocation = locMatch ? `ห้อง ${locMatch[1]}` : "";

      const subjMatch = mainLine.match(/([ก-ฮA-Za-z]\s*\d{5})/);
      const subjectCode = subjMatch ? subjMatch[1].replace(/\s+/g, "") : "";
      const matchedSubj = matchSubject(subjectCode);

      const isUnassigned =
        mainLine.includes("ยังไม่มีผู้สอนแทน") ||
        subLine.includes("ยังไม่มีผู้สอนแทน");

      let rawAbsentTeacher = "";
      let rawSubstituteTeacher = "";

      if (subjMatch) {
        const parts = mainLine.split(subjMatch[0]);
        rawAbsentTeacher = parts[0]
          .replace(/^[\d\s]+/, "")
          .replace(/[\[\]|/\\=]/g, "")
          .trim();
        if (!isUnassigned && parts.length > 1) {
          rawSubstituteTeacher = parts[1].replace(/[\[\]|/\\=]/g, "").trim();
        }
      }

      const absentTch = matchTeacher(rawAbsentTeacher);
      const subTch = isUnassigned ? null : matchTeacher(rawSubstituteTeacher);

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
          : rawAbsentTeacher,
        originalTeacherDept: absentTch ? absentTch.department : department,
        substituteTeacherId: subTch ? subTch.id : "",
        substituteTeacherName: isUnassigned
          ? "ยังไม่มีผู้สอนแทน"
          : subTch
          ? `${subTch.prefix}${subTch.fullName}`
          : rawSubstituteTeacher || "ยังไม่มีผู้สอนแทน",
        substituteTeacherDept: subTch ? subTch.department : department,
        note: isUnassigned ? "ยังไม่มีผู้สอนแทนในเอกสาร" : undefined,
      });
    }
  }

  return parsedItems;
}

// Process OCR from a Buffer directly in Next.js Serverless runtime
export async function processOcrBuffer(fileBuf: Buffer): Promise<OcrResult> {
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

  const items = parseOcrTextToItems(fullOcrText, department);

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
