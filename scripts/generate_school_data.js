const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../src/data/school_timetable_2_2569.csv');
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

function getDepartmentBySubject(code, name = '') {
  if (!code) return 'กลุ่มสาระการเรียนรู้ทั่วไป';
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

function splitPrefixAndName(full) {
  const prefixes = ['นางสาว', 'นาย', 'นาง', 'ครู'];
  for (const p of prefixes) {
    if (full.startsWith(p)) {
      return { prefix: p, name: full.substring(p.length).trim() };
    }
  }
  return { prefix: 'ครู', name: full.trim() };
}

const teachersMap = new Map();
const subjectsMap = new Map();
const classroomsMap = new Map();
// room + subject -> teacher full name
const roomSubjectTeacherMap = new Map();

// 1. First Pass: Collect all subjects and teachers from "รายการวิชาเรียนประจำชั้น"
let currentClassroom = null;
let inSubjectList = false;

for (let i = 0; i < rows.length; i++) {
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

    if (code && name && code.length >= 4) {
      const dept = getDepartmentBySubject(code, name);
      if (!subjectsMap.has(code)) {
        subjectsMap.set(code, {
          id: `subj_${code.replace(/[^a-zA-Z0-9]/g, '_')}`,
          code,
          name,
          department: dept
        });
      }

      if (teacherName && teacherName.length > 2) {
        const { prefix, name: cleanName } = splitPrefixAndName(teacherName);
        if (!teachersMap.has(cleanName)) {
          teachersMap.set(cleanName, {
            id: `tch_${cleanName.replace(/\s+/g, '_')}`,
            code: `T${(teachersMap.size + 1).toString().padStart(3, '0')}`,
            prefix,
            fullName: cleanName,
            department: dept
          });
        }
        if (currentClassroom) {
          roomSubjectTeacherMap.set(`${currentClassroom}_${code}`, cleanName);
        }
      }
    }
  }
}

// Also check teacher table blocks
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const firstCol = row[0] || '';
  if (firstCol.includes('ตารางสอน') && !firstCol.includes('ตารางเรียน')) {
    const match = firstCol.match(/ตารางสอน\s+([^\s]+)\s+([^\s]+(?:\s+[^\s]+)?)\s+ภาคเรียน/);
    if (match) {
      const full = `${match[1]} ${match[2]}`.trim();
      const { prefix, name: cleanName } = splitPrefixAndName(full);
      if (!teachersMap.has(cleanName)) {
        teachersMap.set(cleanName, {
          id: `tch_${cleanName.replace(/\s+/g, '_')}`,
          code: `T${(teachersMap.size + 1).toString().padStart(3, '0')}`,
          prefix,
          fullName: cleanName,
          department: 'กลุ่มสาระการเรียนรู้ทั่วไป'
        });
      }
    }
  }
}

// 2. Second Pass: Parse the Weekly Timetable Grid
const rawPeriodsList = []; // { dayOfWeek, period, gradeRoom, subjectCode, teacherName, roomLocation }

currentClassroom = null;
inSubjectList = false;

const dayNames = {
  'จันทร์': 1,
  'อังคาร': 2,
  'พุธ': 3,
  'พฤหัสฯ': 4,
  'ศุกร์': 5
};

for (let i = 0; i < rows.length; i++) {
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

      const lines = cell.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      const codeOrAct = lines[0];
      const isActivityOnly = ['ชุมนุม', 'ลูกเสือ', 'เลือกเสรี', 'ติวโอเน็ต', 'ซ่อมเสริม', 'บำเพ็ญประโยชน์'].some(act => codeOrAct.includes(act));

      if (isActivityOnly && lines.length === 1) {
        continue;
      }

      let teacherShort = lines[1] || '';
      let roomLoc = lines[2] || '';

      // Match teacher full name
      let teacherFullName = '';
      if (roomSubjectTeacherMap.has(`${currentClassroom}_${codeOrAct}`)) {
        teacherFullName = roomSubjectTeacherMap.get(`${currentClassroom}_${codeOrAct}`);
      } else if (teacherShort) {
        const shortClean = teacherShort.replace(/^ครู/, '').trim();
        for (const [fName, tObj] of teachersMap.entries()) {
          if (fName.startsWith(shortClean)) {
            teacherFullName = fName;
            break;
          }
        }
      }

      // If still not found, check if teacherShort itself is in teachersMap
      if (!teacherFullName && teacherShort) {
        const shortClean = teacherShort.replace(/^ครู/, '').trim();
        teacherFullName = shortClean;
        if (!teachersMap.has(shortClean)) {
          teachersMap.set(shortClean, {
            id: `tch_${shortClean.replace(/\s+/g, '_')}`,
            code: `T${(teachersMap.size + 1).toString().padStart(3, '0')}`,
            prefix: 'ครู',
            fullName: shortClean,
            department: getDepartmentBySubject(codeOrAct)
          });
        }
      }

      // If subject not in map, create entry
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
        teacherFullName: teacherFullName || 'ไม่ระบุ',
        roomLocation: roomLoc
      });
    }
  }
}

console.log('Parsed raw periods:', rawPeriodsList.length);

// 3. Merge Double Periods (consecutive periods with same day, room, subject, teacher)
// Group by classroom and day
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
      next.teacherFullName === cur.teacherFullName &&
      // Don't merge across lunch break (period 4 and 5)
      !(cur.period === 4 && next.period === 5)
    ) {
      // Double period
      const subj = subjectsMap.get(cur.subjectCode);
      const tch = teachersMap.get(cur.teacherFullName);
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
        teacherId: tch ? tch.id : `tch_${cur.teacherFullName}`,
        teacherName: tch ? `${tch.prefix}${tch.fullName}` : cur.teacherFullName,
        roomLocation: cur.roomLocation
      });
      i += 2;
    } else {
      // Single period
      const subj = subjectsMap.get(cur.subjectCode);
      const tch = teachersMap.get(cur.teacherFullName);
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
        teacherId: tch ? tch.id : `tch_${cur.teacherFullName}`,
        teacherName: tch ? `${tch.prefix}${tch.fullName}` : cur.teacherFullName,
        roomLocation: cur.roomLocation
      });
      i += 1;
    }
  }
}

console.log('Merged timetable entries count:', mergedTimetableEntries.length);

// Generate TypeScript Output
const tsOutput = `import { AcademicTerm, Teacher, Subject, Classroom, TimetableEntry, AttendanceRecord } from "@/types";

export const SCHOOL_TERMS: AcademicTerm[] = [
  {
    id: "term_2_2569",
    year: "2569",
    term: "2",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "term_1_2567",
    year: "2567",
    term: "1",
    isActive: false,
    createdAt: new Date().toISOString(),
  },
];

export const SCHOOL_CLASSROOMS: Classroom[] = ${JSON.stringify(Array.from(classroomsMap.values()), null, 2)};

export const SCHOOL_TEACHERS: Teacher[] = ${JSON.stringify(Array.from(teachersMap.values()), null, 2)};

export const SCHOOL_SUBJECTS: Subject[] = ${JSON.stringify(Array.from(subjectsMap.values()), null, 2)};

export const SCHOOL_TIMETABLE: TimetableEntry[] = ${JSON.stringify(mergedTimetableEntries, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/lib/schoolData2569.ts'), tsOutput);
console.log('Successfully wrote src/lib/schoolData2569.ts!');
