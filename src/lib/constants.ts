import { PeriodSetting, SchoolProfile } from "@/types";

export const DEFAULT_PERIODS: PeriodSetting[] = [
  { periodNumber: 1, startTime: "08:40", endTime: "09:30" },
  { periodNumber: 2, startTime: "09:30", endTime: "10:20" },
  { periodNumber: 3, startTime: "10:20", endTime: "11:10" },
  { periodNumber: 4, startTime: "11:10", endTime: "12:00" },
  // พักเที่ยง 12:00 - 13:00 (1 ชั่วโมง)
  { periodNumber: 5, startTime: "13:00", endTime: "13:50" },
  { periodNumber: 6, startTime: "13:50", endTime: "14:40" },
  { periodNumber: 7, startTime: "14:40", endTime: "15:30" },
];

export const THAI_DAYS = [
  { id: 1, name: "จันทร์", full: "วันจันทร์" },
  { id: 2, name: "อังคาร", full: "วันอังคาร" },
  { id: 3, name: "พุธ", full: "วันพุธ" },
  { id: 4, name: "พฤหัสฯ", full: "วันพฤหัสบดี" },
  { id: 5, name: "ศุกร์", full: "วันศุกร์" },
];

export const DEPARTMENTS = [
  "กลุ่มสาระการเรียนรู้ภาษาไทย",
  "กลุ่มสาระการเรียนรู้คณิตศาสตร์",
  "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี",
  "กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม",
  "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ",
  "กลุ่มสาระการเรียนรู้ศิลปะ",
  "กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา",
  "กลุ่มสาระการเรียนรู้การงานอาชีพ",
  "กิจกรรมพัฒนาผู้เรียน",
];

export const DEFAULT_DEPARTMENT_PINS: Record<string, string> = {
  "กลุ่มสาระการเรียนรู้ภาษาไทย": "1001",
  "กลุ่มสาระการเรียนรู้คณิตศาสตร์": "1002",
  "กลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี": "1003",
  "กลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม": "1004",
  "กลุ่มสาระการเรียนรู้ภาษาต่างประเทศ": "1005",
  "กลุ่มสาระการเรียนรู้ศิลปะ": "1006",
  "กลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา": "1007",
  "กลุ่มสาระการเรียนรู้การงานอาชีพ": "1008",
  "กิจกรรมพัฒนาผู้เรียน": "1009",
};

export const ABSENCE_REASON_LABELS: Record<string, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  official: "ไปราชการ",
  meeting: "ประชุม",
  activity: "ร่วมกิจกรรมสำคัญ",
  other: "เหตุผลอื่นๆ",
};

export const DEFAULT_SCHOOL_PROFILE: SchoolProfile = {
  schoolName: "โรงเรียนหนองวัวซอพิทยาคม",
  logoUrl: "/LOGO-N.png",
  directorName: "นายปกรณ์ทรรศน์ ศรีโยวัย",
  academicHeadName: "นางสุวรรณี ศรีทาพุธ",
  signers: [
    {
      id: "signer_1",
      name: "นางสุวรรณี ศรีทาพุธ",
      position: "หัวหน้ากลุ่มบริหารวิชาการ",
      roleTitle: "ผู้ตรวจสอบข้อมูล",
    },
    {
      id: "signer_2",
      name: "นายปกรณ์ทรรศน์ ศรีโยวัย",
      position: "รองผู้อำนวยการกลุ่มบริหารวิชาการ",
      roleTitle: "ผู้รับรองรายงาน",
    },
  ],
  updatedAt: new Date().toISOString(),
};
