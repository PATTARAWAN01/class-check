import {
  AcademicTerm,
  Classroom,
  PeriodSetting,
  Subject,
  Teacher,
  TimetableEntry,
  AttendanceRecord,
  SchoolProfile,
  SubstituteAssignment,
  TimetableUpdateLog,
  TimetableChangeItem,
  SchoolHoliday,
  BackupSectionKey,
  SystemBackupPayload,
} from "@/types";
import { db, isFirebaseConfigured } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  INITIAL_TERMS,
  INITIAL_CLASSROOMS,
  INITIAL_TEACHERS,
  INITIAL_SUBJECTS,
  INITIAL_TIMETABLE,
  INITIAL_ATTENDANCE,
} from "./initialData";
import {
  DEFAULT_PERIODS,
  DEFAULT_SCHOOL_PROFILE,
  DEFAULT_DEPARTMENT_PINS,
} from "./constants";

// Local Storage Keys
const STORAGE_KEYS = {
  TERMS: "class_check_terms",
  CLASSROOMS: "class_check_classrooms",
  TEACHERS: "class_check_teachers",
  SUBJECTS: "class_check_subjects",
  PERIODS: "class_check_periods",
  TIMETABLE: "class_check_timetable",
  ATTENDANCE: "class_check_attendance",
  PROFILE: "class_check_profile",
  SUBSTITUTES: "class_check_substitutes",
  DEPT_PINS: "class_check_dept_pins",
  TIMETABLE_UPDATE_LOGS: "class_check_timetable_update_logs",
  HOLIDAYS: "class_check_holidays",
};

// Event emitter for local storage reactive updates
type Listener = () => void;
const listeners: Record<string, Set<Listener>> = {};

function notify(key: string) {
  if (listeners[key]) {
    listeners[key].forEach((cb) => cb());
  }
}

function subscribe(key: string, cb: Listener) {
  if (!listeners[key]) listeners[key] = new Set();
  listeners[key].add(cb);
  return () => {
    listeners[key]?.delete(cb);
  };
}

// Data version check for auto-migrating seed data
const CURRENT_DATA_VERSION = "2569_v8_clean_prod_data";
let migrationChecked = false;

function checkAndMigrateSeedData() {
  if (typeof window === "undefined" || migrationChecked) return;
  migrationChecked = true;
  try {
    const currentVer = localStorage.getItem("class_check_data_version");
    if (currentVer !== CURRENT_DATA_VERSION) {
      localStorage.setItem("class_check_data_version", CURRENT_DATA_VERSION);
      localStorage.setItem(STORAGE_KEYS.TERMS, JSON.stringify(INITIAL_TERMS));
      localStorage.setItem(STORAGE_KEYS.CLASSROOMS, JSON.stringify(INITIAL_CLASSROOMS));
      localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(INITIAL_TEACHERS));
      localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(INITIAL_SUBJECTS));
      localStorage.setItem(STORAGE_KEYS.TIMETABLE, JSON.stringify(INITIAL_TIMETABLE));
      localStorage.setItem(STORAGE_KEYS.ATTENDANCE, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.SUBSTITUTES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(DEFAULT_SCHOOL_PROFILE));
    }
  } catch (e) {
    console.error("Migration check error:", e);
  }
}

// Local storage helper
function getLocal<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  checkAndMigrateSeedData();
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocal<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    notify(key);
  } catch (e) {
    console.error("Local storage error:", e);
  }
}

// ==================== 1. ACADEMIC TERMS ====================

export async function getTerms(): Promise<AcademicTerm[]> {
  if (db) {
    try {
      const q = query(collection(db, "academic_terms"), orderBy("year", "desc"));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs.map((d) => d.data() as AcademicTerm);
      }
    } catch (e) {
      console.warn("Firestore error, fallback to local:", e);
    }
  }
  return getLocal<AcademicTerm[]>(STORAGE_KEYS.TERMS, INITIAL_TERMS);
}

export async function saveTerm(term: AcademicTerm): Promise<void> {
  if (db) {
    try {
      await setDoc(doc(db, "academic_terms", term.id), term);
    } catch (e) {
      console.error(e);
    }
  }
  const terms = await getTerms();
  const index = terms.findIndex((t) => t.id === term.id);
  if (index >= 0) {
    terms[index] = term;
  } else {
    terms.push(term);
  }
  // If active, make others inactive
  if (term.isActive) {
    terms.forEach((t) => {
      if (t.id !== term.id) t.isActive = false;
    });
  }
  setLocal(STORAGE_KEYS.TERMS, terms);
}

export async function setActiveTerm(termId: string): Promise<void> {
  const terms = await getTerms();
  for (const t of terms) {
    t.isActive = t.id === termId;
    if (db) {
      try {
        await setDoc(doc(db, "academic_terms", t.id), t);
      } catch (e) {
        console.error(e);
      }
    }
  }
  setLocal(STORAGE_KEYS.TERMS, terms);
}

export async function getActiveTerm(): Promise<AcademicTerm | null> {
  const terms = await getTerms();
  return terms.find((t) => t.isActive) || terms[0] || null;
}

// ==================== 2. CLASSROOMS ====================

export async function getClassrooms(): Promise<Classroom[]> {
  if (db) {
    try {
      const snapshot = await getDocs(collection(db, "classrooms"));
      if (!snapshot.empty && snapshot.size >= 20) {
        return snapshot.docs.map((d) => d.data() as Classroom);
      }
      // If Firestore has fewer than 20 classrooms (e.g. unseeded or partial), seed all INITIAL_CLASSROOMS
      const batch = writeBatch(db);
      INITIAL_CLASSROOMS.forEach((c) => batch.set(doc(db!, "classrooms", c.id), c));
      await batch.commit();
      return INITIAL_CLASSROOMS;
    } catch (e) {
      console.warn(e);
    }
  }
  const local = getLocal<Classroom[]>(STORAGE_KEYS.CLASSROOMS, INITIAL_CLASSROOMS);
  if (!local || local.length < 20) {
    setLocal(STORAGE_KEYS.CLASSROOMS, INITIAL_CLASSROOMS);
    return INITIAL_CLASSROOMS;
  }
  return local;
}

export async function saveClassroom(cls: Classroom): Promise<void> {
  if (db) {
    await setDoc(doc(db, "classrooms", cls.id), cls);
  }
  const list = await getClassrooms();
  const idx = list.findIndex((c) => c.id === cls.id);
  if (idx >= 0) list[idx] = cls;
  else list.push(cls);
  setLocal(STORAGE_KEYS.CLASSROOMS, list);
}

export async function deleteClassroom(id: string): Promise<void> {
  if (db) {
    await deleteDoc(doc(db, "classrooms", id));
  }
  const list = (await getClassrooms()).filter((c) => c.id !== id);
  setLocal(STORAGE_KEYS.CLASSROOMS, list);
}

// ==================== 3. TEACHERS ====================

export async function getTeachers(): Promise<Teacher[]> {
  if (db) {
    try {
      const snapshot = await getDocs(collection(db, "teachers"));
      if (!snapshot.empty && snapshot.size >= 20) {
        return snapshot.docs.map((d) => d.data() as Teacher);
      }
      // If Firestore has fewer than 20 teachers (unseeded or partial), auto-seed INITIAL_TEACHERS
      try {
        const batch = writeBatch(db);
        INITIAL_TEACHERS.forEach((t) => batch.set(doc(db!, "teachers", t.id), t));
        await batch.commit();
      } catch (err) {
        console.warn("Auto-seeding teachers error:", err);
      }
      return INITIAL_TEACHERS;
    } catch (e) {
      console.warn("getTeachers Firestore error:", e);
    }
  }
  const local = getLocal<Teacher[]>(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
  if (!local || local.length < 20) {
    setLocal(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
    return INITIAL_TEACHERS;
  }
  return local;
}

export async function saveTeacher(teacher: Teacher): Promise<void> {
  if (db) {
    await setDoc(doc(db, "teachers", teacher.id), teacher);
  }
  const list = await getTeachers();
  const idx = list.findIndex((t) => t.id === teacher.id);
  if (idx >= 0) {
    list[idx] = teacher;
  } else {
    list.push(teacher);
  }
  setLocal(STORAGE_KEYS.TEACHERS, list);
}

export async function saveTeachers(teachers: Teacher[]): Promise<void> {
  if (db) {
    for (let i = 0; i < teachers.length; i += 400) {
      const chunk = teachers.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((t) => {
        batch.set(doc(db!, "teachers", t.id), cleanForFirestore(t));
      });
      await batch.commit();
    }
  }
  setLocal(STORAGE_KEYS.TEACHERS, teachers);
}

export async function deleteTeacher(id: string): Promise<void> {
  if (db) {
    await deleteDoc(doc(db, "teachers", id));
  }
  const list = (await getTeachers()).filter((t) => t.id !== id);
  setLocal(STORAGE_KEYS.TEACHERS, list);
}

// ==================== 4. SUBJECTS ====================

export async function getSubjects(): Promise<Subject[]> {
  if (db) {
    try {
      const snapshot = await getDocs(collection(db, "subjects"));
      if (!snapshot.empty && snapshot.size >= 100) {
        return snapshot.docs.map((d) => d.data() as Subject);
      }
      // If Firestore has fewer than 100 subjects, auto-seed INITIAL_SUBJECTS
      try {
        const batch = writeBatch(db);
        INITIAL_SUBJECTS.forEach((s) => batch.set(doc(db!, "subjects", s.id), s));
        await batch.commit();
      } catch (err) {
        console.warn("Auto-seeding subjects error:", err);
      }
      return INITIAL_SUBJECTS;
    } catch (e) {
      console.warn("getSubjects Firestore error:", e);
    }
  }
  const local = getLocal<Subject[]>(STORAGE_KEYS.SUBJECTS, INITIAL_SUBJECTS);
  if (!local || local.length < 100) {
    setLocal(STORAGE_KEYS.SUBJECTS, INITIAL_SUBJECTS);
    return INITIAL_SUBJECTS;
  }
  return local;
}

export async function saveSubject(subject: Subject): Promise<void> {
  if (db) {
    await setDoc(doc(db, "subjects", subject.id), subject);
  }
  const list = await getSubjects();
  const idx = list.findIndex((s) => s.id === subject.id);
  if (idx >= 0) {
    list[idx] = subject;
  } else {
    list.push(subject);
  }
  setLocal(STORAGE_KEYS.SUBJECTS, list);
}

export async function saveSubjects(subjects: Subject[]): Promise<void> {
  if (db) {
    for (let i = 0; i < subjects.length; i += 400) {
      const chunk = subjects.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        batch.set(doc(db!, "subjects", s.id), cleanForFirestore(s));
      });
      await batch.commit();
    }
  }
  setLocal(STORAGE_KEYS.SUBJECTS, subjects);
}

export async function deleteSubject(id: string): Promise<void> {
  if (db) {
    await deleteDoc(doc(db, "subjects", id));
  }
  const list = (await getSubjects()).filter((s) => s.id !== id);
  setLocal(STORAGE_KEYS.SUBJECTS, list);
}

// ==================== 5. PERIOD SETTINGS ====================

export async function getPeriodSettings(): Promise<PeriodSetting[]> {
  if (db) {
    try {
      const snapshot = await getDocs(collection(db, "period_settings"));
      if (!snapshot.empty) {
        return snapshot.docs
          .map((d) => d.data() as PeriodSetting)
          .sort((a, b) => a.periodNumber - b.periodNumber);
      }
    } catch (e) {
      console.warn(e);
    }
  }
  const local = getLocal<PeriodSetting[]>(STORAGE_KEYS.PERIODS, DEFAULT_PERIODS);
  if (local.length === 8 && local[0].startTime === "08:30") {
    setLocal(STORAGE_KEYS.PERIODS, DEFAULT_PERIODS);
    return DEFAULT_PERIODS;
  }
  return local;
}

export async function savePeriodSettings(periods: PeriodSetting[]): Promise<void> {
  if (db) {
    const batch = writeBatch(db);
    periods.forEach((p) => {
      batch.set(doc(db!, "period_settings", `period_${p.periodNumber}`), p);
    });
    await batch.commit();
  }
  setLocal(STORAGE_KEYS.PERIODS, periods);
}

// ==================== 6. TIMETABLE ====================

export async function getTimetable(termId?: string): Promise<TimetableEntry[]> {
  if (db) {
    try {
      const q = termId
        ? query(collection(db, "timetables"), where("termId", "==", termId))
        : collection(db, "timetables");
      const snapshot = await getDocs(q);
      if (!snapshot.empty && snapshot.size >= 50) {
        const list = snapshot.docs.map((d) => d.data() as TimetableEntry);
        setLocal(STORAGE_KEYS.TIMETABLE, list);
        return list;
      }
      // If Firestore has fewer than 50 timetable entries, auto-seed with INITIAL_TIMETABLE in chunks of 400
      try {
        for (let i = 0; i < INITIAL_TIMETABLE.length; i += 400) {
          const chunk = INITIAL_TIMETABLE.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach((tt) => batch.set(doc(db!, "timetables", tt.id), tt));
          await batch.commit();
        }
      } catch (seedErr) {
        console.warn("Auto-seeding timetables error:", seedErr);
      }
      setLocal(STORAGE_KEYS.TIMETABLE, INITIAL_TIMETABLE);
      return termId
        ? INITIAL_TIMETABLE.filter((t) => !t.termId || t.termId === termId)
        : INITIAL_TIMETABLE;
    } catch (e) {
      console.warn("getTimetable Firestore error:", e);
    }
  }
  const all = getLocal<TimetableEntry[]>(STORAGE_KEYS.TIMETABLE, INITIAL_TIMETABLE);
  if (!all || all.length < 50) {
    setLocal(STORAGE_KEYS.TIMETABLE, INITIAL_TIMETABLE);
    return termId
      ? INITIAL_TIMETABLE.filter((t) => !t.termId || t.termId === termId)
      : INITIAL_TIMETABLE;
  }
  const filtered = termId ? all.filter((t) => t.termId === termId) : all;
  if (filtered.length === 0 && INITIAL_TIMETABLE.length > 0) {
    return termId
      ? INITIAL_TIMETABLE.filter((t) => !t.termId || t.termId === termId)
      : INITIAL_TIMETABLE;
  }
  return filtered;
}

export async function saveTimetable(entries: TimetableEntry[]): Promise<void> {
  if (db) {
    for (let i = 0; i < entries.length; i += 400) {
      const chunk = entries.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((tt) => {
        batch.set(doc(db!, "timetables", tt.id), cleanForFirestore(tt));
      });
      await batch.commit();
    }
  }
  setLocal(STORAGE_KEYS.TIMETABLE, entries);
}

/**
 * Safely replaces timetable entries ONLY for the classrooms present in `entries`
 * (within `termId`). Old/stale entries for those classrooms (e.g. a double period
 * that changed or split into single periods, or removed periods) are deleted from
 * Firestore, while classrooms NOT included in `entries` remain untouched.
 */
export async function replaceTimetableForClassrooms(
  entries: TimetableEntry[],
  termId: string
): Promise<{ saved: number; deleted: number }> {
  const importedClassroomIds = new Set(entries.map((e) => e.classroomId));
  const importedGradeRooms = new Set(entries.map((e) => e.gradeRoom));
  const newIds = new Set(entries.map((e) => e.id));
  let deletedCount = 0;

  if (db) {
    // 1. Find and delete obsolete entries for the imported classrooms in this term
    const q = query(collection(db, "timetables"), where("termId", "==", termId));
    const snapshot = await getDocs(q);
    const staleDocIds: string[] = [];

    snapshot.docs.forEach((d) => {
      const data = d.data() as TimetableEntry;
      const belongsToImportedRoom =
        importedClassroomIds.has(data.classroomId) ||
        importedGradeRooms.has(data.gradeRoom);
      if (belongsToImportedRoom && !newIds.has(d.id)) {
        staleDocIds.push(d.id);
      }
    });

    for (let i = 0; i < staleDocIds.length; i += 400) {
      const chunk = staleDocIds.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((docId) => {
        batch.delete(doc(db!, "timetables", docId));
      });
      await batch.commit();
    }
    deletedCount = staleDocIds.length;

    // 2. Write all new entries in chunks of 400 (Firestore max is 500 per batch)
    for (let i = 0; i < entries.length; i += 400) {
      const chunk = entries.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((tt) => {
        batch.set(doc(db!, "timetables", tt.id), cleanForFirestore(tt));
      });
      await batch.commit();
    }
  }

  // 3. Merge into local storage cache without losing non-imported classrooms
  const existingLocal = getLocal<TimetableEntry[]>(STORAGE_KEYS.TIMETABLE, INITIAL_TIMETABLE);
  const kept = existingLocal.filter((e) => {
    if (e.termId !== termId) return true;
    return (
      !importedClassroomIds.has(e.classroomId) &&
      !importedGradeRooms.has(e.gradeRoom)
    );
  });
  setLocal(STORAGE_KEYS.TIMETABLE, [...kept, ...entries]);

  return { saved: entries.length, deleted: deletedCount };
}

/**
 * Applies ONLY the changed/added/removed timetable entries to Firestore and localStorage.
 * Unchanged entries are never rewritten or touched.
 */
export async function applyTimetableDiff(params: {
  toUpsert: TimetableEntry[];
  toDeleteIds: string[];
}): Promise<{ upserted: number; deleted: number }> {
  const { toUpsert, toDeleteIds } = params;
  const uniqueDeleteIds = Array.from(new Set(toDeleteIds)).filter(Boolean);

  if (db) {
    for (let i = 0; i < uniqueDeleteIds.length; i += 400) {
      const chunk = uniqueDeleteIds.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((docId) => {
        batch.delete(doc(db!, "timetables", docId));
      });
      await batch.commit();
    }

    for (let i = 0; i < toUpsert.length; i += 400) {
      const chunk = toUpsert.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((tt) => {
        batch.set(doc(db!, "timetables", tt.id), cleanForFirestore(tt));
      });
      await batch.commit();
    }
  }

  // Update local storage cache incrementally
  const deleteSet = new Set(uniqueDeleteIds);
  const upsertById = new Map(toUpsert.map((e) => [e.id, e]));
  const existingLocal = getLocal<TimetableEntry[]>(STORAGE_KEYS.TIMETABLE, INITIAL_TIMETABLE);
  const nextLocal = existingLocal.filter(
    (e) => !deleteSet.has(e.id) && !upsertById.has(e.id)
  );
  nextLocal.push(...toUpsert);
  setLocal(STORAGE_KEYS.TIMETABLE, nextLocal);

  return { upserted: toUpsert.length, deleted: uniqueDeleteIds.length };
}

// Recursively remove undefined fields so nested Firestore documents never fail
function deepCleanForFirestore(value: any): any {
  if (Array.isArray(value)) {
    return value.map((item) => deepCleanForFirestore(item));
  }
  if (value !== null && typeof value === "object") {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        cleaned[k] = deepCleanForFirestore(v);
      }
    }
    return cleaned;
  }
  return value;
}

// ==================== 6B. TIMETABLE UPDATE HISTORY & ROLLBACK ====================

export async function getTimetableUpdateLogs(): Promise<TimetableUpdateLog[]> {
  if (db) {
    try {
      const q = query(
        collection(db, "timetable_update_logs"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({
        ...(d.data() as TimetableUpdateLog),
        id: d.id,
      }));
      setLocal(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, list);
      return list;
    } catch (e) {
      console.warn("getTimetableUpdateLogs error:", e);
    }
  }
  const local = getLocal<TimetableUpdateLog[]>(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, []);
  return [...local].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function addTimetableUpdateLog(log: TimetableUpdateLog): Promise<void> {
  const cleanLog = deepCleanForFirestore(log) as TimetableUpdateLog;
  if (db) {
    try {
      await setDoc(doc(db, "timetable_update_logs", cleanLog.id), cleanLog);
    } catch (e) {
      console.error("Firestore addTimetableUpdateLog error:", e);
    }
  }
  const current = getLocal<TimetableUpdateLog[]>(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, []);
  const next = [cleanLog, ...current.filter((l) => l.id !== cleanLog.id)];
  setLocal(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, next);
}

export async function rollbackTimetableUpdateLog(
  log: TimetableUpdateLog
): Promise<{ restored: number; deleted: number; rollbackLog: TimetableUpdateLog }> {
  const toUpsert: TimetableEntry[] = [];
  const toDeleteIds: string[] = [];
  const inverseChanges: TimetableChangeItem[] = [];
  const affectedRooms = new Set<string>();

  let addedBack = 0;
  let modifiedBack = 0;
  let removedBack = 0;

  for (const ch of log.changes || []) {
    affectedRooms.add(ch.gradeRoom);
    if (ch.type === "added" && ch.newEntry) {
      // Undo an addition by deleting the added entry
      toDeleteIds.push(ch.newEntry.id);
      removedBack += 1;
      inverseChanges.push({
        type: "removed",
        gradeRoom: ch.gradeRoom,
        dayOfWeek: ch.dayOfWeek,
        periodStart: ch.periodStart,
        periodEnd: ch.periodEnd,
        oldEntry: ch.newEntry,
      });
    } else if (ch.type === "removed" && ch.oldEntry) {
      // Undo a deletion by restoring the old entry
      toUpsert.push(ch.oldEntry);
      addedBack += 1;
      inverseChanges.push({
        type: "added",
        gradeRoom: ch.gradeRoom,
        dayOfWeek: ch.dayOfWeek,
        periodStart: ch.periodStart,
        periodEnd: ch.periodEnd,
        newEntry: ch.oldEntry,
      });
    } else if (ch.type === "modified" && ch.oldEntry) {
      // Undo a modification by restoring the old entry (and deleting newEntry.id if ID changed)
      toUpsert.push(ch.oldEntry);
      if (ch.newEntry && ch.newEntry.id !== ch.oldEntry.id) {
        toDeleteIds.push(ch.newEntry.id);
      }
      modifiedBack += 1;
      inverseChanges.push({
        type: "modified",
        gradeRoom: ch.gradeRoom,
        dayOfWeek: ch.dayOfWeek,
        periodStart: ch.periodStart,
        periodEnd: ch.periodEnd,
        oldEntry: ch.newEntry,
        newEntry: ch.oldEntry,
        changedFields: ch.changedFields,
      });
    }
  }

  const { upserted, deleted } = await applyTimetableDiff({ toUpsert, toDeleteIds });

  const nowIso = new Date().toISOString();

  // Mark original log as rolled back so it cannot be accidentally rolled back twice
  const updatedOriginal: TimetableUpdateLog = deepCleanForFirestore({
    ...log,
    rolledBackAt: nowIso,
  });
  if (db) {
    try {
      await setDoc(doc(db, "timetable_update_logs", updatedOriginal.id), updatedOriginal);
    } catch (e) {
      console.error("Failed to mark log as rolled back:", e);
    }
  }
  const existingLogs = getLocal<TimetableUpdateLog[]>(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, []);
  const markedLogs = existingLogs.map((l) => (l.id === updatedOriginal.id ? updatedOriginal : l));
  setLocal(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, markedLogs);

  // Record a new audit log entry for the rollback action itself
  const rollbackLog: TimetableUpdateLog = {
    id: `ttlog_${Date.now()}_rb`,
    termId: log.termId,
    createdAt: nowIso,
    source: "rollback",
    sourceLabel: `ย้อนกลับรายการ: ${log.sourceLabel}`,
    note: log.note ? `ย้อนกลับจากรอบ "${log.note}"` : undefined,
    summary: {
      added: addedBack,
      modified: modifiedBack,
      removed: removedBack,
      affectedClassrooms: Array.from(affectedRooms),
    },
    changes: inverseChanges,
    rolledBackFromLogId: log.id,
  };
  await addTimetableUpdateLog(rollbackLog);

  return { restored: upserted, deleted, rollbackLog };
}

// ==================== 6C. SCHOOL HOLIDAYS / NON-TEACHING DAYS ====================

export async function getSchoolHolidays(): Promise<SchoolHoliday[]> {
  if (db) {
    try {
      const q = query(collection(db, "school_holidays"), orderBy("date", "asc"));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => ({
        ...(d.data() as SchoolHoliday),
        id: d.id,
      }));
      setLocal(STORAGE_KEYS.HOLIDAYS, list);
      return list;
    } catch (e) {
      console.warn("getSchoolHolidays error:", e);
    }
  }
  const local = getLocal<SchoolHoliday[]>(STORAGE_KEYS.HOLIDAYS, []);
  return [...local].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

export async function saveSchoolHoliday(holiday: SchoolHoliday): Promise<void> {
  const clean = deepCleanForFirestore(holiday) as SchoolHoliday;
  if (db) {
    try {
      await setDoc(doc(db, "school_holidays", clean.id), clean);
    } catch (e) {
      console.error("Firestore saveSchoolHoliday error:", e);
    }
  }
  const list = getLocal<SchoolHoliday[]>(STORAGE_KEYS.HOLIDAYS, []);
  const next = [...list.filter((h) => h.id !== clean.id), clean].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  setLocal(STORAGE_KEYS.HOLIDAYS, next);
}

export async function saveSchoolHolidays(holidays: SchoolHoliday[]): Promise<void> {
  const cleaned = holidays.map((h) => deepCleanForFirestore(h) as SchoolHoliday);
  if (db) {
    for (let i = 0; i < cleaned.length; i += 400) {
      const chunk = cleaned.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((h) => {
        batch.set(doc(db!, "school_holidays", h.id), h);
      });
      await batch.commit();
    }
  }
  const current = getLocal<SchoolHoliday[]>(STORAGE_KEYS.HOLIDAYS, []);
  const map = new Map<string, SchoolHoliday>();
  current.forEach((h) => map.set(h.id, h));
  cleaned.forEach((h) => map.set(h.id, h));
  setLocal(
    STORAGE_KEYS.HOLIDAYS,
    Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  );
}

export async function deleteSchoolHoliday(id: string): Promise<void> {
  if (db) {
    try {
      await deleteDoc(doc(db, "school_holidays", id));
    } catch (e) {
      console.error("Firestore deleteSchoolHoliday error:", e);
    }
  }
  const list = getLocal<SchoolHoliday[]>(STORAGE_KEYS.HOLIDAYS, []).filter((h) => h.id !== id);
  setLocal(STORAGE_KEYS.HOLIDAYS, list);
}

// ==================== 6D. FULL BACKUP & SELECTIVE RESTORE (JSON) ====================

async function batchWriteCollection<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<number> {
  if (!items || items.length === 0) return 0;
  if (db) {
    for (let i = 0; i < items.length; i += 400) {
      const chunk = items.slice(i, i + 400);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        batch.set(doc(db!, collectionName, item.id), deepCleanForFirestore(item));
      });
      await batch.commit();
    }
  }
  return items.length;
}

export async function exportFullSystemBackup(): Promise<SystemBackupPayload> {
  const [
    terms,
    classrooms,
    teachers,
    subjects,
    periods,
    timetable,
    attendance,
    substitutes,
    timetableUpdateLogs,
    holidays,
    schoolProfile,
  ] = await Promise.all([
    getTerms(),
    getClassrooms(),
    getTeachers(),
    getSubjects(),
    getPeriodSettings(),
    getTimetable(),
    getAttendanceLogs(),
    getSubstituteAssignments(),
    getTimetableUpdateLogs(),
    getSchoolHolidays(),
    getSchoolProfile(),
  ]);

  const exportedAt = new Date().toISOString();

  // Save lastBackupAt timestamp to schoolProfile
  try {
    await saveSchoolProfile({
      ...schoolProfile,
      lastBackupAt: exportedAt,
      updatedAt: exportedAt,
    });
  } catch (e) {
    console.warn("Could not update lastBackupAt:", e);
  }

  return {
    version: "1.0",
    exportedAt,
    schoolName: schoolProfile?.schoolName || "โรงเรียนหนองวัวซอพิทยาคม",
    data: {
      terms,
      classrooms,
      teachers,
      subjects,
      periods,
      timetable,
      attendance,
      substitutes,
      timetableUpdateLogs,
      holidays,
      schoolProfile: { ...schoolProfile, lastBackupAt: exportedAt },
    },
  };
}

export async function restoreSystemBackup(
  payload: SystemBackupPayload,
  selectedSections: BackupSectionKey[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const d = payload?.data || {};
  const want = new Set<BackupSectionKey>(selectedSections);

  if (want.has("terms") && Array.isArray(d.terms)) {
    counts.terms = await batchWriteCollection("academic_terms", d.terms);
    setLocal(STORAGE_KEYS.TERMS, d.terms);
  }
  if (want.has("classrooms") && Array.isArray(d.classrooms)) {
    counts.classrooms = await batchWriteCollection("classrooms", d.classrooms);
    setLocal(STORAGE_KEYS.CLASSROOMS, d.classrooms);
  }
  if (want.has("teachers") && Array.isArray(d.teachers)) {
    counts.teachers = await batchWriteCollection("teachers", d.teachers);
    setLocal(STORAGE_KEYS.TEACHERS, d.teachers);
  }
  if (want.has("subjects") && Array.isArray(d.subjects)) {
    counts.subjects = await batchWriteCollection("subjects", d.subjects);
    setLocal(STORAGE_KEYS.SUBJECTS, d.subjects);
  }
  if (want.has("periods") && Array.isArray(d.periods)) {
    await savePeriodSettings(d.periods);
    counts.periods = d.periods.length;
  }
  if (want.has("timetable") && Array.isArray(d.timetable)) {
    counts.timetable = await batchWriteCollection("timetables", d.timetable);
    setLocal(STORAGE_KEYS.TIMETABLE, d.timetable);
  }
  if (want.has("attendance") && Array.isArray(d.attendance)) {
    counts.attendance = await batchWriteCollection("attendance_logs", d.attendance);
    setLocal(STORAGE_KEYS.ATTENDANCE, d.attendance);
  }
  if (want.has("substitutes") && Array.isArray(d.substitutes)) {
    counts.substitutes = await batchWriteCollection("substitute_assignments", d.substitutes);
    setLocal(STORAGE_KEYS.SUBSTITUTES, d.substitutes);
  }
  if (want.has("timetableUpdateLogs") && Array.isArray(d.timetableUpdateLogs)) {
    counts.timetableUpdateLogs = await batchWriteCollection(
      "timetable_update_logs",
      d.timetableUpdateLogs
    );
    setLocal(STORAGE_KEYS.TIMETABLE_UPDATE_LOGS, d.timetableUpdateLogs);
  }
  if (want.has("holidays") && Array.isArray(d.holidays)) {
    counts.holidays = await batchWriteCollection("school_holidays", d.holidays);
    setLocal(STORAGE_KEYS.HOLIDAYS, d.holidays);
  }
  if (want.has("schoolProfile") && d.schoolProfile) {
    await saveSchoolProfile(d.schoolProfile);
    counts.schoolProfile = 1;
  }

  return counts;
}

export async function deleteTimetableEntry(id: string): Promise<void> {
  if (db) {
    await deleteDoc(doc(db, "timetables", id));
  }
  const all = (await getTimetable()).filter((t) => t.id !== id);
  setLocal(STORAGE_KEYS.TIMETABLE, all);
}

// Helper to clean objects for Firestore (removes undefined fields)
function cleanForFirestore<T extends Record<string, any>>(obj: T): any {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

// ==================== 7. ATTENDANCE LOGS ====================

export async function getAttendanceLogs(termId?: string): Promise<AttendanceRecord[]> {
  if (db) {
    try {
      const q = termId
        ? query(collection(db, "attendance_logs"), where("termId", "==", termId))
        : collection(db, "attendance_logs");
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map((d) => {
        const data = d.data() as AttendanceRecord;
        return {
          ...data,
          id: d.id || data.id,
        };
      });
      list.sort(
        (a, b) =>
          (b.date || "").localeCompare(a.date || "") ||
          (b.periodStart || 0) - (a.periodStart || 0)
      );
      if (list.length > 0) {
        setLocal(STORAGE_KEYS.ATTENDANCE, list);
        return list;
      }
    } catch (e) {
      console.warn("getAttendanceLogs error:", e);
    }
  }
  const all = getLocal<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
  return termId ? all.filter((a) => a.termId === termId) : all;
}

export async function addAttendanceLog(record: AttendanceRecord): Promise<void> {
  if (db) {
    try {
      const cleanRecord = cleanForFirestore(record);
      await setDoc(doc(db, "attendance_logs", record.id), cleanRecord);
    } catch (e) {
      console.error("Firestore addAttendanceLog error:", e);
    }
  }
  const all = getLocal<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
  const idx = all.findIndex((a) => a.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.unshift(record);
  }
  setLocal(STORAGE_KEYS.ATTENDANCE, all);
}

export async function updateAttendanceLog(record: AttendanceRecord): Promise<void> {
  if (db) {
    try {
      const cleanRecord = cleanForFirestore(record);
      if (record.status !== "absent") {
        cleanRecord.absenceReason = "";
        cleanRecord.absenceNote = "";
      }
      await setDoc(doc(db, "attendance_logs", record.id), cleanRecord);
    } catch (e) {
      console.error("Firestore updateAttendanceLog error:", e);
    }
  }
  const all = getLocal<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
  const idx = all.findIndex((a) => a.id === record.id);
  if (idx >= 0) {
    all[idx] = {
      ...record,
      absenceReason: record.status === "absent" ? record.absenceReason : undefined,
      absenceNote: record.status === "absent" ? record.absenceNote : "",
    };
  } else {
    all.unshift(record);
  }
  setLocal(STORAGE_KEYS.ATTENDANCE, all);
}

export async function deleteAttendanceLog(id: string): Promise<void> {
  // 1. Immediately delete from local storage to guarantee 0ms consistency
  const currentLocal = getLocal<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
  const updatedLocal = currentLocal.filter((a) => a.id !== id);
  setLocal(STORAGE_KEYS.ATTENDANCE, updatedLocal);

  // 2. Delete from Firestore if online
  if (db) {
    try {
      await deleteDoc(doc(db, "attendance_logs", id));
    } catch (e) {
      console.error("Firestore deleteDoc error:", e);
    }
  }

  // 3. Dispatch storage event for other windows/tabs
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

// Real-time subscription for attendance logs
export function subscribeAttendance(callback: (records: AttendanceRecord[]) => void): () => void {
  // Immediately provide cached data first for 0ms latency
  const cached = getLocal<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
  callback(cached);

  let unsubFirestore: (() => void) | null = null;
  if (db) {
    try {
      const q = collection(db, "attendance_logs");
      unsubFirestore = onSnapshot(
        q,
        (snapshot) => {
          const records = snapshot.docs.map((d) => {
            const data = d.data() as AttendanceRecord;
            return {
              ...data,
              id: d.id || data.id,
            };
          });
          records.sort(
            (a, b) =>
              (b.date || "").localeCompare(a.date || "") ||
              (b.periodStart || 0) - (a.periodStart || 0)
          );
          setLocal(STORAGE_KEYS.ATTENDANCE, records);
          callback(records);
        },
        (error) => {
          console.warn("Firestore subscription error:", error);
        }
      );
    } catch (e) {
      console.warn("Firestore subscription failed, fallback to local:", e);
    }
  }
  // Local fallback / cross-window update
  const unsubLocal = subscribe(STORAGE_KEYS.ATTENDANCE, () => {
    callback(getLocal<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE));
  });

  return () => {
    if (unsubFirestore) unsubFirestore();
    unsubLocal();
  };
}

// ==================== 8. SCHOOL PROFILE ====================

export async function getSchoolProfile(): Promise<SchoolProfile> {
  if (db) {
    try {
      const snapshot = await getDocs(collection(db, "school_profile"));
      if (!snapshot.empty) {
        return {
          ...DEFAULT_SCHOOL_PROFILE,
          ...(snapshot.docs[0].data() as SchoolProfile),
        };
      }
    } catch (e) {
      console.warn(e);
    }
  }
  const local = getLocal<SchoolProfile>(STORAGE_KEYS.PROFILE, DEFAULT_SCHOOL_PROFILE);
  const signers =
    local.signers && local.signers.length > 0
      ? local.signers
      : DEFAULT_SCHOOL_PROFILE.signers;

  return {
    ...DEFAULT_SCHOOL_PROFILE,
    ...local,
    schoolName:
      local.schoolName && local.schoolName !== "โรงเรียนตัวอย่างวิทยาคม"
        ? local.schoolName
        : "โรงเรียนหนองวัวซอพิทยาคม",
    logoUrl: "/LOGO-N.png",
    signers,
  };
}

export async function saveSchoolProfile(profile: SchoolProfile): Promise<void> {
  if (db) {
    await setDoc(doc(db, "school_profile", "default"), profile);
  }
  setLocal(STORAGE_KEYS.PROFILE, profile);
}

// ==================== SUBSTITUTE ASSIGNMENTS ====================
export const INITIAL_SUBSTITUTES_2569: SubstituteAssignment[] = [];

export async function getSubstituteAssignments(): Promise<SubstituteAssignment[]> {
  checkAndMigrateSeedData();
  if (db) {
    try {
      const q = query(collection(db, 'substitute_assignments'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return snapshot.docs.map((d) => d.data() as SubstituteAssignment);
      }
    } catch (e) {
      console.warn('Firestore error getting substitute assignments, fallback to local:', e);
    }
  }
  return getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []);
}

export async function saveSubstituteAssignment(sub: SubstituteAssignment): Promise<void> {
  if (db) {
    try {
      await setDoc(doc(db, "substitute_assignments", sub.id), sub);
    } catch (e) {
      console.warn("Firestore error saving substitute assignment:", e);
    }
  }
  const current = getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []);
  const index = current.findIndex((s) => s.id === sub.id);
  if (index >= 0) {
    current[index] = sub;
  } else {
    current.unshift(sub);
  }
  setLocal(STORAGE_KEYS.SUBSTITUTES, current);
}

export async function deleteSubstituteAssignment(id: string): Promise<void> {
  if (db) {
    try {
      await deleteDoc(doc(db, "substitute_assignments", id));
    } catch (e) {
      console.warn("Firestore error deleting substitute assignment:", e);
    }
  }
  const current = getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []);
  const filtered = current.filter((s) => s.id !== id);
  setLocal(STORAGE_KEYS.SUBSTITUTES, filtered);
}

export async function deleteSubstituteAssignmentsByDate(date: string): Promise<number> {
  let count = 0;
  if (db) {
    try {
      const q = query(collection(db, "substitute_assignments"), where("date", "==", date));
      const snap = await getDocs(q);
      const docsToDelete = snap.docs;
      count = docsToDelete.length;

      // Batch delete in chunks of 400
      for (let i = 0; i < docsToDelete.length; i += 400) {
        const chunk = docsToDelete.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Update sync status metadata if date matches
      await setDoc(doc(db, "system_sync_status", "substitute"), {
        lastSyncedAt: new Date().toISOString(),
        lastSyncedDate: date,
        totalCount: 0,
        assignedCount: 0,
        unassignedCount: 0,
        status: "cleared",
        message: `ล้างข้อมูลการจัดสอนแทนวันที่ ${date} เรียบร้อยแล้ว`,
      });
    } catch (e) {
      console.warn("Firestore error deleting substitute assignments by date:", e);
    }
  }

  // Update local storage
  const current = getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []);
  const filtered = current.filter((s) => s.date !== date);
  if (count === 0) {
    count = current.length - filtered.length;
  }
  setLocal(STORAGE_KEYS.SUBSTITUTES, filtered);

  return count;
}

export async function deleteSubstituteAssignmentsByTeacher(date: string, teacherName: string): Promise<number> {
  let count = 0;
  const cleanTarget = teacherName.replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, "").trim();

  if (db) {
    try {
      const q = query(collection(db, "substitute_assignments"), where("date", "==", date));
      const snap = await getDocs(q);
      const docsToDelete = snap.docs.filter((d) => {
        const data = d.data() as SubstituteAssignment;
        const origClean = (data.originalTeacherName || "").replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, "").trim();
        const subClean = (data.substituteTeacherName || "").replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, "").trim();
        return origClean === cleanTarget || subClean === cleanTarget;
      });

      count = docsToDelete.length;

      // Batch delete
      for (let i = 0; i < docsToDelete.length; i += 400) {
        const chunk = docsToDelete.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.warn("Firestore error deleting substitute assignments by teacher:", e);
    }
  }

  // Update local storage
  const current = getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []);
  const filtered = current.filter((s) => {
    if (s.date !== date) return true;
    const origClean = (s.originalTeacherName || "").replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, "").trim();
    const subClean = (s.substituteTeacherName || "").replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.)\s*/, "").trim();
    return origClean !== cleanTarget && subClean !== cleanTarget;
  });

  if (count === 0) {
    count = current.length - filtered.length;
  }
  setLocal(STORAGE_KEYS.SUBSTITUTES, filtered);

  return count;
}

export function subscribeSubstituteAssignments(callback: (records: SubstituteAssignment[]) => void) {
  if (!db) {
    callback(getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []));
    return () => {};
  }
  const q = query(collection(db, "substitute_assignments"), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const records: SubstituteAssignment[] = [];
      snapshot.forEach((d) => {
        records.push(d.data() as SubstituteAssignment);
      });
      callback(records);
    },
    (error) => {
      console.warn("Firestore substitute subscription error:", error);
      callback(getLocal<SubstituteAssignment[]>(STORAGE_KEYS.SUBSTITUTES, []));
    }
  );
}

export function subscribeSubstituteSyncStatus(callback: (status: any) => void) {
  if (!db) {
    callback(null);
    return () => {};
  }
  return onSnapshot(
    doc(db, "system_sync_status", "substitute"),
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        callback(null);
      }
    },
    (error) => {
      console.warn("Firestore sync status subscription error:", error);
      callback(null);
    }
  );
}

// ==================== DEPARTMENT PINS ====================
export async function getDepartmentPins(): Promise<Record<string, string>> {
  checkAndMigrateSeedData();
  const local = getLocal<Record<string, string>>(STORAGE_KEYS.DEPT_PINS, DEFAULT_DEPARTMENT_PINS);
  return { ...DEFAULT_DEPARTMENT_PINS, ...local };
}

export async function saveDepartmentPins(pins: Record<string, string>): Promise<void> {
  setLocal(STORAGE_KEYS.DEPT_PINS, pins);
}

// Reset / Seed Initial Data (useful for demo & testing)
export async function resetToSampleData(): Promise<void> {
  setLocal(STORAGE_KEYS.TERMS, INITIAL_TERMS);
  setLocal(STORAGE_KEYS.CLASSROOMS, INITIAL_CLASSROOMS);
  setLocal(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
  setLocal(STORAGE_KEYS.SUBJECTS, INITIAL_SUBJECTS);
  setLocal(STORAGE_KEYS.PERIODS, DEFAULT_PERIODS);
  setLocal(STORAGE_KEYS.TIMETABLE, INITIAL_TIMETABLE);
  setLocal(STORAGE_KEYS.ATTENDANCE, INITIAL_ATTENDANCE);
  setLocal(STORAGE_KEYS.PROFILE, DEFAULT_SCHOOL_PROFILE);
  setLocal(STORAGE_KEYS.SUBSTITUTES, []);
  setLocal(STORAGE_KEYS.DEPT_PINS, DEFAULT_DEPARTMENT_PINS);
}

// Sync all local master data to Cloud Firestore
export async function syncAllToFirestore(): Promise<{ success: boolean; message: string }> {
  if (!db) {
    throw new Error("ระบบ Firebase ยังไม่ได้เชื่อมต่อ กรุณาตรวจสอบการตั้งค่าในไฟล์ .env.local");
  }

  // 1. Terms
  for (const term of INITIAL_TERMS) {
    await setDoc(doc(db, "academic_terms", term.id), term);
  }

  // 2. Classrooms
  const clsBatch = writeBatch(db);
  INITIAL_CLASSROOMS.forEach((c) => clsBatch.set(doc(db!, "classrooms", c.id), c));
  await clsBatch.commit();

  // 3. Teachers
  const tchBatch = writeBatch(db);
  INITIAL_TEACHERS.forEach((t) => tchBatch.set(doc(db!, "teachers", t.id), t));
  await tchBatch.commit();

  // 4. Subjects
  const sbjBatch = writeBatch(db);
  INITIAL_SUBJECTS.forEach((s) => sbjBatch.set(doc(db!, "subjects", s.id), s));
  await sbjBatch.commit();

  // 5. School Profile
  await setDoc(doc(db, "school_profile", "default"), DEFAULT_SCHOOL_PROFILE);

  // 6. Timetable (Chunked by 400 for Firestore limit)
  for (let i = 0; i < INITIAL_TIMETABLE.length; i += 400) {
    const chunk = INITIAL_TIMETABLE.slice(i, i + 400);
    const ttBatch = writeBatch(db);
    chunk.forEach((tt) => ttBatch.set(doc(db!, "timetables", tt.id), tt));
    await ttBatch.commit();
  }

  return {
    success: true,
    message: `ซิงก์ข้อมูลหลักขึ้น Firebase Firestore สำเร็จเรียบร้อยแล้ว (ครู ${INITIAL_TEACHERS.length} ท่าน, ${INITIAL_CLASSROOMS.length} ห้องเรียน, รายวิชา ${INITIAL_SUBJECTS.length} วิชา, ตารางสอน ${INITIAL_TIMETABLE.length} คาบ)`,
  };
}

export async function getSubstituteSyncStatus(): Promise<{
  lastSyncedAt?: string;
  lastSyncedDate?: string;
  totalCount?: number;
  assignedCount?: number;
  unassignedCount?: number;
  status?: string;
  message?: string;
} | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "system_sync_status", "substitute"));
    if (snap.exists()) {
      return snap.data() as any;
    }
  } catch (err) {
    console.warn("Could not get substitute sync status:", err);
  }
  return null;
}
