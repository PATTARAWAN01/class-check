export interface AcademicTerm {
  id: string;
  year: string; // e.g. "2567"
  term: string; // "1" or "2"
  isActive: boolean;
  createdAt: string;
}

export interface Teacher {
  id: string;
  code: string; // รหัสครู เช่น T001
  prefix: string; // นาย / นาง / นางสาว
  fullName: string;
  department: string; // กลุ่มสาระการเรียนรู้
}

export interface Subject {
  id: string;
  code: string; // รหัสวิชา เช่น ค21101
  name: string; // ชื่อวิชา
  department: string;
  assignedClassroomIds?: string[]; // รหัสห้องเรียนที่เรียนวิชานี้ เช่น ["m1_1", "m1_2"]
}

export interface Classroom {
  id: string;
  gradeRoom: string; // เช่น ม.1/1
  grade: string; // ม.1
  room: string; // 1
  pinCode: string; // PIN 4-6 หลัก
}

export interface PeriodSetting {
  periodNumber: number; // 1 - 8
  startTime: string; // "08:30"
  endTime: string; // "09:20"
}

export interface TimetableEntry {
  id: string;
  termId: string;
  dayOfWeek: number; // 1 = จันทร์, 2 = อังคาร, ..., 5 = ศุกร์
  periodStart: number; // 1
  periodEnd: number; // 1 (เดี่ยว) หรือ 2 (คู่)
  classroomId: string;
  gradeRoom: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  roomLocation?: string; // ห้องเรียนหรือสถานที่ เช่น 126, ช้อปอุตฯ, ห้องศิลปะ1, สนาม 7, IS
}

export type AttendanceStatus = 'on_time' | 'late' | 'absent';
export type AbsenceReason = 'personal' | 'sick' | 'official' | 'meeting' | 'activity' | 'other';

export type SubstituteLeaveType = 'sick' | 'personal' | 'official';

export interface SubstituteAssignment {
  id: string;
  termId: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 1-5
  department: string; // กลุ่มสาระการเรียนรู้ของผู้ลา
  originalTeacherId: string;
  originalTeacherName: string;
  leaveType: SubstituteLeaveType;
  periodStart: number;
  periodEnd: number;
  classroomId: string;
  gradeRoom: string;
  subjectCode: string;
  subjectName: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  substituteDepartment: string;
  note?: string;
  recordedByDept: string;
  createdAt: string;
}

export interface DepartmentPin {
  department: string;
  pin: string;
}

export interface AttendanceEditChange {
  field: string;
  oldValue: string;
  newValue: string;
}

export interface AttendanceEditLog {
  timestamp: string; // ISO string
  editorName: string; // e.g. "ผู้ดูแลระบบ (Admin)"
  changes: AttendanceEditChange[];
  clientIp?: string;
}

export interface AttendanceRecord {
  id: string;
  termId: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 1-5
  periodStart: number;
  periodEnd: number;
  periodCount: number; // 1 or 2
  classroomId: string;
  gradeRoom: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  status: AttendanceStatus;
  absenceReason?: AbsenceReason;
  absenceNote?: string;
  lateNote?: string;
  recordedByStudent: string;
  isSubstitute?: boolean;
  originalTeacherId?: string;
  originalTeacherName?: string;
  substituteAssignmentId?: string;
  createdAt: string;
  updatedAt?: string;
  updatedByStudent?: string;
  editHistory?: AttendanceEditLog[];
}

export interface Signer {
  id: string;
  name: string; // ชื่อ-นามสกุล เช่น นายสมศักดิ์ สุขสวัสดิ์
  position: string; // เช่น ผู้อำนวยการโรงเรียนหนองวัวซอพิทยาคม
  roleTitle?: string; // เช่น ผู้ตรวจสอบข้อมูล, ผู้รับรองรายงาน
}

export interface SchoolProfile {
  schoolName: string;
  logoUrl?: string;
  directorName?: string;
  academicHeadName?: string;
  signers: Signer[]; // ผู้ลงนามกำหนดได้กี่คนก็ได้
  trackingStartDate?: string; // YYYY-MM-DD วันเริ่มนับคาบค้างเช็คของเทอม
  lastBackupAt?: string; // ISO timestamp ของการสำรองข้อมูลล่าสุด
  updatedAt: string;
}

export type SchoolHolidayScope = "all_day" | "periods";

export interface SchoolHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // เช่น "วันพ่อแห่งชาติ", "วันกีฬาสี", "สอบกลางภาค"
  scope: SchoolHolidayScope;
  periods?: number[]; // ใช้เมื่อ scope === "periods" เช่น [5, 6, 7]
  note?: string;
  createdAt: string;
}

export type BackupSectionKey =
  | "terms"
  | "classrooms"
  | "teachers"
  | "subjects"
  | "periods"
  | "timetable"
  | "attendance"
  | "substitutes"
  | "timetableUpdateLogs"
  | "holidays"
  | "schoolProfile";

export interface SystemBackupPayload {
  version: string;
  exportedAt: string;
  schoolName: string;
  data: {
    terms?: AcademicTerm[];
    classrooms?: Classroom[];
    teachers?: Teacher[];
    subjects?: Subject[];
    periods?: PeriodSetting[];
    timetable?: TimetableEntry[];
    attendance?: AttendanceRecord[];
    substitutes?: SubstituteAssignment[];
    timetableUpdateLogs?: TimetableUpdateLog[];
    holidays?: SchoolHoliday[];
    schoolProfile?: SchoolProfile;
  };
}

export type TimetableUpdateSource =
  | "excel_import"
  | "manual_add"
  | "manual_edit"
  | "manual_delete"
  | "subject_sync"
  | "rollback";

export interface TimetableChangeItem {
  type: "added" | "modified" | "removed";
  gradeRoom: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  oldEntry?: TimetableEntry;
  newEntry?: TimetableEntry;
  changedFields?: string[];
}

export interface TimetableUpdateLog {
  id: string;
  termId: string;
  createdAt: string;
  source: TimetableUpdateSource;
  sourceLabel: string;
  note?: string;
  summary: {
    added: number;
    modified: number;
    removed: number;
    unchanged?: number;
    affectedClassrooms: string[];
  };
  changes: TimetableChangeItem[];
  rolledBackAt?: string;
  rolledBackFromLogId?: string;
}
