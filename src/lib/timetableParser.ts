import { Classroom, Subject, Teacher, TimetableEntry, AcademicTerm } from "@/types";

export interface ParsedTimetableResult {
  term: AcademicTerm;
  classrooms: Classroom[];
  teachers: Teacher[];
  subjects: Subject[];
  timetableEntries: TimetableEntry[];
  summary: {
    totalClassrooms: number;
    totalTeachers: number;
    totalSubjects: number;
    totalPeriods: number;
    termTitle: string;
  };
}

// Function to parse CSV respecting quotes and newlines
export function parseCSVString(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === "," && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((char === "\r" || char === "\n") && !insideQuote) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function getDepartmentBySubject(code: string, name: string = ""): string {
  if (!code) return "กลุ่มสาระการเรียนรู้ทั่วไป";
  const prefix = code.charAt(0);
  switch (prefix) {
    case "ท":
      return "กลุ่มสาระการเรียนรู้ภาษาไทย";
    case "ค":
      return "กลุ่มสาระการเรียนรู้คณิตศาสตร์";
    case "ว":
      return "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี";
    case "ส":
      return "กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม";
    case "พ":
      return "กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา";
    case "ศ":
      return "กลุ่มสาระการเรียนรู้ศิลปะ";
    case "ง":
      return "กลุ่มสาระการเรียนรู้การงานอาชีพ";
    case "อ":
    case "จ":
      return "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ";
    case "ก":
      return "กิจกรรมพัฒนาผู้เรียน (แนะแนว)";
    case "I":
      return "การศึกษาค้นคว้าอิสระ (IS)";
    default:
      return "กลุ่มสาระการเรียนรู้ทั่วไป";
  }
}

export function splitPrefixAndName(full: string): { prefix: string; name: string } {
  const prefixes = ["นางสาว", "นาย", "นาง", "ครู"];
  for (const p of prefixes) {
    if (full.startsWith(p)) {
      return { prefix: p, name: full.substring(p.length).trim() };
    }
  }
  return { prefix: "ครู", name: full.trim() };
}

export function parseSchoolTimetableText(
  csvContent: string,
  targetTerm?: { term: string; year: string }
): ParsedTimetableResult {
  const rows = parseCSVString(csvContent);

  let termString = "2/2569";
  let detectedYear = "2569";
  let detectedTerm = "2";

  // Scan for term in text
  for (const row of rows) {
    const text = row[0] || "";
    const termMatch = text.match(/ภาคเรียนที่\s*(\d+)\/(\d+)/);
    if (termMatch) {
      detectedTerm = termMatch[1];
      detectedYear = termMatch[2];
      termString = `${detectedTerm}/${detectedYear}`;
      break;
    }
  }

  if (targetTerm) {
    detectedTerm = targetTerm.term;
    detectedYear = targetTerm.year;
    termString = `${detectedTerm}/${detectedYear}`;
  }

  const termId = `term_${detectedYear}_${detectedTerm}`;
  const term: AcademicTerm = {
    id: termId,
    year: detectedYear,
    term: detectedTerm,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const teachersMap = new Map<string, Teacher>();
  const subjectsMap = new Map<string, Subject>();
  const classroomsMap = new Map<string, Classroom>();
  const roomSubjectTeacherMap = new Map<string, string>();

  // Pass 0: Detect Official Personnel Table if present
  const teacherHeaderIdx = rows.findIndex(
    (r) => r.some((c) => c.includes("ลำดับรวม")) && r.some((c) => c.includes("ชื่อ - สกุล"))
  );
  const maxTimetableRowIdx = teacherHeaderIdx >= 0 ? teacherHeaderIdx : rows.length;

  if (teacherHeaderIdx >= 0) {
    let tNum = 1;
    for (let i = teacherHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.length >= 4 && r[2] && r[3]) {
        const rawName = r[2].trim();
        let dept = r[3].trim();
        if (!dept || rawName.includes("ชื่อ - สกุล") || rawName.includes("ข้าราชการครู")) continue;
        if (!dept.startsWith("กลุ่มสาระการเรียนรู้")) {
          dept = "กลุ่มสาระการเรียนรู้" + dept;
        }
        const { prefix, name: cleanName } = splitPrefixAndName(rawName);
        const code = `T${String(tNum++).padStart(3, "0")}`;
        teachersMap.set(cleanName, {
          id: `tch_${cleanName.replace(/\s+/g, "_")}`,
          code,
          prefix,
          fullName: cleanName,
          department: dept,
        });
      }
    }
  }

  let currentClassroom = "";
  let inSubjectList = false;

  // Pass 1: Extract Classrooms, Subjects, and Teachers list
  for (let i = 0; i < maxTimetableRowIdx; i++) {
    const row = rows[i];
    const firstCol = row[0] || "";

    if (firstCol.includes("ตารางเรียน ชั้น ม.")) {
      inSubjectList = false;
      const match = firstCol.match(/ม\.\s*(\d+)\/(\d+)/);
      if (match) {
        const grade = `ม.${match[1]}`;
        const roomNum = match[2];
        const gradeRoom = `ม.${match[1]}/${roomNum}`;
        currentClassroom = gradeRoom;
        if (!classroomsMap.has(gradeRoom)) {
          classroomsMap.set(gradeRoom, {
            id: `cls_m${match[1]}_${roomNum}`,
            gradeRoom,
            grade,
            room: roomNum,
            pinCode: `${match[1]}10${roomNum}`,
          });
        }
      }
      continue;
    }

    if (firstCol.includes("รายการวิชาเรียนประจำชั้น")) {
      inSubjectList = true;
      continue;
    }

    if (inSubjectList) {
      if (
        firstCol === "รหัสวิชา" ||
        firstCol.startsWith("ตารางเรียน") ||
        firstCol.startsWith("ตารางสอน") ||
        firstCol.startsWith("ลงชื่อ")
      ) {
        if (firstCol.startsWith("ตารางเรียน") || firstCol.startsWith("ตารางสอน")) {
          inSubjectList = false;
        }
        continue;
      }

      const code = row[0];
      const name = row[1];
      const teacherName = row[2];

      if (code && name && code.length >= 4) {
        const dept = getDepartmentBySubject(code, name);
        if (!subjectsMap.has(code)) {
          subjectsMap.set(code, {
            id: `subj_${code.trim()}`,
            code,
            name,
            department: dept,
          });
        }

        if (teacherName && teacherName.length > 2) {
          const { prefix, name: cleanName } = splitPrefixAndName(teacherName);
          if (!teachersMap.has(cleanName)) {
            teachersMap.set(cleanName, {
              id: `tch_${cleanName.replace(/\s+/g, "_")}`,
              code: `T${(teachersMap.size + 1).toString().padStart(3, "0")}`,
              prefix,
              fullName: cleanName,
              department: dept,
            });
          }
          if (currentClassroom) {
            roomSubjectTeacherMap.set(`${currentClassroom}_${code}`, cleanName);
          }
        }
      }
    }
  }

  // Also scan teacher tables for teacher names
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstCol = row[0] || "";
    if (firstCol.includes("ตารางสอน") && !firstCol.includes("ตารางเรียน")) {
      const match = firstCol.match(/ตารางสอน\s+([^\s]+)\s+([^\s]+(?:\s+[^\s]+)?)\s+ภาคเรียน/);
      if (match) {
        const full = `${match[1]} ${match[2]}`.trim();
        const { prefix, name: cleanName } = splitPrefixAndName(full);
        if (!teachersMap.has(cleanName)) {
          teachersMap.set(cleanName, {
            id: `tch_${cleanName.replace(/\s+/g, "_")}`,
            code: `T${(teachersMap.size + 1).toString().padStart(3, "0")}`,
            prefix,
            fullName: cleanName,
            department: "กลุ่มสาระการเรียนรู้ทั่วไป",
          });
        }
      }
    }
  }

  // Pass 2: Extract periods from weekly grid
  const rawPeriodsList: {
    dayOfWeek: number;
    period: number;
    gradeRoom: string;
    subjectCode: string;
    teacherFullName: string;
    roomLocation: string;
  }[] = [];

  currentClassroom = "";
  inSubjectList = false;

  const dayNames: Record<string, number> = {
    จันทร์: 1,
    อังคาร: 2,
    พุธ: 3,
    "พฤหัสฯ": 4,
    ศุกร์: 5,
  };

  for (let i = 0; i < maxTimetableRowIdx; i++) {
    const row = rows[i];
    const firstCol = row[0] || "";

    if (firstCol.includes("ตารางเรียน ชั้น ม.")) {
      inSubjectList = false;
      const match = firstCol.match(/ม\.\s*(\d+)\/(\d+)/);
      if (match) {
        currentClassroom = `ม.${match[1]}/${match[2]}`;
      }
      continue;
    }

    if (firstCol.includes("รายการวิชาเรียนประจำชั้น")) {
      inSubjectList = true;
      continue;
    }

    if (inSubjectList) continue;

    if (currentClassroom && dayNames[firstCol]) {
      const dayOfWeek = dayNames[firstCol];
      const periodCols = [
        { period: 1, colIdx: 2 },
        { period: 2, colIdx: 3 },
        { period: 3, colIdx: 4 },
        { period: 4, colIdx: 5 },
        { period: 5, colIdx: 7 },
        { period: 6, colIdx: 8 },
        { period: 7, colIdx: 9 },
        { period: 8, colIdx: 10 },
      ];

      for (const p of periodCols) {
        const cell = row[p.colIdx];
        if (!cell || cell === "พักเที่ยง" || cell === "โฮมรูม") continue;

        const lines = cell.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;

        const codeOrAct = lines[0];
        const isActivityOnly = [
          "ชุมนุม",
          "ลูกเสือ",
          "เลือกเสรี",
          "ติวโอเน็ต",
          "ซ่อมเสริม",
          "บำเพ็ญประโยชน์",
        ].some((act) => codeOrAct.includes(act));

        if (isActivityOnly && lines.length === 1) {
          continue;
        }

        let teacherShort = lines[1] || "";
        let roomLoc = lines[2] || "";

        let teacherFullName = "";
        if (roomSubjectTeacherMap.has(`${currentClassroom}_${codeOrAct}`)) {
          teacherFullName = roomSubjectTeacherMap.get(`${currentClassroom}_${codeOrAct}`) || "";
        } else if (teacherShort) {
          const shortClean = teacherShort.replace(/^ครู/, "").trim();
          for (const fName of Array.from(teachersMap.keys())) {
            if (fName.startsWith(shortClean)) {
              teacherFullName = fName;
              break;
            }
          }
        }

        if (!teacherFullName && teacherShort) {
          const shortClean = teacherShort.replace(/^ครู/, "").trim();
          teacherFullName = shortClean;
          if (!teachersMap.has(shortClean)) {
            teachersMap.set(shortClean, {
              id: `tch_${shortClean.replace(/\s+/g, "_")}`,
              code: `T${(teachersMap.size + 1).toString().padStart(3, "0")}`,
              prefix: "ครู",
              fullName: shortClean,
              department: getDepartmentBySubject(codeOrAct),
            });
          }
        }

        if (!subjectsMap.has(codeOrAct)) {
          subjectsMap.set(codeOrAct, {
            id: `subj_${codeOrAct.trim()}`,
            code: codeOrAct,
            name: codeOrAct,
            department: getDepartmentBySubject(codeOrAct),
          });
        }

        rawPeriodsList.push({
          dayOfWeek,
          period: p.period,
          gradeRoom: currentClassroom,
          subjectCode: codeOrAct,
          teacherFullName: teacherFullName || "ไม่ระบุ",
          roomLocation: roomLoc,
        });
      }
    }
  }

  // Pass 3: Merge consecutive double periods
  const grouped: Record<string, typeof rawPeriodsList> = {};
  for (const item of rawPeriodsList) {
    const key = `${item.gradeRoom}_${item.dayOfWeek}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  const timetableEntries: TimetableEntry[] = [];

  for (const key of Object.keys(grouped)) {
    const items = grouped[key].sort((a, b) => a.period - b.period);
    let i = 0;
    while (i < items.length) {
      const cur = items[i];
      const next = items[i + 1];

      if (
        next &&
        next.period === cur.period + 1 &&
        next.subjectCode === cur.subjectCode &&
        next.teacherFullName === cur.teacherFullName &&
        !(cur.period === 4 && next.period === 5)
      ) {
        // Double period
        const subj = subjectsMap.get(cur.subjectCode);
        const tch = teachersMap.get(cur.teacherFullName);
        const cls = classroomsMap.get(cur.gradeRoom);

        timetableEntries.push({
          id: `tt_${cls ? cls.id : "c"}_d${cur.dayOfWeek}_p${cur.period}_${next.period}`,
          termId,
          dayOfWeek: cur.dayOfWeek,
          periodStart: cur.period,
          periodEnd: next.period,
          classroomId: cls ? cls.id : cur.gradeRoom,
          gradeRoom: cur.gradeRoom,
          subjectId: subj ? subj.id : `subj_${cur.subjectCode}`,
          subjectCode: cur.subjectCode,
          subjectName: subj ? subj.name : cur.subjectCode,
          teacherId: tch ? tch.id : `tch_${cur.teacherFullName}`,
          teacherName: tch ? `${tch.prefix}${tch.fullName}` : cur.teacherFullName,
          roomLocation: cur.roomLocation,
        });
        i += 2;
      } else {
        // Single period
        const subj = subjectsMap.get(cur.subjectCode);
        const tch = teachersMap.get(cur.teacherFullName);
        const cls = classroomsMap.get(cur.gradeRoom);

        timetableEntries.push({
          id: `tt_${cls ? cls.id : "c"}_d${cur.dayOfWeek}_p${cur.period}`,
          termId,
          dayOfWeek: cur.dayOfWeek,
          periodStart: cur.period,
          periodEnd: cur.period,
          classroomId: cls ? cls.id : cur.gradeRoom,
          gradeRoom: cur.gradeRoom,
          subjectId: subj ? subj.id : `subj_${cur.subjectCode}`,
          subjectCode: cur.subjectCode,
          subjectName: subj ? subj.name : cur.subjectCode,
          teacherId: tch ? tch.id : `tch_${cur.teacherFullName}`,
          teacherName: tch ? `${tch.prefix}${tch.fullName}` : cur.teacherFullName,
          roomLocation: cur.roomLocation,
        });
        i += 1;
      }
    }
  }

  return {
    term,
    classrooms: Array.from(classroomsMap.values()),
    teachers: Array.from(teachersMap.values()),
    subjects: Array.from(subjectsMap.values()),
    timetableEntries,
    summary: {
      totalClassrooms: classroomsMap.size,
      totalTeachers: teachersMap.size,
      totalSubjects: subjectsMap.size,
      totalPeriods: timetableEntries.length,
      termTitle: `ภาคเรียนที่ ${detectedTerm}/${detectedYear}`,
    },
  };
}
