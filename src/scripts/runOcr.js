const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

// Load master data from parsed_summary.json
const masterDataPath = path.resolve(__dirname, '../data/parsed_summary.json');
let masterTeachers = [];
let masterSubjects = [];
let masterClassrooms = [];

try {
  const masterData = JSON.parse(fs.readFileSync(masterDataPath, 'utf8'));
  masterTeachers = masterData.teachers || [];
  masterSubjects = masterData.subjects || [];
  masterClassrooms = masterData.classrooms || [];
} catch (e) {
  console.error('Warning: could not load master data:', e.message);
}

// Helper to extract JPEG from PDF buffer
function extractJpegFromPdf(pdfBuffer) {
  if (pdfBuffer[0] === 0xff && pdfBuffer[1] === 0xd8) {
    return [pdfBuffer];
  }
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
  const images = [];
  while (offset < pdfBuffer.length) {
    const startIdx = pdfBuffer.indexOf(jpegHeader, offset);
    if (startIdx === -1) break;
    const endIdx = pdfBuffer.indexOf(jpegEOF, startIdx + 2);
    if (endIdx === -1) break;

    const imgBuf = pdfBuffer.slice(startIdx, endIdx + 2);
    if (imgBuf.length > 40000) {
      images.push(imgBuf);
    }
    offset = endIdx + 2;
  }
  return images;
}

function normalizeThai(str) {
  if (!str) return '';
  return str.replace(/[^ก-๙a-zA-Z0-9]/g, '');
}

function matchTeacher(ocrName) {
  if (!ocrName) return null;
  const cleanOcr = normalizeThai(ocrName);
  if (!cleanOcr || cleanOcr.length < 3) return null;

  let bestTeacher = null;
  let bestScore = 0;

  for (const t of masterTeachers) {
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

function matchClassroom(gradeRoom) {
  if (!gradeRoom) return null;
  const clean = gradeRoom.replace(/\s+/g, '');
  return masterClassrooms.find((c) => c.gradeRoom.replace(/\s+/g, '') === clean) || null;
}

function matchSubject(subjectCode) {
  if (!subjectCode) return null;
  const clean = subjectCode.replace(/\s+/g, '').toUpperCase();
  return masterSubjects.find((s) => s.code.replace(/\s+/g, '').toUpperCase() === clean) || null;
}

function parseThaiDate(text) {
  const m = text.match(
    /(?:วัน([^\s]+)\s+)?(\d{1,2})\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม|พ\.ย\.|ธ\.ค\.|ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.)\s+(\d{2,4})/
  );
  if (!m) return null;

  const dayStr = m[2];
  const monthName = m[3];
  let yearNum = parseInt(m[4], 10);
  if (yearNum > 2500) yearNum -= 543;
  else if (yearNum < 100) yearNum += 2000;

  const monthMap = {
    มกราคม: '01', 'ม.ค.': '01',
    กุมภาพันธ์: '02', 'ก.พ.': '02',
    มีนาคม: '03', 'มี.ค.': '03',
    เมษายน: '04', 'เม.ย.': '04',
    พฤษภาคม: '05', 'พ.ค.': '05',
    มิถุนายน: '06', 'มิ.ย.': '06',
    กรกฎาคม: '07', 'ก.ค.': '07',
    สิงหาคม: '08', 'ส.ค.': '08',
    กันยายน: '09', 'ก.ย.': '09',
    ตุลาคม: '10', 'ต.ค.': '10',
    พฤศจิกายน: '11', 'พ.ย.': '11',
    ธันวาคม: '12', 'ธ.ค.': '12',
  };

  const month = monthMap[monthName] || '11';
  const day = String(parseInt(dayStr, 10)).padStart(2, '0');
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

function parseDepartment(text) {
  if (text.includes('วิทยาศาสตร์')) return 'กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี';
  if (text.includes('คณิตศาสตร์')) return 'กลุ่มสาระการเรียนรู้คณิตศาสตร์';
  if (text.includes('ภาษาไทย')) return 'กลุ่มสาระการเรียนรู้ภาษาไทย';
  if (text.includes('ภาษาต่างประเทศ')) return 'กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ';
  if (text.includes('สังคม')) return 'กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม';
  if (text.includes('สุขศึกษา') || text.includes('พลศึกษา')) return 'กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา';
  if (text.includes('ศิลปะ')) return 'กลุ่มสาระการเรียนรู้ศิลปะ';
  if (text.includes('การงาน')) return 'กลุ่มสาระการเรียนรู้การงานอาชีพ';
  return 'กลุ่มสาระการเรียนรู้';
}

async function processFile(filePath) {
  const fileBuf = fs.readFileSync(filePath);
  const images = extractJpegFromPdf(fileBuf);
  if (images.length === 0) {
    throw new Error('No images could be extracted from this PDF/image file.');
  }

  const worker = await createWorker('tha+eng');
  let fullOcrText = '';
  for (let idx = 0; idx < Math.min(images.length, 2); idx++) {
    const res = await worker.recognize(images[idx]);
    fullOcrText += '\n' + res.data.text;
  }
  await worker.terminate();

  const parsedDate = parseThaiDate(fullOcrText);
  const department = parseDepartment(fullOcrText);

  const isoDate = parsedDate ? parsedDate.isoDate : new Date().toISOString().split('T')[0];
  const thaiDisplayDate = parsedDate ? parsedDate.thaiDisplayDate : 'วันที่ระบุในเอกสาร';
  const dayOfWeek = parsedDate ? parsedDate.dayOfWeek : 1;

  const lines = fullOcrText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const parsedItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeMatch = line.match(/(\d{1,2}[.:]\d{2})\s*-\s*(\d{1,2}[.:]\d{2})/);
    const leaveMatch = line.match(/(ลาป่วย|ลากิจ|ไปราชการ)/);

    if (timeMatch && leaveMatch) {
      const subLine = line;
      const mainLine = i > 0 ? lines[i - 1] : '';

      const timeRange = `${timeMatch[1]}-${timeMatch[2]}`;
      let period = 1;
      if (timeRange.startsWith('08')) period = 1;
      else if (timeRange.startsWith('09')) period = 2;
      else if (timeRange.startsWith('10')) period = 3;
      else if (timeRange.startsWith('11')) period = 4;
      else if (timeRange.startsWith('13.00') || timeRange.startsWith('13:00')) period = 5;
      else if (timeRange.startsWith('13.50') || timeRange.startsWith('13:50')) period = 6;
      else if (timeRange.startsWith('14')) period = 7;

      let leaveType = 'sick';
      if (subLine.includes('ลากิจ')) leaveType = 'personal';
      else if (subLine.includes('ไปราชการ')) leaveType = 'official';

      const roomMatch = subLine.match(/ม\.\s*([1-6])\s*[\/./]\s*([1-5])/);
      const gradeRoom = roomMatch ? `ม.${roomMatch[1]}/${roomMatch[2]}` : '';
      const matchedCls = matchClassroom(gradeRoom);

      const locMatch = subLine.match(/ห้อง\s*(\d+)/);
      const roomLocation = locMatch ? `ห้อง ${locMatch[1]}` : '';

      const subjMatch = mainLine.match(/([ก-ฮA-Za-z]\s*\d{5})/);
      const subjectCode = subjMatch ? subjMatch[1].replace(/\s+/g, '') : '';
      const matchedSubj = matchSubject(subjectCode);

      const isUnassigned =
        mainLine.includes('ยังไม่มีผู้สอนแทน') || subLine.includes('ยังไม่มีผู้สอนแทน');

      let rawAbsentTeacher = '';
      let rawSubstituteTeacher = '';

      if (subjMatch) {
        const parts = mainLine.split(subjMatch[0]);
        rawAbsentTeacher = parts[0].replace(/^[\d\s]+/, '').replace(/[\[\]|/\\=]/g, '').trim();
        if (!isUnassigned && parts.length > 1) {
          rawSubstituteTeacher = parts[1].replace(/[\[\]|/\\=]/g, '').trim();
        }
      }

      const absentTch = matchTeacher(rawAbsentTeacher);
      const subTch = isUnassigned ? null : matchTeacher(rawSubstituteTeacher);

      parsedItems.push({
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        periodStart: period,
        periodEnd: period,
        timeRange,
        gradeRoom: gradeRoom || (matchedCls ? matchedCls.gradeRoom : 'ม.1/1'),
        classroomId: matchedCls ? matchedCls.id : 'm1_1',
        roomLocation,
        subjectCode: subjectCode || (matchedSubj ? matchedSubj.code : ''),
        subjectName: matchedSubj ? matchedSubj.name : 'รายวิชาตามตารางสอน',
        leaveType,
        originalTeacherId: absentTch ? absentTch.id : '',
        originalTeacherName: absentTch
          ? `${absentTch.prefix}${absentTch.fullName}`
          : rawAbsentTeacher,
        originalTeacherDept: absentTch ? absentTch.department : department,
        substituteTeacherId: subTch ? subTch.id : '',
        substituteTeacherName: isUnassigned
          ? 'ยังไม่มีผู้สอนแทน'
          : subTch
          ? `${subTch.prefix}${subTch.fullName}`
          : rawSubstituteTeacher,
        substituteDept: subTch ? subTch.department : department,
        isAssigned: !isUnassigned && !!subTch,
        selected: !isUnassigned, // Default selected if teacher is assigned
        rawAbsentTeacher,
        rawSubstituteTeacher: isUnassigned ? 'ยังไม่มีผู้สอนแทน' : rawSubstituteTeacher,
      });
    }
  }

  return {
    success: true,
    isoDate,
    thaiDisplayDate,
    dayOfWeek,
    department,
    itemsCount: parsedItems.length,
    assignedCount: parsedItems.filter((i) => i.isAssigned).length,
    unassignedCount: parsedItems.filter((i) => !i.isAssigned).length,
    items: parsedItems,
  };
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(JSON.stringify({ success: false, error: 'File path required' }));
    process.exit(1);
  }
  processFile(filePath)
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((err) => {
      console.error(JSON.stringify({ success: false, error: err.message }));
      process.exit(1);
    });
}

module.exports = { processFile };
