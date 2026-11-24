import { Teacher, Classroom, Subject, TimetableEntry, AcademicTerm, SubstituteAssignment, SubstituteLeaveType } from "@/types";
import { getTeachers, getClassrooms, getSubjects, getTerms, saveSubstituteAssignment, deleteSubstituteAssignment } from "@/lib/storage";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { getThaiDateString } from "@/lib/dateUtils";

const NONGWUASO_SUB_BASE_URL = "https://nongwuaso-sub.netlify.app";

export interface NongwuasoParsedRow {
  date: string; // YYYY-MM-DD
  dept: string;
  originalTeacherName: string;
  substituteTeacherName: string;
  period: number;
  subjectCode: string;
  gradeRoom: string;
  roomLocation: string;
  leaveType: SubstituteLeaveType;
  combo: boolean;
}

export interface SyncResult {
  success: boolean;
  date: string;
  totalSynced: number;
  assignedCount: number;
  unassignedCount: number;
  deletedCount?: number;
  departmentsCount: number;
  syncedAt: string;
  message: string;
  details?: {
    dept: string;
    period: number;
    gradeRoom: string;
    orig: string;
    sub: string;
    subject: string;
  }[];
  error?: string;
}

// Helper to extract subject code, grade room, and room number from plan text
export function parsePlanText(text: string): { code: string; cls: string; room: string } {
  if (!text) return { code: "", cls: "", room: "" };
  const code = (text.match(/[ก-ฮ]{1,2}\s?\d{5}/) || [""])[0].replace(/\s/g, "");
  const lv = text.match(/([มป])\.\s?(\d\/\d{1,2})/);
  const bare = text.match(/(\d\/\d{1,2})/);
  const grp = text.match(/([มป])\.\s?(\d\s*\([^)]*\))/);
  const lvl = text.match(/([มป])\.\s?(\d)(?![\d\/])/);

  const cls = lv
    ? `${lv[1]}.${lv[2]}`
    : bare
    ? "ม." + bare[1]
    : grp
    ? `${grp[1]}.${grp[2]}`
    : lvl
    ? `${lvl[1]}.${lvl[2]}`
    : "";

  const room =
    text
      .split("\n")
      .map((s) => s.trim())
      .find(
        (s) =>
          /^(ห้อง\s?)?\d{3,4}$/.test(s) ||
          /^คอม(ฯ|\s?\d)/.test(s) ||
          /^ห้อง/.test(s)
      ) || "";

  return { code, cls, room: room.replace(/^ห้อง\s?/, "") };
}

export interface NongwuasoFetchResult {
  rows: NongwuasoParsedRow[];
  succeededDepts: Set<string>;
  allDeptsSucceeded: boolean;
}

/**
 * Fetch and parse raw substitute teaching plans directly from nongwuaso-sub.netlify.app API
 */
export async function fetchNongwuasoSubDataWithMeta(targetDate?: string): Promise<NongwuasoFetchResult> {
  const queryDate = targetDate || getThaiDateString();

  // 1. Fetch all departments
  const deptsRes = await fetch(`${NONGWUASO_SUB_BASE_URL}/api/depts`, { cache: "no-store" });
  if (!deptsRes.ok) {
    throw new Error(`Failed to fetch departments from nongwuaso-sub (HTTP ${deptsRes.status})`);
  }
  const depts: { id: string; name: string }[] = await deptsRes.json();

  const allRows: NongwuasoParsedRow[] = [];
  const succeededDepts = new Set<string>();

  // 2. Fetch each department's state
  for (const d of depts) {
    try {
      const res = await fetch(`${NONGWUASO_SUB_BASE_URL}/api/state?dept=${encodeURIComponent(d.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) continue;
      const data = await res.json();
      succeededDepts.add(d.name);
      const S = data?.state;
      if (!S || !S.plans) continue;

      const teacherMap = new Map<string, string>((S.teachers || []).map((t: any) => [t.id, t.name]));
      const absenceMap = new Map<string, any>((S.absences || []).map((a: any) => [a.id, a]));

      // Filter plans for the target date
      const dayPlan = S.plans[queryDate];
      if (!dayPlan) continue;

      for (const [key, entry] of Object.entries<any>(dayPlan)) {
        if (!entry || entry.need === false) continue;
        const [tid, pStr] = key.split("|");
        const p = parseInt(pStr, 10) || 1;

        const origName = teacherMap.get(tid) || tid || "ไม่ระบุชื่อครู";
        const subName = entry.sub ? (teacherMap.get(entry.sub) || entry.sub) : "";
        const parsed = parsePlanText(entry.text || "");
        const absence = entry.aid ? absenceMap.get(entry.aid) : null;

        let leaveType: SubstituteLeaveType = "personal";
        const rawType = (absence?.type || "").trim();
        if (rawType.includes("ป่วย")) leaveType = "sick";
        else if (rawType.includes("ราชการ")) leaveType = "official";

        allRows.push({
          date: queryDate,
          dept: d.name,
          originalTeacherName: origName,
          substituteTeacherName: subName,
          period: p,
          subjectCode: parsed.code,
          gradeRoom: parsed.cls,
          roomLocation: parsed.room,
          leaveType,
          combo: Boolean(entry.combo),
        });
      }
    } catch (deptErr) {
      console.warn(`Error syncing dept ${d.name}:`, deptErr);
    }
  }

  return {
    rows: allRows,
    succeededDepts,
    allDeptsSucceeded: depts.length > 0 && succeededDepts.size === depts.length,
  };
}

export async function fetchNongwuasoSubData(targetDate?: string): Promise<NongwuasoParsedRow[]> {
  const { rows } = await fetchNongwuasoSubDataWithMeta(targetDate);
  return rows;
}

/**
 * Sync substitute assignments into Class Check database with fuzzy matching
 */
export async function syncNongwuasoSubstitutes(targetDate?: string): Promise<SyncResult> {
  const finalDate = targetDate || getThaiDateString();

  try {
    // 1. Fetch raw data from Netlify (tracks which departments responded cleanly)
    const { rows: rawRows, succeededDepts, allDeptsSucceeded } =
      await fetchNongwuasoSubDataWithMeta(finalDate);

    // 2. Load Class Check data for matching
    const [teachers, classrooms, subjects, terms] = await Promise.all([
      getTeachers(),
      getClassrooms(),
      getSubjects(),
      getTerms(),
    ]);

    const activeTerm = terms.find((t) => t.isActive) || terms[0];
    const termId = activeTerm?.id || "term_2_2569";

    const parsedDate = new Date(`${finalDate}T12:00:00+07:00`);
    const dayOfWeek = parsedDate.getDay() || 1;

    // Helper matchers
    const matchTeacher = (name: string): Teacher | null => {
      if (!name) return null;
      const clean = name.replace(/\s+/g, "").toLowerCase();
      return (
        teachers.find((t) => {
          const full = `${t.prefix}${t.fullName}`.replace(/\s+/g, "").toLowerCase();
          const bare = t.fullName.replace(/\s+/g, "").toLowerCase();
          return clean.includes(bare) || bare.includes(clean) || clean.includes(full);
        }) || null
      );
    };

    const matchClassroom = (gr: string): Classroom | null => {
      if (!gr) return null;
      const clean = gr.replace(/\s+/g, "").toLowerCase();
      return (
        classrooms.find((c) => {
          const cClean = c.gradeRoom.replace(/\s+/g, "").toLowerCase();
          return cClean === clean || cClean.replace("ม.", "") === clean.replace("ม.", "");
        }) || null
      );
    };

    const matchSubject = (code: string): Subject | null => {
      if (!code) return null;
      const clean = code.replace(/\s+/g, "").toUpperCase();
      return subjects.find((s) => s.code.replace(/\s+/g, "").toUpperCase() === clean) || null;
    };

    let totalSynced = 0;
    let assignedCount = 0;
    let unassignedCount = 0;
    let deletedCount = 0;
    const activeSyncedIds = new Set<string>();
    const details: SyncResult["details"] = [];

    // 3. Process each row and save cleanly with deterministic ID (clean overwrite on re-sync)
    for (let idx = 0; idx < rawRows.length; idx++) {
      const item = rawRows[idx];

      const matchedOrig = matchTeacher(item.originalTeacherName);
      const isUnassigned =
        !item.substituteTeacherName ||
        item.substituteTeacherName.includes("ยังไม่มี") ||
        item.substituteTeacherName.includes("ไม่มี") ||
        item.substituteTeacherName === "-";

      const matchedSub = !isUnassigned ? matchTeacher(item.substituteTeacherName) : null;
      const matchedCls = matchClassroom(item.gradeRoom);
      const matchedSubj = matchSubject(item.subjectCode);

      if (isUnassigned) {
        unassignedCount++;
      } else {
        assignedCount++;
      }

      const classroomId = matchedCls?.id || item.gradeRoom || `room_${item.gradeRoom}`;
      const cleanGradeRoom = matchedCls?.gradeRoom || (item.gradeRoom.startsWith("ม.") ? item.gradeRoom : `ม.${item.gradeRoom}`);

      // Deterministic ID prevents duplicate records on repeated syncs
      const deterministicId = `sub_auto_${finalDate}_${classroomId.replace(/[^a-zA-Z0-9_-]/g, "_")}_p${item.period}`;

      const subAssignment: SubstituteAssignment = {
        id: deterministicId,
        termId,
        date: finalDate,
        dayOfWeek,
        periodStart: item.period,
        periodEnd: item.period,
        classroomId,
        gradeRoom: cleanGradeRoom,
        subjectCode: item.subjectCode || matchedSubj?.code || "",
        subjectName: matchedSubj?.name || item.subjectCode || "วิชาตามตาราง",
        originalTeacherId: matchedOrig?.id || "",
        originalTeacherName: matchedOrig ? `${matchedOrig.prefix}${matchedOrig.fullName}` : item.originalTeacherName,
        leaveType: item.leaveType,
        substituteTeacherId: matchedSub?.id || "",
        substituteTeacherName: isUnassigned
          ? ""
          : matchedSub
          ? `${matchedSub.prefix}${matchedSub.fullName}`
          : item.substituteTeacherName,
        substituteDepartment: matchedSub?.department || item.dept,
        recordedByDept: `ฝ่ายวิชาการ (Auto-Sync: ${item.dept})`,
        createdAt: new Date().toISOString(),
        department: item.dept,
        note: item.combo ? "ดูแลควบ" : isUnassigned ? "ยังไม่มีผู้สอนแทน" : "",
      };

      await saveSubstituteAssignment(subAssignment);
      activeSyncedIds.add(deterministicId);
      totalSynced++;

      details.push({
        dept: item.dept,
        period: item.period,
        gradeRoom: cleanGradeRoom,
        orig: subAssignment.originalTeacherName,
        sub: subAssignment.substituteTeacherName || "ยังไม่มีผู้สอนแทน",
        subject: subAssignment.subjectCode,
      });
    }

    // 3B. Safely remove stale auto-synced records (ONLY `sub_auto_${finalDate}_...`)
    // that were cancelled or moved on nongwuaso-sub. Never touches manual Excel/OCR records,
    // and only cleans up departments that responded cleanly with HTTP 200.
    if (db && succeededDepts.size > 0) {
      try {
        const autoPrefix = `sub_auto_${finalDate}_`;
        const q = query(
          collection(db, "substitute_assignments"),
          where("date", "==", finalDate)
        );
        const existingSnap = await getDocs(q);
        for (const d of existingSnap.docs) {
          if (!d.id.startsWith(autoPrefix)) continue;
          if (activeSyncedIds.has(d.id)) continue;
          const existingData = d.data() as SubstituteAssignment;
          // Only delete if all departments succeeded OR this specific department succeeded
          if (allDeptsSucceeded || (existingData.department && succeededDepts.has(existingData.department))) {
            await deleteSubstituteAssignment(d.id);
            deletedCount++;
          }
        }
      } catch (cleanupErr) {
        console.warn("Stale auto-sync substitute cleanup warning:", cleanupErr);
      }
    }

    const syncedAt = new Date().toISOString();
    const cleanupNote = deletedCount > 0 ? `, ล้างคาบที่ถูกยกเลิกออก ${deletedCount} คาบ` : "";
    const result: SyncResult = {
      success: true,
      date: finalDate,
      totalSynced,
      assignedCount,
      unassignedCount,
      deletedCount,
      departmentsCount: new Set(rawRows.map((r) => r.dept)).size,
      syncedAt,
      message:
        totalSynced > 0
          ? `ซิงก์ข้อมูลสอนแทนวันที่ ${finalDate} สำเร็จทั้งหมด ${totalSynced} คาบ (จัดสอนแทนแล้ว ${assignedCount} คาบ, ยังไม่มีผู้แทน ${unassignedCount} คาบ${cleanupNote})`
          : deletedCount > 0
          ? `ไม่พบรายการจัดสอนแทนสำหรับวันที่ ${finalDate} (ล้างรายการที่ถูกยกเลิกออก ${deletedCount} คาบ)`
          : `ไม่พบรายการจัดสอนแทนในระบบ nongwuaso-sub สำหรับวันที่ ${finalDate}`,
      details,
    };

    // 4. Save metadata audit status to Firestore
    if (db) {
      try {
        await setDoc(doc(db, "system_sync_status", "substitute"), {
          lastSyncedAt: syncedAt,
          lastSyncedDate: finalDate,
          totalCount: totalSynced,
          assignedCount,
          unassignedCount,
          status: "success",
          message: result.message,
        });
      } catch (err) {
        console.warn("Could not save sync status to Firestore:", err);
      }
    }

    return result;
  } catch (err: any) {
    console.error("syncNongwuasoSubstitutes error:", err);
    return {
      success: false,
      date: finalDate,
      totalSynced: 0,
      assignedCount: 0,
      unassignedCount: 0,
      departmentsCount: 0,
      syncedAt: new Date().toISOString(),
      message: `เกิดข้อผิดพลาดในการซิงก์ข้อมูล: ${err?.message || "ไม่สามารถเชื่อมต่อ nongwuaso-sub"}`,
      error: String(err?.message || err),
    };
  }
}
