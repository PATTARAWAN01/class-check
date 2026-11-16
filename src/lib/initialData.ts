import { AcademicTerm, Classroom, Subject, Teacher, TimetableEntry, AttendanceRecord } from "@/types";
import { SCHOOL_TERM_2569, SCHOOL_CLASSROOMS, SCHOOL_TEACHERS, SCHOOL_SUBJECTS, SCHOOL_TIMETABLE } from "./schoolData2569";

export const INITIAL_TERMS: AcademicTerm[] = [
  SCHOOL_TERM_2569,
];

export const INITIAL_CLASSROOMS: Classroom[] = SCHOOL_CLASSROOMS;

export const INITIAL_TEACHERS: Teacher[] = SCHOOL_TEACHERS;

export const INITIAL_SUBJECTS: Subject[] = SCHOOL_SUBJECTS;

export const INITIAL_TIMETABLE: TimetableEntry[] = SCHOOL_TIMETABLE;

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];
