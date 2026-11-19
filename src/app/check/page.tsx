"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Lock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Clock,
  BookOpen,
  UserCheck,
  Send,
  Sparkles,
  ArrowRight,
  LogOut,
  Calendar,
  Info,
  QrCode,
  Bell,
  Edit3,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  getClassrooms,
  getActiveTerm,
  getPeriodSettings,
  getTimetable,
  getTeachers,
  getSubjects,
  addAttendanceLog,
  updateAttendanceLog,
  deleteAttendanceLog,
  getAttendanceLogs,
  subscribeAttendance,
  getSubstituteAssignments,
} from "@/lib/storage";
import {
  Classroom,
  AcademicTerm,
  PeriodSetting,
  TimetableEntry,
  Teacher,
  Subject,
  AttendanceStatus,
  AbsenceReason,
  AttendanceRecord,
  SubstituteAssignment,
} from "@/types";
import { THAI_DAYS } from "@/lib/constants";
import { INITIAL_SUBJECTS } from "@/lib/initialData";
import {
  getThaiDateString,
  getThaiOffsetDate,
  formatThaiDateLong,
  isWithin7DaysThai,
} from "@/lib/dateUtils";
import { getSpecialNonCheckedPeriodInfo } from "@/lib/attendanceUtils";

// Excluded non-academic activities, free periods, or tutorial periods that should NOT be checked:
const EXCLUDED_ACTIVITY_KEYWORDS = [
  "บำเพ็ญประโยชน์",
  "พัฒนาทักษะชีวิต",
  "พัฒนา",
  "ทักษะชีวิต",
  "ลูกเสือ",
  "เนตรนารี",
  "ยุวกาชาด",
  "ชุมนุม",
  "สวดมนต์",
  "ติวโอเน็ต",
  "ติว O-NET",
  "ติว",
  "ซ่อมเสริม",
  "เลือกเสรี",
  "โฮมรูม",
  "พักเที่ยง",
  "คาบว่าง",
];

function isExcludedActivity(nameOrCode?: string): boolean {
  if (!nameOrCode) return false;
  return EXCLUDED_ACTIVITY_KEYWORDS.some((kw) => nameOrCode.includes(kw));
}

export default function StudentCheckPage() {
  // Master data
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeTerm, setActiveTerm] = useState<AcademicTerm | null>(null);
  const [periods, setPeriods] = useState<PeriodSetting[]>([]);
  const [timetables, setTimetables] = useState<TimetableEntry[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [substitutes, setSubstitutes] = useState<SubstituteAssignment[]>([]);
  const [roomSubstitutesToday, setRoomSubstitutesToday] = useState<SubstituteAssignment[]>([]);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);

  // Room Authentication state
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [studentName, setStudentName] = useState("");
  const [isRoomAuthenticated, setIsRoomAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [qrScannedRoom, setQrScannedRoom] = useState<string | null>(null);

  // Anti-Brute Force PIN state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);

  useEffect(() => {
    if (!lockUntil) return;
    const timer = setInterval(() => {
      const left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) {
        setLockUntil(null);
        setLockSecondsLeft(0);
        setFailedAttempts(0);
        setAuthError("");
      } else {
        setLockSecondsLeft(left);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockUntil]);

  // Check-in Form state (in Thai Bangkok Timezone UTC+7)
  const todayStr = useMemo(() => getThaiDateString(), []);
  const [checkDate, setCheckDate] = useState(() => getThaiDateString());
  const [isDoublePeriod, setIsDoublePeriod] = useState(false);
  const [periodStart, setPeriodStart] = useState<number>(1);
  const [periodEnd, setPeriodEnd] = useState<number>(1);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "">("");
  const [absenceReason, setAbsenceReason] = useState<AbsenceReason | "">("");
  const [absenceNote, setAbsenceNote] = useState("");
  const [lateNote, setLateNote] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [autoDetectedNotice, setAutoDetectedNotice] = useState<string | null>(null);
  const [roomTodayLogs, setRoomTodayLogs] = useState<AttendanceRecord[]>([]);
  const [allRoomLogs, setAllRoomLogs] = useState<AttendanceRecord[]>([]);
  const [historyTab, setHistoryTab] = useState<"day" | "week">("day");
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);

  // Current Thai Time clock
  const [currentTimeStr, setCurrentTimeStr] = useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load all required data
  useEffect(() => {
    async function init() {
      const [term, clsList, pList, tchList, subjList, subList] = await Promise.all([
        getActiveTerm(),
        getClassrooms(),
        getPeriodSettings(),
        getTeachers(),
        getSubjects(),
        getSubstituteAssignments(),
      ]);
      setActiveTerm(term);
      setClassrooms(clsList);
      setPeriods(pList);
      setTeachers(tchList);
      setSubjects(subjList);
      setSubstitutes(subList);

      let ttList: TimetableEntry[] = [];
      if (term) {
        ttList = await getTimetable(term.id);
      }
      if (!ttList || ttList.length === 0) {
        ttList = await getTimetable();
      }
      setTimetables(ttList);

      // Check cached session
      const savedRoomId = sessionStorage.getItem("class_check_room_id");
      const savedStudent = sessionStorage.getItem("class_check_student");
      const localSavedStudent = typeof window !== "undefined" ? localStorage.getItem("class_check_saved_student_name") : null;
      const localSavedRoomId = typeof window !== "undefined" ? localStorage.getItem("class_check_saved_room_id") : null;

      if (savedRoomId && savedStudent) {
        setSelectedRoomId(savedRoomId);
        setStudentName(savedStudent);
        setIsRoomAuthenticated(true);
        const r = clsList.find((c) => c.id === savedRoomId);
        if (r) setSelectedGrade(r.grade);

        // Check if there are substitute assignments for this room today
        const todayStr = getThaiDateString();
        const roomSubs = subList.filter(
          (s) => s.classroomId === savedRoomId && s.date === todayStr
        );
        if (roomSubs.length > 0) {
          setRoomSubstitutesToday(roomSubs);
          setShowSubstituteModal(true);
        }

        // Trigger initial timetable sync for current period or Period 1
        let initialP = 1;
        const now = new Date();
        const curHM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
        const matchP = pList.find((p) => curHM >= p.startTime && curHM <= p.endTime);
        if (matchP) initialP = matchP.periodNumber;
        setPeriodStart(initialP);
        setPeriodEnd(initialP);

        // Sync with timetable immediately
        syncWithTimetable(
          savedRoomId,
          todayStr,
          initialP,
          ttList,
          subjList,
          tchList,
          subList
        );
      } else if (typeof window !== "undefined") {
        // Prefill saved room and student name on this device if available
        if (localSavedStudent) {
          setStudentName(localSavedStudent);
        }
        if (localSavedRoomId && !selectedRoomId) {
          setSelectedRoomId(localSavedRoomId);
          const r = clsList.find((c) => c.id === localSavedRoomId);
          if (r) setSelectedGrade(r.grade);
        }

        // Detect QR Code scan params (e.g. ?roomId=m1_1 or ?grade=ม.1&room=1)
        const params = new URLSearchParams(window.location.search);
        const qRoomId = params.get("roomId");
        const qGrade = params.get("grade");
        const qRoom = params.get("room");

        if (qRoomId) {
          const target = clsList.find((c) => c.id === qRoomId || c.gradeRoom === qRoomId);
          if (target) {
            setSelectedGrade(target.grade);
            setSelectedRoomId(target.id);
            setQrScannedRoom(target.gradeRoom);
          }
        } else if (qGrade && qRoom) {
          const target = clsList.find(
            (c) => c.grade === qGrade && String(c.room) === String(qRoom)
          );
          if (target) {
            setSelectedGrade(target.grade);
            setSelectedRoomId(target.id);
            setQrScannedRoom(target.gradeRoom);
          }
        }
      }
    }
    init();
  }, []);

  // Real-time online synchronization of attendance logs for this room
  useEffect(() => {
    if (isRoomAuthenticated && selectedRoomId) {
      const unsubscribe = subscribeAttendance((allRecords) => {
        const roomLogs = allRecords.filter((l) => l.classroomId === selectedRoomId);
        setAllRoomLogs(roomLogs);
        const todayLogs = roomLogs.filter((l) => l.date === checkDate);
        setRoomTodayLogs(todayLogs);
      });
      return () => unsubscribe();
    }
  }, [isRoomAuthenticated, selectedRoomId, checkDate]);

  async function loadRoomLogs() {
    if (!activeTerm) return;
    const allLogs = await getAttendanceLogs(activeTerm.id);
    const roomLogs = allLogs.filter((l) => l.classroomId === selectedRoomId);
    setAllRoomLogs(roomLogs);
    setRoomTodayLogs(roomLogs.filter((l) => l.date === checkDate));
  }

  // Room logs within 7 days that are eligible for editing/deleting
  const room7DaysLogs = useMemo(() => {
    return allRoomLogs.filter((l) => isWithin7DaysThai(l.date));
  }, [allRoomLogs]);

  // Start editing a record (allowed within 7 days)
  const handleStartEdit = (record: AttendanceRecord) => {
    if (!isWithin7DaysThai(record.date)) {
      alert("รายการนี้ถูกบันทึกเกิน 7 วันแล้ว ไม่สามารถแก้ไขได้ (ตามระเบียบโรงเรียน)");
      return;
    }
    setEditingRecord(record);
    setCheckDate(record.date);
    setIsDoublePeriod(record.periodStart !== record.periodEnd);
    setPeriodStart(record.periodStart);
    setPeriodEnd(record.periodEnd);
    setSelectedSubjectId(record.subjectId);
    setSelectedTeacherId(record.teacherId);
    setStatus(record.status);
    setAbsenceReason(record.absenceReason || "");
    setAbsenceNote(record.absenceNote || "");
    setLateNote(record.lateNote || "");

    // Scroll smoothly to form
    const formEl = document.getElementById("checkin-form");
    if (formEl) {
      formEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setEditingRecord(null);
    setStatus("");
    setAbsenceReason("");
    setAbsenceNote("");
    setLateNote("");
  };

  // Delete a record (allowed within 7 days)
  const handleDeleteRecord = async (record: AttendanceRecord) => {
    if (!isWithin7DaysThai(record.date)) {
      alert("รายการนี้ถูกบันทึกเกิน 7 วันแล้ว ไม่สามารถลบได้ (ตามระเบียบโรงเรียน)");
      return;
    }
    const pLabel =
      record.periodStart === record.periodEnd
        ? `คาบที่ ${record.periodStart}`
        : `คาบที่ ${record.periodStart}-${record.periodEnd}`;
    const confirmed = window.confirm(
      `คุณต้องการลบข้อมูลการเข้าสอน ${pLabel} (${record.subjectCode} ${record.subjectName}) ของวันที่ ${record.date} ใช่หรือไม่?\n(ข้อมูลจะถูกลบออกจากระบบส่วนกลาง)`
    );
    if (!confirmed) return;

    try {
      await deleteAttendanceLog(record.id);
      if (editingRecord?.id === record.id) {
        handleCancelEdit();
      }
      await loadRoomLogs();
    } catch (e) {
      console.error(e);
      alert("เกิดข้อผิดพลาดในการลบข้อมูล กรุณาลองใหม่อีกครั้ง");
    }
  };

  // Handle Room Login
  const handleRoomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (lockUntil && Date.now() < lockUntil) {
      setAuthError(`⛔ คุณใส่รหัส PIN ผิดเกิน 5 ครั้ง ระบบระงับชั่วคราวเพื่อความปลอดภัย กรุณารออีก ${lockSecondsLeft} วินาที`);
      return;
    }

    if (!selectedRoomId) {
      setAuthError("กรุณาเลือกระดับชั้น/ห้องเรียน");
      return;
    }
    if (!pinInput.trim()) {
      setAuthError("กรุณากรอกรหัส PIN ของห้องเรียน");
      return;
    }
    if (!studentName.trim()) {
      setAuthError("กรุณากรอกชื่อหรือเลขที่ของนักเรียนผู้บันทึก");
      return;
    }

    const targetRoom = classrooms.find((c) => c.id === selectedRoomId);
    if (!targetRoom || targetRoom.pinCode !== pinInput.trim()) {
      const nextFailed = failedAttempts + 1;
      setFailedAttempts(nextFailed);

      if (nextFailed >= 5) {
        const lockDuration = 60 * 1000;
        setLockUntil(Date.now() + lockDuration);
        setLockSecondsLeft(60);
        setAuthError("⛔ คุณใส่รหัส PIN ผิดติดต่อกัน 5 ครั้ง ระบบระงับชั่วคราว 60 วินาที เพื่อความปลอดภัย");
      } else {
        setAuthError(`รหัส PIN ของห้องเรียนไม่ถูกต้อง (สามารถลองใหม่ได้อีก ${5 - nextFailed} ครั้ง)`);
      }
      return;
    }

    // Success login: reset brute force trackers
    setFailedAttempts(0);
    setLockUntil(null);
    setLockSecondsLeft(0);
    setIsRoomAuthenticated(true);
    sessionStorage.setItem("class_check_room_id", selectedRoomId);
    sessionStorage.setItem("class_check_student", studentName.trim());
    localStorage.setItem("class_check_saved_room_id", selectedRoomId);
    localStorage.setItem("class_check_saved_student_name", studentName.trim());

    // Check if there are substitute assignments for this room today
    const todayStr = getThaiDateString();
    const roomSubs = substitutes.filter(
      (s) => s.classroomId === selectedRoomId && s.date === todayStr
    );
    if (roomSubs.length > 0) {
      setRoomSubstitutesToday(roomSubs);
      setShowSubstituteModal(true);
    } else {
      setShowSubstituteModal(false);
    }

    // Initial period selection (default to current period if class time, else Period 1)
    let initialP = 1;
    const now = new Date();
    const curHM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const matchP = periods.find((p) => curHM >= p.startTime && curHM <= p.endTime);
    if (matchP) initialP = matchP.periodNumber;
    setPeriodStart(initialP);
    setPeriodEnd(initialP);

    // Sync timetable immediately
    syncWithTimetable(targetRoom.id, checkDate, initialP);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("class_check_room_id");
    sessionStorage.removeItem("class_check_student");
    setIsRoomAuthenticated(false);
    setPinInput("");
    setAutoDetectedNotice(null);

    const localSavedStudent = typeof window !== "undefined" ? localStorage.getItem("class_check_saved_student_name") : null;
    const localSavedRoomId = typeof window !== "undefined" ? localStorage.getItem("class_check_saved_room_id") : null;
    if (localSavedStudent) setStudentName(localSavedStudent);
    if (localSavedRoomId) {
      setSelectedRoomId(localSavedRoomId);
      const r = classrooms.find((c) => c.id === localSavedRoomId);
      if (r) setSelectedGrade(r.grade);
    } else {
      setSelectedGrade("");
      setSelectedRoomId("");
    }
  };

  // Dynamic Timetable Synchronization (by room, date, and periodNumber)
  const syncWithTimetable = (
    roomId: string,
    dateStr: string,
    periodNum: number,
    ttSource?: TimetableEntry[],
    subjSource?: Subject[],
    tchSource?: Teacher[],
    subSource?: SubstituteAssignment[]
  ) => {
    if (!roomId) return;
    const currentTT = ttSource || timetables;
    const currentSubj = subjSource || subjects;
    const currentTch = tchSource || teachers;
    const currentSubs = subSource || substitutes;

    const parts = dateStr.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return;
    const [y, m, d] = parts;
    const targetDate = new Date(y, m - 1, d);
    const dayOfWeek = targetDate.getDay();

    const thaiDays = [
      "วันอาทิตย์",
      "วันจันทร์",
      "วันอังคาร",
      "วันพุธ",
      "วันพฤหัสบดี",
      "วันศุกร์",
      "วันเสาร์",
    ];
    const thaiDayName = thaiDays[dayOfWeek] || "";

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      setAutoDetectedNotice(
        `📅 ${thaiDayName} (${formatThaiDateLong(dateStr)}): เป็นวันหยุดสุดสัปดาห์ (ไม่มีในตารางสอนปกติ) สามารถเลือกวิชาและครูผู้สอนเองได้`
      );
      return;
    }

    const roomObj = classrooms.find((c) => c.id === roomId || c.gradeRoom === roomId);
    const targetRoomId = roomObj?.id || roomId;
    const targetGradeRoom = roomObj?.gradeRoom || roomId;

    // Look up timetable for this room, dayOfWeek, and periodNum
    const matchedTT = currentTT.find(
      (tt) =>
        (tt.classroomId === targetRoomId ||
          tt.classroomId === roomId ||
          tt.gradeRoom === targetGradeRoom ||
          tt.gradeRoom === roomId) &&
        tt.dayOfWeek === dayOfWeek &&
        periodNum >= tt.periodStart &&
        periodNum <= tt.periodEnd
    );

    if (matchedTT) {
      // Check if excluded non-academic activity or activity without teacher/code
      if (
        isExcludedActivity(matchedTT.subjectName) ||
        isExcludedActivity(matchedTT.subjectCode) ||
        !matchedTT.subjectCode ||
        matchedTT.teacherName === "ไม่ระบุ"
      ) {
        setIsDoublePeriod(false);
        setPeriodStart(periodNum);
        setPeriodEnd(periodNum);
        setSelectedSubjectId("");
        setSelectedTeacherId("");
        setAutoDetectedNotice(
          `📅 ตารางสอน${thaiDayName} คาบที่ ${periodNum}: ${matchedTT.subjectName || matchedTT.subjectCode || "คาบกิจกรรม/ว่าง"} (เป็นกิจกรรม/ติว/คาบว่าง ไม่มีการเรียนการสอนรายวิชาหลัก ไม่ต้องเช็คเวลาเข้าสอน)`
        );
        return;
      }

      const isDouble = matchedTT.periodEnd > matchedTT.periodStart;
      setIsDoublePeriod(isDouble);
      if (isDouble) {
        setPeriodStart(matchedTT.periodStart);
        setPeriodEnd(matchedTT.periodEnd);
      } else {
        setPeriodStart(periodNum);
        setPeriodEnd(periodNum);
      }

      // Match subject (matches by code OR id OR name, resilient to spacing and spelling)
      const cleanSubjCode = (matchedTT.subjectCode || "").replace(/\s+/g, "").toUpperCase();
      const normSubjName = (name: string) =>
        (name || "")
          .replace(/\s+/g, "")
          .replace(/วิทยศาสตร์/g, "วิทยาศาสตร์")
          .toLowerCase();

      const matchedNameNorm = normSubjName(matchedTT.subjectName);

      // Exact subject code / ID match has highest priority!
      let sb = currentSubj.find((s) => {
        const sCode = (s.code || "").replace(/\s+/g, "").toUpperCase();
        return (cleanSubjCode && sCode === cleanSubjCode) || s.id === matchedTT.subjectId;
      });

      // Fallback: if no exact code match, match by classroom assigned + name, or normalized name
      if (!sb && matchedNameNorm) {
        sb =
          currentSubj.find((s) => {
            const sNameNorm = normSubjName(s.name);
            const isNameMatch = sNameNorm === matchedNameNorm;
            const isRoomAssigned = s.assignedClassroomIds?.includes(targetRoomId);
            return isNameMatch && isRoomAssigned;
          }) ||
          currentSubj.find((s) => {
            const sNameNorm = normSubjName(s.name);
            return sNameNorm === matchedNameNorm;
          });
      }

      if (sb) {
        setSelectedSubjectId(sb.id);
      } else if (matchedTT.subjectId) {
        setSelectedSubjectId(matchedTT.subjectId);
      } else if (cleanSubjCode) {
        setSelectedSubjectId(`subj_${cleanSubjCode}`);
      } else {
        setSelectedSubjectId("");
      }

      // Check active substitute for this room, date, and period
      const activeSub = currentSubs.find(
        (s) =>
          (s.classroomId === targetRoomId ||
            s.classroomId === roomId ||
            s.gradeRoom === targetGradeRoom) &&
          s.date === dateStr &&
          Number(s.periodStart) <= matchedTT.periodStart &&
          Number(s.periodEnd) >= matchedTT.periodStart
      );

      if (activeSub) {
        setSelectedTeacherId(activeSub.substituteTeacherId);
      } else {
        // Match teacher by id or name (resilient to prefix and variant spelling like โตบำรุง / โถบำรุง)
        const normTeacherName = (str: string) =>
          (str || "")
            .replace(/^(นาย|นาง|นางสาว)/, "")
            .replace(/\s+/g, "")
            .replace(/โถบำรุง/g, "โตบำรุง")
            .trim();

        const cleanTTTch = normTeacherName(matchedTT.teacherName);
        const tch = currentTch.find((t) => {
          const tNorm = normTeacherName(t.fullName);
          return (
            t.id === matchedTT.teacherId ||
            t.fullName === matchedTT.teacherName ||
            `${t.prefix}${t.fullName}` === matchedTT.teacherName ||
            (cleanTTTch && tNorm === cleanTTTch) ||
            (cleanTTTch && (tNorm.includes(cleanTTTch) || cleanTTTch.includes(tNorm)))
          );
        });
        if (tch) {
          setSelectedTeacherId(tch.id);
        } else {
          setSelectedTeacherId("");
        }
      }

      const periodLabel = isDouble
        ? `คาบที่ ${matchedTT.periodStart} - ${matchedTT.periodEnd} (วิชาคาบคู่)`
        : `คาบที่ ${periodNum}`;

      const subInfo = activeSub
        ? ` ➡️ ครูผู้สอนแทน: ${activeSub.substituteTeacherName}`
        : "";

      setAutoDetectedNotice(
        `📅 ตารางสอน${thaiDayName} (${periodLabel}): วิชา ${matchedTT.subjectName} (${matchedTT.subjectCode}) - ครูผู้สอน: ${matchedTT.teacherName}${subInfo}`
      );
    } else {
      setIsDoublePeriod(false);
      setPeriodStart(periodNum);
      setPeriodEnd(periodNum);
      setSelectedSubjectId("");
      setSelectedTeacherId("");
      setAutoDetectedNotice(
        `📅 ตารางสอน${thaiDayName}: คาบที่ ${periodNum} เป็นคาบว่าง (ไม่มีข้อมูลในตารางสอน ไม่คาดเดารายวิชาล่วงหน้า)`
      );
    }
  };

  // Auto-detect based on current clock time
  const autoDetectPeriodAndTimetable = (roomId: string) => {
    const now = new Date();
    const curHM = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const matchedPeriod = periods.find(
      (p) => curHM >= p.startTime && curHM <= p.endTime
    );
    const pNum = matchedPeriod ? matchedPeriod.periodNumber : 1;
    setPeriodStart(pNum);
    setPeriodEnd(pNum);
    syncWithTimetable(roomId, checkDate, pNum);
  };

  // Handle clicking a period button (immediately syncs timetable without carrying over previous state)
  const handlePeriodStartChange = (val: number) => {
    setPeriodStart(val);
    setPeriodEnd(val);
    if (selectedRoomId) {
      syncWithTimetable(selectedRoomId, checkDate, val);
    }
  };

  // Handle changing date (immediately syncs timetable for new day of week)
  const handleDateChange = (newDate: string) => {
    setCheckDate(newDate);
    if (selectedRoomId) {
      syncWithTimetable(selectedRoomId, newDate, periodStart);
    }
  };

  // Quick date selector (Today, Yesterday) in Thai timezone
  const setQuickDate = (offsetDays: number) => {
    const dateStr = getThaiOffsetDate(offsetDays);
    handleDateChange(dateStr);
  };

  // Check if this period has already been checked in today's logs for this room
  const isPeriodLogged = (pNum: number) => {
    return roomTodayLogs.some(
      (l) => l.periodStart <= pNum && l.periodEnd >= pNum
    );
  };

  // ==================== CASCADING SUBJECT & TEACHER LOGIC ====================

  // Subjects taught in this classroom (Strictly room-only, excluding non-checkable activities)
  const roomSubjects = useMemo(() => {
    if (!selectedRoomId) return [];
    const room = classrooms.find((c) => c.id === selectedRoomId);
    const normSubjName = (name: string) =>
      (name || "")
        .replace(/\s+/g, "")
        .replace(/วิทยศาสตร์/g, "วิทยาศาสตร์")
        .toLowerCase();

    const list = subjects.filter((s) => {
      // 1. Exclude non-checkable activities (บำเพ็ญประโยชน์, พัฒนาทักษะชีวิต, ลูกเสือ, ชุมนุม)
      if (isExcludedActivity(s.name) || isExcludedActivity(s.code)) return false;

      // 2. Check if assigned to this classroom
      const inAssigned = s.assignedClassroomIds?.includes(selectedRoomId);
      const sCode = (s.code || "").replace(/\s+/g, "").toUpperCase();
      const sNameNorm = normSubjName(s.name);

      const inTimetable = timetables.some((tt) => {
        const isThisRoom =
          tt.classroomId === selectedRoomId ||
          tt.classroomId === room?.gradeRoom ||
          (room && tt.gradeRoom === room.gradeRoom);
        if (!isThisRoom) return false;

        const ttCode = (tt.subjectCode || "").replace(/\s+/g, "").toUpperCase();
        const ttNameNorm = normSubjName(tt.subjectName);

        return (
          tt.subjectId === s.id ||
          (sCode && ttCode === sCode) ||
          (!ttCode && sNameNorm && ttNameNorm === sNameNorm)
        );
      });
      return inAssigned || inTimetable;
    });

    // Safeguard: if selectedSubjectId is set, ensure it is available in options
    if (selectedSubjectId) {
      let cur = subjects.find((s) => s.id === selectedSubjectId);
      if (!cur) {
        // If not found directly in subjects, synthesize from timetables so option exists
        const cleanTargetId = (selectedSubjectId || "").replace(/\s+/g, "").toUpperCase();
        const tt = timetables.find(
          (t) =>
            t.subjectId === selectedSubjectId ||
            (t.subjectCode && (t.subjectCode.replace(/\s+/g, "").toUpperCase() === cleanTargetId || `SUBJ_${t.subjectCode.replace(/\s+/g, "").toUpperCase()}` === cleanTargetId))
        );
        if (tt) {
          cur = {
            id: selectedSubjectId,
            code: tt.subjectCode,
            name: tt.subjectName,
            department: "กลุ่มสาระการเรียนรู้",
            assignedClassroomIds: [selectedRoomId],
          };
        }
      }
      if (cur && !list.some((s) => s.id === cur.id || s.code === cur.code)) {
        list.push(cur);
      }
    }
    return list;
  }, [selectedRoomId, classrooms, timetables, subjects, selectedSubjectId]);

  // Currently selected subject object
  const selectedSubject = useMemo(() => {
    return subjects.find((s) => s.id === selectedSubjectId) || null;
  }, [subjects, selectedSubjectId]);

  // Special rule: Guidance (แนะแนว) and Anti-Corruption (ต้านทุจริต / ป้องกันทุจริต)
  const isGuidanceOrAntiCorruption = useMemo(() => {
    if (!selectedSubject) return false;
    const code = selectedSubject.code.toUpperCase();
    const name = selectedSubject.name;
    return code.startsWith("ก") || name.includes("แนะแนว") || name.includes("ทุจริต");
  }, [selectedSubject]);

  // Filtered teachers based on subject department or guidance/anti-corruption rule or timetable assignment
  const filteredTeachers = useMemo(() => {
    if (!selectedSubject) return teachers;
    if (isGuidanceOrAntiCorruption) return teachers; // All 56 teachers from all departments

    const norm = (d: string) =>
      (d || "").replace(/^(กลุ่มสาระการเรียนรู้|กลุ่มสาระฯ|กลุ่มสาระ)/, "").trim();
    const targetDept = norm(selectedSubject.department);

    // Teachers from the subject's primary department
    const deptTeachers = teachers.filter((t) => norm(t.department) === targetDept);

    // Cross-department teachers assigned to teach this subject in the timetable (e.g. Health/PE teacher teaching Math)
    const crossTeachers = teachers.filter((t) => {
      if (deptTeachers.some((dt) => dt.id === t.id)) return false;
      return timetables.some(
        (tt) =>
          (tt.subjectId === selectedSubject.id || tt.subjectCode === selectedSubject.code) &&
          (tt.teacherId === t.id ||
            t.fullName === tt.teacherName ||
            `${t.prefix}${t.fullName}` === tt.teacherName)
      );
    });

    const res = [...deptTeachers, ...crossTeachers];
    // Safeguard: if selectedTeacherId is set, ensure it is available in options
    if (selectedTeacherId) {
      const curTch = teachers.find((t) => t.id === selectedTeacherId);
      if (curTch && !res.some((t) => t.id === curTch.id)) {
        res.push(curTch);
      }
    }
    return res;
  }, [selectedSubject, isGuidanceOrAntiCorruption, teachers, timetables, selectedTeacherId]);

  // Teachers grouped by department for optgroups when showing all teachers
  const teachersByDepartment = useMemo(() => {
    const map = new Map<string, Teacher[]>();
    filteredTeachers.forEach((t) => {
      const dept = t.department || "ทั่วไป";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(t);
    });
    return map;
  }, [filteredTeachers]);

  // Active substitute assignment for currently selected room, date, and period
  const currentSubstitute = useMemo(() => {
    const currentRoom = classrooms.find((c) => c.id === selectedRoomId);
    return (
      substitutes.find(
        (s) =>
          (s.classroomId === selectedRoomId ||
            (currentRoom && s.gradeRoom === currentRoom.gradeRoom)) &&
          s.date === checkDate &&
          Number(s.periodStart) <= periodStart &&
          Number(s.periodEnd) >= periodStart
      ) || null
    );
  }, [substitutes, selectedRoomId, checkDate, periodStart, classrooms]);

  // Auto-select substitute teacher if one is assigned for this period
  useEffect(() => {
    if (currentSubstitute) {
      setSelectedTeacherId(currentSubstitute.substituteTeacherId);
    }
  }, [currentSubstitute]);

  // Handle subject change with cascading teacher auto-match
  const handleSubjectChange = (newSubjId: string) => {
    setSelectedSubjectId(newSubjId);
    if (!newSubjId) {
      setSelectedTeacherId("");
      return;
    }
    const subj = subjects.find((s) => s.id === newSubjId);
    if (!subj) return;

    const norm = (d: string) =>
      (d || "").replace(/^(กลุ่มสาระการเรียนรู้|กลุ่มสาระฯ|กลุ่มสาระ)/, "").trim();
    const isSpecial =
      subj.code.startsWith("ก") ||
      subj.name.includes("แนะแนว") ||
      subj.name.includes("ทุจริต");

    // Check if current classroom & period timetable has teacher for this subject
    const parsedDate = new Date(checkDate);
    const dayOfWeek = parsedDate.getDay() || 1;
    const matchedTT = timetables.find(
      (tt) =>
        tt.classroomId === selectedRoomId &&
        tt.dayOfWeek === dayOfWeek &&
        (tt.subjectId === newSubjId || tt.subjectCode === subj.code)
    );

    if (matchedTT) {
      const tch = teachers.find(
        (t) => t.id === matchedTT.teacherId || t.fullName === matchedTT.teacherName
      );
      if (tch) {
        setSelectedTeacherId(tch.id);
        return;
      }
    }

    // If currently selected teacher is in filtered list, keep it
    if (filteredTeachers.some((t) => t.id === selectedTeacherId)) {
      return;
    }

    // Auto-select first matching teacher if only 1 teacher, or reset
    if (filteredTeachers.length === 1) {
      setSelectedTeacherId(filteredTeachers[0].id);
    } else {
      setSelectedTeacherId("");
    }
  };

  // Submit Attendance Check
  const handleSubmitAttendance = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTeacherId) {
      alert("กรุณาเลือกชื่อครูผู้สอน");
      return;
    }
    if (!selectedSubjectId) {
      alert("กรุณาเลือกวิชาที่สอน");
      return;
    }
    if (!status) {
      alert("กรุณาเลือกสถานะการเข้าสอน (เข้าสอนตรงเวลา / สาย / ไม่เข้าสอน)");
      return;
    }
    if (status === "absent" && !absenceNote.trim()) {
      alert("กรณีครูไม่เข้าสอน กรุณาพิมพ์ระบุเหตุผลในช่องข้อความ");
      return;
    }
    if (status === "late" && !lateNote.trim()) {
      alert("กรณีครูเข้าสอนสาย กรุณาพิมพ์ระบุสาเหตุในช่องข้อความ");
      return;
    }

    setSubmitting(true);

    try {
      const room = classrooms.find((c) => c.id === selectedRoomId);
      const teacher = teachers.find((t) => t.id === selectedTeacherId);
      const subject = subjects.find((s) => s.id === selectedSubjectId);

      // Multi-tier subject code and name resolution (guarantees subjectCode and subjectName are never empty)
      let resolvedCode = "";
      let resolvedName = "";

      const cleanSubjId = (selectedSubjectId || "").replace(/\s+/g, "").toUpperCase();
      const foundSubj =
        subjects.find(
          (s) =>
            s.id === selectedSubjectId ||
            s.code === selectedSubjectId ||
            (s.code && s.code.replace(/\s+/g, "").toUpperCase() === cleanSubjId) ||
            `SUBJ_${(s.code || "").replace(/\s+/g, "").toUpperCase()}` === cleanSubjId
        ) ||
        roomSubjects.find((s) => s.id === selectedSubjectId);

      if (foundSubj) {
        resolvedCode = foundSubj.code || "";
        resolvedName = foundSubj.name || "";
      } else {
        const tt = timetables.find(
          (t) =>
            t.subjectId === selectedSubjectId ||
            t.subjectCode === selectedSubjectId ||
            (t.subjectCode &&
              (t.subjectCode.replace(/\s+/g, "").toUpperCase() === cleanSubjId ||
                `SUBJ_${t.subjectCode.replace(/\s+/g, "").toUpperCase()}` === cleanSubjId))
        );
        if (tt) {
          resolvedCode = tt.subjectCode || "";
          resolvedName = tt.subjectName || "";
        } else {
          const initSubj = INITIAL_SUBJECTS.find(
            (s) =>
              s.id === selectedSubjectId ||
              s.code === selectedSubjectId ||
              (s.code && s.code.replace(/\s+/g, "").toUpperCase() === cleanSubjId) ||
              `SUBJ_${(s.code || "").replace(/\s+/g, "").toUpperCase()}` === cleanSubjId
          );
          if (initSubj) {
            resolvedCode = initSubj.code || "";
            resolvedName = initSubj.name || "";
          } else if (selectedSubjectId) {
            resolvedCode = selectedSubjectId.replace(/^subj_/, "");
            resolvedName = resolvedCode;
          }
        }
      }

      const periodCount = isDoublePeriod ? periodEnd - periodStart + 1 : 1;
      const parsedDate = new Date(checkDate);
      const dayOfWeek = parsedDate.getDay() || 1;

      const isSub = Boolean(
        currentSubstitute &&
          selectedTeacherId === currentSubstitute.substituteTeacherId
      );

      if (editingRecord) {
        // Updating existing record within 7 days
        const changes = [];
        const statusLabels: Record<string, string> = {
          on_time: "เข้าสอนตรงเวลา",
          late: "เข้าสอนสาย (หลัง 10 นาที)",
          absent: "ไม่เข้าสอน",
        };
        if (editingRecord.status !== status) {
          changes.push({
            field: "สถานะการเข้าสอน",
            oldValue: statusLabels[editingRecord.status] || editingRecord.status,
            newValue: statusLabels[status] || status,
          });
        }
        const newTeacherName = teacher ? `${teacher.prefix}${teacher.fullName}` : editingRecord.teacherName;
        if (editingRecord.teacherName !== newTeacherName) {
          changes.push({
            field: "ครูผู้สอน",
            oldValue: editingRecord.teacherName,
            newValue: newTeacherName,
          });
        }
        if (status === "absent" && editingRecord.absenceNote !== absenceNote.trim()) {
          changes.push({
            field: "เหตุผลการไม่เข้าสอน",
            oldValue: editingRecord.absenceNote || "-",
            newValue: absenceNote.trim(),
          });
        }
        if (status === "late" && editingRecord.lateNote !== lateNote.trim()) {
          changes.push({
            field: "สาเหตุการเข้าสอนสาย",
            oldValue: editingRecord.lateNote || "-",
            newValue: lateNote.trim(),
          });
        }

        const newEditLog = {
          timestamp: new Date().toISOString(),
          editorName: `นักเรียน: ${studentName.trim()} (ห้อง ${room?.gradeRoom || editingRecord.gradeRoom})`,
          changes: changes.length > 0 ? changes : [{ field: "บันทึกข้อมูลซ้ำ", oldValue: "-", newValue: "อัปเดต" }],
        };

        const updatedRecord: AttendanceRecord = {
          ...editingRecord,
          date: checkDate,
          dayOfWeek,
          periodStart,
          periodEnd,
          periodCount,
          classroomId: selectedRoomId,
          gradeRoom: room?.gradeRoom || editingRecord.gradeRoom,
          subjectId: selectedSubjectId,
          subjectCode: resolvedCode || subject?.code || editingRecord.subjectCode || "",
          subjectName: resolvedName || subject?.name || editingRecord.subjectName || "",
          teacherId: selectedTeacherId,
          teacherName: newTeacherName,
          status,
          absenceReason: status === "absent" ? (absenceReason as AbsenceReason) : undefined,
          absenceNote: status === "absent" ? absenceNote.trim() : "",
          lateNote: status === "late" ? lateNote.trim() : "",
          isSubstitute: isSub,
          originalTeacherId: isSub ? currentSubstitute?.originalTeacherId : undefined,
          originalTeacherName: isSub ? currentSubstitute?.originalTeacherName : undefined,
          substituteAssignmentId: isSub ? currentSubstitute?.id : undefined,
          updatedAt: new Date().toISOString(),
          updatedByStudent: studentName.trim(),
          editHistory: [...(editingRecord.editHistory || []), newEditLog],
        };

        await updateAttendanceLog(updatedRecord);
        setEditingRecord(null);
      } else {
        const newRecord: AttendanceRecord = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          termId: activeTerm?.id || "term_default",
          date: checkDate,
          dayOfWeek,
          periodStart,
          periodEnd,
          periodCount,
          classroomId: selectedRoomId,
          gradeRoom: room?.gradeRoom || "ห้องเรียน",
          subjectId: selectedSubjectId,
          subjectCode: resolvedCode || subject?.code || "",
          subjectName: resolvedName || subject?.name || "",
          teacherId: selectedTeacherId,
          teacherName: teacher ? `${teacher.prefix}${teacher.fullName}` : "ไม่ระบุ",
          status,
          absenceReason: status === "absent" ? (absenceReason as AbsenceReason) : undefined,
          absenceNote: status === "absent" ? absenceNote.trim() : "",
          lateNote: status === "late" ? lateNote.trim() : "",
          recordedByStudent: studentName.trim(),
          isSubstitute: isSub,
          originalTeacherId: isSub ? currentSubstitute?.originalTeacherId : undefined,
          originalTeacherName: isSub ? currentSubstitute?.originalTeacherName : undefined,
          substituteAssignmentId: isSub ? currentSubstitute?.id : undefined,
          createdAt: new Date().toISOString(),
        };

        await addAttendanceLog(newRecord);
      }

      setSubmitSuccess(true);
      await loadRoomLogs();

      // Reset form status
      setStatus("");
      setAbsenceReason("");
      setAbsenceNote("");
      setLateNote("");

      setTimeout(() => {
        setSubmitSuccess(false);
      }, 4000);
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const currentRoom = classrooms.find((c) => c.id === selectedRoomId);

  const currentDayOfWeek = useMemo(() => {
    if (!checkDate) return 1;
    const parts = checkDate.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return 1;
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }, [checkDate]);

  const getPeriodSpecialInfo = (pNum: number) => {
    if (!selectedRoomId || !currentRoom) return null;
    const matchedTT = timetables.find(
      (tt) =>
        (tt.classroomId === selectedRoomId || tt.gradeRoom === currentRoom.gradeRoom) &&
        tt.dayOfWeek === currentDayOfWeek &&
        pNum >= tt.periodStart &&
        pNum <= tt.periodEnd
    );
    return getSpecialNonCheckedPeriodInfo(
      selectedRoomId,
      currentRoom.gradeRoom,
      currentDayOfWeek,
      pNum,
      matchedTT
    );
  };

  const currentPeriodSpecialInfo = useMemo(() => {
    return getPeriodSpecialInfo(periodStart);
  }, [selectedRoomId, currentRoom, currentDayOfWeek, periodStart, timetables]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* SUBSTITUTE TEACHER ALERT POPUP MODAL */}
      {showSubstituteModal && roomSubstitutesToday.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner shrink-0">
                <Bell className="w-6 h-6 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">
                  แจ้งเตือนการจัดสอนแทนประจำวัน
                </h3>
                <p className="text-xs text-slate-500">
                  ห้อง {currentRoom?.gradeRoom} &bull; วันที่ {checkDate}
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {roomSubstitutesToday.map((sub, idx) => (
                <div
                  key={sub.id || idx}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-sky-800 bg-sky-100 px-2.5 py-0.5 rounded-full border border-sky-200">
                      คาบที่ {sub.periodStart}
                      {sub.periodEnd !== sub.periodStart && `-${sub.periodEnd}`} ({sub.subjectCode})
                    </span>
                    <span className="text-slate-600">{sub.subjectName}</span>
                  </div>

                  <div className="text-slate-700">
                    ครูประจำวิชา: <strong className="text-rose-700">{sub.originalTeacherName}</strong> (
                    <span className="font-semibold text-rose-600">
                      {sub.leaveType === "sick"
                        ? "ลาป่วย"
                        : sub.leaveType === "personal"
                        ? "ลากิจ"
                        : "ไปราชการ"}
                    </span>
                    )
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      ครูผู้สอนแทน: <strong>{sub.substituteTeacherName}</strong> (
                      {sub.substituteDepartment.replace("กลุ่มสาระการเรียนรู้", "")})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSubstituteModal(false)}
              className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>รับทราบข้อมูลและเข้าสู่การบันทึก</span>
            </button>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-gradient-to-r from-sky-700 via-sky-800 to-indigo-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            เช็คเวลาเข้าสอนของครู
          </h1>
        </div>

        {/* Current Date & Live Clock Cards */}
        <div className="flex items-center gap-3 flex-wrap self-start md:self-auto">
          <div className="bg-white/10 backdrop-blur-md rounded-xl px-3.5 py-2.5 border border-white/20 flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-sky-300 shrink-0" />
            <div>
              <div className="text-[11px] text-sky-200 leading-tight">วันที่ปัจจุบัน</div>
              <div className="text-sm sm:text-base font-bold text-white leading-snug">
                {formatThaiDateLong(todayStr)}
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl px-3.5 py-2.5 border border-white/20 flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-sky-300 animate-pulse shrink-0" />
            <div>
              <div className="text-[11px] text-sky-200 leading-tight">เวลาปัจจุบัน</div>
              <div className="text-sm sm:text-base font-mono font-bold text-white leading-snug">
                {currentTimeStr || "--:--:--"}
              </div>
            </div>
          </div>

          <Link
            href="/guide"
            className="bg-white/15 hover:bg-white/25 active:bg-white/30 text-white rounded-xl px-3.5 py-2.5 border border-white/25 flex items-center gap-1.5 text-xs font-bold transition-all backdrop-blur-md shadow-xs"
            title="เปิดดูคู่มือขั้นตอนการบันทึกเวลาเข้าสอน"
          >
            <BookOpen className="w-4 h-4 text-amber-300" />
            <span>คู่มือวิธีใช้งาน</span>
          </Link>
        </div>
      </div>

      {/* STEP 1: ROOM LOGIN MODAL / CARD */}
      {!isRoomAuthenticated ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm max-w-lg mx-auto">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-sky-100 text-sky-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              เข้าสู่ระบบประจำห้องเรียน
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              สำหรับหัวหน้าห้องหรือตัวแทนห้องบันทึกเวลาเรียน &bull;{" "}
              <Link href="/guide" className="text-sky-600 font-bold hover:underline inline-flex items-center gap-0.5">
                <BookOpen className="w-3 h-3 inline" /> ดูวิธีใช้งาน
              </Link>
            </p>
          </div>

          <form onSubmit={handleRoomLogin} className="space-y-4">
            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{authError}</span>
              </div>
            )}

            {qrScannedRoom && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-emerald-900">
                    ตรวจพบห้องเรียนจากการสแกน QR Code!
                  </div>
                  <div className="text-emerald-700">
                    ระบบเลือกระดับชั้นและห้อง <strong>{qrScannedRoom}</strong> ให้แล้ว กรุณาใส่รหัส PIN และชื่อผู้บันทึก
                  </div>
                </div>
              </div>
            )}

            {/* Split Grade and Room Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  1. เลือกระดับชั้น <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedGrade}
                  onChange={(e) => {
                    setSelectedGrade(e.target.value);
                    setSelectedRoomId("");
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    selectedGrade
                      ? "border-2 border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold shadow-xs"
                      : "border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-sky-500"
                  }`}
                  required
                >
                  <option value="">-- เลือกระดับชั้น --</option>
                  {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((g) => (
                    <option key={g} value={g}>
                      มัธยมศึกษาปีที่ {g.replace("ม.", "")} ({g})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  2. เลือกห้องเรียน <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedRoomId}
                  onChange={(e) => setSelectedRoomId(e.target.value)}
                  disabled={!selectedGrade}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    selectedRoomId
                      ? "border-2 border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold shadow-xs"
                      : "border-slate-300 bg-white text-slate-700 disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-sky-500"
                  }`}
                  required
                >
                  <option value="">
                    {selectedGrade
                      ? `-- เลือกห้อง (${selectedGrade}) --`
                      : "-- กรุณาเลือกระดับชั้นก่อน --"}
                  </option>
                  {classrooms
                    .filter((cls) => cls.grade === selectedGrade)
                    .map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        ห้อง {cls.gradeRoom} (ห้อง {cls.room})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                รหัส PIN ประจำห้อง (4-6 หลัก) <span className="text-rose-500">*</span>
              </label>
              <input
                type="password"
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={Boolean(lockUntil && lockSecondsLeft > 0)}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={lockUntil && lockSecondsLeft > 0 ? "🔒 ระงับชั่วคราว..." : "••••"}
                className={`w-full px-4 py-3 rounded-xl border text-lg tracking-widest text-center font-mono font-bold transition-all ${
                  lockUntil && lockSecondsLeft > 0
                    ? "border-rose-300 bg-rose-50/50 text-rose-400 cursor-not-allowed"
                    : pinInput.length >= 4
                    ? "border-2 border-emerald-600 bg-emerald-50/50 text-emerald-950 shadow-xs"
                    : "border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-sky-500"
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>ชื่อ-นามสกุล <span className="text-rose-500">*</span></span>
                {typeof window !== "undefined" && localStorage.getItem("class_check_saved_student_name") && (
                  <span className="text-[11px] text-emerald-600 font-normal">
                    ✓ จดจำชื่อในเครื่องนี้แล้ว
                  </span>
                )}
              </label>
              <input
                type="text"
                disabled={Boolean(lockUntil && lockSecondsLeft > 0)}
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="เช่น ภัทราวรรณ  สุวรรณวาปี"
                className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all ${
                  studentName.trim().length > 0
                    ? "border-2 border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold shadow-xs"
                    : "border-slate-300 bg-white text-slate-700 focus:ring-2 focus:ring-sky-500"
                }`}
                required
              />
            </div>

            <button
              type="submit"
              disabled={Boolean(lockUntil && lockSecondsLeft > 0)}
              className={`w-full mt-2 py-3 px-4 font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm ${
                lockUntil && lockSecondsLeft > 0
                  ? "bg-slate-400 text-slate-100 cursor-not-allowed shadow-none"
                  : "bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-sky-600/25"
              }`}
            >
              {lockUntil && lockSecondsLeft > 0 ? (
                <span>🔒 ระบบระงับชั่วคราว (รออีก {lockSecondsLeft} วินาที)</span>
              ) : (
                <>
                  <span>เข้าสู่หน้าบันทึกการสอน</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* STEP 2: CHECK-IN FORM */
        <div className="space-y-6">
          {/* Active Room Session Bar */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm shadow-inner">
                {currentRoom?.gradeRoom}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-base">
                    ห้องเรียน {currentRoom?.gradeRoom}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    เข้าสู่ระบบแล้ว
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  ผู้บันทึก: <strong className="text-slate-700">{studentName}</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors border border-rose-200 shadow-sm"
                title="ออกจากระบบห้องเรียนนี้"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>

          {/* Auto Detect Notice Alert */}
          {autoDetectedNotice && (
            <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs sm:text-sm flex items-start gap-2.5">
              <Info className="w-5 h-5 shrink-0 text-sky-600 mt-0.5" />
              <div className="flex-1">
                <span>{autoDetectedNotice}</span>
                <span className="block text-[11px] text-sky-600 mt-0.5">
                  (หากมีการสลับวิชาหรือมีครูสอนแทน สามารถเปลี่ยนตัวเลือกด้านล่างได้เองเลย)
                </span>
              </div>
            </div>
          )}

          {/* Submit Success Alert */}
          {submitSuccess && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center gap-3 animate-in fade-in duration-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold text-sm">บันทึกข้อมูลเรียบร้อยแล้ว!</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  ข้อมูลถูกบันทึกและซิงค์ออนไลน์ไปยังฐานข้อมูลกลางทันที
                </p>
              </div>
            </div>
          )}

          {/* Edit Mode Alert Banner */}
          {editingRecord && (
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex flex-wrap items-center justify-between gap-3 shadow-md animate-in fade-in duration-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 shadow-inner">
                  <Edit3 className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="font-bold text-sm sm:text-base text-amber-950 flex items-center gap-2">
                    <span>โหมดแก้ไขข้อมูลการเข้าสอน</span>
                    <span className="text-[11px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full font-semibold">
                      แก้ไขได้ภายใน 7 วัน
                    </span>
                  </div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    กำลังแก้ไขวิชา <strong>{editingRecord.subjectCode} {editingRecord.subjectName}</strong> &bull; วันที่ {editingRecord.date} &bull; คาบ {editingRecord.periodStart === editingRecord.periodEnd ? editingRecord.periodStart : `${editingRecord.periodStart}-${editingRecord.periodEnd}`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 active:scale-95 border border-slate-300 shadow-sm transition-all flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>ยกเลิกการแก้ไข</span>
              </button>
            </div>
          )}

          {/* The Check-in Form */}
          <form
            id="checkin-form"
            onSubmit={handleSubmitAttendance}
            className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-6"
          >
            {/* Section 1: Date & Period Selection */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center">
                    1
                  </span>
                  <h3 className="font-bold text-slate-800 text-base">
                    เลือกวันที่และคาบเรียน
                  </h3>
                </div>

                {/* Quick Date Switcher and Date Picker */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickDate(0)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-colors border ${
                      checkDate === todayStr
                        ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    วันนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickDate(1)}
                    className="px-2.5 py-1 text-xs rounded-lg font-semibold bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
                  >
                    เมื่อวาน
                  </button>
                  <div className="relative">
                    <input
                      type="date"
                      value={checkDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium text-slate-700 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Date Status Banner (Today vs Backdated) */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="font-bold text-slate-800">
                    {formatThaiDateLong(checkDate)}
                  </span>
                  {checkDate < todayStr && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      🕒 บันทึกย้อนหลัง
                    </span>
                  )}
                  {checkDate > todayStr && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                      ℹ️ บันทึกล่วงหน้า
                    </span>
                  )}
                  {checkDate === todayStr && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ✓ วันนี้
                    </span>
                  )}
                </div>

                {checkDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setQuickDate(0)}
                    className="text-[11px] text-sky-700 hover:text-sky-800 font-semibold underline"
                  >
                    กลับสู่วันนี้
                  </button>
                )}
              </div>

              {/* Period Buttons / Selectors with Morning & Afternoon separation */}
              <div className="space-y-3">
                {isDoublePeriod && (
                  <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-300 text-xs text-sky-900 flex items-center gap-2 shadow-xs">
                    <span className="font-bold bg-sky-700 text-white px-2 py-0.5 rounded-md text-[11px] shrink-0">
                      ⚡ วิชาคาบคู่
                    </span>
                    <span className="font-medium">
                      ตารางสอนระบุเป็นวิชาคาบคู่ (คาบที่ {periodStart} - {periodEnd}) ระบบเลือกและบันทึกข้อมูลพร้อมกันให้อัตโนมัติ
                    </span>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center justify-between">
                    <span>ภาคเช้า (คาบ 1 - 4)</span>
                    <span className="text-slate-400">08:40 - 12:00 น.</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {periods.filter((p) => p.periodNumber <= 4).map((p) => {
                      const special = getPeriodSpecialInfo(p.periodNumber);
                      if (special) {
                        return (
                          <div
                            key={p.periodNumber}
                            className="p-2.5 rounded-xl border border-slate-200 bg-slate-100/80 text-slate-400 text-center cursor-not-allowed select-none shadow-2xs"
                            title={special.description}
                          >
                            <div className="text-xs font-bold text-slate-500 flex items-center justify-center gap-1">
                              <span>คาบที่ {p.periodNumber}</span>
                              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                                [{special.label}]
                              </span>
                            </div>
                            <div className="text-[10px] mt-0.5 text-slate-400 font-mono">
                              {p.startTime} - {p.endTime}
                            </div>
                            <div className="mt-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-200 text-slate-500">
                                ไม่ต้องเช็ค
                              </span>
                            </div>
                          </div>
                        );
                      }
                      const isSelected = isDoublePeriod
                        ? p.periodNumber >= periodStart && p.periodNumber <= periodEnd
                        : p.periodNumber === periodStart;
                      const isLogged = isPeriodLogged(p.periodNumber);
                      return (
                        <button
                          type="button"
                          key={p.periodNumber}
                          onClick={() => handlePeriodStartChange(p.periodNumber)}
                          className={`p-2.5 rounded-xl border text-center transition-all relative ${
                            isSelected
                              ? "bg-sky-800 text-white border-2 border-sky-950 shadow-md ring-4 ring-sky-300 scale-[1.02]"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          <div className="text-xs font-bold">คาบที่ {p.periodNumber}</div>
                          <div className={`text-[10px] mt-0.5 ${isSelected ? "text-sky-100" : "text-slate-500 font-mono"}`}>
                            {p.startTime} - {p.endTime}
                          </div>
                          {isLogged && (
                            <div className="mt-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                isSelected
                                  ? "bg-white text-sky-900"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}>
                                ✓ บันทึกแล้ว
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Formal Red Lunch break card - Unselectable time slot */}
                <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3.5 sm:p-4 flex items-center justify-between text-rose-900 my-3 shadow-xs select-none">
                  <div className="font-bold text-sm sm:text-base text-rose-950 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                    <span>พักรับประทานอาหารกลางวัน</span>
                  </div>
                  <div className="font-mono font-bold text-sm sm:text-base text-rose-900 bg-white/80 border border-rose-200 px-3 py-1 rounded-lg">
                    12:00 - 13:00 น.
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center justify-between">
                    <span>ภาคบ่าย (คาบ 5 - 7)</span>
                    <span className="text-slate-400">13:00 - 15:30 น.</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {periods.filter((p) => p.periodNumber >= 5).map((p) => {
                      const special = getPeriodSpecialInfo(p.periodNumber);
                      if (special) {
                        return (
                          <div
                            key={p.periodNumber}
                            className="p-2.5 rounded-xl border border-slate-200 bg-slate-100/80 text-slate-400 text-center cursor-not-allowed select-none shadow-2xs"
                            title={special.description}
                          >
                            <div className="text-xs font-bold text-slate-500 flex items-center justify-center gap-1">
                              <span>คาบที่ {p.periodNumber}</span>
                              <span className="text-[10px] px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                                [{special.label}]
                              </span>
                            </div>
                            <div className="text-[10px] mt-0.5 text-slate-400 font-mono">
                              {p.startTime} - {p.endTime}
                            </div>
                            <div className="mt-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-200 text-slate-500">
                                ไม่ต้องเช็ค
                              </span>
                            </div>
                          </div>
                        );
                      }
                      const isSelected = isDoublePeriod
                        ? p.periodNumber >= periodStart && p.periodNumber <= periodEnd
                        : p.periodNumber === periodStart;
                      const isLogged = isPeriodLogged(p.periodNumber);
                      return (
                        <button
                          type="button"
                          key={p.periodNumber}
                          onClick={() => handlePeriodStartChange(p.periodNumber)}
                          className={`p-2.5 rounded-xl border text-center transition-all relative ${
                            isSelected
                              ? "bg-sky-800 text-white border-2 border-sky-950 shadow-md ring-4 ring-sky-300 scale-[1.02]"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          <div className="text-xs font-bold">คาบที่ {p.periodNumber}</div>
                          <div className={`text-[10px] mt-0.5 ${isSelected ? "text-sky-100" : "text-slate-500 font-mono"}`}>
                            {p.startTime} - {p.endTime}
                          </div>
                          {isLogged && (
                            <div className="mt-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                isSelected
                                  ? "bg-white text-sky-900"
                                  : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              }`}>
                                ✓ บันทึกแล้ว
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Notice if the selected period has already been checked */}
              {isPeriodLogged(periodStart) && (
                <div className="mt-3.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>แจ้งเตือน:</strong> คาบที่ {periodStart} ในวันที่เลือกนี้ ได้ถูกบันทึกข้อมูลไว้แล้วในระบบ หากท่านกดบันทึก ข้อมูลใหม่จะถูกบันทึกทับ/อัปเดตรายการเดิม
                  </span>
                </div>
              )}

              {/* Special Activity / Free Period Notice (No Check Required) */}
              {currentPeriodSpecialInfo && (
                <div className="mt-3.5 p-3.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 text-xs flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    <strong>คาบที่ {periodStart} เป็น [{currentPeriodSpecialInfo.label}]:</strong> {currentPeriodSpecialInfo.description} &bull; โรงเรียนกำหนดให้นักเรียนไม่ต้องบันทึกเข้าสอนในคาบนี้
                  </span>
                </div>
              )}
            </div>

            {/* Section 2: Subject & Teacher Selection (Cascading by Department) */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center">
                    2
                  </span>
                  <h3 className="font-bold text-slate-800 text-base">
                    วิชาและครูผู้สอน
                  </h3>
                </div>

                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  ห้อง {currentRoom?.gradeRoom} ({roomSubjects.length} วิชา)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Subject Selector (Room only) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    1. เลือกวิชาที่สอน <span className="text-rose-500">*</span>
                  </label>

                  <select
                    value={selectedSubjectId}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                      selectedSubjectId
                        ? "border-2 border-emerald-600 bg-emerald-50/60 text-emerald-950 font-bold shadow-xs"
                        : "border-slate-300 bg-white font-medium focus:ring-2 focus:ring-sky-500"
                    }`}
                    required
                  >
                    <option value="">-- เลือกรหัสและชื่อรายวิชา ({roomSubjects.length} วิชา) --</option>
                    {roomSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Teacher Selector (Cascading from Subject) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      2. เลือกชื่อครูผู้สอน <span className="text-rose-500">*</span>
                    </label>

                    {selectedSubject && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                          isGuidanceOrAntiCorruption
                            ? "bg-purple-50 text-purple-800 border-purple-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {isGuidanceOrAntiCorruption
                          ? `ครูทั้งโรงเรียน (${filteredTeachers.length} ท่าน)`
                          : `ครูในกลุ่มสาระ (${filteredTeachers.length} ท่าน)`}
                      </span>
                    )}
                  </div>

                  {currentSubstitute && (
                    <div className="p-3 mb-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <span>📢 คาบนี้ <strong>{currentSubstitute.originalTeacherName}</strong> (</span>
                        <span className="font-bold text-rose-700">
                          {currentSubstitute.leaveType === "sick"
                            ? "ลาป่วย"
                            : currentSubstitute.leaveType === "personal"
                            ? "ลากิจ"
                            : "ไปราชการ"}
                        </span>
                        <span>) ➡️ ปฏิบัติหน้าที่สอนแทนโดย <strong>{currentSubstitute.substituteTeacherName}</strong></span>
                      </div>
                    </div>
                  )}

                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    disabled={!selectedSubjectId}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-all ${
                      selectedTeacherId
                        ? "border-2 border-emerald-600 bg-emerald-50/60 text-emerald-950 font-bold shadow-xs"
                        : "border-slate-300 bg-white font-medium disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-sky-500"
                    }`}
                    required
                  >
                    <option value="">
                      {!selectedSubjectId
                        ? "-- กรุณาเลือกวิชาที่สอนก่อน --"
                        : `-- เลือกชื่อครูผู้สอน (${filteredTeachers.length} ท่าน) --`}
                    </option>

                    {/* Prepend substitute teacher if assigned */}
                    {currentSubstitute && (
                      <option
                        value={currentSubstitute.substituteTeacherId}
                        className="font-bold text-emerald-800 bg-emerald-50"
                      >
                        ⭐ {currentSubstitute.substituteTeacherName} (ครูผู้สอนแทน)
                      </option>
                    )}

                    {isGuidanceOrAntiCorruption
                      ? Array.from(teachersByDepartment.entries()).map(([dept, tList]) => (
                          <optgroup key={dept} label={dept.replace("กลุ่มสาระการเรียนรู้", "สาระฯ ")}>
                            {tList.map((t) => {
                              const isAbsent = currentSubstitute?.originalTeacherId === t.id;
                              const isSub = currentSubstitute?.substituteTeacherId === t.id;
                              if (isSub) return null;

                              return (
                                <option
                                  key={t.id}
                                  value={t.id}
                                  disabled={isAbsent}
                                  className={isAbsent ? "text-slate-400 bg-slate-100 italic" : ""}
                                >
                                  {isAbsent
                                    ? `🚫 ${t.prefix}${t.fullName} (${
                                        currentSubstitute.leaveType === "sick"
                                          ? "ลาป่วย"
                                          : currentSubstitute.leaveType === "personal"
                                          ? "ลากิจ"
                                          : "ไปราชการ"
                                      } - มีครูสอนแทน)`
                                    : `${t.prefix}${t.fullName}`}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))
                      : filteredTeachers.map((t) => {
                          const isAbsent = currentSubstitute?.originalTeacherId === t.id;
                          const isSub = currentSubstitute?.substituteTeacherId === t.id;
                          if (isSub) return null;

                          return (
                            <option
                              key={t.id}
                              value={t.id}
                              disabled={isAbsent}
                              className={isAbsent ? "text-slate-400 bg-slate-100 italic" : ""}
                            >
                              {isAbsent
                                ? `🚫 ${t.prefix}${t.fullName} (${
                                    currentSubstitute.leaveType === "sick"
                                      ? "ลาป่วย"
                                      : currentSubstitute.leaveType === "personal"
                                      ? "ลากิจ"
                                      : "ไปราชการ"
                                  } - มีครูสอนแทน)`
                                : `${t.prefix}${t.fullName}`}
                            </option>
                          );
                        })}
                  </select>
                </div>
              </div>
            </div>

            {/* Section 3: Attendance Status Recording */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center">
                  3
                </span>
                <h3 className="font-bold text-slate-800 text-base">
                  บันทึกสถานะการเข้าสอน <span className="text-rose-500">*</span>
                </h3>
              </div>

              {/* Status Radio Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. On-time */}
                <label
                  className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    status === "on_time"
                      ? "border-emerald-600 bg-emerald-100 text-emerald-950 shadow-md ring-4 ring-emerald-300/60 scale-[1.02]"
                      : status !== ""
                      ? "border-dashed border-slate-200 bg-slate-50/70 text-slate-400 opacity-40 hover:opacity-75"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="attendance_status"
                    value="on_time"
                    checked={status === "on_time"}
                    onChange={() => {
                      setStatus("on_time");
                      setAbsenceReason("");
                      setAbsenceNote("");
                      setLateNote("");
                    }}
                    className="sr-only"
                  />
                  <span className="font-bold text-base">
                    เข้าสอนตรงเวลา
                  </span>
                  <CheckCircle2
                    className={`w-6 h-6 shrink-0 ${
                      status === "on_time" ? "text-emerald-700" : "text-slate-300"
                    }`}
                  />
                </label>

                {/* 2. Late */}
                <label
                  className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    status === "late"
                      ? "border-amber-600 bg-amber-100 text-amber-950 shadow-md ring-4 ring-amber-300/60 scale-[1.02]"
                      : status !== ""
                      ? "border-dashed border-slate-200 bg-slate-50/70 text-slate-400 opacity-40 hover:opacity-75"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="attendance_status"
                    value="late"
                    checked={status === "late"}
                    onChange={() => {
                      setStatus("late");
                      setAbsenceReason("");
                      setAbsenceNote("");
                    }}
                    className="sr-only"
                  />
                  <span className="font-bold text-base">
                    เข้าสอนหลัง 10 นาที
                  </span>
                  <AlertTriangle
                    className={`w-6 h-6 shrink-0 ${
                      status === "late" ? "text-amber-700" : "text-slate-300"
                    }`}
                  />
                </label>

                {/* 3. Absent */}
                <label
                  className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    status === "absent"
                      ? "border-rose-600 bg-rose-100 text-rose-950 shadow-md ring-4 ring-rose-300/60 scale-[1.02]"
                      : status !== ""
                      ? "border-dashed border-slate-200 bg-slate-50/70 text-slate-400 opacity-40 hover:opacity-75"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="attendance_status"
                    value="absent"
                    checked={status === "absent"}
                    onChange={() => {
                      setStatus("absent");
                      setLateNote("");
                    }}
                    className="sr-only"
                  />
                  <span className="font-bold text-base">
                    ไม่เข้าสอน
                  </span>
                  <XCircle
                    className={`w-6 h-6 shrink-0 ${
                      status === "absent" ? "text-rose-700" : "text-slate-300"
                    }`}
                  />
                </label>
              </div>

              {/* Sub-form: Mandatory Typed Late Reason */}
              {status === "late" && (
                <div className="mt-4 p-4 rounded-xl bg-amber-50/70 border-2 border-amber-300 space-y-2 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center justify-between">
                    <span>ระบุสาเหตุที่ครูเข้าสอนสาย (&gt;10 นาที) <span className="text-amber-700">* (จำเป็นต้องระบุ)</span></span>
                  </label>
                  <input
                    type="text"
                    value={lateNote}
                    onChange={(e) => setLateNote(e.target.value)}
                    placeholder="พิมพ์ระบุสาเหตุ เช่น ติดภารกิจช่วงต้นคาบ, ประชุมสั้น, ติดเคลียร์งานคาบก่อนหน้า..."
                    className={`w-full px-4 py-3 rounded-xl border text-sm text-slate-800 transition-all ${
                      lateNote.trim()
                        ? "border-2 border-amber-600 bg-white font-semibold shadow-xs"
                        : "border-amber-300 bg-white focus:ring-2 focus:ring-amber-500"
                    }`}
                    required
                  />
                  <p className="text-[11px] text-amber-800">
                    * กรุณาพิมพ์ระบุสาเหตุหรือภารกิจที่ทำให้ครูเข้าสอนสายในคาบนี้ให้ชัดเจน
                  </p>
                </div>
              )}

              {/* Sub-form: Mandatory Typed Absence Reason */}
              {status === "absent" && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50/70 border-2 border-rose-300 space-y-2 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-rose-950 uppercase tracking-wider flex items-center justify-between">
                    <span>ระบุเหตุผลที่ครูไม่เข้าสอน <span className="text-rose-600">* (จำเป็นต้องระบุ)</span></span>
                  </label>
                  <input
                    type="text"
                    value={absenceNote}
                    onChange={(e) => setAbsenceNote(e.target.value)}
                    placeholder="พิมพ์ระบุเหตุผล เช่น ไปราชการ, ติดภารกิจ, ซื้อของให้โรงเรียน..."
                    className={`w-full px-4 py-3 rounded-xl border text-sm text-slate-800 transition-all ${
                      absenceNote.trim()
                        ? "border-2 border-rose-600 bg-white font-semibold shadow-xs"
                        : "border-rose-300 bg-white focus:ring-2 focus:ring-rose-500"
                    }`}
                    required
                  />
                  <p className="text-[11px] text-rose-700">
                    * กรุณาพิมพ์ระบุเหตุผลหรือภารกิจที่ครูไม่สามารถเข้าสอนในคาบนี้ให้ชัดเจน
                  </p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="border-t border-slate-100 pt-6 flex flex-wrap items-center justify-between gap-3">
              {editingRecord && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 active:scale-95 font-semibold text-sm flex items-center gap-2 transition-all shadow-xs"
                >
                  <RotateCcw className="w-4 h-4 text-slate-500" />
                  <span>ยกเลิกโหมดแก้ไข</span>
                </button>
              )}
              {currentPeriodSpecialInfo ? (
                <button
                  type="button"
                  disabled
                  className="w-full sm:w-auto px-6 py-3 bg-slate-200 text-slate-500 font-bold rounded-xl cursor-not-allowed text-xs sm:text-sm ml-auto flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>คาบนี้เป็น [{currentPeriodSpecialInfo.label}] &bull; โรงเรียนกำหนดไม่ต้องเช็คเข้าสอน</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full sm:w-auto px-8 py-3 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 active:scale-95 ${
                    editingRecord
                      ? "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 shadow-amber-600/30 ml-auto"
                      : "bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 shadow-sky-600/25 ml-auto"
                  }`}
                >
                  {editingRecord ? <Edit3 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  <span>
                    {submitting
                      ? "กำลังบันทึก..."
                      : editingRecord
                      ? "บันทึกการแก้ไขข้อมูล"
                      : "ยืนยันบันทึกการเข้าสอน"}
                  </span>
                </button>
              )}
            </div>
          </form>

          {/* Section 4: Room Log History & 7-Day Edit */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 border-b border-slate-100 pb-3 gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-600" />
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  ประวัติการบันทึกของห้อง {currentRoom?.gradeRoom}
                </h3>
              </div>

              {/* History Switcher Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setHistoryTab("day")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    historyTab === "day"
                      ? "bg-white text-sky-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  วันที่เลือก ({roomTodayLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab("week")}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    historyTab === "week"
                      ? "bg-white text-amber-800 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ย้อนหลัง 7 วันที่แก้ไขได้ ({room7DaysLogs.length})
                </button>
              </div>
            </div>

            {/* Logs List */}
            {(() => {
              const displayLogs = historyTab === "day" ? roomTodayLogs : room7DaysLogs;
              if (displayLogs.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 text-sm">
                    {historyTab === "day"
                      ? `ยังไม่มีการบันทึกข้อมูลของห้องนี้ในวันที่ ${checkDate}`
                      : "ยังไม่มีประวัติการบันทึกข้อมูลย้อนหลัง 7 วันของห้องนี้"}
                  </div>
                );
              }

              return (
                <div className="divide-y divide-slate-100">
                  {displayLogs.map((log) => {
                    const canEdit = isWithin7DaysThai(log.date);
                    const isCurrentlyEditing = editingRecord?.id === log.id;
                    return (
                      <div
                        key={log.id}
                        className={`py-3.5 px-3 rounded-xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm ${
                          isCurrentlyEditing
                            ? "bg-amber-50 border border-amber-200"
                            : "hover:bg-slate-50/80"
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-bold text-xs shrink-0 mt-0.5 sm:mt-0">
                            {log.periodStart === log.periodEnd
                              ? `คาบ ${log.periodStart}`
                              : `คาบ ${log.periodStart}-${log.periodEnd}`}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800 flex flex-wrap items-center gap-1.5">
                              <span>
                                {log.subjectCode} {log.subjectName}
                              </span>
                              {historyTab === "week" && (
                                <span className="text-[11px] font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                  {formatThaiDateLong(log.date)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              ครูผู้สอน: <strong>{log.teacherName}</strong> &bull; บันทึกโดย: {log.recordedByStudent}
                              {log.updatedAt && (
                                <span className="text-amber-700 ml-1.5 font-medium">
                                  (แก้ไขเมื่อ: {new Date(log.updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                          {log.status === "on_time" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              ตรงเวลา
                            </span>
                          )}
                          {log.status === "late" && (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"
                              title={log.lateNote ? `สาเหตุ: ${log.lateNote}` : undefined}
                            >
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              สาย {log.lateNote ? `(${log.lateNote})` : ">10 นาที"}
                            </span>
                          )}
                          {log.status === "absent" && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              ไม่เข้าสอน ({log.absenceReason === "meeting" ? "ประชุม" : log.absenceReason === "activity" ? "กิจกรรมสำคัญ" : log.absenceReason === "official" ? "ไปราชการ" : log.absenceReason === "personal" ? "ลากิจ" : log.absenceReason === "sick" ? "ลาป่วย" : log.absenceNote || "เหตุผลอื่นๆ"})
                            </span>
                          )}

                          {/* 7-Day Actions (Edit & Delete) */}
                          {canEdit ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(log)}
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                  isCurrentlyEditing
                                    ? "bg-amber-600 text-white shadow-xs"
                                    : "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 active:scale-95"
                                }`}
                                title="แก้ไขข้อมูลการบันทึก (ภายใน 7 วัน)"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>{isCurrentlyEditing ? "กำลังแก้ไข" : "แก้ไข"}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(log)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 active:scale-95 transition-all shadow-xs"
                                title="ลบข้อมูลการบันทึกนี้ (ภายใน 7 วัน)"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>ลบ</span>
                              </button>
                            </div>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-slate-100 text-slate-400 border border-slate-200"
                              title="บันทึกเกิน 7 วันแล้ว ไม่สามารถแก้ไขหรือลบได้"
                            >
                              <Lock className="w-3 h-3" />
                              <span>เกิน 7 วัน</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
