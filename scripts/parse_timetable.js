const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../src/data/school_timetable_2_2569.csv');
const content = fs.readFileSync(csvPath, 'utf8');

// Function to parse CSV respecting quotes and newlines
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
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++; // handle CRLF
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
console.log('Total parsed rows:', rows.length);

const teachersMap = new Map(); // fullName -> { prefix, fullName, department, code }
const subjectsMap = new Map(); // code -> { code, name, department }
const classroomsMap = new Map(); // gradeRoom -> { id, gradeRoom, grade, room }
const timetableEntries = []; // { dayOfWeek, periodStart, periodEnd, gradeRoom, subjectCode, teacherFullName, roomLocation }

// Department mapper based on subject code
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

// Prefix extractor
function splitPrefixAndName(full) {
  const prefixes = ['นาย', 'นางสาว', 'นาง', 'ครู'];
  for (const p of prefixes) {
    if (full.startsWith(p)) {
      return { prefix: p, name: full.substring(p.length).trim() };
    }
  }
  return { prefix: 'ครู', name: full.trim() };
}

let currentClassroom = null;
let currentDay = null;
let inSubjectList = false;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const firstCol = row[0] || '';

  // 1. Detect Classroom schedule header
  // e.g. "ตารางเรียน ชั้น ม. 1/1 ภาคเรียนที่ 2/2569 โรงเรียนหนองวัวซอพิทยาคม"
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
          pinCode: `${match[1]}10${roomNum}` // standard PIN
        });
      }
    }
    continue;
  }

  // 2. Detect Subject list section
  // e.g. "รายการวิชาเรียนประจำชั้น ม.1/1"
  if (firstCol.includes('รายการวิชาเรียนประจำชั้น')) {
    inSubjectList = true;
    continue;
  }

  // If in subject list
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
    const periodCount = parseInt(row[3], 10) || 1;
    const roomLoc = row[4] || '';

    if (code && name && code.length >= 5) {
      const dept = getDepartmentBySubject(code, name);
      if (!subjectsMap.has(code)) {
        subjectsMap.set(code, { id: `subj_${code}`, code, name, department: dept });
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
      }
    }
    continue;
  }

  // 3. Detect Timetable grid row
  // Days: จันทร์, อังคาร, พุธ, พฤหัสฯ, ศุกร์
  const dayNames = {
    'จันทร์': 1,
    'อังคาร': 2,
    'พุธ': 3,
    'พฤหัสฯ': 4,
    'ศุกร์': 5
  };

  if (currentClassroom && dayNames[firstCol]) {
    const dayOfWeek = dayNames[firstCol];
    // Columns:
    // col 0: Day
    // col 1: โฮมรูม / สวดมนต์
    // col 2: คาบ 1
    // col 3: คาบ 2
    // col 4: คาบ 3
    // col 5: คาบ 4
    // col 6: พักเที่ยง
    // col 7: คาบ 5
    // col 8: คาบ 6
    // col 9: คาบ 7
    // col 10: คาบ 8 (if any)

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

      // Cell can be multi-line:
      // "ส21103\nครูชลาธิป\n126"
      const lines = cell.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      const codeOrAct = lines[0];
      // Check if it's an activity without teacher or general activity
      const isActivityOnly = ['ชุมนุม', 'ลูกเสือ', 'เลือกเสรี', 'ติวโอเน็ต', 'ซ่อมเสริม', 'บำเพ็ญประโยชน์'].some(act => codeOrAct.includes(act));

      if (isActivityOnly && lines.length === 1) {
        continue; // skip pure activities without teachers as requested
      }

      let teacherShort = lines[1] || '';
      let roomLoc = lines[2] || '';

      timetableEntries.push({
        dayOfWeek,
        period: p.period,
        gradeRoom: currentClassroom,
        subjectCode: codeOrAct,
        teacherShort,
        roomLoc,
        rawCell: cell
      });
    }
  }
}

console.log('Classrooms found:', classroomsMap.size, Array.from(classroomsMap.keys()));
console.log('Subjects found:', subjectsMap.size);
console.log('Teachers found:', teachersMap.size);
console.log('Total period entries parsed:', timetableEntries.length);

// Also look at teacher schedule blocks to enrich teacher names
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const firstCol = row[0] || '';
  if (firstCol.includes('ตารางสอน') && !firstCol.includes('ตารางเรียน')) {
    // e.g. "ตารางสอน นายณัฐวุฒิ ยันตะพันธ์ ภาคเรียนที่ 2/2569 โรงเรียนหนองวัวซอพิทยาคม"
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

console.log('Teachers after teacher table scan:', teachersMap.size);

fs.writeFileSync(path.join(__dirname, '../src/data/parsed_summary.json'), JSON.stringify({
  classroomsCount: classroomsMap.size,
  subjectsCount: subjectsMap.size,
  teachersCount: teachersMap.size,
  entriesCount: timetableEntries.length,
  classrooms: Array.from(classroomsMap.values()),
  subjects: Array.from(subjectsMap.values()),
  teachers: Array.from(teachersMap.values()),
  sampleEntries: timetableEntries.slice(0, 10)
}, null, 2));
