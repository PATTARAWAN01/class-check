import type { Classroom, Subject, Teacher, TimetableEntry, AcademicTerm } from "@/types";

export interface TimetableDiffItem {
  type: "added" | "modified" | "removed";
  key: string;
  gradeRoom: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  oldEntry?: TimetableEntry;
  newEntry?: TimetableEntry;
  changedFields?: string[];
}

export interface TimetableDiffResult {
  added: TimetableEntry[];
  modified: { oldEntry: TimetableEntry; newEntry: TimetableEntry; changedFields: string[] }[];
  removed: TimetableEntry[];
  unchangedCount: number;
  affectedClassrooms: string[];
  items: TimetableDiffItem[];
}

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
    const text = row.join(" ");
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

  // Match production termId convention (e.g. term_2_2569)
  const termId = `term_${detectedTerm}_${detectedYear}`;
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
  const subjectClassroomsMap = new Map<string, Set<string>>();

  const addClassroomToSubject = (subjectCode: string, classroomId: string) => {
    if (!subjectCode || !classroomId) return;
    if (!subjectClassroomsMap.has(subjectCode)) {
      subjectClassroomsMap.set(subjectCode, new Set<string>());
    }
    subjectClassroomsMap.get(subjectCode)!.add(classroomId);
  };

  const extractClassroomHeader = (row: string[]) => {
    const joined = row.map((c) => c.trim()).filter(Boolean).join(" ");
    if (!joined.includes("ตารางเรียน")) return null;
    const match = joined.match(/ม\.\s*(\d+)\/(\d+)/);
    if (!match) return null;
    const gradeNum = match[1];
    const roomNum = match[2];
    const grade = `ม.${gradeNum}`;
    const gradeRoom = `ม.${gradeNum}/${roomNum}`;
    // Match production classroomId convention (e.g. m1_1)
    const id = `m${gradeNum}_${roomNum}`;
    return { id, grade, roomNum, gradeRoom, gradeNum };
  };

  // Pass 0: Detect Official Personnel Table(s) anywhere across all sheets
  {
    let inPersonnelTable = false;
    let nameColIdx = 2;
    let deptColIdx = 3;
    let tNum = 1;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const joined = r.map((c) => c.trim()).filter(Boolean).join(" ");

      if (
        r.some((c) => c.includes("ลำดับรวม")) &&
        r.some((c) => c.includes("ชื่อ - สกุล") || c.includes("ชื่อ-สกุล"))
      ) {
        inPersonnelTable = true;
        const foundNameIdx = r.findIndex(
          (c) => c.includes("ชื่อ - สกุล") || c.includes("ชื่อ-สกุล")
        );
        const foundDeptIdx = r.findIndex((c) => c.includes("กลุ่มสาระ"));
        nameColIdx = foundNameIdx >= 0 ? foundNameIdx : 2;
        deptColIdx = foundDeptIdx >= 0 ? foundDeptIdx : 3;
        continue;
      }

      if (
        joined.includes("ตารางเรียน") ||
        joined.includes("รายการวิชาเรียนประจำชั้น") ||
        (joined.includes("ตารางสอน") && !joined.includes("สารสนเทศ"))
      ) {
        inPersonnelTable = false;
        continue;
      }

      if (inPersonnelTable && r[nameColIdx] && r[deptColIdx]) {
        const rawName = r[nameColIdx].trim();
        let dept = r[deptColIdx].trim();
        if (
          !dept ||
          rawName.includes("ชื่อ - สกุล") ||
          rawName.includes("ชื่อ-สกุล") ||
          rawName.includes("ข้าราชการครู")
        ) {
          continue;
        }
        if (!dept.startsWith("กลุ่มสาระการเรียนรู้")) {
          dept = "กลุ่มสาระการเรียนรู้" + dept;
        }
        const { prefix, name: cleanName } = splitPrefixAndName(rawName);
        if (!cleanName) continue;
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
  let currentClassroomId = "";
  let inSubjectList = false;

  // Pass 1: Extract Classrooms, Subjects, and Teachers list across all sheets
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstCol = (row[0] || "").trim();
    const rowJoined = row.map((c) => c.trim()).filter(Boolean).join(" ");

    const clsHeader = extractClassroomHeader(row);
    if (clsHeader) {
      inSubjectList = false;
      currentClassroom = clsHeader.gradeRoom;
      currentClassroomId = clsHeader.id;
      if (!classroomsMap.has(clsHeader.gradeRoom)) {
        classroomsMap.set(clsHeader.gradeRoom, {
          id: clsHeader.id,
          gradeRoom: clsHeader.gradeRoom,
          grade: clsHeader.grade,
          room: clsHeader.roomNum,
          pinCode: `${clsHeader.gradeNum}10${clsHeader.roomNum}`,
        });
      }
      continue;
    }

    if (rowJoined.includes("รายการวิชาเรียนประจำชั้น")) {
      inSubjectList = true;
      const listMatch = rowJoined.match(/ม\.\s*(\d+)\/(\d+)/);
      if (listMatch) {
        const gradeNum = listMatch[1];
        const roomNum = listMatch[2];
        const gradeRoom = `ม.${gradeNum}/${roomNum}`;
        const id = `m${gradeNum}_${roomNum}`;
        currentClassroom = gradeRoom;
        currentClassroomId = id;
        if (!classroomsMap.has(gradeRoom)) {
          classroomsMap.set(gradeRoom, {
            id,
            gradeRoom,
            grade: `ม.${gradeNum}`,
            room: roomNum,
            pinCode: `${gradeNum}10${roomNum}`,
          });
        }
      }
      continue;
    }

    if (
      rowJoined.includes("สารสนเทศพื้นฐาน") ||
      (row.some((c) => c.includes("ลำดับรวม")) &&
        row.some((c) => c.includes("ชื่อ - สกุล") || c.includes("ชื่อ-สกุล")))
    ) {
      inSubjectList = false;
      continue;
    }

    if (inSubjectList) {
      if (
        firstCol === "รหัสวิชา" ||
        firstCol.startsWith("ตารางเรียน") ||
        firstCol.startsWith("ตารางสอน") ||
        firstCol.startsWith("ลงชื่อ") ||
        firstCol === "คาบที่" ||
        firstCol === "เวลา"
      ) {
        if (
          firstCol.startsWith("ตารางเรียน") ||
          firstCol.startsWith("ตารางสอน") ||
          firstCol === "คาบที่"
        ) {
          inSubjectList = false;
        }
        continue;
      }

      const code = (row[0] || "").trim();
      const name = (row[1] || "").trim();
      const teacherName = (row[2] || "").trim();

      if (code && name && code.length >= 4 && !code.includes("ลำดับ")) {
        const dept = getDepartmentBySubject(code, name);
        if (!subjectsMap.has(code)) {
          subjectsMap.set(code, {
            id: `subj_${code}`,
            code,
            name,
            department: dept,
          });
        }
        if (currentClassroomId) {
          addClassroomToSubject(code, currentClassroomId);
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
    const firstCol = (row[0] || "").trim();
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

  // Pass 2: Extract periods from weekly grid across all sheets
  const rawPeriodsMap = new Map<
    string,
    {
      dayOfWeek: number;
      period: number;
      gradeRoom: string;
      subjectCode: string;
      teacherFullName: string;
      roomLocation: string;
    }
  >();

  currentClassroom = "";
  currentClassroomId = "";
  inSubjectList = false;

  const defaultPeriodCols = [
    { period: 1, colIdx: 2 },
    { period: 2, colIdx: 3 },
    { period: 3, colIdx: 4 },
    { period: 4, colIdx: 5 },
    { period: 5, colIdx: 7 },
    { period: 6, colIdx: 8 },
    { period: 7, colIdx: 9 },
    { period: 8, colIdx: 10 },
  ];
  let activePeriodCols = defaultPeriodCols;
  let activeDayColIdx = 0;

  const dayNames: Record<string, number> = {
    จันทร์: 1,
    วันจันทร์: 1,
    อังคาร: 2,
    วันอังคาร: 2,
    พุธ: 3,
    วันพุธ: 3,
    "พฤหัสฯ": 4,
    พฤหัส: 4,
    พฤหัสบดี: 4,
    วันพฤหัสบดี: 4,
    "วันพฤหัสฯ": 4,
    ศุกร์: 5,
    วันศุกร์: 5,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowJoined = row.map((c) => c.trim()).filter(Boolean).join(" ");

    const clsHeader = extractClassroomHeader(row);
    if (clsHeader) {
      inSubjectList = false;
      currentClassroom = clsHeader.gradeRoom;
      currentClassroomId = clsHeader.id;
      activePeriodCols = defaultPeriodCols;
      activeDayColIdx = 0;
      continue;
    }

    if (
      rowJoined.includes("รายการวิชาเรียนประจำชั้น") ||
      rowJoined.includes("สารสนเทศพื้นฐาน") ||
      (row.some((c) => c.includes("ลำดับรวม")) &&
        row.some((c) => c.includes("ชื่อ - สกุล") || c.includes("ชื่อ-สกุล")))
    ) {
      inSubjectList = true;
      continue;
    }

    if (inSubjectList) continue;

    // Dynamically detect period column indices from the "คาบที่" header row if present
    const periodHeaderColIdx = row.findIndex((c) => c.trim() === "คาบที่");
    if (currentClassroom && periodHeaderColIdx >= 0) {
      const detectedCols: { period: number; colIdx: number }[] = [];
      for (let col = periodHeaderColIdx + 1; col < row.length; col++) {
        const val = (row[col] || "").trim();
        if (/^[1-9]$/.test(val)) {
          detectedCols.push({ period: Number(val), colIdx: col });
        }
      }
      if (detectedCols.length >= 6) {
        activePeriodCols = detectedCols;
        activeDayColIdx = periodHeaderColIdx;
      }
      continue;
    }

    const dayCell = (row[activeDayColIdx] || row[0] || "").trim();
    if (currentClassroom && dayNames[dayCell]) {
      const dayOfWeek = dayNames[dayCell];

      for (const p of activePeriodCols) {
        const cell = (row[p.colIdx] || "").trim();
        if (!cell || cell === "พักเที่ยง" || cell === "โฮมรูม") continue;

        const lines = cell
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) continue;

        const codeOrAct = lines[0];
        const joinedCell = lines.join(" ").replace(/\s+/g, "");
        const looksLikeSubjectCode = /^[ก-ฮA-Za-z]\d{4,6}/.test(codeOrAct);
        const isActivityOnly =
          !looksLikeSubjectCode &&
          [
            "ชุมนุม",
            "ลูกเสือ",
            "เนตรนารี",
            "ยุวกาชาด",
            "เลือกเสรี",
            "ติวโอเน็ต",
            "ซ่อมเสริม",
            "บำเพ็ญประโยชน์",
            "พัฒนาทักษะชีวิต",
            "สวดมนต์",
            "โฮมรูม",
            "พักเที่ยง",
          ].some((act) => joinedCell.includes(act));

        if (isActivityOnly) {
          continue;
        }

        const teacherShort = lines[1] || "";
        const roomLoc = lines[2] || "";

        const resolveFullTeacherName = (candidate: string): string => {
          const clean = candidate.replace(/^ครู/, "").trim();
          if (!clean) return "";
          // If already a full name (contains space) and exists in teachersMap, keep it
          if (clean.includes(" ") && teachersMap.has(clean)) {
            return clean;
          }
          // Try unique first-name match against known full names in teachersMap
          const matches = Array.from(teachersMap.keys()).filter(
            (fName) => fName.includes(" ") && (fName === clean || fName.startsWith(clean + " "))
          );
          if (matches.length === 1) {
            return matches[0];
          }
          // Fallback prefix match
          const prefixMatches = Array.from(teachersMap.keys()).filter(
            (fName) => fName.includes(" ") && fName.startsWith(clean)
          );
          if (prefixMatches.length === 1) {
            return prefixMatches[0];
          }
          return clean;
        };

        let teacherFullName = "";
        if (roomSubjectTeacherMap.has(`${currentClassroom}_${codeOrAct}`)) {
          teacherFullName = resolveFullTeacherName(
            roomSubjectTeacherMap.get(`${currentClassroom}_${codeOrAct}`) || ""
          );
        } else if (teacherShort) {
          teacherFullName = resolveFullTeacherName(teacherShort);
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
        if (currentClassroomId) {
          addClassroomToSubject(codeOrAct, currentClassroomId);
        }

        // Deduplicate by classroom + day + period
        const periodKey = `${currentClassroom}_${dayOfWeek}_${p.period}`;
        rawPeriodsMap.set(periodKey, {
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

  const rawPeriodsList = Array.from(rawPeriodsMap.values());

  // Attach assignedClassroomIds to each parsed subject
  for (const [code, subj] of Array.from(subjectsMap.entries())) {
    const assigned = subjectClassroomsMap.get(code);
    if (assigned && assigned.size > 0) {
      subj.assignedClassroomIds = Array.from(assigned).sort();
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

  // Sort classrooms naturally (e.g. ม.1/1, ม.1/2, ..., ม.6/4)
  const sortedClassrooms = Array.from(classroomsMap.values()).sort((a, b) => {
    const ga = Number(a.grade.replace(/\D/g, "")) || 0;
    const gb = Number(b.grade.replace(/\D/g, "")) || 0;
    if (ga !== gb) return ga - gb;
    return (Number(a.room) || 0) - (Number(b.room) || 0);
  });

  return {
    term,
    classrooms: sortedClassrooms,
    teachers: Array.from(teachersMap.values()),
    subjects: Array.from(subjectsMap.values()),
    timetableEntries,
    summary: {
      totalClassrooms: sortedClassrooms.length,
      totalTeachers: teachersMap.size,
      totalSubjects: subjectsMap.size,
      totalPeriods: timetableEntries.length,
      termTitle: `ภาคเรียนที่ ${detectedTerm}/${detectedYear}`,
    },
  };
}

/**
 * Compares existing Firestore timetable entries against incoming parsed entries
 * (scoped ONLY to classrooms present in the incoming file) so that only changed,
 * added, or removed entries are modified.
 */
export function computeTimetableDiff(
  existingEntries: TimetableEntry[],
  incomingEntries: TimetableEntry[],
  importedGradeRooms?: string[]
): TimetableDiffResult {
  const norm = (s?: string) => (s || "").replace(/\s+/g, " ").trim();
  const slotKey = (e: TimetableEntry) =>
    `${norm(e.gradeRoom)}|${e.dayOfWeek}|${e.periodStart}|${e.periodEnd}`;

  const scopedRooms = new Set<string>(
    (importedGradeRooms && importedGradeRooms.length > 0
      ? importedGradeRooms
      : incomingEntries.map((e) => e.gradeRoom)
    ).map((r) => norm(r))
  );

  // Build map of existing entries for scoped classrooms only
  const existingBySlot = new Map<string, TimetableEntry>();
  for (const ex of existingEntries) {
    if (!scopedRooms.has(norm(ex.gradeRoom))) continue;
    existingBySlot.set(slotKey(ex), ex);
  }

  const added: TimetableEntry[] = [];
  const modified: { oldEntry: TimetableEntry; newEntry: TimetableEntry; changedFields: string[] }[] = [];
  const removed: TimetableEntry[] = [];
  const items: TimetableDiffItem[] = [];
  const affectedRoomsSet = new Set<string>();
  const incomingSlots = new Set<string>();
  let unchangedCount = 0;

  for (const inc of incomingEntries) {
    const key = slotKey(inc);
    incomingSlots.add(key);
    const ex = existingBySlot.get(key);

    if (!ex) {
      added.push(inc);
      affectedRoomsSet.add(inc.gradeRoom);
      items.push({
        type: "added",
        key: `add|${key}`,
        gradeRoom: inc.gradeRoom,
        dayOfWeek: inc.dayOfWeek,
        periodStart: inc.periodStart,
        periodEnd: inc.periodEnd,
        newEntry: inc,
      });
    } else {
      const changedFields: string[] = [];
      if (
        norm(ex.subjectCode) !== norm(inc.subjectCode) ||
        norm(ex.subjectName) !== norm(inc.subjectName)
      ) {
        changedFields.push("วิชา");
      }
      if (norm(ex.teacherName) !== norm(inc.teacherName)) {
        changedFields.push("ครูผู้สอน");
      }
      if (norm(ex.roomLocation) !== norm(inc.roomLocation)) {
        changedFields.push("ห้องเรียน/สถานที่");
      }

      if (changedFields.length === 0) {
        unchangedCount += 1;
      } else {
        modified.push({ oldEntry: ex, newEntry: inc, changedFields });
        affectedRoomsSet.add(inc.gradeRoom);
        items.push({
          type: "modified",
          key: `mod|${key}`,
          gradeRoom: inc.gradeRoom,
          dayOfWeek: inc.dayOfWeek,
          periodStart: inc.periodStart,
          periodEnd: inc.periodEnd,
          oldEntry: ex,
          newEntry: inc,
          changedFields,
        });
      }
    }
  }

  for (const [key, ex] of Array.from(existingBySlot.entries())) {
    if (!incomingSlots.has(key)) {
      removed.push(ex);
      affectedRoomsSet.add(ex.gradeRoom);
      items.push({
        type: "removed",
        key: `rem|${key}`,
        gradeRoom: ex.gradeRoom,
        dayOfWeek: ex.dayOfWeek,
        periodStart: ex.periodStart,
        periodEnd: ex.periodEnd,
        oldEntry: ex,
      });
    }
  }

  const parseRoomOrder = (gradeRoom: string) => {
    const m = gradeRoom.match(/(\d+)\/(\d+)/);
    return m ? Number(m[1]) * 100 + Number(m[2]) : 9999;
  };

  items.sort((a, b) => {
    const ra = parseRoomOrder(a.gradeRoom);
    const rb = parseRoomOrder(b.gradeRoom);
    if (ra !== rb) return ra - rb;
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    if (a.periodStart !== b.periodStart) return a.periodStart - b.periodStart;
    return a.type.localeCompare(b.type);
  });

  const affectedClassrooms = Array.from(affectedRoomsSet).sort(
    (a, b) => parseRoomOrder(a) - parseRoomOrder(b)
  );

  return {
    added,
    modified,
    removed,
    unchangedCount,
    affectedClassrooms,
    items,
  };
}
