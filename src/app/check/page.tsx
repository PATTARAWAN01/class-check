"use client";

import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import {
  getClassrooms,
  getActiveTerm,
  getPeriodSettings,
  getTimetable,
  getTeachers,
  getSubjects,
  addAttendanceLog,
  getAttendanceLogs,
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

// Excluded non-academic activities that should NOT be checked:
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
];

function isExcludedActivity(nameOrCode?: string): boolean {
  if (!nameOrCode) return false;
  return EXCLUDED_ACTIVITY_KEYWORDS.some((kw) => nameOrCode.includes(kw));
}

function formatThaiDateLong(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  const thaiDays = [
    "วันอาทิตย์",
    "วันจันทร์",
    "วันอังคาร",
    "วันพุธ",
    "วันพฤหัสบดี",
    "วันศุกร์",
    "วันเสาร์",
  ];
  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  const dayName = thaiDays[date.getDay()] || "";
  const monthName = thaiMonths[m - 1] || "";
  const thaiYear = y + 543;
  return `${dayName}ที่ ${d} ${monthName} ${thaiYear}`;
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

  // Check-in Form state
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [checkDate, setCheckDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [isDoublePeriod, setIsDoublePeriod] = useState(false);
  const [periodStart, setPeriodStart] = useState<number>(1);
  const [periodEnd, setPeriodEnd] = useState<number>(1);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "">("");
  const [absenceReason, setAbsenceReason] = useState<AbsenceReason | "">("");
  const [absenceNote, setAbsenceNote] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [autoDetectedNotice, setAutoDetectedNotice] = useState<string | null>(null);
  const [roomTodayLogs, setRoomTodayLogs] = useState<AttendanceRecord[]>([]);

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
        setTimetables(ttList);
      }

      // Check cached session
      const savedRoomId = sessionStorage.getItem("class_check_room_id");
      const savedStudent = sessionStorage.getItem("class_check_student");
      if (savedRoomId && savedStudent) {
        setSelectedRoomId(savedRoomId);
        setStudentName(savedStudent);
        setIsRoomAuthenticated(true);
        const r = clsList.find((c) => c.id === savedRoomId);
        if (r) setSelectedGrade(r.grade);

        // Check if there are substitute assignments for this room today
        const todayStr = new Date().toISOString().split("T")[0];
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

  // Refresh logs for this room
  useEffect(() => {
    if (isRoomAuthenticated && selectedRoomId) {
      loadRoomLogs();
    }
  }, [isRoomAuthenticated, selectedRoomId, checkDate]);

  async function loadRoomLogs() {
    if (!activeTerm) return;
    const allLogs = await getAttendanceLogs(activeTerm.id);
    const roomLogs = allLogs.filter(
      (l) => l.classroomId === selectedRoomId && l.date === checkDate
    );
    setRoomTodayLogs(roomLogs);
  }

  // Handle Room Login
  const handleRoomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

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
      setAuthError("รหัส PIN ของห้องเรียนไม่ถูกต้อง กรุณาตรวจสอบกับครูประจำชั้นหรือหัวหน้าห้อง");
      return;
    }

    // Success login
    setIsRoomAuthenticated(true);
    sessionStorage.setItem("class_check_room_id", selectedRoomId);
    sessionStorage.setItem("class_check_student", studentName.trim());

    // Check if there are substitute assignments for this room today
    const todayStr = new Date().toISOString().split("T")[0];
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
    setSelectedGrade("");
    setSelectedRoomId("");
    setPinInput("");
    setAutoDetectedNotice(null);
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

    // Look up timetable for this room, dayOfWeek, and periodNum
    const matchedTT = currentTT.find(
      (tt) =>
        tt.classroomId === roomId &&
        tt.dayOfWeek === dayOfWeek &&
        periodNum >= tt.periodStart &&
        periodNum <= tt.periodEnd
    );

    if (matchedTT) {
      // Check if excluded non-academic activity
      if (
        isExcludedActivity(matchedTT.subjectName) ||
        isExcludedActivity(matchedTT.subjectCode)
      ) {
        setSelectedSubjectId("");
        setSelectedTeacherId("");
        setAutoDetectedNotice(
          `📅 ตารางสอน${thaiDayName} คาบที่ ${periodNum}: ${matchedTT.subjectName} (${matchedTT.subjectCode}) ซึ่งเป็นกิจกรรมพัฒนาผู้เรียนที่ไม่ต้องเช็คเวลาเข้าสอน`
        );
        return;
      }

      const isDouble = matchedTT.periodEnd > matchedTT.periodStart;
      setIsDoublePeriod(isDouble);
      setPeriodStart(matchedTT.periodStart);
      setPeriodEnd(matchedTT.periodEnd);

      // Match subject (matches by code OR id)
      const sb = currentSubj.find(
        (s) => s.code === matchedTT.subjectCode || s.id === matchedTT.subjectId
      );
      if (sb) {
        setSelectedSubjectId(sb.id);
      } else {
        setSelectedSubjectId("");
      }

      // Check active substitute for this room, date, and period
      const activeSub = currentSubs.find(
        (s) =>
          s.classroomId === roomId &&
          s.date === dateStr &&
          s.periodStart === matchedTT.periodStart
      );

      if (activeSub) {
        setSelectedTeacherId(activeSub.substituteTeacherId);
      } else {
        // Match teacher by id or name
        const tch = currentTch.find(
          (t) =>
            t.id === matchedTT.teacherId ||
            t.fullName === matchedTT.teacherName ||
            `${t.prefix}${t.fullName}` === matchedTT.teacherName
        );
        if (tch) {
          setSelectedTeacherId(tch.id);
        } else {
          setSelectedTeacherId("");
        }
      }

      const periodLabel = isDouble
        ? `คาบคู่ ${matchedTT.periodStart}-${matchedTT.periodEnd}`
        : `คาบที่ ${matchedTT.periodStart}`;

      const subInfo = activeSub
        ? ` ➡️ ครูผู้สอนแทน: ${activeSub.substituteTeacherName}`
        : "";

      setAutoDetectedNotice(
        `📅 ตารางสอน${thaiDayName} (${periodLabel}): วิชา ${matchedTT.subjectName} (${matchedTT.subjectCode}) - ครูผู้สอน: ${matchedTT.teacherName}${subInfo}`
      );
    } else {
      setAutoDetectedNotice(
        `📅 ตารางสอน${thaiDayName}: คาบที่ ${periodNum} ไม่พบวิชาในตารางสอน สามารถเลือกวิชาและครูผู้สอนเองได้`
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

  // Adjust period end when double period changes
  const handleDoublePeriodToggle = (checked: boolean) => {
    setIsDoublePeriod(checked);
    if (checked) {
      setPeriodEnd(Math.min(periodStart + 1, periods.length || 7));
    } else {
      setPeriodEnd(periodStart);
    }
  };

  // Handle clicking a period button (immediately syncs timetable)
  const handlePeriodStartChange = (val: number) => {
    setPeriodStart(val);
    if (isDoublePeriod) {
      setPeriodEnd(Math.min(val + 1, periods.length || 7));
    } else {
      setPeriodEnd(val);
    }
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

  // Quick date selector (Today, Yesterday)
  const setQuickDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    const dateStr = d.toISOString().split("T")[0];
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
    return subjects.filter((s) => {
      // 1. Exclude non-checkable activities (บำเพ็ญประโยชน์, พัฒนาทักษะชีวิต, ลูกเสือ, ชุมนุม)
      if (isExcludedActivity(s.name) || isExcludedActivity(s.code)) return false;

      // 2. Check if assigned to this classroom
      const inAssigned = s.assignedClassroomIds?.includes(selectedRoomId);
      const inTimetable = timetables.some(
        (tt) =>
          tt.classroomId === selectedRoomId &&
          (tt.subjectId === s.id || tt.subjectCode === s.code)
      );
      return inAssigned || inTimetable;
    });
  }, [selectedRoomId, timetables, subjects]);

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

    return [...deptTeachers, ...crossTeachers];
  }, [selectedSubject, isGuidanceOrAntiCorruption, teachers, timetables]);

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
    return (
      substitutes.find(
        (s) =>
          s.classroomId === selectedRoomId &&
          s.date === checkDate &&
          s.periodStart === periodStart
      ) || null
    );
  }, [substitutes, selectedRoomId, checkDate, periodStart]);

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
    if (status === "absent" && !absenceReason) {
      alert("กรณีไม่เข้าสอน กรุณาระบุสาเหตุ (ประชุม / ร่วมกิจกรรมสำคัญ / เหตุผลอื่นๆ)");
      return;
    }
    if (status === "absent" && absenceReason === "other" && !absenceNote.trim()) {
      alert("กรุณาพิมพ์ตอบระบุสาเหตุในช่องข้อความ");
      return;
    }

    setSubmitting(true);

    try {
      const room = classrooms.find((c) => c.id === selectedRoomId);
      const teacher = teachers.find((t) => t.id === selectedTeacherId);
      const subject = subjects.find((s) => s.id === selectedSubjectId);

      const periodCount = isDoublePeriod ? periodEnd - periodStart + 1 : 1;
      const parsedDate = new Date(checkDate);
      const dayOfWeek = parsedDate.getDay() || 1;

      const isSub = Boolean(
        currentSubstitute &&
          selectedTeacherId === currentSubstitute.substituteTeacherId
      );

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
        subjectCode: subject?.code || "",
        subjectName: subject?.name || "",
        teacherId: selectedTeacherId,
        teacherName: teacher ? `${teacher.prefix}${teacher.fullName}` : "ไม่ระบุ",
        status,
        absenceReason: status === "absent" ? (absenceReason as AbsenceReason) : undefined,
        absenceNote: status === "absent" ? absenceNote.trim() : undefined,
        recordedByStudent: studentName.trim(),
        isSubstitute: isSub,
        originalTeacherId: isSub ? currentSubstitute?.originalTeacherId : undefined,
        originalTeacherName: isSub ? currentSubstitute?.originalTeacherName : undefined,
        substituteAssignmentId: isSub ? currentSubstitute?.id : undefined,
        createdAt: new Date().toISOString(),
      };

      await addAttendanceLog(newRecord);

      setSubmitSuccess(true);
      await loadRoomLogs();

      // Reset form status
      setStatus("");
      setAbsenceReason("");
      setAbsenceNote("");

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

                  {sub.note && (
                    <div className="text-[11px] text-slate-500 italic bg-white p-2 rounded-lg border border-slate-200">
                      💡 คำสั่ง/หมายเหตุ: {sub.note}
                    </div>
                  )}
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
          <div className="flex items-center gap-2 text-sky-200 text-xs font-semibold tracking-wider uppercase mb-1">
            <UserCheck className="w-4 h-4" />
            <span>ระบบบันทึกเวลาเรียนสำหรับนักเรียน / หัวหน้าห้อง</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            เช็คเวลาเข้าสอนของครู
          </h1>
          <p className="text-sky-100 text-sm mt-1">
            ร่วมกันสร้างวินัยและส่งเสริมคุณภาพการจัดการเรียนรู้ในห้องเรียน
          </p>
        </div>

        {/* Live Clock Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 flex items-center gap-3 self-start md:self-auto">
          <Clock className="w-6 h-6 text-sky-300 animate-pulse" />
          <div>
            <div className="text-xs text-sky-200">เวลาปัจจุบัน</div>
            <div className="text-lg font-mono font-bold">{currentTimeStr || "--:--:--"}</div>
          </div>
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
            <p className="text-sm text-slate-500 mt-1">
              กรุณาเลือกห้องเรียนและใส่รหัส PIN เพื่อป้องกันการเช็คชื่อข้ามห้อง
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm bg-white font-medium"
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm bg-white font-medium disabled:bg-slate-100 disabled:text-slate-400"
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
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-lg tracking-widest text-center font-mono font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                ชื่อ-นามสกุล หรือ เลขที่ของนักเรียนผู้บันทึก{" "}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="เช่น ด.ช.ธนกฤต เลขที่ 1 (หัวหน้าห้อง)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full mt-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold rounded-xl transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-2 text-sm"
            >
              <span>เข้าสู่หน้าบันทึกการสอน</span>
              <ArrowRight className="w-4 h-4" />
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
                onClick={() => autoDetectPeriodAndTimetable(selectedRoomId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors border border-sky-200"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                <span>ตรวจจับตารางสอนอัตโนมัติ</span>
              </button>

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
                  ข้อมูลถูกบันทึกเข้าระบบสถิติส่วนกลางทันที สามารถบันทึกคาบต่อไปได้เลย
                </p>
              </div>
            </div>
          )}

          {/* The Check-in Form */}
          <form
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
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">
                      เลือกวันที่และคาบเรียน
                    </h3>
                    <p className="text-xs text-slate-500">
                      คลิกเลือกคาบเพื่อดึงวิชาและครูอัตโนมัติ (หรือเลือกวันที่เพื่อบันทึกย้อนหลัง)
                    </p>
                  </div>
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
                      🕒 กำลังบันทึกย้อนหลัง
                    </span>
                  )}
                  {checkDate > todayStr && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                      ℹ️ กำลังบันทึกล่วงหน้า
                    </span>
                  )}
                  {checkDate === todayStr && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ✓ วันที่ปัจจุบัน
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

              {/* Double Period Toggle */}
              <div className="mb-4 flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDoublePeriod}
                    onChange={(e) => handleDoublePeriodToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
                <div>
                  <span className="text-sm font-semibold text-slate-800">
                    เป็นวิชาคาบคู่ (2 คาบติดกัน)
                  </span>
                  <span className="block text-xs text-slate-500">
                    {isDoublePeriod
                      ? "ระบบจะคำนวณภาระงานเป็น 2 คาบโดยอัตโนมัติ"
                      : "เป็นวิชาคาบเดี่ยว (1 คาบ)"}
                  </span>
                </div>
              </div>

              {/* Period Buttons / Selectors with Morning & Afternoon separation */}
              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500 mb-1.5 flex items-center justify-between">
                    <span>ภาคเช้า (คาบ 1 - 4)</span>
                    <span className="text-slate-400">08:40 - 12:00 น.</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {periods.filter((p) => p.periodNumber <= 4).map((p) => {
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
                              ? "bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/25 ring-2 ring-sky-300"
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
                                  ? "bg-white text-sky-800"
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
                              ? "bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/25 ring-2 ring-sky-300"
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
                                  ? "bg-white text-sky-800"
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
                  วิชาเรียนประจำห้อง {currentRoom?.gradeRoom} ({roomSubjects.length} วิชา)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Subject Selector (Room only) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      1. เลือกวิชาที่สอน <span className="text-rose-500">*</span>
                    </label>
                    {selectedSubject && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
                        {selectedSubject.department.replace("กลุ่มสาระการเรียนรู้", "")}
                      </span>
                    )}
                  </div>

                  <select
                    value={selectedSubjectId}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm bg-white font-medium"
                    required
                  >
                    <option value="">-- เลือกรหัสและชื่อรายวิชา ({roomSubjects.length} วิชา) --</option>
                    {roomSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} {s.name}
                      </option>
                    ))}
                  </select>

                  <p className="text-[11px] text-slate-500 mt-1.5">
                    {selectedSubject ? (
                      <span className="text-slate-600">
                        วิชา <strong>{selectedSubject.name}</strong> ({selectedSubject.code}) สังกัด: {selectedSubject.department}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        💡 แสดงเฉพาะรายวิชาที่ห้อง {currentRoom?.gradeRoom} เรียนในภาคเรียนนี้
                      </span>
                    )}
                  </p>
                </div>

                {/* 2. Teacher Selector (Cascading from Subject) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      2. เลือกชื่อครูผู้สอน <span className="text-rose-500">*</span>
                    </label>

                    {selectedSubject && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                          isGuidanceOrAntiCorruption
                            ? "bg-purple-50 text-purple-800 border-purple-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        }`}
                      >
                        {isGuidanceOrAntiCorruption
                          ? `ครูทั้งโรงเรียน (${filteredTeachers.length} ท่าน)`
                          : `เฉพาะครูในกลุ่มสาระ (${filteredTeachers.length} ท่าน)`}
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
                        {currentSubstitute.note && (
                          <div className="text-[11px] text-amber-700 mt-0.5 font-medium">
                            คำสั่ง/หมายเหตุ: {currentSubstitute.note}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    disabled={!selectedSubjectId}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm bg-white font-medium disabled:bg-slate-100 disabled:text-slate-400"
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

                  <div className="text-[11px] mt-1.5">
                    {!selectedSubjectId ? (
                      <span className="text-amber-600 font-medium">
                        ⚠️ กรุณาเลือกวิชาก่อน ระบบจะแสดงเฉพาะครูที่สังกัดกลุ่มสาระของวิชานั้น
                      </span>
                    ) : isGuidanceOrAntiCorruption ? (
                      <span className="text-purple-700 font-medium">
                        🌟 วิชาแนะแนว / ต้านทุจริต: แสดงรายชื่อครูผู้สอนทุกกลุ่มสาระการเรียนรู้ทั้งโรงเรียน
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        แสดงเฉพาะครูสังกัด{selectedSubject?.department} เพื่อความถูกต้องและเลือกได้รวดเร็ว
                      </span>
                    )}
                  </div>
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
                  className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    status === "on_time"
                      ? "border-emerald-500 bg-emerald-50/70 shadow-sm"
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
                    }}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-emerald-800 text-sm">
                      เข้าสอนตรงเวลา
                    </span>
                    <CheckCircle2
                      className={`w-5 h-5 ${
                        status === "on_time" ? "text-emerald-600" : "text-slate-300"
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    ครูเข้าสอนภายใน 10 นาทีแรกหลังเสียงสัญญาณเริ่มคาบ
                  </p>
                </label>

                {/* 2. Late */}
                <label
                  className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    status === "late"
                      ? "border-amber-500 bg-amber-50/70 shadow-sm"
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
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-amber-800 text-sm">
                      เข้าสอนหลัง 10 นาที
                    </span>
                    <AlertTriangle
                      className={`w-5 h-5 ${
                        status === "late" ? "text-amber-500" : "text-slate-300"
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    ครูเข้าสอนช้ากว่า 10 นาที (มาสอนแต่สาย)
                  </p>
                </label>

                {/* 3. Absent */}
                <label
                  className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    status === "absent"
                      ? "border-rose-500 bg-rose-50/70 shadow-sm"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="attendance_status"
                    value="absent"
                    checked={status === "absent"}
                    onChange={() => setStatus("absent")}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-rose-800 text-sm">
                      ไม่เข้าสอน
                    </span>
                    <XCircle
                      className={`w-5 h-5 ${
                        status === "absent" ? "text-rose-600" : "text-slate-300"
                      }`}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    ครูไม่มาสอนในคาบนี้ (ต้องระบุสาเหตุ)
                  </p>
                </label>
              </div>

              {/* Sub-form: Absence Reason */}
              {status === "absent" && (
                <div className="mt-4 p-4 rounded-xl bg-rose-50/60 border border-rose-200 space-y-3 animate-in fade-in duration-200">
                  <label className="block text-xs font-bold text-rose-900 uppercase tracking-wider">
                    ระบุสาเหตุที่ครูไม่เข้าสอน <span className="text-rose-600">*</span>
                  </label>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "meeting", label: "ประชุม" },
                      {
                        id: "activity",
                        label: "ร่วมกิจกรรมสำคัญ (ศึกษาดูงาน/ตรวจเยี่ยม)",
                      },
                      { id: "other", label: "เหตุผลอื่นๆ (พิมพ์ตอบเอง)" },
                    ].map((reason) => (
                      <label
                        key={reason.id}
                        className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                          absenceReason === reason.id
                            ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                            : "bg-white text-slate-700 border-rose-200 hover:bg-rose-100/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="absence_reason"
                          value={reason.id}
                          checked={absenceReason === reason.id}
                          onChange={() => setAbsenceReason(reason.id as AbsenceReason)}
                          className="sr-only"
                        />
                        <span>{reason.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Other Note Input */}
                  {absenceReason === "other" && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={absenceNote}
                        onChange={(e) => setAbsenceNote(e.target.value)}
                        placeholder="กรุณาพิมพ์ระบุสาเหตุเพิ่มเติมที่นี่..."
                        className="w-full px-3.5 py-2 rounded-lg border border-rose-300 focus:ring-2 focus:ring-rose-500 text-xs bg-white text-slate-800"
                        required
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <div className="border-t border-slate-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-400">
                * ต้องเลือกและกรอกข้อมูลให้ครบถ้วนทุกข้อ จึงจะสามารถกดบันทึกได้
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-95 text-white font-semibold rounded-xl shadow-lg shadow-sky-600/25 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submitting ? "กำลังบันทึก..." : "ยืนยันบันทึกการเข้าสอน"}</span>
              </button>
            </div>
          </form>

          {/* Section 4: Today's Log for this room */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-600" />
                <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                  ประวัติที่ห้อง {currentRoom?.gradeRoom} บันทึกแล้วในวันที่ {checkDate}
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {roomTodayLogs.length} รายการ
              </span>
            </div>

            {roomTodayLogs.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                ยังไม่มีการบันทึกข้อมูลของห้องนี้ในวันที่เลือก
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {roomTodayLogs.map((log) => (
                  <div
                    key={log.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-bold text-xs shrink-0">
                        {log.periodStart === log.periodEnd
                          ? `คาบ ${log.periodStart}`
                          : `คาบ ${log.periodStart}-${log.periodEnd}`}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800">
                          {log.subjectCode} {log.subjectName}
                        </div>
                        <div className="text-xs text-slate-500">
                          ครูผู้สอน: {log.teacherName} &bull; บันทึกโดย: {log.recordedByStudent}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {log.status === "on_time" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ตรงเวลา
                        </span>
                      )}
                      {log.status === "late" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          สาย &gt;10 นาที
                        </span>
                      )}
                      {log.status === "absent" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          ไม่เข้าสอน ({log.absenceReason === "official" ? "ไปราชการ" : log.absenceReason === "personal" ? "ลากิจ" : log.absenceReason === "sick" ? "ลาป่วย" : log.absenceNote || "อื่นๆ"})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
