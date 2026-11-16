const fs = require('fs');
const code = fs.readFileSync('src/lib/schoolData2569.ts', 'utf8');
const ttBlock = code.split('export const SCHOOL_TIMETABLE: TimetableEntry[] = ')[1].trim().replace(/;$/, '');
const tt = eval(ttBlock);
const patTT = tt.filter(e => e.subjectCode.includes('พัฒนา') || e.subjectName.includes('พัฒนา') || e.teacherName.includes('ทักษะ'));
console.log('Timetable entries matching พัฒนา or ทักษะ:', patTT.length);

const subBlock = code.split('export const SCHOOL_SUBJECTS: Subject[] = ')[1].split('export const SCHOOL_TIMETABLE')[0].trim().replace(/;$/, '');
const subs = eval(subBlock);
console.log('Subjects matching พัฒนา:', subs.filter(s => s.name.includes('พัฒนา') || s.code.includes('พัฒนา')));
