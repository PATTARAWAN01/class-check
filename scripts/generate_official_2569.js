const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../src/data/school_timetable_2_2569_official.csv');
const content = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
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
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

const rows = parseCSV(content);

// 1. First: Parse Official Personnel Table at the bottom
const teacherHeaderIdx = rows.findIndex(r => r.some(c => c.includes('ลำดับรวม')) && r.some(c => c.includes('ชื่อ - สกุล')));
console.log('Teacher header index:', teacherHeaderIdx);

const officialTeachers = [];
const officialTeacherByName = new Map();
let tNum = 1;

for (let i = teacherHeaderIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length >= 4 && r[2] && r[3]) {
    const rawName = r[2].trim();
    let dept = r[3].trim();
    if (!dept || rawName.includes('ชื่อ - สกุล') || rawName.includes('ข้าราชการครู')) continue;
    if (!dept.startsWith('กลุ่มสาระการเรียนรู้')) {
      dept = 'กลุ่มสาระการเรียนรู้' + dept;
    }

    let prefix = 'ครู';
    let fullName = rawName;
    if (rawName.startsWith('นางสาว')) {
      prefix = 'นางสาว';
      fullName = rawName.substring(6).trim();
    } else if (rawName.startsWith('นาง')) {
      prefix = 'นาง';
      fullName = rawName.substring(3).trim();
    } else if (rawName.startsWith('นาย')) {
      prefix = 'นาย';
      fullName = rawName.substring(3).trim();
    }

    const code = 'T' + String(tNum++).padStart(3, '0');
    const teacherObj = {
      id: `tch_${fullName.replace(/\s+/g, '_')}`,
      code,
      prefix,
      fullName,
      department: dept
    };

    officialTeachers.push(teacherObj);
    officialTeacherByName.set(fullName, teacherObj);
    officialTeacherByName.set(rawName, teacherObj);
  }
}

console.log('Total official teachers parsed:', officialTeachers.length);

// Excluded activities that should NOT be checked:
const EXCLUDED_KEYWORDS = ['บำเพ็ญประโยชน์', 'พัฒนาทักษะชีวิต', 'พัฒนา', 'ทักษะชีวิต', 'ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด', 'ชุมนุม', 'สวดมนต์'];
function isExcludedActivity(str) {
  if (!str) return false;
  return EXCLUDED_KEYWORDS.some(k => str.includes(k));
}

function getDepartmentBySubject(code, name = '') {
  if (!code) return 'กลุ่มสาระการเรียนรู้ทั่วไป';
  if (name.includes('แนะแนว') || code.startsWith('ก')) return 'กิจกรรมพัฒนาผู้เรียน (แนะแนว)';
  if (name.includes('ทุจริต')) return 'กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม';
  const prefix = code.charAt(0);
  switch (prefix) {
    case 'ท': return 'กลุ่มสาระการเรียนรู้ภาษาไทย';
    case 'ค': return 'กลุ่มสาระการเรียนรู้คณิตศาสตร์';
    case 'ว': return 'กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี';
    case 'ส': return 'กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม';
    case 'พ': return 'กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา';
    case 'ศ': return 'กลุ่มสาระการเรียนรู้ศิลปะ';
    case 'ง': return 'กลุ่มสาระการเรียนรู้การงานอาชีพ';
    case 'อ':
    case 'จ': return 'กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ';
    case 'ก': return 'กิจกรรมพัฒนาผู้เรียน (แนะแนว)';
    case 'I': return 'การศึกษาค้นคว้าอิสระ (IS)';
    default: return 'กลุ่มสาระการเรียนรู้ทั่วไป';
  }
}

// 2. Parse Classrooms & Subjects
const classroomsMap = new Map();
const subjectsMap = new Map();
const roomSubjectTeacherMap = new Map();

let currentClassroom = null;
let inSubjectList = false;

for (let i = 0; i < teacherHeaderIdx; i++) {
  const row = rows[i];
  const firstCol = row[0] || '';

  if (firstCol.includes('ตารางเรียน ชั้น ม.')) {
    inSubjectList = false;
    const match = firstCol.match(/ม\.\s*(\d+)\/(\d+)/);
    if (match) {
      const grade = `ม.${match[1]}`;
      const roomNum = match[2];
      const gradeRoom = `ม.${match[1]}/${roomNum}`;
      currentClassroom = gradeRoom;
      if (!classroomsMap.has(gradeRoom)) {
        classroomsMap.set(gradeRoom, {
          id: `m${match[1]}_${roomNum}`,
          gradeRoom,
          grade,
          room: roomNum,
          pinCode: `${match[1]}10${roomNum}`
        });
      }
    }
    continue;
  }

  if (firstCol.includes('รายการวิชาเรียนประจำชั้น')) {
    inSubjectList = true;
    continue;
  }

  if (inSubjectList) {
    if (firstCol === 'รหัสวิชา' || firstCol.startsWith('ตารางเรียน') || firstCol.startsWith('ตารางสอน') || firstCol.startsWith('ลงชื่อ')) {
      if (firstCol.startsWith('ตารางเรียน') || firstCol.startsWith('ตารางสอน')) {
        inSubjectList = false;
      }
      continue;
    }

    const code = row[0];
    const name = row[1];
    const teacherName = row[2];

    // Filter out excluded activities (บำเพ็ญประโยชน์, พัฒนาทักษะชีวิต, ลูกเสือ, ชุมนุม)
    if (isExcludedActivity(code) || isExcludedActivity(name)) {
      continue;
    }

    if (code && name && code.length >= 4) {
      const dept = getDepartmentBySubject(code, name);
      if (!subjectsMap.has(code)) {
        subjectsMap.set(code, {
          id: `subj_${code.replace(/[^a-zA-Z0-9]/g, '_')}`,
          code,
          name,
          department: dept,
          assignedClassroomIds: []
        });
      }

      const subjObj = subjectsMap.get(code);
      const cls = currentClassroom ? classroomsMap.get(currentClassroom) : null;
      if (cls && !subjObj.assignedClassroomIds.includes(cls.id)) {
        subjObj.assignedClassroomIds.push(cls.id);
      }

      if (teacherName && teacherName.length > 2) {
        let cleanName = teacherName.replace(/^(นางสาว|นาง|นาย|ครู)/, '').trim();
        if (currentClassroom) {
          roomSubjectTeacherMap.set(`${currentClassroom}_${code}`, cleanName);
        }
      }
    }
  }
}

console.log('Classrooms parsed:', classroomsMap.size);
console.log('Subjects parsed:', subjectsMap.size);

// 3. Parse Weekly Timetable Grid
const rawPeriodsList = [];
currentClassroom = null;
inSubjectList = false;

const dayNames = {
  'จันทร์': 1,
  'อังคาร': 2,
  'พุธ': 3,
  'พฤหัสฯ': 4,
  'ศุกร์': 5
};

for (let i = 0; i < teacherHeaderIdx; i++) {
  const row = rows[i];
  const firstCol = row[0] || '';

  if (firstCol.includes('ตารางเรียน ชั้น ม.')) {
    inSubjectList = false;
    const match = firstCol.match(/ม\.\s*(\d+)\/(\d+)/);
    if (match) {
      currentClassroom = `ม.${match[1]}/${match[2]}`;
    }
    continue;
  }

  if (firstCol.includes('รายการวิชาเรียนประจำชั้น')) {
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
      if (!cell || cell === 'พักเที่ยง' || cell === 'โฮมรูม') continue;

      const cellClean = cell.replace(/[\r\n\s]+/g, '');
      if (isExcludedActivity(cellClean) || isExcludedActivity(cell)) continue;

      const lines = cell.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      const codeOrAct = lines[0];
      const isActivityOnly = ['ชุมนุม', 'ลูกเสือ', 'เลือกเสรี', 'ติวโอเน็ต', 'ซ่อมเสริม', 'บำเพ็ญประโยชน์', 'พัฒนาทักษะชีวิต', 'พัฒนา', 'ยุวกาชาด', 'เนตรนารี', 'สวดมนต์'].some(act => codeOrAct.includes(act));

      // Skip excluded activities completely
      if (isExcludedActivity(codeOrAct)) {
        continue;
      }

      if (isActivityOnly && lines.length === 1) {
        continue;
      }

      let teacherShort = lines[1] || '';
      let roomLoc = lines[2] || '';

      if (isExcludedActivity(teacherShort) || isExcludedActivity(roomLoc)) {
        continue;
      }

      // Match teacher full name from official teacher map
      let matchedTeacher = null;
      if (roomSubjectTeacherMap.has(`${currentClassroom}_${codeOrAct}`)) {
        const expectedFullName = roomSubjectTeacherMap.get(`${currentClassroom}_${codeOrAct}`);
        matchedTeacher = officialTeacherByName.get(expectedFullName);
      }

      if (!matchedTeacher && teacherShort) {
        const shortClean = teacherShort.replace(/^ครู/, '').trim();
        for (const t of officialTeachers) {
          if (t.fullName.startsWith(shortClean) || t.fullName.includes(shortClean)) {
            matchedTeacher = t;
            break;
          }
        }
      }

      // If still not in subjects map
      if (!subjectsMap.has(codeOrAct)) {
        subjectsMap.set(codeOrAct, {
          id: `subj_${codeOrAct.replace(/[^a-zA-Z0-9]/g, '_')}`,
          code: codeOrAct,
          name: codeOrAct,
          department: getDepartmentBySubject(codeOrAct)
        });
      }

      rawPeriodsList.push({
        dayOfWeek,
        period: p.period,
        gradeRoom: currentClassroom,
        subjectCode: codeOrAct,
        teacher: matchedTeacher || {
          id: 'tch_unknown',
          code: 'T999',
          prefix: 'ครู',
          fullName: teacherShort || 'ไม่ระบุ',
          department: getDepartmentBySubject(codeOrAct)
        },
        roomLocation: roomLoc
      });
    }
  }
}

console.log('Parsed raw periods:', rawPeriodsList.length);

// 4. Merge Double Periods
const grouped = {};
for (const item of rawPeriodsList) {
  const key = `${item.gradeRoom}_${item.dayOfWeek}`;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(item);
}

const mergedTimetableEntries = [];

for (const key of Object.keys(grouped)) {
  const items = grouped[key].sort((a, b) => a.period - b.period);
  let i = 0;
  while (i < items.length) {
    const cur = items[i];
    let next = items[i + 1];

    if (
      next &&
      next.period === cur.period + 1 &&
      next.subjectCode === cur.subjectCode &&
      next.teacher.id === cur.teacher.id &&
      // Don't merge across lunch break (period 4 and 5)
      !(cur.period === 4 && next.period === 5)
    ) {
      const subj = subjectsMap.get(cur.subjectCode);
      const cls = classroomsMap.get(cur.gradeRoom);

      mergedTimetableEntries.push({
        id: `tt_${cls.id}_d${cur.dayOfWeek}_p${cur.period}_${next.period}`,
        termId: 'term_2_2569',
        dayOfWeek: cur.dayOfWeek,
        periodStart: cur.period,
        periodEnd: next.period,
        classroomId: cls.id,
        gradeRoom: cur.gradeRoom,
        subjectId: subj ? subj.id : `subj_${cur.subjectCode}`,
        subjectCode: cur.subjectCode,
        subjectName: subj ? subj.name : cur.subjectCode,
        teacherId: cur.teacher.id,
        teacherName: `${cur.teacher.prefix}${cur.teacher.fullName}`,
        roomLocation: cur.roomLocation || next.roomLocation || undefined
      });
      i += 2;
    } else {
      const subj = subjectsMap.get(cur.subjectCode);
      const cls = classroomsMap.get(cur.gradeRoom);

      mergedTimetableEntries.push({
        id: `tt_${cls.id}_d${cur.dayOfWeek}_p${cur.period}`,
        termId: 'term_2_2569',
        dayOfWeek: cur.dayOfWeek,
        periodStart: cur.period,
        periodEnd: cur.period,
        classroomId: cls.id,
        gradeRoom: cur.gradeRoom,
        subjectId: subj ? subj.id : `subj_${cur.subjectCode}`,
        subjectCode: cur.subjectCode,
        subjectName: subj ? subj.name : cur.subjectCode,
        teacherId: cur.teacher.id,
        teacherName: `${cur.teacher.prefix}${cur.teacher.fullName}`,
        roomLocation: cur.roomLocation || undefined
      });
      i++;
    }
  }
}

console.log('Merged timetable entries:', mergedTimetableEntries.length);

// Generate sample attendance logs across the last 14 weekdays
const now = new Date();
const dates = [];
for (let d = 0; d < 14; d++) {
  const dt = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const day = dt.getDay();
  if (day >= 1 && day <= 5) {
    dates.push({
      dateStr: dt.toISOString().split('T')[0],
      dayOfWeek: day
    });
  }
}

const attendanceLogs = [];
let logCounter = 1;
const sampleEntries = mergedTimetableEntries.slice(0, 150);

sampleEntries.forEach((entry, idx) => {
  const matchedDates = dates.filter(d => d.dayOfWeek === entry.dayOfWeek);
  matchedDates.forEach((dObj, dIdx) => {
    const seed = (idx * 17 + dIdx * 31) % 100;
    let status = 'on_time';
    let absenceReason;
    let absenceNote;

    if (seed > 92) {
      status = 'absent';
      const reasons = ['official', 'sick', 'personal'];
      absenceReason = reasons[seed % 3];
      if (absenceReason === 'official') absenceNote = 'ไปราชการ อบรมเชิงปฏิบัติการ สพม.อด';
      else if (absenceReason === 'sick') absenceNote = 'ลาป่วย มีใบรับรองแพทย์';
      else absenceNote = 'ลากิจส่วนตัว';
    } else if (seed > 80) {
      status = 'late';
    }

    attendanceLogs.push({
      id: `rec_${logCounter++}`,
      termId: 'term_2_2569',
      date: dObj.dateStr,
      dayOfWeek: dObj.dayOfWeek,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      periodCount: entry.periodEnd - entry.periodStart + 1,
      classroomId: entry.classroomId,
      gradeRoom: entry.gradeRoom,
      subjectId: entry.subjectId,
      subjectCode: entry.subjectCode,
      subjectName: entry.subjectName,
      teacherId: entry.teacherId,
      teacherName: entry.teacherName,
      status,
      absenceReason,
      absenceNote,
      recordedByStudent: `นักเรียนหัวหน้าห้อง ${entry.gradeRoom}`,
      createdAt: `${dObj.dateStr}T${entry.periodStart === 1 ? '08:45:00' : '10:30:00'}Z`
    });
  });
});

console.log('Generated attendance logs:', attendanceLogs.length);

const classroomsArray = Array.from(classroomsMap.values());
const subjectsArray = Array.from(subjectsMap.values());

// Save to parsed_summary.json
const summary = {
  classrooms: classroomsArray,
  teachers: officialTeachers,
  subjects: subjectsArray,
  timetableCount: mergedTimetableEntries.length,
  attendanceCount: attendanceLogs.length
};
fs.writeFileSync(path.join(__dirname, '../src/data/parsed_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

// Write schoolData2569.ts
const schoolDataContent = `import { Classroom, Subject, Teacher, TimetableEntry, AttendanceRecord, AcademicTerm } from "@/types";

export const SCHOOL_TERM_2569: AcademicTerm = {
  id: "term_2_2569",
  year: "2569",
  term: "2",
  isActive: true,
  createdAt: "2026-11-15T00:00:00.000Z",
};

export const SCHOOL_CLASSROOMS: Classroom[] = ${JSON.stringify(classroomsArray, null, 2)};

export const SCHOOL_TEACHERS: Teacher[] = ${JSON.stringify(officialTeachers, null, 2)};

export const SCHOOL_SUBJECTS: Subject[] = ${JSON.stringify(subjectsArray, null, 2)};

export const SCHOOL_TIMETABLE: TimetableEntry[] = ${JSON.stringify(mergedTimetableEntries, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/lib/schoolData2569.ts'), schoolDataContent, 'utf8');
console.log('Successfully wrote src/lib/schoolData2569.ts');

// Write initialData.ts
const initialDataContent = `import { AcademicTerm, Classroom, Subject, Teacher, TimetableEntry, AttendanceRecord } from "@/types";
import { SCHOOL_TERM_2569, SCHOOL_CLASSROOMS, SCHOOL_TEACHERS, SCHOOL_SUBJECTS, SCHOOL_TIMETABLE } from "./schoolData2569";

export const INITIAL_TERMS: AcademicTerm[] = [
  SCHOOL_TERM_2569,
  {
    id: "term_1_2569",
    year: "2569",
    term: "1",
    isActive: false,
    createdAt: "2026-05-15T00:00:00.000Z",
  },
  {
    id: "term_2_2568",
    year: "2568",
    term: "2",
    isActive: false,
    createdAt: "2025-11-01T00:00:00.000Z",
  },
];

export const INITIAL_CLASSROOMS: Classroom[] = SCHOOL_CLASSROOMS;

export const INITIAL_TEACHERS: Teacher[] = SCHOOL_TEACHERS;

export const INITIAL_SUBJECTS: Subject[] = SCHOOL_SUBJECTS;

export const INITIAL_TIMETABLE: TimetableEntry[] = SCHOOL_TIMETABLE;

export const INITIAL_ATTENDANCE: AttendanceRecord[] = ${JSON.stringify(attendanceLogs, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/lib/initialData.ts'), initialDataContent, 'utf8');
console.log('Successfully wrote src/lib/initialData.ts');
