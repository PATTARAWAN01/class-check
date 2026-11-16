const fs = require('fs');
const path = require('path');

// Read the generated JSON summary or raw arrays
const summaryPath = path.join(__dirname, '../src/data/parsed_summary.json');
const rawSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

// Also read schoolData2569 to get timetable
const dataFile = fs.readFileSync(path.join(__dirname, '../src/lib/schoolData2569.ts'), 'utf8');

// Parse out classrooms, teachers, subjects, timetable
const classrooms = rawSummary.classrooms;
const teachers = rawSummary.teachers;
const subjects = rawSummary.subjects;

// Load merged timetable from file or re-merge
const timetableMatch = dataFile.match(/export const SCHOOL_TIMETABLE: TimetableEntry\[\] = (\[[\s\S]*?\]);/);
let timetable = [];
if (timetableMatch) {
  timetable = JSON.parse(timetableMatch[1]);
}

console.log('Classrooms:', classrooms.length);
console.log('Teachers:', teachers.length);
console.log('Subjects:', subjects.length);
console.log('Timetable entries:', timetable.length);

// Generate sample attendance records for recent dates
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

// Pick sample timetable entries across different rooms and days
const sampleEntries = timetable.slice(0, 120);

for (const entry of sampleEntries) {
  // Find matching dates for entry.dayOfWeek
  const matchDate = dates.find(d => d.dayOfWeek === entry.dayOfWeek);
  if (!matchDate) continue;

  // Decide status: 88% on_time, 8% late, 4% absent
  const rand = Math.random();
  let status = 'on_time';
  let absenceReason = undefined;
  let absenceNote = undefined;

  if (rand > 0.94) {
    status = 'absent';
    const reasons = ['official', 'sick', 'personal', 'other'];
    absenceReason = reasons[Math.floor(Math.random() * reasons.length)];
    if (absenceReason === 'official') absenceNote = 'ไปราชการอบรม สพม.อุดรธานี';
    else if (absenceReason === 'sick') absenceNote = 'ลาป่วยมีใบรับรองแพทย์';
    else if (absenceReason === 'personal') absenceNote = 'ลากิจส่วนตัว';
    else absenceNote = 'ติดภารกิจนิเทศการสอน';
  } else if (rand > 0.85) {
    status = 'late';
  }

  const periodCount = entry.periodEnd - entry.periodStart + 1;

  attendanceLogs.push({
    id: `att_init_${logCounter++}`,
    termId: 'term_2_2569',
    date: matchDate.dateStr,
    dayOfWeek: entry.dayOfWeek,
    periodStart: entry.periodStart,
    periodEnd: entry.periodEnd,
    periodCount,
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
    recordedByStudent: 'ด.ช.ธนกฤต (หัวหน้าห้อง)',
    createdAt: `${matchDate.dateStr}T10:00:00Z`
  });
}

console.log('Generated attendance logs:', attendanceLogs.length);

const outputTS = `import { AcademicTerm, Classroom, Subject, Teacher, TimetableEntry, AttendanceRecord } from "@/types";

export const INITIAL_TERMS: AcademicTerm[] = [
  {
    id: "term_2_2569",
    year: "2569",
    term: "2",
    isActive: true,
    createdAt: "2026-11-01T08:00:00Z",
  },
  {
    id: "term_1_2569",
    year: "2569",
    term: "1",
    isActive: false,
    createdAt: "2026-05-15T08:00:00Z",
  },
  {
    id: "term_2567_1",
    year: "2567",
    term: "1",
    isActive: false,
    createdAt: "2024-05-15T08:00:00Z",
  },
];

export const INITIAL_CLASSROOMS: Classroom[] = ${JSON.stringify(classrooms, null, 2)};

export const INITIAL_TEACHERS: Teacher[] = ${JSON.stringify(teachers, null, 2)};

export const INITIAL_SUBJECTS: Subject[] = ${JSON.stringify(subjects, null, 2)};

export const INITIAL_TIMETABLE: TimetableEntry[] = ${JSON.stringify(timetable, null, 2)};

export const INITIAL_ATTENDANCE: AttendanceRecord[] = ${JSON.stringify(attendanceLogs, null, 2)};
export const INITIAL_ATTENDANCE_LOGS: AttendanceRecord[] = INITIAL_ATTENDANCE;
`;

fs.writeFileSync(path.join(__dirname, '../src/lib/initialData.ts'), outputTS);
console.log('Successfully updated src/lib/initialData.ts with real school data!');
