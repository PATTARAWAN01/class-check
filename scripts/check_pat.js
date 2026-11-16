const fs = require('fs');
const content = fs.readFileSync('src/data/school_timetable_2_2569_official.csv', 'utf8');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('พัฒนา') && !line.includes('พัฒนาผู้เรียน')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
}
