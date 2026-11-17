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

function cleanSubjectCode(rawCode, dept) {
  if (!rawCode) return '';
  let clean = rawCode.replace(/\s+/g, '').toUpperCase();
  if (masterSubjects.some((s) => s.code.replace(/\s+/g, '').toUpperCase() === clean)) {
    return clean;
  }
  if (/^[80Oo]\d{5}$/i.test(clean)) {
    const candidate = 'อ' + clean.substring(1);
    if (masterSubjects.some((s) => s.code.replace(/\s+/g, '').toUpperCase() === candidate)) {
      return candidate;
    }
  }
  if (/^[2]\d{5}$/.test(clean)) {
    const candidate = 'ว' + clean.substring(1);
    if (masterSubjects.some((s) => s.code.replace(/\s+/g, '').toUpperCase() === candidate)) {
      return candidate;
    }
  }
  if (/^\d{5}$/.test(clean)) {
    const deptPrefixMap = {
      'กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ': 'อ',
      'กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี': 'ว',
      'กลุ่มสาระการเรียนรู้คณิตศาสตร์': 'ค',
      'กลุ่มสาระการเรียนรู้ภาษาไทย': 'ท',
      'กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม': 'ส',
      'กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา': 'พ',
      'กลุ่มสาระการเรียนรู้ศิลปะ': 'ศ',
      'กลุ่มสาระการเรียนรู้การงานอาชีพ': 'ง',
    };
    const prefix = (dept && deptPrefixMap[dept]) || 'อ';
    const candidate = prefix + clean;
    if (masterSubjects.some((s) => s.code.replace(/\s+/g, '').toUpperCase() === candidate)) {
      return candidate;
    }
  }
  if (/^[80Oo]\d{5}$/i.test(clean) && dept && dept.includes('ภาษาต่างประเทศ')) {
    return 'อ' + clean.substring(1);
  }
  return clean;
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
      let mainLine = '';
      for (let k = 1; k <= 2; k++) {
        if (i - k >= 0) {
          const prev = lines[i - k];
          if (
            !prev.includes('รายงาน') &&
            !prev.includes('โรงเรียน') &&
            !prev.includes('สรุป') &&
            !prev.includes('วันจันทร์') &&
            !prev.includes('วันอังคาร') &&
            !prev.includes('วันพุธ') &&
            !prev.includes('วันพฤหัส') &&
            !prev.includes('วันศุกร์')
          ) {
            mainLine = prev;
            break;
          }
        }
      }

      const combinedText = `${mainLine} ${subLine}`;
      const timeRange = `${timeMatch[1]}-${timeMatch[2]}`;
      let period = 1;
      if (timeRange.startsWith('08')) period = 1;
      else if (timeRange.startsWith('09')) period = 2;
      else if (timeRange.startsWith('10')) period = 3;
      else if (timeRange.startsWith('11')) period = 4;
      else if (timeRange.startsWith('13.00') || timeRange.startsWith('13:00')) period = 5;
      else if (timeRange.startsWith('13.50') || timeRange.startsWith('13:50')) period = 6;
      else if (timeRange.startsWith('14') || timeRange.startsWith('15')) period = 7;

      let leaveType = 'sick';
      if (combinedText.includes('ลากิจ')) leaveType = 'personal';
      else if (combinedText.includes('ไปราชการ')) leaveType = 'official';

      const roomMatch = combinedText.match(/ม\.\s*([1-6])\s*[\/./]\s*([1-5])/);
      const gradeRoom = roomMatch ? `ม.${roomMatch[1]}/${roomMatch[2]}` : '';
      const matchedCls = matchClassroom(gradeRoom);

      const locMatch = combinedText.match(/ห้อง\s*(\d+)/);
      const roomLocation = locMatch ? `ห้อง ${locMatch[1]}` : '';

      let rawSubject = '';
      const subjMatch = combinedText.match(/([ก-ฮA-Za-z0-9]\s*\d{5})/);
      if (subjMatch) {
        rawSubject = subjMatch[1];
      }
      const subjectCode = cleanSubjectCode(rawSubject, department);
      const matchedSubj = matchSubject(subjectCode);

      const isExplicitlyUnassigned =
        combinedText.includes('ยังไม่มีผู้สอนแทน') || combinedText.includes('ไม่มีผู้สอนแทน');

      // Scan all known teachers in mainLine
      const mainNorm = normalizeThai(mainLine);
      const matchedTeachers = [];
      for (const t of masterTeachers) {
        const norm = normalizeThai(t.fullName);
        const idx = mainNorm.indexOf(norm);
        if (idx !== -1) {
          matchedTeachers.push({ teacher: t, pos: idx });
        }
      }
      matchedTeachers.sort((a, b) => a.pos - b.pos);

      let absentTch = matchedTeachers[0] ? matchedTeachers[0].teacher : null;
      let subTch = null;

      if (!isExplicitlyUnassigned) {
        if (matchedTeachers.length > 1) {
          subTch = matchedTeachers[1].teacher;
        } else if (subjMatch) {
          const parts = mainLine.split(subjMatch[0]);
          if (parts.length > 1) {
            subTch = matchTeacher(parts[1]);
          }
        }
      }

      if (!absentTch) {
        if (subjMatch) {
          const parts = mainLine.split(subjMatch[0]);
          absentTch = matchTeacher(parts[0]);
        } else {
          absentTch = matchTeacher(mainLine);
        }
      }

      const isAssigned = Boolean(subTch && !isExplicitlyUnassigned);

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
          : '',
        originalTeacherDept: absentTch ? absentTch.department : department,
        substituteTeacherId: subTch ? subTch.id : '',
        substituteTeacherName: isExplicitlyUnassigned
          ? 'ยังไม่มีผู้สอนแทน'
          : subTch
          ? `${subTch.prefix}${subTch.fullName}`
          : 'ยังไม่มีผู้สอนแทน',
        substituteTeacherDept: subTch ? subTch.department : department,
        substituteDept: subTch ? subTch.department : department,
        isAssigned,
        selected: isAssigned,
        rawAbsentTeacher: absentTch ? `${absentTch.prefix}${absentTch.fullName}` : '',
        rawSubstituteTeacher: isExplicitlyUnassigned
          ? 'ยังไม่มีผู้สอนแทน'
          : subTch
          ? `${subTch.prefix}${subTch.fullName}`
          : 'ยังไม่มีผู้สอนแทน',
        note: isExplicitlyUnassigned ? 'ยังไม่มีผู้สอนแทนในเอกสาร' : undefined,
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
