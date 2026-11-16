const fs = require('fs');
const path = require('path');

const summaryPath = path.join(__dirname, '../src/data/parsed_summary.json');
const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

console.log('Sample subjects:', data.subjects.slice(0, 5));
console.log('Sample teachers:', data.teachers.slice(0, 10));
