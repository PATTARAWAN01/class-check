"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ShieldCheck,
  Lock,
  LogOut,
  Calendar,
  Users,
  BookOpen,
  School,
  Clock,
  Printer,
  FileSpreadsheet,
  Download,
  Upload,
  Plus,
  Trash2,
  Edit2,
  Edit3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Settings,
  Eye,
  QrCode,
  Search,
  X,
  ChevronRight,
  UserCheck,
  CloudUpload,
  CheckSquare,
  Square,
  Filter,
  ClipboardList,
  Dices,
  KeyRound,
  Copy,
  Check,
  Save,
  Loader2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import SubstituteOcrImporter from "@/components/SubstituteOcrImporter";
import {
  getTerms,
  saveTerm,
  setActiveTerm,
  getTeachers,
  saveTeachers,
  deleteTeacher,
  getSubjects,
  saveSubjects,
  deleteSubject,
  getClassrooms,
  saveClassroom,
  deleteClassroom,
  getPeriodSettings,
  savePeriodSettings,
  getTimetable,
  saveTimetable,
  deleteTimetableEntry,
  getSchoolProfile,
  saveSchoolProfile,
  getAttendanceLogs,
  updateAttendanceLog,
  deleteAttendanceLog,
  subscribeAttendance,
  resetToSampleData,
  syncAllToFirestore,
  getSubstituteAssignments,
  saveSubstituteAssignment,
  deleteSubstituteAssignment,
  getSubstituteSyncStatus,
} from "@/lib/storage";
import { getThaiDateString, getThaiOffsetDate, formatThaiDateLong } from "@/lib/dateUtils";
import {
  downloadTeacherTemplate,
  parseTeacherExcel,
  downloadSubjectTemplate,
  parseSubjectExcel,
  downloadTimetableTemplate,
  parseTimetableExcel,
  exportAttendanceToExcel,
  exportSubstituteStatsToExcel,
} from "@/lib/excel";
import {
  AcademicTerm,
  Teacher,
  Subject,
  Classroom,
  PeriodSetting,
  TimetableEntry,
  SchoolProfile,
  AttendanceRecord,
  SubstituteAssignment,
  SubstituteLeaveType,
} from "@/types";
import { DEPARTMENTS, THAI_DAYS } from "@/lib/constants";
import { INITIAL_SUBJECTS } from "@/lib/initialData";
import OfficialPdfReport from "@/components/OfficialPdfReport";
import OfficialSubstitutePdfReport from "@/components/OfficialSubstitutePdfReport";
import ClassroomQrPrint from "@/components/ClassroomQrPrint";
import ClassroomPinPrintModal from "@/components/ClassroomPinPrintModal";
import ClassroomPeriodMatrixModal from "@/components/ClassroomPeriodMatrixModal";
import SubstituteExcelImporter from "@/components/SubstituteExcelImporter";
import SchoolTimetableImporter from "@/components/SchoolTimetableImporter";
import { generateSecurePin } from "@/lib/pinUtils";
import { getEffectivePeriodCount, deduplicateAttendanceRecords } from "@/lib/attendanceUtils";

type AdminTab =
  | "reports"
  | "attendance"
  | "substitute"
  | "timetable"
  | "teachers"
  | "subjects"
  | "classrooms"
  | "settings";

export default function AdminPage() {
  // Admin Login State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Navigation
  const [activeTab, setActiveTab] = useState<AdminTab>("reports");

  // Master Data
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [periods, setPeriods] = useState<PeriodSetting[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile>({
    schoolName: "โรงเรียนหนองวัวซอพิทยาคม",
    logoUrl: "/LOGO-N.png",
    directorName: "นายสมศักดิ์ สุขสวัสดิ์",
    academicHeadName: "นางสาวศิริพร บุญช่วย",
    signers: [
      {
        id: "signer_1",
        name: "นางสาวศิริพร บุญช่วย",
        position: "หัวหน้ากลุ่มบริหารงานวิชาการ",
        roleTitle: "ผู้ตรวจสอบข้อมูล",
      },
      {
        id: "signer_2",
        name: "นายสมศักดิ์ สุขสวัสดิ์",
        position: "ผู้อำนวยการโรงเรียนหนองวัวซอพิทยาคม",
        roleTitle: "ผู้รับรองรายงาน",
      },
    ],
    updatedAt: "",
  });
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);

  // UI status
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // PDF Preview State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfSelectedTeacherId, setPdfSelectedTeacherId] = useState<string>("all");
  const [pdfTimeRange, setPdfTimeRange] = useState<"custom" | "week" | "month" | "term">("custom");
  const [pdfStartDate, setPdfStartDate] = useState(() => getThaiOffsetDate(30));
  const [pdfEndDate, setPdfEndDate] = useState(() => getThaiDateString());
  const [pdfTermId, setPdfTermId] = useState<string>("");
  const [classroomGradeFilter, setClassroomGradeFilter] = useState<string>("all");
  const [showQrModal, setShowQrModal] = useState(false);
  const [showPinPrintModal, setShowPinPrintModal] = useState(false);
  const [showSubPdfModal, setShowSubPdfModal] = useState(false);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [historyViewRecord, setHistoryViewRecord] = useState<AttendanceRecord | null>(null);
  const [gradeDraftPins, setGradeDraftPins] = useState<Record<string, string>>({});
  const [gradeSaving, setGradeSaving] = useState<Record<string, boolean>>({});
  const [copiedGrade, setCopiedGrade] = useState<string | null>(null);
  const [showSchoolImporter, setShowSchoolImporter] = useState(false);

  // Attendance Records Backend State (Live Real-time Monitoring)
  const [attSearch, setAttSearch] = useState("");
  const [attDateFilter, setAttDateFilter] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  const [attStartDate, setAttStartDate] = useState(() => getThaiOffsetDate(7));
  const [attEndDate, setAttEndDate] = useState(() => getThaiDateString());
  const [attClassroomFilter, setAttClassroomFilter] = useState("all");
  const [attStatusFilter, setAttStatusFilter] = useState<"all" | "on_time" | "late" | "absent">("all");
  const [attDeptFilter, setAttDeptFilter] = useState("all");
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [editingLog, setEditingLog] = useState<AttendanceRecord | null>(null);
  const [showEditLogModal, setShowEditLogModal] = useState(false);

  // Substitute Management State (Admin Centralized)
  const [substitutes, setSubstitutes] = useState<SubstituteAssignment[]>([]);
  const [subTab, setSubTab] = useState<"excel" | "ocr" | "history">("excel");
  const [subTimeFilter, setSubTimeFilter] = useState<"today" | "week" | "month" | "all" | "custom">("today");
  const [subStartDate, setSubStartDate] = useState(() => getThaiOffsetDate(7));
  const [subEndDate, setSubEndDate] = useState(() => getThaiDateString());
  const [subSearch, setSubSearch] = useState("");
  const [subDeptFilter, setSubDeptFilter] = useState("all");
  const [subHistoryView, setSubHistoryView] = useState<"teachers" | "schedule">("teachers");
  const [isSyncingSub, setIsSyncingSub] = useState(false);
  const [syncTargetDate, setSyncTargetDate] = useState(() => getThaiDateString());
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);

  // Check cached login
  useEffect(() => {
    const saved = sessionStorage.getItem("class_check_admin_auth");
    if (saved === "true") {
      setIsAuthenticated(true);
    }
    // Check URL query for tab
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "substitute") {
        setActiveTab("substitute");
      }
    }
  }, []);

  // Load Data
  useEffect(() => {
    if (isAuthenticated) {
      loadAllData();
    }
  }, [isAuthenticated]);

  async function loadAllData() {
    const [
      termList,
      tchList,
      sbList,
      clsList,
      pList,
      ttList,
      prof,
      attList,
      subList,
      syncStatus,
    ] = await Promise.all([
      getTerms(),
      getTeachers(),
      getSubjects(),
      getClassrooms(),
      getPeriodSettings(),
      getTimetable(),
      getSchoolProfile(),
      getAttendanceLogs(),
      getSubstituteAssignments(),
      getSubstituteSyncStatus(),
    ]);

    setTerms(termList);
    setTeachers(tchList);
    setSubjects(sbList);
    setClassrooms(clsList);
    setPeriods(pList);
    setTimetable(ttList);
    setSchoolProfile(prof);
    setAttendanceLogs(attList);
    setSubstitutes(subList);

    if (syncStatus) {
      setLastSyncResult({
        success: syncStatus.status === "success",
        message: syncStatus.message || "ซิงก์ข้อมูลอัตโนมัติล่าสุดสำเร็จ",
        totalSynced: syncStatus.totalCount || 0,
        assignedCount: syncStatus.assignedCount || 0,
        unassignedCount: syncStatus.unassignedCount || 0,
        syncedAt: syncStatus.lastSyncedAt,
        date: syncStatus.lastSyncedDate,
      });
    }

    const active = termList.find((t) => t.isActive) || termList[0];
    if (active) setPdfTermId(active.id);
  }

  // Real-time listener for attendance logs in Admin
  useEffect(() => {
    if (isAuthenticated) {
      const unsub = subscribeAttendance((records) => {
        setAttendanceLogs(records);
      });
      return () => unsub();
    }
  }, [isAuthenticated]);

  // Filtered substitute assignments in Admin
  const filteredAdminSubstitutes = useMemo(() => {
    let list = substitutes;

    const todayStr = getThaiDateString();

    if (subTimeFilter === "today") {
      list = list.filter((s) => s.date === todayStr);
    } else if (subTimeFilter === "week") {
      const weekAgoStr = getThaiOffsetDate(7);
      list = list.filter((s) => s.date >= weekAgoStr && s.date <= todayStr);
    } else if (subTimeFilter === "month") {
      const currentYearMonth = todayStr.substring(0, 7);
      list = list.filter((s) => s.date.startsWith(currentYearMonth));
    } else if (subTimeFilter === "custom") {
      list = list.filter((s) => s.date >= subStartDate && s.date <= subEndDate);
    }

    if (subDeptFilter !== "all") {
      list = list.filter(
        (s) =>
          s.department === subDeptFilter ||
          s.substituteDepartment === subDeptFilter ||
          s.department.replace("กลุ่มสาระการเรียนรู้", "") === subDeptFilter.replace("กลุ่มสาระการเรียนรู้", "")
      );
    }

    if (subSearch.trim()) {
      const q = subSearch.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.originalTeacherName.toLowerCase().includes(q) ||
          s.substituteTeacherName.toLowerCase().includes(q) ||
          s.subjectCode.toLowerCase().includes(q) ||
          s.subjectName.toLowerCase().includes(q) ||
          s.gradeRoom.toLowerCase().includes(q)
      );
    }

    // Helper to get department index according to official DEPARTMENTS
    const getDeptRank = (deptStr: string) => {
      const clean = (deptStr || "").replace("กลุ่มสาระการเรียนรู้", "").trim();
      const idx = DEPARTMENTS.findIndex(
        (d) =>
          d.includes(clean) ||
          clean.includes(d.replace("กลุ่มสาระการเรียนรู้", "").trim())
      );
      return idx === -1 ? 999 : idx;
    };

    // Track first appearance/upload order of each teacher to preserve upload order per person
    const teacherFirstOrder = new Map<string, number>();
    list.forEach((item, idx) => {
      const teacherKey = `${item.date}_${item.department}_${item.originalTeacherName || item.originalTeacherId}`;
      if (!teacherFirstOrder.has(teacherKey)) {
        teacherFirstOrder.set(teacherKey, idx);
      }
    });

    return [...list].sort((a, b) => {
      // 1. Date (newest date first)
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }

      // 2. Department (Official Department Order)
      const deptA = getDeptRank(a.department);
      const deptB = getDeptRank(b.department);
      if (deptA !== deptB) {
        return deptA - deptB;
      }

      // 3. Person (Keep each teacher together in order of upload)
      const teacherKeyA = `${a.date}_${a.department}_${a.originalTeacherName || a.originalTeacherId}`;
      const teacherKeyB = `${b.date}_${b.department}_${b.originalTeacherName || b.originalTeacherId}`;
      const orderA = teacherFirstOrder.get(teacherKeyA) ?? 0;
      const orderB = teacherFirstOrder.get(teacherKeyB) ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // 4. Period (within each individual teacher, sort by periodStart)
      return a.periodStart - b.periodStart;
    });
  }, [substitutes, subTimeFilter, subStartDate, subEndDate, subDeptFilter, subSearch]);

  // Filtered attendance records in Admin Backend
  const filteredAdminAttendance = useMemo(() => {
    let list = attendanceLogs;
    if (pdfTermId) {
      list = list.filter((r) => !r.termId || r.termId === pdfTermId);
    }

    const todayStr = getThaiDateString();

    if (attDateFilter === "today") {
      list = list.filter((r) => r.date === todayStr);
    } else if (attDateFilter === "yesterday") {
      const yesterdayStr = getThaiOffsetDate(1);
      list = list.filter((r) => r.date === yesterdayStr);
    } else if (attDateFilter === "week") {
      const weekAgoStr = getThaiOffsetDate(7);
      list = list.filter((r) => r.date >= weekAgoStr && r.date <= todayStr);
    } else if (attDateFilter === "month") {
      const currentYM = todayStr.substring(0, 7);
      list = list.filter((r) => r.date.startsWith(currentYM));
    } else if (attDateFilter === "custom") {
      list = list.filter((r) => r.date >= attStartDate && r.date <= attEndDate);
    }

    if (attClassroomFilter !== "all") {
      list = list.filter((r) => r.classroomId === attClassroomFilter || r.gradeRoom === attClassroomFilter);
    }

    if (attStatusFilter !== "all") {
      list = list.filter((r) => r.status === attStatusFilter);
    }

    if (attDeptFilter !== "all") {
      const deptTeachers = new Set(teachers.filter((t) => t.department === attDeptFilter).map((t) => t.id));
      list = list.filter((r) => deptTeachers.has(r.teacherId));
    }

    if (attSearch.trim()) {
      const q = attSearch.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.teacherName || "").toLowerCase().includes(q) ||
          (r.subjectCode || "").toLowerCase().includes(q) ||
          (r.subjectName || "").toLowerCase().includes(q) ||
          (r.recordedByStudent && r.recordedByStudent.toLowerCase().includes(q)) ||
          (r.gradeRoom || "").toLowerCase().includes(q) ||
          (r.absenceNote && r.absenceNote.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => b.date.localeCompare(a.date) || b.periodStart - a.periodStart);
  }, [
    attendanceLogs,
    pdfTermId,
    attDateFilter,
    attStartDate,
    attEndDate,
    attClassroomFilter,
    attStatusFilter,
    attDeptFilter,
    attSearch,
    teachers,
  ]);

  // Admin Attendance Handlers (Delete & Edit)
  const handleAdminDeleteLog = async (id: string) => {
    const target = attendanceLogs.find((a) => a.id === id);
    if (!target) return;
    if (
      !window.confirm(
        `ยืนยันการลบข้อมูลการเข้าสอน คาบที่ ${target.periodStart} (${target.subjectCode} ${target.subjectName}) ห้อง ${target.gradeRoom} วันที่ ${target.date} ใช่หรือไม่?\n(ข้อมูลจะถูกลบออกจากระบบส่วนกลาง)`
      )
    )
      return;
    try {
      await deleteAttendanceLog(id);
      showNotice("ลบรายการบันทึกเรียบร้อยแล้ว", "success");
      setSelectedLogIds((prev) => prev.filter((i) => i !== id));
    } catch (e) {
      console.error(e);
      showNotice("เกิดข้อผิดพลาดในการลบรายการ", "error");
    }
  };

  const handleBatchDeleteLogs = async () => {
    if (selectedLogIds.length === 0) return;
    if (
      !window.confirm(
        `ยืนยันการลบข้อมูลการเข้าสอนที่เลือกทั้งหมด ${selectedLogIds.length} รายการ ใช่หรือไม่?\n(การกระทำนี้จะลบออกจากระบบส่วนกลางและไม่สามารถย้อนกลับได้)`
      )
    )
      return;
    try {
      for (const id of selectedLogIds) {
        await deleteAttendanceLog(id);
      }
      showNotice(`ลบข้อมูล ${selectedLogIds.length} รายการเรียบร้อยแล้ว`, "success");
      setSelectedLogIds([]);
    } catch (e) {
      console.error(e);
      showNotice("เกิดข้อผิดพลาดในการลบรายการ", "error");
    }
  };

  const handleAutoCleanAndRepairLogs = async () => {
    if (
      !window.confirm(
        "ระบบจะทำการตรวจสอบรายการบันทึกทั้งหมดเพื่อ:\n1. ปรับปรุงคาบเรียนที่บันทึกเป็นคาบคู่ผิดพลาด ให้กลับมาเป็น 1 คาบตามตารางสอนจริง (แก้ไขปัญหาคาบรวมเกินจริง)\n2. ลบรายการที่นักเรียนบันทึกซ้ำซ้อนในห้องและคาบเดียวกันออกจากระบบ\n\nต้องการดำเนินการทันทีหรือไม่?"
      )
    ) {
      return;
    }

    try {
      let repairedCount = 0;
      let deletedDuplicates = 0;

      // Group records by classroomId + date
      const roomDateGroups = new Map<string, AttendanceRecord[]>();
      attendanceLogs.forEach((r) => {
        const key = `${r.classroomId}_${r.date}`;
        if (!roomDateGroups.has(key)) roomDateGroups.set(key, []);
        roomDateGroups.get(key)!.push(r);
      });

      // 1. Process duplicates and repair erroneous periods
      for (const records of Array.from(roomDateGroups.values())) {
        // Sort descending (newest first)
        const sorted = [...records].sort((a, b) => {
          const timeA = a.updatedAt || a.createdAt || "";
          const timeB = b.updatedAt || b.createdAt || "";
          return timeB.localeCompare(timeA);
        });

        const occupied = new Set<number>();
        for (const r of sorted) {
          const pStart = r.periodStart || 1;
          const pEnd = r.periodEnd || pStart;
          let isDup = false;
          for (let p = pStart; p <= pEnd; p++) {
            if (occupied.has(p)) {
              isDup = true;
              break;
            }
          }

          if (isDup) {
            await deleteAttendanceLog(r.id);
            deletedDuplicates++;
          } else {
            for (let p = pStart; p <= pEnd; p++) {
              occupied.add(p);
            }

            // Check if periodCount or periodEnd is erroneous
            const effectiveCount = getEffectivePeriodCount(r, timetable);
            if (
              r.periodCount !== effectiveCount ||
              (effectiveCount === 1 && r.periodEnd !== r.periodStart)
            ) {
              const fixed: AttendanceRecord = {
                ...r,
                periodCount: effectiveCount,
                periodEnd: effectiveCount === 1 ? r.periodStart : r.periodEnd,
                updatedAt: new Date().toISOString(),
              };
              await updateAttendanceLog(fixed);
              repairedCount++;
            }
          }
        }
      }

      showNotice(
        `ประมวลผลสำเร็จ: ซ่อมแซมคาบเรียนที่ผิดพลาด ${repairedCount} รายการ และลบรายการซ้ำซ้อน ${deletedDuplicates} รายการ`,
        "success"
      );
    } catch (e) {
      console.error("Clean logs error:", e);
      showNotice("เกิดข้อผิดพลาดในการตรวจสอบและทำความสะอาดข้อมูล", "error");
    }
  };

  const handleSaveEditLog = async (updated: AttendanceRecord) => {
    try {
      const original = attendanceLogs.find((r) => r.id === updated.id);
      const changes = [];
      const statusLabels: Record<string, string> = {
        on_time: "เข้าสอนตรงเวลา",
        late: "เข้าสอนสาย (>10 นาที)",
        absent: "ไม่เข้าสอน",
      };

      if (original) {
        if (original.status !== updated.status) {
          changes.push({
            field: "สถานะการเข้าสอน",
            oldValue: statusLabels[original.status] || original.status,
            newValue: statusLabels[updated.status] || updated.status,
          });
        }
        if (original.teacherId !== updated.teacherId || original.teacherName !== updated.teacherName) {
          changes.push({
            field: "ครูผู้สอน",
            oldValue: original.teacherName,
            newValue: updated.teacherName,
          });
        }
        if (original.date !== updated.date) {
          changes.push({
            field: "วันที่สอน",
            oldValue: original.date,
            newValue: updated.date,
          });
        }
        if (original.absenceReason !== updated.absenceReason) {
          changes.push({
            field: "สาเหตุการไม่เข้าสอน",
            oldValue: original.absenceReason || "-",
            newValue: updated.absenceReason || "-",
          });
        }
        if ((original.absenceNote || "") !== (updated.absenceNote || "")) {
          changes.push({
            field: "หมายเหตุ",
            oldValue: original.absenceNote || "-",
            newValue: updated.absenceNote || "-",
          });
        }
      }

      const editEntry = {
        timestamp: new Date().toISOString(),
        editorName: "ผู้ดูแลระบบ (Admin)",
        changes: changes.length > 0 ? changes : [{ field: "บันทึกแก้ไขข้อมูล", oldValue: "-", newValue: "อัปเดตข้อมูล" }],
        clientIp: "ระบบหลังบ้านแอดมิน",
      };

      const finalRecord: AttendanceRecord = {
        ...updated,
        updatedAt: new Date().toISOString(),
        updatedByStudent: "ผู้ดูแลระบบ (Admin)",
        editHistory: [...(original?.editHistory || []), editEntry],
      };

      await updateAttendanceLog(finalRecord);
      showNotice("บันทึกการแก้ไขข้อมูลเรียบร้อยแล้ว", "success");
      setShowEditLogModal(false);
      setEditingLog(null);
    } catch (e) {
      console.error(e);
      showNotice("เกิดข้อผิดพลาดในการแก้ไขข้อมูล", "error");
    }
  };

  const toggleSelectLog = (id: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllLogs = () => {
    if (selectedLogIds.length === filteredAdminAttendance.length) {
      setSelectedLogIds([]);
    } else {
      setSelectedLogIds(filteredAdminAttendance.map((r) => r.id));
    }
  };

  // KPI for filtered admin attendance
  const adminAttendanceKpis = useMemo(() => {
    let total = 0;
    let onTime = 0;
    let late = 0;
    let absent = 0;
    filteredAdminAttendance.forEach((r) => {
      const cnt = getEffectivePeriodCount(r, timetable);
      total += cnt;
      if (r.status === "on_time") onTime += cnt;
      else if (r.status === "late") late += cnt;
      else if (r.status === "absent") absent += cnt;
    });
    const onTimePct = total > 0 ? Math.round((onTime / total) * 1000) / 10 : 0;
    const latePct = total > 0 ? Math.round((late / total) * 1000) / 10 : 0;
    const absentPct = total > 0 ? Math.round((absent / total) * 1000) / 10 : 0;
    return { total, onTime, late, absent, onTimePct, latePct, absentPct };
  }, [filteredAdminAttendance, timetable]);

  const adminSubKpis = useMemo(() => {
    const totalPeriods = filteredAdminSubstitutes.length;
    const substituteTeacherSet = new Set(filteredAdminSubstitutes.map((s) => s.substituteTeacherId).filter(Boolean));
    const absentTeacherSet = new Set(filteredAdminSubstitutes.map((s) => s.originalTeacherId).filter(Boolean));
    const sickCount = filteredAdminSubstitutes.filter((s) => s.leaveType === "sick").length;
    const personalCount = filteredAdminSubstitutes.filter((s) => s.leaveType === "personal").length;
    const officialCount = filteredAdminSubstitutes.filter((s) => s.leaveType === "official").length;

    return {
      totalPeriods,
      substituteTeachersCount: substituteTeacherSet.size,
      absentTeachersCount: absentTeacherSet.size,
      sickCount,
      personalCount,
      officialCount,
    };
  }, [filteredAdminSubstitutes]);

  // Detect subjects with duplicate names across different codes
  const duplicateSubjectGroups = useMemo(() => {
    const map = new Map<string, Subject[]>();
    subjects.forEach((s) => {
      const norm = (s.name || "").trim().toLowerCase();
      if (!norm) return;
      if (!map.has(norm)) map.set(norm, []);
      map.get(norm)!.push(s);
    });

    const dupes: Array<{ name: string; items: Subject[] }> = [];
    map.forEach((items, name) => {
      if (items.length > 1) {
        dupes.push({ name: items[0].name, items });
      }
    });
    return dupes;
  }, [subjects]);

  // Sorted teachers by official DEPARTMENTS hierarchy, then alphabetically by name
  const sortedTeachersByDept = useMemo(() => {
    const getDeptRank = (deptStr: string) => {
      const clean = (deptStr || "").replace("กลุ่มสาระการเรียนรู้", "").trim();
      const idx = DEPARTMENTS.findIndex(
        (d) => d.includes(clean) || clean.includes(d.replace("กลุ่มสาระการเรียนรู้", "").trim())
      );
      return idx === -1 ? 999 : idx;
    };
    return [...teachers].sort((a, b) => {
      const rankA = getDeptRank(a.department);
      const rankB = getDeptRank(b.department);
      if (rankA !== rankB) return rankA - rankB;
      return a.fullName.localeCompare(b.fullName, "th");
    });
  }, [teachers]);

  // Statistics of teachers who substituted (based on current filters: time, dept, search)
  const substituteTeacherStats = useMemo(() => {
    const teacherMap = new Map<
      string,
      {
        teacherId: string;
        teacherName: string;
        department: string;
        totalPeriods: number;
        replacedTeachers: Set<string>;
        rooms: Set<string>;
        dates: Set<string>;
      }
    >();

    filteredAdminSubstitutes.forEach((sub) => {
      const key = sub.substituteTeacherName || sub.substituteTeacherId || "ไม่ระบุ";
      let entry = teacherMap.get(key);
      if (!entry) {
        const foundTch = teachers.find(
          (t) =>
            t.id === sub.substituteTeacherId ||
            `${t.prefix}${t.fullName}` === sub.substituteTeacherName ||
            t.fullName === sub.substituteTeacherName
        );
        const dept = sub.substituteDepartment || foundTch?.department || sub.department || "ไม่ระบุ";

        entry = {
          teacherId: sub.substituteTeacherId,
          teacherName: sub.substituteTeacherName,
          department: dept,
          totalPeriods: 0,
          replacedTeachers: new Set<string>(),
          rooms: new Set<string>(),
          dates: new Set<string>(),
        };
        teacherMap.set(key, entry);
      }

      const periodsCount =
        sub.periodEnd && sub.periodEnd > sub.periodStart
          ? sub.periodEnd - sub.periodStart + 1
          : 1;

      entry.totalPeriods += periodsCount;
      if (sub.originalTeacherName) {
        entry.replacedTeachers.add(sub.originalTeacherName);
      }
      if (sub.gradeRoom) {
        entry.rooms.add(sub.gradeRoom);
      }
      if (sub.date) {
        entry.dates.add(sub.date);
      }
    });

    const getDeptRank = (deptStr: string) => {
      const clean = (deptStr || "").replace("กลุ่มสาระการเรียนรู้", "").trim();
      const idx = DEPARTMENTS.findIndex(
        (d) => d.includes(clean) || clean.includes(d.replace("กลุ่มสาระการเรียนรู้", "").trim())
      );
      return idx === -1 ? 999 : idx;
    };

    return Array.from(teacherMap.values())
      .map((item) => ({
        ...item,
        replacedTeachers: Array.from(item.replacedTeachers),
        rooms: Array.from(item.rooms),
        dates: Array.from(item.dates),
      }))
      .sort((a, b) => {
        if (b.totalPeriods !== a.totalPeriods) {
          return b.totalPeriods - a.totalPeriods;
        }
        const rankA = getDeptRank(a.department);
        const rankB = getDeptRank(b.department);
        if (rankA !== rankB) return rankA - rankB;
        return a.teacherName.localeCompare(b.teacherName, "th");
      });
  }, [filteredAdminSubstitutes, teachers]);

  const handleExportSubstituteStats = () => {
    if (substituteTeacherStats.length === 0) {
      alert("ไม่มีข้อมูลสถิติครูสอนแทนในช่วงเวลาที่เลือก");
      return;
    }
    const timeLabel =
      subTimeFilter === "today"
        ? `ประจำวันนี้_${getThaiDateString()}`
        : subTimeFilter === "week"
        ? "ย้อนหลัง_7_วัน"
        : subTimeFilter === "month"
        ? "ประจำเดือนนี้"
        : subTimeFilter === "custom"
        ? `ช่วงวันที่_${subStartDate}_ถึง_${subEndDate}`
        : "ทั้งหมด";

    exportSubstituteStatsToExcel(
      substituteTeacherStats,
      schoolProfile.schoolName || "โรงเรียน",
      timeLabel
    );
  };

  const handleDeleteSubstitute = async (id: string) => {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการยกเลิก/ลบรายการจัดสอนแทนนี้?")) return;
    await deleteSubstituteAssignment(id);
    const updated = await getSubstituteAssignments();
    setSubstitutes(updated);
    showNotice("ยกเลิกรายการจัดสอนแทนเรียบร้อยแล้ว", "success");
  };

  const handleTriggerNetlifySync = async (dateToSync?: string) => {
    const finalDate = dateToSync || syncTargetDate || getThaiDateString();
    try {
      setIsSyncingSub(true);
      const res = await fetch(`/api/substitute/cron-sync?date=${encodeURIComponent(finalDate)}`, {
        method: "POST",
      });
      const data = await res.json();
      setLastSyncResult(data);
      if (data.success) {
        const refreshed = await getSubstituteAssignments();
        setSubstitutes(refreshed);
        showNotice(`⚡ ${data.message}`, "success");
      } else {
        showNotice(`เกิดข้อผิดพลาดในการซิงก์: ${data.message || data.error}`, "error");
      }
    } catch (e: any) {
      console.error(e);
      showNotice("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์", "error");
    } finally {
      setIsSyncingSub(false);
    }
  };

  const showNotice = (text: string, type: "success" | "error" = "success") => {
    setNotice({ text, type });
    setTimeout(() => setNotice(null), 4000);
  };

  // Login Handler (Admin Authentication)
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");

    if (adminUsername === "admin" && adminPassword === "nwsp123456") {
      setIsAuthenticated(true);
      sessionStorage.setItem("class_check_admin_auth", "true");
    } else {
      setLoginError("ชื่อผู้ใช้หรือรหัสผ่านแอดมินไม่ถูกต้อง");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("class_check_admin_auth");
    setAdminPassword("");
  };

  // ==================== TAB 1: REPORTS HANDLERS ====================
  const handleOpenPdf = () => {
    setPdfModalOpen(true);
  };

  const filteredPdfRecords = useMemo(() => {
    const list = attendanceLogs.filter((r) => {
      if (pdfTermId && r.termId !== pdfTermId) return false;
      if (pdfSelectedTeacherId !== "all" && r.teacherId !== pdfSelectedTeacherId)
        return false;

      if (pdfTimeRange === "custom") {
        if (pdfStartDate && r.date < pdfStartDate) return false;
        if (pdfEndDate && r.date > pdfEndDate) return false;
        return true;
      } else if (pdfTimeRange === "week") {
        const todayStr = getThaiDateString();
        const weekAgoStr = getThaiOffsetDate(7);
        return r.date >= weekAgoStr && r.date <= todayStr;
      } else if (pdfTimeRange === "month") {
        const todayStr = getThaiDateString();
        const currentYM = todayStr.substring(0, 7);
        return r.date.startsWith(currentYM);
      }
      return true;
    });

    return deduplicateAttendanceRecords(list);
  }, [attendanceLogs, pdfTermId, pdfSelectedTeacherId, pdfTimeRange, pdfStartDate, pdfEndDate]);

  const pdfDateRangeLabel = useMemo(() => {
    if (pdfTimeRange === "custom") {
      return `ช่วงวันที่ ${pdfStartDate} ถึง ${pdfEndDate}`;
    }
    if (pdfTimeRange === "week") return "รายงานประจำสัปดาห์ (7 วันล่าสุด)";
    if (pdfTimeRange === "month") return "รายงานประจำเดือน";
    return "รายงานตลอดภาคเรียน";
  }, [pdfTimeRange, pdfStartDate, pdfEndDate]);

  const selectedTeacherObj =
    pdfSelectedTeacherId === "all"
      ? null
      : teachers.find((t) => t.id === pdfSelectedTeacherId) || null;

  const currentPdfTermObj = terms.find((t) => t.id === pdfTermId) || null;

  // ==================== TAB 2: TIMETABLE HANDLERS ====================
  const handleTimetableImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const activeTerm = terms.find((t) => t.isActive) || terms[0];
      const parsed = await parseTimetableExcel(file, activeTerm?.id || "term_default");
      if (parsed.length === 0) {
        showNotice("ไม่พบข้อมูลตารางสอนในไฟล์ที่อัปโหลด กรุณาใช้เทมเพลตมาตรฐาน", "error");
        return;
      }
      await saveTimetable(parsed);
      await loadAllData();
      showNotice(`นำเข้าข้อมูลตารางสอนสำเร็จ ${parsed.length} รายการ`);
    } catch (err) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดในการอ่านไฟล์ตารางสอน", "error");
    }
  };

  // ==================== TAB 3: TEACHERS HANDLERS ====================
  const [newTeacher, setNewTeacher] = useState({
    code: "",
    prefix: "นาย",
    fullName: "",
    department: DEPARTMENTS[0],
  });
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherDeptFilter, setTeacherDeptFilter] = useState("all");

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacher.fullName.trim()) return;

    let finalCode = newTeacher.code.trim();
    if (!finalCode) {
      const maxCode = teachers.reduce((max, t) => {
        const m = t.code.match(/^T(\d+)$/i);
        if (m) {
          const num = parseInt(m[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, 0);
      finalCode = `T${String(maxCode + 1).padStart(3, "0")}`;
    }

    const added: Teacher = {
      id: `tch_${Date.now()}`,
      code: finalCode,
      prefix: newTeacher.prefix.trim() || "ครู",
      fullName: newTeacher.fullName.trim(),
      department: newTeacher.department,
    };

    const updated = [...teachers, added];
    await saveTeachers(updated);
    setTeachers(updated);
    setNewTeacher({ code: "", prefix: "นาย", fullName: "", department: DEPARTMENTS[0] });
    showNotice(`เพิ่มครู ${added.prefix}${added.fullName} (${added.code}) สำเร็จ`);
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher || !editingTeacher.fullName.trim()) return;

    const updated = teachers.map((t) => (t.id === editingTeacher.id ? editingTeacher : t));
    await saveTeachers(updated);
    setTeachers(updated);
    showNotice(`แก้ไขข้อมูลครู ${editingTeacher.prefix}${editingTeacher.fullName} สำเร็จ`);
    setEditingTeacher(null);
  };

  const handleTeacherExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseTeacherExcel(file);
      if (parsed.length === 0) {
        showNotice("ไม่พบข้อมูลครูในไฟล์ Excel", "error");
        return;
      }
      const combined = [...teachers, ...parsed];
      await saveTeachers(combined);
      setTeachers(combined);
      showNotice(`นำเข้ารายชื่อครูจาก Excel สำเร็จ ${parsed.length} ท่าน`);
    } catch (err) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดในการอ่านไฟล์ Excel", "error");
    }
  };

  const handleDeleteTeacher = async (id: string, name: string) => {
    if (!confirm(`ต้องการลบรายชื่อ "${name}" หรือไม่?`)) return;
    await deleteTeacher(id);
    setTeachers(teachers.filter((t) => t.id !== id));
    showNotice(`ลบรายชื่อครูสำเร็จ`);
  };

  // ==================== TAB 4: SUBJECTS HANDLERS ====================
  const [newSubject, setNewSubject] = useState({
    code: "",
    name: "",
    department: DEPARTMENTS[0],
    assignedClassroomIds: [] as string[],
  });
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [subjectDeptFilter, setSubjectDeptFilter] = useState("all");

  const toggleClassroomForNewSubject = (clsId: string) => {
    const current = newSubject.assignedClassroomIds;
    const next = current.includes(clsId)
      ? current.filter((id) => id !== clsId)
      : [...current, clsId];
    setNewSubject({ ...newSubject, assignedClassroomIds: next });
  };

  const setGradeRoomsForNewSubject = (grade: string, selectAll: boolean) => {
    const gradeRoomIds = classrooms.filter((c) => c.grade === grade).map((c) => c.id);
    let next = [...newSubject.assignedClassroomIds];
    if (selectAll) {
      gradeRoomIds.forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
    } else {
      next = next.filter((id) => !gradeRoomIds.includes(id));
    }
    setNewSubject({ ...newSubject, assignedClassroomIds: next });
  };

  const toggleClassroomForEditingSubject = (clsId: string) => {
    if (!editingSubject) return;
    const current = editingSubject.assignedClassroomIds || [];
    const next = current.includes(clsId)
      ? current.filter((id) => id !== clsId)
      : [...current, clsId];
    setEditingSubject({ ...editingSubject, assignedClassroomIds: next });
  };

  const setGradeRoomsForEditingSubject = (grade: string, selectAll: boolean) => {
    if (!editingSubject) return;
    const gradeRoomIds = classrooms.filter((c) => c.grade === grade).map((c) => c.id);
    let next = [...(editingSubject.assignedClassroomIds || [])];
    if (selectAll) {
      gradeRoomIds.forEach((id) => {
        if (!next.includes(id)) next.push(id);
      });
    } else {
      next = next.filter((id) => !gradeRoomIds.includes(id));
    }
    setEditingSubject({ ...editingSubject, assignedClassroomIds: next });
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = newSubject.code.trim();
    const cleanName = newSubject.name.trim();
    if (!cleanCode || !cleanName) return;

    // 1. Primary Key: Code uniqueness validation
    const existingCode = subjects.find(
      (s) => s.code.replace(/\s+/g, "").toUpperCase() === cleanCode.replace(/\s+/g, "").toUpperCase()
    );
    if (existingCode) {
      alert(`รหัสวิชา "${cleanCode}" มีอยู่ในระบบแล้ว (${existingCode.name}) รหัสวิชาเป็นคีย์หลักห้ามซ้ำกันเด็ดขาด`);
      return;
    }

    // 2. Duplicate Name Warning
    const dupNameSubj = subjects.find(
      (s) => s.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (dupNameSubj) {
      const proceed = confirm(
        `⚠️ ชื่อวิชา "${cleanName}" ซ้ำกับวิชารหัส "${dupNameSubj.code}" (${dupNameSubj.department})\n\nแนะนำให้ระบุระดับชั้นต่อท้าย เช่น "${cleanName} (ม.4)" เพื่อป้องกันระบบดึงข้อมูลสับสน\n\nต้องการบันทึกด้วยชื่อนี้หรือไม่?`
      );
      if (!proceed) return;
    }

    const added: Subject = {
      id: `subj_${cleanCode.replace(/[^a-zA-Z0-9ก-ฮ]/g, "_")}_${Date.now()}`,
      code: cleanCode,
      name: cleanName,
      department: newSubject.department,
      assignedClassroomIds: newSubject.assignedClassroomIds,
    };

    const updated = [...subjects, added];
    await saveSubjects(updated);
    setSubjects(updated);
    setNewSubject({ code: "", name: "", department: DEPARTMENTS[0], assignedClassroomIds: [] });
    showNotice(`เพิ่มรายวิชา ${added.code} ${added.name} สำเร็จ (${added.assignedClassroomIds?.length || 0} ห้องเรียน)`);
  };

  const handleUpdateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !editingSubject.code.trim() || !editingSubject.name.trim()) return;

    const cleanCode = editingSubject.code.trim();
    const cleanName = editingSubject.name.trim();

    // 1. Primary Key: Code uniqueness check (excluding self)
    const existingCode = subjects.find(
      (s) => s.id !== editingSubject.id && s.code.replace(/\s+/g, "").toUpperCase() === cleanCode.replace(/\s+/g, "").toUpperCase()
    );
    if (existingCode) {
      alert(`รหัสวิชา "${cleanCode}" มีอยู่ในระบบแล้ว (${existingCode.name}) รหัสวิชาเป็นคีย์หลักห้ามซ้ำกัน`);
      return;
    }

    // 2. Duplicate Name Warning
    const dupNameSubj = subjects.find(
      (s) => s.id !== editingSubject.id && s.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (dupNameSubj) {
      const proceed = confirm(
        `⚠️ ชื่อวิชา "${cleanName}" ซ้ำกับวิชารหัส "${dupNameSubj.code}" (${dupNameSubj.department})\n\nแนะนำให้ระบุระดับชั้นต่อท้าย เช่น "${cleanName} (ม.4)" เพื่อป้องกันระบบดึงข้อมูลสับสน\n\nต้องการบันทึกด้วยชื่อนี้หรือไม่?`
      );
      if (!proceed) return;
    }

    const updated = subjects.map((s) => (s.id === editingSubject.id ? { ...editingSubject, code: cleanCode, name: cleanName } : s));
    await saveSubjects(updated);
    setSubjects(updated);
    showNotice(`แก้ไขข้อมูลวิชา ${editingSubject.code} ${editingSubject.name} สำเร็จ`);
    setEditingSubject(null);
  };

  const handleSyncAllStandardSubjects = async () => {
    if (!confirm(`คุณต้องการซิงก์ข้อมูลรายวิชามาตรฐานทั้ง 134 รายวิชาขึ้น Firebase Firestore หรือไม่? (จะอัปเดตและเติมเต็มรายวิชามาตรฐานที่ขาดหายไป)`)) return;
    try {
      await saveSubjects(INITIAL_SUBJECTS);
      const updated = await getSubjects();
      setSubjects(updated);
      showNotice(`ซิงก์รายวิชามาตรฐาน ${updated.length} วิชาขึ้น Firebase สำเร็จเรียบร้อยแล้ว`, "success");
    } catch (e: any) {
      showNotice("เกิดข้อผิดพลาดในการซิงก์รายวิชา: " + e.message, "error");
    }
  };

  const handleSubjectExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSubjectExcel(file);
      if (parsed.length === 0) {
        showNotice("ไม่พบข้อมูลรายวิชาในไฟล์ Excel", "error");
        return;
      }
      const combined = [...subjects, ...parsed];
      await saveSubjects(combined);
      setSubjects(combined);
      showNotice(`นำเข้ารายวิชาจาก Excel สำเร็จ ${parsed.length} วิชา`);
    } catch (err) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดในการอ่านไฟล์ Excel", "error");
    }
  };

  const handleDeleteSubject = async (id: string, code: string) => {
    if (!confirm(`ต้องการลบวิชา "${code}" หรือไม่?`)) return;
    await deleteSubject(id);
    setSubjects(subjects.filter((s) => s.id !== id));
    showNotice(`ลบรายวิชาสำเร็จ`);
  };

  // ==================== TAB 5: CLASSROOMS HANDLERS ====================
  const [newClassroom, setNewClassroom] = useState({
    gradeRoom: "",
    pinCode: "1234",
  });

  const handleAddClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassroom.gradeRoom.trim()) return;

    const parts = newClassroom.gradeRoom.trim().split("/");
    const grade = parts[0] || "ม.1";
    const room = parts[1] || "1";

    const added: Classroom = {
      id: `cls_${Date.now()}`,
      gradeRoom: newClassroom.gradeRoom.trim(),
      grade,
      room,
      pinCode: newClassroom.pinCode.trim() || "1234",
    };

    await saveClassroom(added);
    setClassrooms([...classrooms, added]);
    setNewClassroom({ gradeRoom: "", pinCode: "1234" });
    showNotice(`เพิ่มห้องเรียน ${added.gradeRoom} สำเร็จ`);
  };

  const handleUpdateRoomPin = async (cls: Classroom, newPin: string) => {
    const updated = { ...cls, pinCode: newPin };
    await saveClassroom(updated);
    setClassrooms(classrooms.map((c) => (c.id === cls.id ? updated : c)));
    showNotice(`อัปเดตรหัส PIN ของห้อง ${cls.gradeRoom} สำเร็จ`);
  };

  // Randomize all rooms in a specific grade
  const handleRandomizeGradePins = (grade: string) => {
    const roomsInGrade = classrooms.filter((c) => c.grade === grade);
    if (roomsInGrade.length === 0) return;

    // Existing PINs of other rooms not in this grade
    const otherPins = classrooms
      .filter((c) => c.grade !== grade)
      .map((c) => gradeDraftPins[c.id] || c.pinCode);

    const newDrafts = { ...gradeDraftPins };
    const usedPins = [...otherPins];

    for (const room of roomsInGrade) {
      const pin = generateSecurePin(usedPins);
      newDrafts[room.id] = pin;
      usedPins.push(pin);
    }

    setGradeDraftPins(newDrafts);
    showNotice(`🎲 สุ่ม PIN ใหม่ระดับชั้น ${grade} แล้ว (${roomsInGrade.length} ห้อง) — กรุณากดปุ่มบันทึก`);
  };

  // Randomize a single room PIN
  const handleRandomizeSingleRoomPin = (cls: Classroom) => {
    const otherPins = classrooms
      .filter((c) => c.id !== cls.id)
      .map((c) => gradeDraftPins[c.id] || c.pinCode);

    const pin = generateSecurePin(otherPins);
    setGradeDraftPins((prev) => ({ ...prev, [cls.id]: pin }));
    showNotice(`🎲 สุ่ม PIN ห้อง ${cls.gradeRoom} เป็น ${pin} — กรุณากดปุ่มบันทึก`);
  };

  // Save all rooms in a specific grade to Firestore
  const handleSaveGradePins = async (grade: string) => {
    const roomsInGrade = classrooms.filter((c) => c.grade === grade);
    if (roomsInGrade.length === 0) return;

    setGradeSaving((prev) => ({ ...prev, [grade]: true }));
    try {
      const updatedRooms: Classroom[] = [];
      for (const room of roomsInGrade) {
        const newPin = gradeDraftPins[room.id];
        if (newPin && newPin.trim() && newPin.trim() !== room.pinCode) {
          const updated = { ...room, pinCode: newPin.trim() };
          await saveClassroom(updated);
          updatedRooms.push(updated);
        }
      }

      if (updatedRooms.length > 0) {
        setClassrooms((prev) =>
          prev.map((c) => {
            const found = updatedRooms.find((u) => u.id === c.id);
            return found || c;
          })
        );
        // Clear saved rooms from draft pins
        setGradeDraftPins((prev) => {
          const next = { ...prev };
          for (const u of updatedRooms) {
            delete next[u.id];
          }
          return next;
        });
      }

      showNotice(`💾 บันทึกรหัส PIN ระดับชั้น ${grade} สำเร็จเรียบร้อยแล้ว (${roomsInGrade.length} ห้อง)`);
    } catch (err: any) {
      console.error("Save grade pins error:", err);
      alert("เกิดข้อผิดพลาดในการบันทึกรหัส PIN: " + (err?.message || err));
    } finally {
      setGradeSaving((prev) => ({ ...prev, [grade]: false }));
    }
  };

  // Copy all PINs for a grade to clipboard for LINE forwarding
  const handleCopyGradePins = (grade: string) => {
    const roomsInGrade = classrooms
      .filter((c) => c.grade === grade)
      .sort((a, b) => a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true }));

    const activeTermObj = terms.find((t) => t.isActive) || terms[0];
    const termLabel = activeTermObj ? `ภาคเรียนที่ ${activeTermObj.term}/${activeTermObj.year}` : "ภาคเรียนที่ 2/2569";
    let text = `📌 รหัส PIN เข้าเช็คชื่อ ระดับชั้น ${grade}\nโรงเรียนหนองวัวซอพิทยาคม (${termLabel})\n----------------------------\n`;
    for (const r of roomsInGrade) {
      const pin = gradeDraftPins[r.id] || r.pinCode;
      text += `• ห้อง ${r.gradeRoom} : PIN [ ${pin} ]\n`;
    }
    text += `\n* หมายเหตุ: สำหรับหัวหน้าห้องใช้ล็อกอินเข้าเช็คชื่อ ห้ามเผยแพร่ข้ามห้อง`;

    navigator.clipboard.writeText(text);
    setCopiedGrade(grade);
    setTimeout(() => setCopiedGrade(null), 2500);
    showNotice(`📋 คัดลอกรหัส PIN ระดับชั้น ${grade} แล้ว พร้อมวางใน LINE ได้ทันที`);
  };

  const handleDeleteClassroom = async (id: string, name: string) => {
    if (!confirm(`ต้องการลบห้อง "${name}" หรือไม่?`)) return;
    await deleteClassroom(id);
    setClassrooms(classrooms.filter((c) => c.id !== id));
    showNotice(`ลบห้องเรียนสำเร็จ`);
  };

  // ==================== TAB 6: SETTINGS HANDLERS ====================
  const [newTermYear, setNewTermYear] = useState("2568");
  const [newTermNumber, setNewTermNumber] = useState("1");

  const handleAddTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    const newTerm: AcademicTerm = {
      id: `term_${newTermYear}_${newTermNumber}`,
      year: newTermYear,
      term: newTermNumber,
      isActive: false,
      createdAt: new Date().toISOString(),
    };
    await saveTerm(newTerm);
    const updated = await getTerms();
    setTerms(updated);
    showNotice(`เพิ่มภาคเรียน ${newTermNumber}/${newTermYear} สำเร็จ`);
  };

  const handleSetActiveTerm = async (termId: string) => {
    await setActiveTerm(termId);
    const updated = await getTerms();
    setTerms(updated);
    showNotice("ตั้งค่าภาคเรียนปัจจุบันเรียบร้อยแล้ว");
  };

  const handleAddSigner = () => {
    const list = schoolProfile.signers || [];
    const newSigner = {
      id: `signer_${Date.now()}`,
      name: "",
      position: "",
      roleTitle: list.length === 0 ? "ผู้ตรวจสอบข้อมูล" : "ผู้รับรองรายงาน",
    };
    setSchoolProfile({
      ...schoolProfile,
      signers: [...list, newSigner],
    });
  };

  const handleUpdateSigner = (
    index: number,
    field: "name" | "position" | "roleTitle",
    val: string
  ) => {
    const list = [...(schoolProfile.signers || [])];
    list[index] = { ...list[index], [field]: val };
    setSchoolProfile({ ...schoolProfile, signers: list });
  };

  const handleDeleteSigner = (index: number) => {
    const list = [...(schoolProfile.signers || [])];
    list.splice(index, 1);
    setSchoolProfile({ ...schoolProfile, signers: list });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSchoolProfile(schoolProfile);
    showNotice("บันทึกข้อมูลสถานศึกษาและรายชื่อผู้ลงนามเรียบร้อยแล้ว");
  };

  const handleSavePeriods = async (e: React.FormEvent) => {
    e.preventDefault();
    await savePeriodSettings(periods);
    showNotice("บันทึกช่วงเวลาคาบเรียนสำเร็จ");
  };

  const handlePeriodChange = (index: number, field: "startTime" | "endTime", val: string) => {
    const updated = [...periods];
    updated[index][field] = val;
    setPeriods(updated);
  };

  // Reset to Demo Data
  const handleResetSampleData = async () => {
    if (!confirm("คุณต้องการรีเซ็ตข้อมูลเป็นตัวอย่างเริ่มต้น (Demo) ทั้งหมดใช่หรือไม่?")) return;
    await resetToSampleData();
    await loadAllData();
    showNotice("รีเซ็ตข้อมูลเป็นตัวอย่างเริ่มต้นเรียบร้อยแล้ว");
  };

  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);

  // Sync Master Data to Cloud Firestore
  const handleSyncFirebase = async () => {
    if (
      !confirm(
        "ต้องการนำข้อมูลหลักของโรงเรียน (ครู 56 ท่าน, 27 ห้องเรียน, รายวิชา, ตารางสอน ภาคเรียนที่ 2/2569) ซิงก์ขึ้นสู่ฐานข้อมูล Cloud Firestore หรือไม่?"
      )
    )
      return;
    setIsSyncingFirebase(true);
    try {
      const res = await syncAllToFirestore();
      await loadAllData();
      showNotice(res.message, "success");
    } catch (e: any) {
      showNotice(e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ Firebase", "error");
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  // ==================== LOGIN VIEW ====================
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-indigo-100 text-indigo-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">
            เข้าสู่ระบบผู้ดูแลระบบ (Admin)
          </h2>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {loginError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{loginError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ชื่อผู้ใช้ (Username)
            </label>
            <input
              type="text"
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              รหัสผ่าน (Password)
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 text-sm"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md shadow-indigo-600/25 mt-2"
          >
            เข้าสู่ระบบหลังบ้าน
          </button>
        </form>
      </div>
    );
  }

  // ==================== AUTHENTICATED ADMIN DASHBOARD ====================
  return (
    <>
      <div className={`space-y-6 ${pdfModalOpen || showQrModal || showPinPrintModal || showSubPdfModal || showMatrixModal ? "no-print" : ""}`}>
      {/* Admin Top Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>ฝ่ายวิชาการ &bull; จัดการข้อมูลระบบ (Class Check Admin)</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            ศูนย์บริหารจัดการระบบ
          </h1>
          <p className="text-slate-300 text-xs mt-0.5">
            โรงเรียน: {schoolProfile.schoolName || "กำลังโหลด..."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncFirebase}
            disabled={isSyncingFirebase}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
            title="ซิงก์ข้อมูลครู ห้องเรียน ตารางสอน และภาคเรียนขึ้นสู่ Cloud Firestore"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isSyncingFirebase ? "animate-bounce" : ""}`} />
            <span>{isSyncingFirebase ? "กำลังซิงก์..." : "ซิงก์ขึ้น Firebase"}</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Global Alert Notice */}
      {notice && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-sm animate-in fade-in ${
            notice.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-300"
              : "bg-rose-50 text-rose-900 border border-rose-300"
          }`}
        >
          {notice.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex flex-wrap gap-1">
        {[
          { id: "reports", label: "ออกรายงาน PDF / Excel", icon: Printer },
          { id: "attendance", label: "ตรวจสอบการบันทึกเข้าสอน", icon: ClipboardList },
          { id: "substitute", label: "จัดสอนแทน (OCR & สถิติ)", icon: Sparkles },
          { id: "timetable", label: "ตารางสอน (Excel)", icon: Calendar },
          { id: "teachers", label: "ข้อมูลครูผู้สอน", icon: Users },
          { id: "subjects", label: "รายวิชา", icon: BookOpen },
          { id: "classrooms", label: "ห้องเรียน & PIN", icon: School },
          { id: "settings", label: "ตั้งค่าระบบ & เทอม", icon: Settings },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                isActive
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================== */}
      {/* TAB 1: OFFICIAL REPORTS & EXPORT */}
      {/* ========================================================== */}
      {activeTab === "reports" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-5">
              <h2 className="text-base font-bold text-slate-800">
                ระบบส่งออกรายงานทางการ (Official PDF & Excel)
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {/* Select Term */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  เลือกภาคเรียน / ปีการศึกษา
                </label>
                <select
                  value={pdfTermId}
                  onChange={(e) => setPdfTermId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      เทอม {t.term}/{t.year} {t.isActive ? "(ปัจจุบัน)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Teacher */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  เลือกครูผู้สอน (หรือสรุปทุกคน)
                </label>
                <select
                  value={pdfSelectedTeacherId}
                  onChange={(e) => setPdfSelectedTeacherId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                >
                  <option value="all">-- สรุปภาพรวมครูทุกคน ({teachers.length} ท่าน) --</option>
                  {DEPARTMENTS.map((dept) => {
                    const deptTeachers = sortedTeachersByDept.filter(
                      (t) =>
                        t.department === dept ||
                        t.department.replace("กลุ่มสาระการเรียนรู้", "").trim() ===
                          dept.replace("กลุ่มสาระการเรียนรู้", "").trim()
                    );
                    if (deptTeachers.length === 0) return null;
                    return (
                      <optgroup key={dept} label={`📂 ${dept}`}>
                        {deptTeachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.prefix}{t.fullName}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {(() => {
                    const otherTeachers = sortedTeachersByDept.filter((t) => {
                      const cleanT = (t.department || "").replace("กลุ่มสาระการเรียนรู้", "").trim();
                      return !DEPARTMENTS.some(
                        (d) =>
                          d.includes(cleanT) ||
                          cleanT.includes(d.replace("กลุ่มสาระการเรียนรู้", "").trim())
                      );
                    });
                    if (otherTeachers.length === 0) return null;
                    return (
                      <optgroup label="📂 อื่นๆ / ไม่ระบุกลุ่มสาระ">
                        {otherTeachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.prefix}{t.fullName} ({t.department || "ไม่ระบุ"})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })()}
                </select>
              </div>

              {/* Select Time Range */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  รูปแบบช่วงเวลาที่รายงาน
                </label>
                <select
                  value={pdfTimeRange}
                  onChange={(e) => setPdfTimeRange(e.target.value as any)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                >
                  <option value="custom">📅 กำหนดช่วงวันที่เอง (ปฏิทิน)</option>
                  <option value="week">รายงานประจำสัปดาห์ (7 วันล่าสุด)</option>
                  <option value="month">รายงานประจำเดือน (เดือนนี้)</option>
                  <option value="term">รายงานทั้งภาคเรียน</option>
                </select>
              </div>

              {/* Date Range Calendar Pickers */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    วันเริ่มต้น
                  </label>
                  <input
                    type="date"
                    value={pdfStartDate}
                    onChange={(e) => setPdfStartDate(e.target.value)}
                    disabled={pdfTimeRange !== "custom"}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    วันสิ้นสุด
                  </label>
                  <input
                    type="date"
                    value={pdfEndDate}
                    onChange={(e) => setPdfEndDate(e.target.value)}
                    disabled={pdfTimeRange !== "custom"}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <span className="text-xs text-sky-800 bg-sky-50 px-3 py-1.5 rounded-lg inline-block border border-sky-200">
                📊 รายงาน: <strong>{pdfDateRangeLabel}</strong> &bull; พบประวัติการสอน {filteredPdfRecords.length} รายการ
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={handleOpenPdf}
                className="px-6 py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>เปิดดูและพิมพ์รายงานทางการ (PDF)</span>
              </button>

              <button
                onClick={() => {
                  const label = `${currentPdfTermObj?.year || "2567"}_term${currentPdfTermObj?.term || "1"}_${pdfTimeRange}`;
                  exportAttendanceToExcel(
                    filteredPdfRecords,
                    schoolProfile.schoolName || "โรงเรียน",
                    label
                  );
                }}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>ส่งออกข้อมูลดิบเป็น Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => setShowQrModal(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                <span>พิมพ์แผ่น QR Code ประจำห้อง (27 ห้อง)</span>
              </button>

              <button
                onClick={() => setShowSubPdfModal(true)}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>พิมพ์รายงานสถิติสอนแทนทางการ (PDF)</span>
              </button>

              <button
                onClick={() => setShowMatrixModal(true)}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>ตารางสรุปการเช็คชื่อ 27 ห้อง (1 หน้า A4)</span>
              </button>
            </div>
          </div>

          {/* Quick Stats on selected scope */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 flex items-center justify-between">
            <span>
              พบข้อมูลบันทึกการสอนที่ตรงกับเงื่อนไข:{" "}
              <strong className="text-slate-900 text-sm font-bold">
                {filteredPdfRecords.length} รายการ
              </strong>
            </span>
            <span className="text-slate-400">
              พร้อมส่งออกทั้งรูปแบบ A4 และ Excel Spreadsheet
            </span>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB: ATTENDANCE RECORDS MONITORING (ADMIN CENTRALIZED BACKEND) */}
      {/* ========================================================== */}
      {activeTab === "attendance" && (
        <div className="space-y-6">
          {/* Main Card Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800">
                    ระบบตรวจสอบการบันทึกเข้าสอนแบบเรียลไทม์ (Live Attendance Feed)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  ตรวจสอบรายการเข้าสอนที่บันทึกเข้ามาจากทุกห้องเรียน ค้นหา กรองข้อมูล และแก้ไขหรือลบรายการที่บันทึกผิดพลาดได้ทันที
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedLogIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchDeleteLogs}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ลบที่เลือก ({selectedLogIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowMatrixModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-sm active:scale-95"
                  title="เปิดดูตารางสรุปการเช็คเวลาเรียน 27 ห้องเรียนและพิมพ์ออก 1 หน้า A4"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>ตารางสรุป 27 ห้อง (1 หน้า A4)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const activeTerm = terms.find((t) => t.id === pdfTermId) || terms[0];
                    exportAttendanceToExcel(
                      filteredAdminAttendance,
                      schoolProfile.schoolName,
                      `ภาคเรียนที่ ${activeTerm?.term || "2"}/${activeTerm?.year || "2569"}`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>ส่งออก Excel ({filteredAdminAttendance.length})</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoCleanAndRepairLogs}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-all shadow-sm active:scale-95"
                  title="ตรวจสอบและแก้ไขคาบเรียนที่บันทึกผิดพลาด/ซ้ำซ้อนให้ตรงกับตารางสอนจริง"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>🧹 ซ่อมแซมและล้างข้อมูลซ้ำ</span>
                </button>
              </div>
            </div>

            {/* Live KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 font-medium">บันทึกทั้งหมด (ช่วงที่เลือก)</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-800 mt-1">
                  {adminAttendanceKpis.total}{" "}
                  <span className="text-xs font-normal text-slate-500">คาบ</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="text-xs text-emerald-700 font-medium">เข้าสอนตรงเวลา</div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-800 mt-1">
                  {adminAttendanceKpis.onTime}{" "}
                  <span className="text-xs font-semibold text-emerald-600">
                    ({adminAttendanceKpis.onTimePct}%)
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
                <div className="text-xs text-amber-700 font-medium">เข้าสอนสาย &gt;10 นาที</div>
                <div className="text-xl sm:text-2xl font-bold text-amber-800 mt-1">
                  {adminAttendanceKpis.late}{" "}
                  <span className="text-xs font-semibold text-amber-600">
                    ({adminAttendanceKpis.latePct}%)
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200">
                <div className="text-xs text-rose-700 font-medium">ไม่เข้าสอน</div>
                <div className="text-xl sm:text-2xl font-bold text-rose-800 mt-1">
                  {adminAttendanceKpis.absent}{" "}
                  <span className="text-xs font-semibold text-rose-600">
                    ({adminAttendanceKpis.absentPct}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Filter and Search Toolbar */}
            <div className="space-y-3 p-4 rounded-xl bg-slate-50/80 border border-slate-200 mb-6">
              {/* Quick Date Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-200/80">
                <span className="text-xs font-bold text-slate-600 mr-2 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  ช่วงเวลา:
                </span>
                {[
                  { id: "today", label: "วันนี้" },
                  { id: "yesterday", label: "เมื่อวาน" },
                  { id: "week", label: "7 วันล่าสุด" },
                  { id: "month", label: "เดือนนี้" },
                  { id: "all", label: "ทั้งหมด" },
                  { id: "custom", label: "กำหนดเอง" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAttDateFilter(item.id as any)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all ${
                      attDateFilter === item.id
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Advanced Dropdowns & Custom Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {/* Search */}
                <div className="md:col-span-2 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={attSearch}
                    onChange={(e) => setAttSearch(e.target.value)}
                    placeholder="ค้นหาชื่อครู, รหัส/ชื่อวิชา, ห้อง, หรือผู้บันทึก..."
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {attSearch && (
                    <button
                      type="button"
                      onClick={() => setAttSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Classroom Filter */}
                <div>
                  <select
                    value={attClassroomFilter}
                    onChange={(e) => setAttClassroomFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">-- ทุกห้องเรียน ({classrooms.length} ห้อง) --</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        ห้อง {c.gradeRoom}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <select
                    value={attStatusFilter}
                    onChange={(e) => setAttStatusFilter(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">-- ทุกสถานะเข้าสอน --</option>
                    <option value="on_time">เข้าสอนตรงเวลา</option>
                    <option value="late">เข้าสอนสาย (&gt;10 นาที)</option>
                    <option value="absent">ไม่เข้าสอน</option>
                  </select>
                </div>

                {/* Department Filter */}
                <div>
                  <select
                    value={attDeptFilter}
                    onChange={(e) => setAttDeptFilter(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">-- ทุกกลุ่มสาระฯ --</option>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept.replace("กลุ่มสาระการเรียนรู้", "สาระฯ ")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Date Pickers */}
              {attDateFilter === "custom" && (
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200/80">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600 font-medium">ตั้งแต่วันที่:</span>
                    <input
                      type="date"
                      value={attStartDate}
                      onChange={(e) => setAttStartDate(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600 font-medium">ถึงวันที่:</span>
                    <input
                      type="date"
                      value={attEndDate}
                      onChange={(e) => setAttEndDate(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Attendance Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAllLogs}
                        className="text-slate-500 hover:text-slate-700"
                        title="เลือกทั้งหมด"
                      >
                        {selectedLogIds.length === filteredAdminAttendance.length && filteredAdminAttendance.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="p-3 whitespace-nowrap">วันที่ / คาบ</th>
                    <th className="p-3 whitespace-nowrap">ห้องเรียน</th>
                    <th className="p-3 whitespace-nowrap">วิชาที่สอน</th>
                    <th className="p-3 whitespace-nowrap">ครูผู้สอน</th>
                    <th className="p-3 whitespace-nowrap">สถานะการเข้าสอน</th>
                    <th className="p-3 whitespace-nowrap">ผู้บันทึก / วันเวลา</th>
                    <th className="p-3 text-center whitespace-nowrap">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAdminAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        ไม่พบข้อมูลการเข้าสอนตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredAdminAttendance.map((log) => {
                      const isSelected = selectedLogIds.includes(log.id);
                      return (
                        <tr
                          key={log.id}
                          className={`transition-colors ${
                            isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectLog(log.id)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="p-3 whitespace-nowrap font-medium text-slate-800">
                            <div>{formatThaiDateLong(log.date)}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {log.periodStart === log.periodEnd
                                ? `คาบที่ ${log.periodStart}`
                                : `คาบคู่ ${log.periodStart}-${log.periodEnd}`}
                            </div>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {log.gradeRoom}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800">
                              {log.subjectCode || log.subjectName ? (
                                `${log.subjectCode} ${log.subjectName}`.trim()
                              ) : (
                                (() => {
                                  const s =
                                    subjects.find(
                                      (sub) =>
                                        sub.id === log.subjectId ||
                                        (log.subjectId &&
                                          sub.code === log.subjectId.replace(/^subj_/, ""))
                                    ) ||
                                    timetable.find((t: any) => t.subjectId === log.subjectId);
                                  return s
                                    ? `${(s as any).code || (s as any).subjectCode || ""} ${(s as any).name || (s as any).subjectName || ""}`.trim()
                                    : log.subjectId
                                    ? log.subjectId.replace(/^subj_/, "")
                                    : "ไม่ระบุวิชา";
                                })()
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800">
                              {log.teacherName}
                            </div>
                            {log.isSubstitute && (
                              <div className="text-[11px] text-emerald-700 font-medium">
                                ⭐ ปฏิบัติหน้าที่สอนแทน
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {log.status === "on_time" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                ตรงเวลา
                              </span>
                            )}
                            {log.status === "late" && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                สาย &gt;10 นาที
                              </span>
                            )}
                            {log.status === "absent" && (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                                  <XCircle className="w-3 h-3 text-rose-600" />
                                  ไม่เข้าสอน
                                  {log.absenceNote
                                    ? ` (${log.absenceNote})`
                                    : log.absenceReason
                                    ? ` (${
                                        log.absenceReason === "meeting"
                                          ? "ประชุม"
                                          : log.absenceReason === "activity"
                                          ? "กิจกรรมสำคัญ"
                                          : log.absenceReason === "official"
                                          ? "ไปราชการ"
                                          : log.absenceReason === "personal"
                                          ? "ลากิจ"
                                          : log.absenceReason === "sick"
                                          ? "ลาป่วย"
                                          : "เหตุผลอื่นๆ"
                                      })`
                                    : ""}
                                </span>
                                {log.absenceNote && log.absenceReason && log.absenceReason !== "other" && (
                                  <div className="text-[10px] text-rose-700 italic">
                                    หมายเหตุ: {log.absenceNote}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 whitespace-nowrap text-slate-600">
                            <div>ผู้บันทึก: <strong>{log.recordedByStudent || "ไม่ระบุ"}</strong></div>
                            {log.editHistory && log.editHistory.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => setHistoryViewRecord(log)}
                                className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors border border-amber-300 shadow-xs cursor-pointer"
                                title="คลิกเพื่อดูประวัติและรายละเอียดการแก้ไขทั้งหมด"
                              >
                                <Clock className="w-3 h-3 text-amber-700" />
                                <span>ประวัติแก้ไข ({log.editHistory.length} ครั้ง)</span>
                              </button>
                            ) : log.updatedAt ? (
                              <button
                                type="button"
                                onClick={() => setHistoryViewRecord(log)}
                                className="mt-1 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors border border-amber-300 shadow-xs cursor-pointer"
                                title="คลิกเพื่อดูรายละเอียดการแก้ไข"
                              >
                                <Clock className="w-3 h-3 text-amber-700" />
                                <span>แก้ไขเมื่อ {new Date(log.updatedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</span>
                              </button>
                            ) : null}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLog(log);
                                  setShowEditLogModal(true);
                                }}
                                className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all shadow-xs"
                                title="แก้ไขรายการนี้ (ในฐานะแอดมิน)"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdminDeleteLog(log.id)}
                                className="p-1.5 rounded-lg text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all shadow-xs"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>แสดงทั้งหมด {filteredAdminAttendance.length} รายการ</span>
              {selectedLogIds.length > 0 && (
                <span className="font-semibold text-indigo-700">
                  เลือกอยู่ {selectedLogIds.length} รายการ
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB: SUBSTITUTE TEACHING SYSTEM (ADMIN CENTRALIZED & OCR) */}
      {/* ========================================================== */}
      {activeTab === "substitute" && (
        <div className="space-y-6">
          {/* Hero Auto-Sync Card: nongwuaso-sub.netlify.app */}
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-indigo-700/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Auto-Sync ทุกเช้า 08:30 น. (จันทร์ - ศุกร์)
                  </span>
                  <a
                    href="https://nongwuaso-sub.netlify.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 transition-colors"
                  >
                    nongwuaso-sub.netlify.app ↗
                  </a>
                </div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
                  ดึงและซิงก์ข้อมูลจัดสอนแทนอัตโนมัติ
                </h3>
                <p className="text-xs text-indigo-200/80 max-w-2xl leading-relaxed">
                  ระบบจะดึงข้อมูลการจัดสอนแทนจากเว็บ Nongwuaso-sub อัตโนมัติทุกเช้า 08:30 น. (ก่อนคาบ 1) พร้อมจับคู่ครูผู้สอน ห้องเรียน และรหัสวิชาในระบบทันที หรือเลือกวันที่แล้วกดปุ่มสั่งซิงก์ด้วยตนเองได้ทันที
                </p>
              </div>

              {/* Sync Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={syncTargetDate}
                    onChange={(e) => setSyncTargetDate(e.target.value)}
                    className="bg-white text-slate-800 text-xs font-medium px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setSyncTargetDate(getThaiDateString())}
                    className="px-2.5 py-2 text-xs font-medium bg-indigo-700/60 hover:bg-indigo-600/80 text-white rounded-lg transition-colors whitespace-nowrap"
                    title="เลือกวันที่ปัจจุบัน"
                  >
                    วันนี้
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleTriggerNetlifySync()}
                  disabled={isSyncingSub}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-slate-900 font-bold text-xs rounded-lg shadow-md transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {isSyncingSub ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                      <span>กำลังซิงก์ข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-slate-900" />
                      <span>⚡ ซิงก์ข้อมูลทันที</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sync Feedback Box */}
            {lastSyncResult && (
              <div className="mt-4 pt-4 border-t border-indigo-700/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {lastSyncResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className={lastSyncResult.success ? "text-emerald-200 font-medium" : "text-rose-200 font-medium"}>
                    {lastSyncResult.message}
                  </span>
                  {lastSyncResult.syncedAt && (
                    <span className="text-[11px] text-indigo-300/80 bg-white/10 px-2 py-0.5 rounded">
                      (เมื่อ {new Date(lastSyncResult.syncedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น. วันที่ {lastSyncResult.date})
                    </span>
                  )}
                </div>
                {lastSyncResult.success && lastSyncResult.totalSynced > 0 && (
                  <div className="flex items-center gap-3 text-indigo-200">
                    <span>มีผู้สอนแทน: <strong className="text-white">{lastSyncResult.assignedCount}</strong> คาบ</span>
                    <span>รอจัดสอนแทน: <strong className="text-amber-300">{lastSyncResult.unassignedCount}</strong> คาบ</span>
                    <button
                      type="button"
                      onClick={() => setSubTab("history")}
                      className="text-amber-300 hover:text-amber-200 underline text-xs font-semibold"
                    >
                      ดูในแท็บประวัติ →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Main Card Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800">
                    ระบบจัดสอนแทน &amp; นำเข้ารายงาน PDF OCR
                  </h2>
                </div>
              </div>

              {/* Sub-tab switcher */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setSubTab("excel")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    subTab === "excel"
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>นำเข้าไฟล์ Excel / CSV (แนะนำ)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("ocr")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    subTab === "ocr"
                      ? "bg-white text-sky-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>นำเข้า (PDF OCR)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSubTab("history")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    subTab === "history"
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>ประวัติ &amp; สถิติ ({substitutes.length})</span>
                </button>
              </div>
            </div>

            {/* TAB CONTENT 1: EXCEL IMPORTER */}
            {subTab === "excel" && (
              <div>
                <SubstituteExcelImporter
                  teachers={teachers}
                  classrooms={classrooms}
                  subjects={subjects}
                  timetable={timetable}
                  activeTerm={terms.find((t) => t.isActive) || terms[0] || null}
                  onImportComplete={async (count: number) => {
                    const updated = await getSubstituteAssignments();
                    setSubstitutes(updated);
                    showNotice(`บันทึกและนำเข้าข้อมูลจัดสอนแทนจากไฟล์ Excel สำเร็จเรียบร้อย (${count} คาบ)`, "success");
                    setSubTab("history");
                  }}
                />
              </div>
            )}

            {/* TAB CONTENT 2: OCR IMPORTER */}
            {subTab === "ocr" && (
              <div>
                <SubstituteOcrImporter
                  teachers={teachers}
                  classrooms={classrooms}
                  subjects={subjects}
                  timetable={timetable}
                  activeTerm={terms.find((t) => t.isActive) || terms[0] || null}
                  authDept="งานวิชาการ"
                  onImportComplete={async (count: number) => {
                    const updated = await getSubstituteAssignments();
                    setSubstitutes(updated);
                    showNotice(`บันทึกและนำเข้าข้อมูลจัดสอนแทนสำเร็จเรียบร้อย (${count} คาบ)`, "success");
                    setSubTab("history");
                  }}
                />
              </div>
            )}

            {/* TAB CONTENT 2: HISTORY & RETROSPECTIVE STATISTICS */}
            {subTab === "history" && (
              <div className="space-y-5">
                {/* Time & Department Filters */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Time Filter Buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-700 mr-1 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        ช่วงเวลา:
                      </span>
                      {[
                        { id: "today", label: "วันนี้" },
                        { id: "week", label: "7 วันล่าสุด" },
                        { id: "month", label: "เดือนนี้" },
                        { id: "all", label: "ทั้งหมด" },
                        { id: "custom", label: "📅 กำหนดช่วงเวลา (ปฏิทิน)" },
                      ].map((tf) => (
                        <button
                          key={tf.id}
                          type="button"
                          onClick={() => setSubTimeFilter(tf.id as any)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            subTimeFilter === tf.id
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                          }`}
                        >
                          {tf.label}
                        </button>
                      ))}
                    </div>

                    {/* Department Dropdown */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">กลุ่มสาระ:</span>
                      <select
                        value={subDeptFilter}
                        onChange={(e) => setSubDeptFilter(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">ทุกกลุ่มสาระการเรียนรู้</option>
                        {DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept.replace("กลุ่มสาระการเรียนรู้", "")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Calendar Date Pickers when 'custom' is active */}
                  {subTimeFilter === "custom" && (
                    <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 font-medium">ตั้งแต่วันที่:</span>
                        <input
                          type="date"
                          value={subStartDate}
                          onChange={(e) => setSubStartDate(e.target.value)}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 font-medium">ถึงวันที่:</span>
                        <input
                          type="date"
                          value={subEndDate}
                          onChange={(e) => setSubEndDate(e.target.value)}
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700"
                        />
                      </div>
                    </div>
                  )}

                  {/* Search Bar */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-md">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={subSearch}
                        onChange={(e) => setSubSearch(e.target.value)}
                        placeholder="ค้นหาชื่อครู, รหัสวิชา, ห้องเรียน..."
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <span className="text-xs text-slate-500">
                      พบ <strong>{filteredAdminSubstitutes.length}</strong> คาบสอนแทน
                    </span>
                  </div>
                </div>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  <div className="p-3 bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-100 shadow-sm">
                    <span className="text-[11px] font-semibold text-indigo-700">รวมคาบสอนแทน</span>
                    <div className="text-xl font-bold text-indigo-900 mt-1">
                      {adminSubKpis.totalPeriods} <span className="text-xs font-normal">คาบ</span>
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-sky-50 to-white rounded-xl border border-sky-100 shadow-sm">
                    <span className="text-[11px] font-semibold text-sky-700">ครูเข้าสอนแทน</span>
                    <div className="text-xl font-bold text-sky-900 mt-1">
                      {adminSubKpis.substituteTeachersCount} <span className="text-xs font-normal">ท่าน</span>
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-rose-50 to-white rounded-xl border border-rose-100 shadow-sm">
                    <span className="text-[11px] font-semibold text-rose-700">ครูที่ลา/ราชการ</span>
                    <div className="text-xl font-bold text-rose-900 mt-1">
                      {adminSubKpis.absentTeachersCount} <span className="text-xs font-normal">ท่าน</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-amber-700">ลาป่วย</span>
                    <div className="text-xl font-bold text-amber-900 mt-1">
                      {adminSubKpis.sickCount} <span className="text-xs font-normal">คาบ</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-blue-700">ลากิจ</span>
                    <div className="text-xl font-bold text-blue-900 mt-1">
                      {adminSubKpis.personalCount} <span className="text-xs font-normal">คาบ</span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-semibold text-purple-700">ไปราชการ</span>
                    <div className="text-xl font-bold text-purple-900 mt-1">
                      {adminSubKpis.officialCount} <span className="text-xs font-normal">คาบ</span>
                    </div>
                  </div>
                </div>

                {/* Sub-view toggle & Excel export button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setSubHistoryView("teachers")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        subHistoryView === "teachers"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      สถิติครูผู้เข้าสอนแทน ({substituteTeacherStats.length} ท่าน)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubHistoryView("schedule")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        subHistoryView === "schedule"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      รายการจัดสอนแทนรายคาบ ({filteredAdminSubstitutes.length} รายการ)
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSubPdfModal(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
                    >
                      <Printer className="w-4 h-4" />
                      พิมพ์รายงานทางการ (PDF)
                    </button>

                    {subHistoryView === "teachers" && (
                      <button
                        type="button"
                        onClick={handleExportSubstituteStats}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        ส่งออกสถิติสอนแทน (Excel)
                      </button>
                    )}
                  </div>
                </div>

                {filteredAdminSubstitutes.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                    <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-slate-600">
                      ไม่พบข้อมูลการจัดสอนแทนในช่วงเวลาที่เลือก
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      คุณสามารถนำเข้ารายงานประจำวันจากไฟล์ PDF โดยกดที่แท็บ &ldquo;นำเข้ารายงาน (PDF OCR)&rdquo; ด้านบน
                    </p>
                  </div>
                ) : subHistoryView === "teachers" ? (
                  /* Teachers Substitution Statistics Table */
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                          <th className="p-3 w-10 text-center">#</th>
                          <th className="p-3 whitespace-nowrap">ครูผู้เข้าสอนแทน</th>
                          <th className="p-3 whitespace-nowrap">กลุ่มสาระการเรียนรู้</th>
                          <th className="p-3 whitespace-nowrap text-center">จำนวนคาบสอนแทน</th>
                          <th className="p-3 whitespace-nowrap">ปฏิบัติหน้าที่แทนครู</th>
                          <th className="p-3 whitespace-nowrap">ห้องเรียนที่สอนแทน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {substituteTeacherStats.map((stat, idx) => (
                          <tr key={stat.teacherId || stat.teacherName} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                                <span className="text-sm">{stat.teacherName}</span>
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap text-slate-600">
                              <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700">
                                {stat.department.replace("กลุ่มสาระการเรียนรู้", "")}
                              </span>
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {stat.totalPeriods} คาบ
                              </span>
                            </td>
                            <td className="p-3 text-slate-700">
                              <div className="flex flex-wrap gap-1 max-w-[280px]">
                                {stat.replacedTeachers.map((tch, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-amber-50 text-amber-800 border border-amber-200 font-medium"
                                  >
                                    {tch}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1 max-w-[220px]">
                                {stat.rooms.map((room, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200"
                                  >
                                    {room}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Individual Substitution Periods Table */
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                          <th className="p-3 w-10 text-center">#</th>
                          <th className="p-3 whitespace-nowrap">วันที่ / คาบ</th>
                          <th className="p-3 whitespace-nowrap text-center">ห้องเรียน</th>
                          <th className="p-3 whitespace-nowrap">วิชา</th>
                          <th className="p-3 whitespace-nowrap">ครูที่ลา (ประเภท)</th>
                          <th className="p-3 whitespace-nowrap">ครูที่เข้าสอนแทน</th>
                          <th className="p-3">หมายเหตุ</th>
                          <th className="p-3 text-center w-16">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredAdminSubstitutes.map((sub, idx) => {
                          const leaveBadgeClass =
                            sub.leaveType === "sick"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : sub.leaveType === "personal"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-purple-50 text-purple-700 border-purple-200";

                          const leaveLabel =
                            sub.leaveType === "sick"
                              ? "ลาป่วย"
                              : sub.leaveType === "personal"
                              ? "ลากิจ"
                              : sub.leaveType === "official"
                              ? "ไปราชการ"
                              : "ลา";

                          return (
                            <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                              <td className="p-3 whitespace-nowrap">
                                <div className="font-semibold text-slate-800">{sub.date}</div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  คาบที่ {sub.periodStart}
                                  {sub.periodEnd && sub.periodEnd !== sub.periodStart
                                    ? ` - ${sub.periodEnd}`
                                    : ""}
                                </div>
                              </td>
                              <td className="p-3 text-center whitespace-nowrap">
                                <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800">
                                  {sub.gradeRoom}
                                </span>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <div className="font-bold text-slate-800">{sub.subjectCode}</div>
                                <div className="text-[11px] text-slate-500 truncate max-w-[140px]">
                                  {sub.subjectName}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <div className="font-medium text-slate-900">{sub.originalTeacherName}</div>
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${leaveBadgeClass} mt-0.5`}
                                >
                                  {leaveLabel}
                                </span>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <div className="font-bold text-indigo-900 flex items-center gap-1">
                                  <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                  <span>{sub.substituteTeacherName}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                  {sub.substituteDepartment?.replace("กลุ่มสาระการเรียนรู้", "") ||
                                    sub.department.replace("กลุ่มสาระการเรียนรู้", "")}
                                </div>
                              </td>
                              <td className="p-3 text-slate-600 text-[11px] max-w-[160px] truncate">
                                {sub.note && !sub.note.startsWith("นำเข้าอัตโนมัติ") ? sub.note : "-"}
                              </td>
                              <td className="p-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubstitute(sub.id)}
                                  className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                                  title="ยกเลิก/ลบรายการสอนแทนนี้"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 2: TIMETABLE MANAGEMENT */}
      {/* ========================================================== */}
      {activeTab === "timetable" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  จัดการตารางสอนประจำภาคเรียน (Timetable)
                </h2>
              </div>

              {/* Excel Import & Template Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowSchoolImporter(true)}
                  className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>นำเข้าจากโปรแกรมจัดตารางสอน (CSV / Excel)</span>
                </button>

                <button
                  onClick={downloadTimetableTemplate}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 border border-slate-200"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>เทมเพลต Excel เปล่า</span>
                </button>

                <label className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer border border-slate-200 transition-all flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-slate-600" />
                  <span>นำเข้าไฟล์ Excel</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleTimetableImport}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Timetable List Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">วัน</th>
                    <th className="py-3 px-3 text-center">คาบเรียน</th>
                    <th className="py-3 px-3">ห้องเรียน</th>
                    <th className="py-3 px-3">รหัสวิชา & วิชา</th>
                    <th className="py-3 px-3">ครูผู้สอน</th>
                    <th className="py-3 px-3 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {timetable.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        ยังไม่มีข้อมูลตารางสอน กรุณานำเข้าจากไฟล์ Excel ด้านบน
                      </td>
                    </tr>
                  ) : (
                    timetable.map((tt) => {
                      const dayObj = THAI_DAYS.find((d) => d.id === tt.dayOfWeek);
                      return (
                        <tr key={tt.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {dayObj?.full || `วัน${tt.dayOfWeek}`}
                          </td>
                          <td className="py-3 px-3 text-center font-mono">
                            {tt.periodStart === tt.periodEnd
                              ? `คาบ ${tt.periodStart}`
                              : `คาบคู่ ${tt.periodStart}-${tt.periodEnd}`}
                          </td>
                          <td className="py-3 px-3 font-medium text-sky-700">
                            ห้อง {tt.gradeRoom}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold">{tt.subjectCode}</span>{" "}
                            {tt.subjectName}
                          </td>
                          <td className="py-3 px-3 font-medium text-slate-800">
                            {tt.teacherName}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={async () => {
                                if (confirm("ต้องการลบคาบสอนนี้ออกจากตารางหรือไม่?")) {
                                  await deleteTimetableEntry(tt.id);
                                  setTimetable(timetable.filter((t) => t.id !== tt.id));
                                  showNotice("ลบรายการตารางสอนแล้ว");
                                }
                              }}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="ลบ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 3: TEACHERS MANAGEMENT */}
      {/* ========================================================== */}
      {/* ========================================================== */}
      {/* TAB 3: TEACHERS MANAGEMENT */}
      {/* ========================================================== */}
      {activeTab === "teachers" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span>รายชื่อครูผู้สอน</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-bold">
                    {teachers.length} ท่าน
                  </span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={downloadTeacherTemplate}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 border border-slate-200"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>ดาวน์โหลดเทมเพลตครู (Excel)</span>
                </button>

                <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-md transition-all flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>นำเข้าไฟล์รายชื่อครู (Excel)</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleTeacherExcelImport}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Quick Add Teacher Form */}
            <form onSubmit={handleAddTeacher} className="bg-slate-50 p-4 sm:p-5 rounded-xl mb-6 border border-slate-200/80">
              <div className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-600" />
                <span>เพิ่มรายชื่อครูใหม่</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">คำนำหน้า</label>
                  <select
                    value={newTeacher.prefix}
                    onChange={(e) => setNewTeacher({ ...newTeacher, prefix: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white font-medium"
                  >
                    <option value="นาย">นาย</option>
                    <option value="นาง">นาง</option>
                    <option value="นางสาว">นางสาว</option>
                    <option value="ครู">ครู</option>
                  </select>
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น สมหมาย ปัญญาดี"
                    value={newTeacher.fullName}
                    onChange={(e) => setNewTeacher({ ...newTeacher, fullName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">รหัสครู (เช่น T057)</label>
                  <input
                    type="text"
                    placeholder="เว้นว่างเพื่อสร้างอัตโนมัติ"
                    value={newTeacher.code}
                    onChange={(e) => setNewTeacher({ ...newTeacher, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white font-mono"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">กลุ่มสาระการเรียนรู้</label>
                  <select
                    value={newTeacher.department}
                    onChange={(e) => setNewTeacher({ ...newTeacher, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d.replace("กลุ่มสาระการเรียนรู้", "")}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1 flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <span>เพิ่ม</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาตามรหัสครู หรือชื่อ-นามสกุล..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                {teacherSearch && (
                  <button
                    onClick={() => setTeacherSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Department Filter */}
              <div className="sm:w-72">
                <select
                  value={teacherDeptFilter}
                  onChange={(e) => setTeacherDeptFilter(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">ทุกกลุ่มสาระการเรียนรู้ ({teachers.length} คน)</option>
                  {DEPARTMENTS.map((d) => {
                    const count = teachers.filter((t) => t.department === d).length;
                    return (
                      <option key={d} value={d}>
                        {d.replace("กลุ่มสาระการเรียนรู้", "")} ({count} คน)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Teachers Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5 w-24">รหัสครู</th>
                    <th className="py-3 px-3.5">ชื่อ - สกุล</th>
                    <th className="py-3 px-3.5">กลุ่มสาระการเรียนรู้</th>
                    <th className="py-3 px-3.5 text-center w-28">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {teachers
                    .filter((t) => {
                      const matchDept =
                        teacherDeptFilter === "all" || t.department === teacherDeptFilter;
                      const s = teacherSearch.trim().toLowerCase();
                      const matchSearch =
                        !s ||
                        t.fullName.toLowerCase().includes(s) ||
                        t.code.toLowerCase().includes(s) ||
                        (t.prefix && t.prefix.toLowerCase().includes(s));
                      return matchDept && matchSearch;
                    })
                    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
                    .map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3.5">
                          <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 text-[11px]">
                            {t.code}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-semibold text-slate-900">
                          {t.prefix}{t.fullName}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="text-slate-700">
                            {t.department}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setEditingTeacher({ ...t })}
                              className="px-2 py-1 rounded-lg text-slate-600 hover:text-sky-700 hover:bg-sky-50 transition-colors flex items-center gap-1 border border-slate-200 text-[11px]"
                              title="แก้ไขข้อมูล"
                            >
                              <Edit2 className="w-3 h-3 text-sky-600" />
                              <span>แก้ไข</span>
                            </button>

                            <button
                              onClick={() => handleDeleteTeacher(t.id, `${t.prefix}${t.fullName}`)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200"
                              title="ลบ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Teacher Edit Modal */}
            {editingTeacher && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                        <Edit2 className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-slate-800 text-base">
                        แก้ไขข้อมูลครูผู้สอน
                      </h3>
                    </div>
                    <button
                      onClick={() => setEditingTeacher(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleUpdateTeacher} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        รหัสครู (เช่น T001) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editingTeacher.code}
                        onChange={(e) =>
                          setEditingTeacher({ ...editingTeacher, code: e.target.value })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-sky-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          คำนำหน้า
                        </label>
                        <select
                          value={editingTeacher.prefix}
                          onChange={(e) =>
                            setEditingTeacher({ ...editingTeacher, prefix: e.target.value })
                          }
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-medium"
                        >
                          <option value="นาย">นาย</option>
                          <option value="นาง">นาง</option>
                          <option value="นางสาว">นางสาว</option>
                          <option value="ครู">ครู</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editingTeacher.fullName}
                          onChange={(e) =>
                            setEditingTeacher({ ...editingTeacher, fullName: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        กลุ่มสาระการเรียนรู้ <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={editingTeacher.department}
                        onChange={(e) =>
                          setEditingTeacher({ ...editingTeacher, department: e.target.value })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                        required
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditingTeacher(null)}
                        className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                      >
                        ยกเลิก
                      </button>

                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>บันทึกการแก้ไข</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 4: SUBJECTS MANAGEMENT */}
      {/* ========================================================== */}
      {/* ========================================================== */}
      {/* TAB 4: SUBJECTS MANAGEMENT */}
      {/* ========================================================== */}
      {activeTab === "subjects" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span>รายวิชาในหลักสูตร</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-bold">
                    {subjects.length} วิชา
                  </span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleSyncAllStandardSubjects}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>ซิงก์ 134 รายวิชามาตรฐาน</span>
                </button>

                <button
                  onClick={downloadSubjectTemplate}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 border border-slate-200"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>ดาวน์โหลดเทมเพลตรายวิชา (Excel)</span>
                </button>

                <label className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-md transition-all flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>นำเข้าไฟล์รายวิชา (Excel)</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleSubjectExcelImport}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            {/* Duplicate Subject Names Warning Banner */}
            {duplicateSubjectGroups.length > 0 && (
              <div className="bg-amber-50/90 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold text-amber-900">
                        ระบบตรวจสอบพบรายวิชาที่ใช้ชื่อซ้ำกัน ({duplicateSubjectGroups.length} กลุ่มวิชา)
                      </h3>
                      <p className="text-xs text-amber-700 mt-0.5">
                        ระบบใช้ <strong>&ldquo;รหัสวิชา&rdquo;</strong> เป็นคีย์หลักในการดึงข้อมูล แต่แนะนำให้ระบุระดับชั้นต่อท้ายชื่อวิชา เช่น เติม (ม.4), (ม.5) เพื่อความชัดเจนและป้องกันความสับสน
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-amber-200">
                  {duplicateSubjectGroups.map((group) => (
                    <div
                      key={group.name}
                      className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col justify-between gap-2 shadow-xs"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center justify-between gap-1.5">
                          <span className="truncate max-w-[200px]">วิชา &ldquo;{group.name}&rdquo;</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full shrink-0">
                            ซ้ำ {group.items.length} รหัส
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {group.items.map((s) => (
                            <div
                              key={s.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono"
                            >
                              <span className="font-bold text-indigo-700">{s.code}</span>
                              <span className="text-slate-500 font-sans text-[11px]">
                                ({s.assignedClassroomIds?.length ? s.assignedClassroomIds.map(cid => cid.replace('m', 'ม.').replace('_', '/')).join(', ') : 'ไม่ระบุห้อง'})
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingSubject(s)}
                                className="p-1 hover:bg-slate-200 rounded text-slate-500 hover:text-indigo-600 transition-colors"
                                title="คลิกเพื่อแก้ไขชื่อวิชานี้ (เช่น เติมระดับชั้น)"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Add Subject with Classroom Assignment */}
            <form onSubmit={handleAddSubject} className="bg-slate-50 p-4 sm:p-5 rounded-xl mb-6 border border-slate-200/80 space-y-4">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-sky-600" />
                <span>เพิ่มรายวิชาใหม่ &amp; กำหนดห้องเรียนที่เรียน</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    รหัสวิชา (เช่น ค21102) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ค21102"
                    value={newSubject.code}
                    onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white font-mono font-bold"
                    required
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    ชื่อรายวิชา <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น คณิตศาสตร์พื้นฐาน 2"
                    value={newSubject.name}
                    onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                    required
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    กลุ่มสาระการเรียนรู้ <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newSubject.department}
                    onChange={(e) => setNewSubject({ ...newSubject, department: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d.replace("กลุ่มสาระการเรียนรู้", "")}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Classroom Assignment Section */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <span>🏫 กำหนดห้องเรียนที่เรียนวิชานี้</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                      เลือกแล้ว {newSubject.assignedClassroomIds.length} ห้อง
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setNewSubject({
                          ...newSubject,
                          assignedClassroomIds: classrooms.map((c) => c.id),
                        })
                      }
                      className="px-2.5 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-semibold border border-sky-200 text-[11px]"
                    >
                      เลือกทุกห้อง (27 ห้อง)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewSubject({ ...newSubject, assignedClassroomIds: [] })
                      }
                      className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold border border-slate-200 text-[11px]"
                    >
                      ล้างการเลือก
                    </button>
                  </div>
                </div>

                {/* Grade Quick Selectors & Checkboxes */}
                <div className="space-y-2.5">
                  {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((g) => {
                    const gradeRooms = classrooms.filter((c) => c.grade === g);
                    const allSelected = gradeRooms.every((c) =>
                      newSubject.assignedClassroomIds.includes(c.id)
                    );
                    return (
                      <div
                        key={g}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 bg-slate-50/70 p-2 rounded-lg border border-slate-200/60"
                      >
                        <div className="sm:w-36 flex items-center justify-between shrink-0">
                          <span className="font-bold text-slate-700 text-xs">{g} ({gradeRooms.length} ห้อง):</span>
                          <button
                            type="button"
                            onClick={() => setGradeRoomsForNewSubject(g, !allSelected)}
                            className={`text-[10px] px-2 py-0.5 rounded font-bold border transition-colors ${
                              allSelected
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            {allSelected ? "✓ ครบระดับ" : "+ เลือกทั้งระดับ"}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          {gradeRooms.map((c) => {
                            const isChecked = newSubject.assignedClassroomIds.includes(c.id);
                            return (
                              <label
                                key={c.id}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-all ${
                                  isChecked
                                    ? "bg-sky-600 text-white font-bold border-sky-600 shadow-xs"
                                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleClassroomForNewSubject(c.id)}
                                  className="sr-only"
                                />
                                <span>{c.gradeRoom}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-6 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-md transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>บันทึกเพิ่มรายวิชา</span>
                </button>
              </div>
            </form>

            {/* Filter and Search Bar for Subjects */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 bg-slate-50/70 p-3 rounded-xl border border-slate-200/70">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ค้นหาตามรหัสวิชา หรือชื่อวิชา..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                {subjectSearch && (
                  <button
                    onClick={() => setSubjectSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Department Filter */}
              <div className="sm:w-72">
                <select
                  value={subjectDeptFilter}
                  onChange={(e) => setSubjectDeptFilter(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">ทุกกลุ่มสาระการเรียนรู้ ({subjects.length} วิชา)</option>
                  {DEPARTMENTS.map((d) => {
                    const count = subjects.filter((s) => s.department === d).length;
                    return (
                      <option key={d} value={d}>
                        {d.replace("กลุ่มสาระการเรียนรู้", "")} ({count} วิชา)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Subjects Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5 w-24">รหัสวิชา</th>
                    <th className="py-3 px-3.5">ชื่อรายวิชา</th>
                    <th className="py-3 px-3.5">กลุ่มสาระการเรียนรู้</th>
                    <th className="py-3 px-3.5">ห้องเรียนที่เรียน</th>
                    <th className="py-3 px-3.5 text-center w-28">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {subjects
                    .filter((s) => {
                      const matchDept =
                        subjectDeptFilter === "all" || s.department === subjectDeptFilter;
                      const q = subjectSearch.trim().toLowerCase();
                      const matchSearch =
                        !q ||
                        s.name.toLowerCase().includes(q) ||
                        s.code.toLowerCase().includes(q);
                      return matchDept && matchSearch;
                    })
                    .map((s) => {
                      const assignedCount = s.assignedClassroomIds?.length || 0;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3.5">
                            <span className="font-mono font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 text-[11px]">
                              {s.code}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 font-semibold text-slate-900">{s.name}</td>
                          <td className="py-3 px-3.5 text-slate-600">{s.department}</td>
                          <td className="py-3 px-3.5">
                            {assignedCount > 0 ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-semibold">
                                <span>{assignedCount === 27 ? "ทุกห้อง (27 ห้อง)" : `${assignedCount} ห้องเรียน`}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">- ยังไม่ระบุ -</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setEditingSubject({ ...s, assignedClassroomIds: s.assignedClassroomIds || [] })}
                                className="px-2 py-1 rounded-lg text-slate-600 hover:text-sky-700 hover:bg-sky-50 transition-colors flex items-center gap-1 border border-slate-200 text-[11px]"
                                title="แก้ไขวิชา & กำหนดห้องเรียน"
                              >
                                <Edit2 className="w-3 h-3 text-sky-600" />
                                <span>แก้ไข</span>
                              </button>

                              <button
                                onClick={() => handleDeleteSubject(s.id, s.code)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-200"
                                title="ลบ"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Subject Edit Modal */}
            {editingSubject && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-8 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                        <Edit2 className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-slate-800 text-base">
                        แก้ไขรายวิชา &amp; ห้องเรียนที่เรียน
                      </h3>
                    </div>
                    <button
                      onClick={() => setEditingSubject(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleUpdateSubject} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          รหัสวิชา <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editingSubject.code}
                          onChange={(e) =>
                            setEditingSubject({ ...editingSubject, code: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm focus:ring-2 focus:ring-sky-500 font-bold"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          ชื่อรายวิชา <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editingSubject.name}
                          onChange={(e) =>
                            setEditingSubject({ ...editingSubject, name: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        กลุ่มสาระการเรียนรู้ <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={editingSubject.department}
                        onChange={(e) =>
                          setEditingSubject({ ...editingSubject, department: e.target.value })
                        }
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-sky-500"
                        required
                      >
                        {DEPARTMENTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Classrooms Multi-Select in Edit Modal */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <span>🏫 ห้องเรียนที่เรียนวิชานี้</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                            เลือกแล้ว {editingSubject.assignedClassroomIds?.length || 0} ห้อง
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingSubject({
                                ...editingSubject,
                                assignedClassroomIds: classrooms.map((c) => c.id),
                              })
                            }
                            className="px-2.5 py-1 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 font-semibold border border-sky-200 text-[11px]"
                          >
                            เลือกทุกห้อง (27 ห้อง)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingSubject({ ...editingSubject, assignedClassroomIds: [] })
                            }
                            className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold border border-slate-200 text-[11px]"
                          >
                            ล้างการเลือก
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((g) => {
                          const gradeRooms = classrooms.filter((c) => c.grade === g);
                          const allSelected = gradeRooms.every((c) =>
                            editingSubject.assignedClassroomIds?.includes(c.id)
                          );
                          return (
                            <div
                              key={g}
                              className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white p-2 rounded-lg border border-slate-200"
                            >
                              <div className="sm:w-36 flex items-center justify-between shrink-0">
                                <span className="font-bold text-slate-700 text-xs">{g} ({gradeRooms.length} ห้อง):</span>
                                <button
                                  type="button"
                                  onClick={() => setGradeRoomsForEditingSubject(g, !allSelected)}
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold border transition-colors ${
                                    allSelected
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                      : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                                  }`}
                                >
                                  {allSelected ? "✓ ครบระดับ" : "+ เลือกทั้งระดับ"}
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 flex-1">
                                {gradeRooms.map((c) => {
                                  const isChecked = editingSubject.assignedClassroomIds?.includes(c.id);
                                  return (
                                    <label
                                      key={c.id}
                                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-all ${
                                        isChecked
                                          ? "bg-sky-600 text-white font-bold border-sky-600 shadow-xs"
                                          : "bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleClassroomForEditingSubject(c.id)}
                                        className="sr-only"
                                      />
                                      <span>{c.gradeRoom}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setEditingSubject(null)}
                        className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
                      >
                        ยกเลิก
                      </button>

                      <button
                        type="submit"
                        className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>บันทึกการแก้ไข</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 5: CLASSROOMS & PIN CODES */}
      {/* ========================================================== */}
      {activeTab === "classrooms" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4 mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  จัดการห้องเรียนและรหัส PIN ประจำห้อง
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPinPrintModal(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>📄 พิมพ์ใบสรุปรหัส PIN (Print/PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm"
                >
                  <QrCode className="w-4 h-4" />
                  <span>พิมพ์แผ่น QR Code ประจำห้อง (27 ห้อง)</span>
                </button>
              </div>
            </div>

            {/* Add Classroom */}
            <form onSubmit={handleAddClassroom} className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200/80">
              <div className="text-xs font-bold text-slate-700 mb-2">
                + เพิ่มห้องเรียนใหม่
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="เช่น ม.1/3 หรือ ม.4/1"
                  value={newClassroom.gradeRoom}
                  onChange={(e) => setNewClassroom({ ...newClassroom, gradeRoom: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  required
                />
                <input
                  type="text"
                  maxLength={6}
                  placeholder="รหัส PIN 4 หลัก เช่น 1133"
                  value={newClassroom.pinCode}
                  onChange={(e) => setNewClassroom({ ...newClassroom, pinCode: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white font-mono"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>เพิ่มห้องเรียน</span>
                </button>
              </div>
            </form>

            {/* Grade Jump & Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 mb-6 bg-slate-100 p-1.5 rounded-xl text-xs font-semibold">
              <span className="text-slate-500 px-2 py-1 flex items-center gap-1">
                <School className="w-3.5 h-3.5" /> ระดับชั้น:
              </span>
              {[
                { id: "all", label: `ทั้งหมด (${classrooms.length} ห้อง)` },
                { id: "ม.1", label: `ม.1 (${classrooms.filter((c) => c.grade === "ม.1").length})` },
                { id: "ม.2", label: `ม.2 (${classrooms.filter((c) => c.grade === "ม.2").length})` },
                { id: "ม.3", label: `ม.3 (${classrooms.filter((c) => c.grade === "ม.3").length})` },
                { id: "ม.4", label: `ม.4 (${classrooms.filter((c) => c.grade === "ม.4").length})` },
                { id: "ม.5", label: `ม.5 (${classrooms.filter((c) => c.grade === "ม.5").length})` },
                { id: "ม.6", label: `ม.6 (${classrooms.filter((c) => c.grade === "ม.6").length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setClassroomGradeFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    classroomGradeFilter === tab.id
                      ? "bg-white text-indigo-700 shadow-sm font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Grouped by Grade Sections */}
            <div className="space-y-6">
              {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"]
                .filter(
                  (grade) =>
                    classroomGradeFilter === "all" || classroomGradeFilter === grade
                )
                .map((grade) => {
                  const roomsInGrade = classrooms.filter((c) => c.grade === grade);
                  return (
                    <div
                      key={grade}
                      className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3"
                    >
                      {/* Grade Section Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs">
                            {grade}
                          </span>
                          <div>
                            <h3 className="font-bold text-slate-800 text-sm">
                              มัธยมศึกษาปีที่ {grade.replace("ม.", "")} ({grade})
                            </h3>
                            <p className="text-[11px] text-slate-500">
                              มีทั้งหมด {roomsInGrade.length} ห้องเรียน
                            </p>
                          </div>
                        </div>

                        {/* Grade Actions: Randomize, Save, Copy */}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRandomizeGradePins(grade)}
                            className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                            title={`สุ่มรหัส PIN 4 หลักแบบคาดเดาไม่ได้ให้กับทุกห้องในระดับชั้น ${grade}`}
                          >
                            <Dices className="w-3.5 h-3.5" />
                            <span>สุ่ม PIN ทั้งระดับ {grade}</span>
                          </button>

                          <button
                            type="button"
                            disabled={gradeSaving[grade]}
                            onClick={() => handleSaveGradePins(grade)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs ${
                              roomsInGrade.some(
                                (c) =>
                                  gradeDraftPins[c.id] !== undefined &&
                                  gradeDraftPins[c.id] !== c.pinCode
                              )
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-300"
                                : "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300"
                            }`}
                            title={`บันทึกรหัส PIN ประจำระดับชั้น ${grade} ลงระบบ`}
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>
                              {gradeSaving[grade]
                                ? "กำลังบันทึก..."
                                : `💾 บันทึก PIN ระดับ ${grade}`}
                            </span>
                            {roomsInGrade.filter(
                              (c) =>
                                gradeDraftPins[c.id] !== undefined &&
                                gradeDraftPins[c.id] !== c.pinCode
                            ).length > 0 && (
                              <span className="w-4 h-4 rounded-full bg-white text-emerald-700 text-[10px] font-black flex items-center justify-center ml-0.5 shadow-xs">
                                {
                                  roomsInGrade.filter(
                                    (c) =>
                                      gradeDraftPins[c.id] !== undefined &&
                                      gradeDraftPins[c.id] !== c.pinCode
                                  ).length
                                }
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyGradePins(grade)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all flex items-center gap-1.5"
                            title={`คัดลอกรหัส PIN ของห้องในระดับชั้น ${grade} เพื่อส่งใน LINE`}
                          >
                            {copiedGrade === grade ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700 font-bold">คัดลอกแล้ว!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>คัดลอกรหัส</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Rooms in Grade Grid */}
                      {roomsInGrade.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs">
                          ยังไม่มีห้องเรียนในระดับชั้น {grade}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                          {roomsInGrade.map((cls) => {
                            const currentPin =
                              gradeDraftPins[cls.id] !== undefined
                                ? gradeDraftPins[cls.id]
                                : cls.pinCode;
                            const isModified =
                              gradeDraftPins[cls.id] !== undefined &&
                              gradeDraftPins[cls.id] !== cls.pinCode;

                            return (
                              <div
                                key={cls.id}
                                className={`p-3.5 rounded-xl border bg-white shadow-xs transition-all flex flex-col justify-between space-y-2.5 ${
                                  isModified
                                    ? "border-purple-300 ring-2 ring-purple-100"
                                    : "border-slate-200 hover:border-indigo-300"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      ห้อง {cls.gradeRoom}
                                    </span>
                                    {isModified && (
                                      <span className="text-[9px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                        ยังไม่บันทึก
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClassroom(cls.id, cls.gradeRoom)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="ลบห้องเรียนนี้"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                <div className="flex items-center justify-between gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                                  <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                                    PIN:
                                  </span>
                                  <input
                                    type="text"
                                    maxLength={6}
                                    value={currentPin}
                                    onChange={(e) => {
                                      setGradeDraftPins({
                                        ...gradeDraftPins,
                                        [cls.id]: e.target.value.trim(),
                                      });
                                    }}
                                    className={`w-20 px-2 py-0.5 text-xs font-mono font-bold text-center border rounded bg-white text-slate-900 focus:ring-1 focus:ring-indigo-500 ${
                                      isModified
                                        ? "border-purple-400 bg-purple-50/50 text-purple-900 font-black"
                                        : "border-slate-300"
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRandomizeSingleRoomPin(cls)}
                                    className="p-1 rounded-md text-purple-600 hover:bg-purple-100 transition-colors"
                                    title="สุ่ม PIN เฉพาะห้องนี้ใหม่"
                                  >
                                    <Dices className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 6: SETTINGS, PERIODS & ACADEMIC TERMS */}
      {/* ========================================================== */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {/* Section: Academic Terms */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800">
                จัดการภาคเรียนและปีการศึกษา (Academic Terms)
              </h2>
            </div>

            {/* Add Term Form */}
            <form onSubmit={handleAddTerm} className="flex flex-wrap items-center gap-3 mb-5">
              <div className="flex items-center gap-1.5 text-xs">
                <span>ปีการศึกษา:</span>
                <input
                  type="text"
                  value={newTermYear}
                  onChange={(e) => setNewTermYear(e.target.value)}
                  className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span>เทอม:</span>
                <select
                  value={newTermNumber}
                  onChange={(e) => setNewTermNumber(e.target.value)}
                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">ภาคฤดูร้อน</option>
                </select>
              </div>
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>เพิ่มเทอมใหม่</span>
              </button>
            </form>

            <div className="divide-y divide-slate-100">
              {terms.map((t) => (
                <div key={t.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-800 text-sm">
                      ภาคเรียนที่ {t.term}/{t.year}
                    </span>
                    {t.isActive ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        ✓ เทอมปัจจุบันที่เปิดใช้งาน
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">ข้อมูลประวัติ</span>
                    )}
                  </div>

                  {!t.isActive && (
                    <button
                      onClick={() => handleSetActiveTerm(t.id)}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                    >
                      เปิดใช้เป็นเทอมปัจจุบัน
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section: Period Times Settings */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800">
                กำหนดตารางเวลาของแต่ละคาบเรียน (Period Schedule)
              </h2>
            </div>

            <form onSubmit={handleSavePeriods}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {periods.map((p, idx) => (
                  <div
                    key={p.periodNumber}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5"
                  >
                    <div className="font-bold text-slate-700">คาบที่ {p.periodNumber}</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={p.startTime}
                        onChange={(e) => handlePeriodChange(idx, "startTime", e.target.value)}
                        className="px-2 py-1 rounded border border-slate-300 text-xs w-full font-mono"
                      />
                      <span>-</span>
                      <input
                        type="time"
                        value={p.endTime}
                        onChange={(e) => handlePeriodChange(idx, "endTime", e.target.value)}
                        className="px-2 py-1 rounded border border-slate-300 text-xs w-full font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow"
              >
                บันทึกตารางเวลาคาบเรียน
              </button>
            </form>
          </div>

          {/* Section: School Profile & Dynamic Signers */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800">
                ข้อมูลสถานศึกษาและผู้ลงนามในรายงานทางการ (PDF)
              </h2>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-6 max-w-2xl">
              {/* School Name & Logo */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="w-16 h-16 rounded-xl bg-white p-1 border border-slate-200 shrink-0 flex items-center justify-center overflow-hidden">
                  <img
                    src="/LOGO-N.png"
                    alt="ตราโรงเรียน"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ชื่อสถานศึกษา / โรงเรียน <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={schoolProfile.schoolName}
                    onChange={(e) =>
                      setSchoolProfile({ ...schoolProfile, schoolName: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                    required
                  />
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    ไฟล์ตราโรงเรียน: /LOGO-N.png
                  </span>
                </div>
              </div>

              {/* Dynamic Signers List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      รายชื่อผู้ลงนามในรายงานทางการ ({schoolProfile.signers?.length || 0} ท่าน)
                    </h3>
                    <p className="text-xs text-slate-500">
                      เพิ่มหรือลดผู้ลงนามได้ตามโครงสร้างองค์กรของโรงเรียน
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddSigner}
                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ เพิ่มผู้ลงนาม</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {(!schoolProfile.signers || schoolProfile.signers.length === 0) ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      ยังไม่มีรายชื่อผู้ลงนาม กรุณากดปุ่ม "+ เพิ่มผู้ลงนาม" ด้านบน
                    </div>
                  ) : (
                    schoolProfile.signers.map((signer, idx) => (
                      <div
                        key={signer.id || idx}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            ผู้ลงนามคนที่ {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSigner(idx)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="ลบผู้ลงนามนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              บทบาทกำกับ
                            </label>
                            <input
                              type="text"
                              value={signer.roleTitle || ""}
                              onChange={(e) =>
                                handleUpdateSigner(idx, "roleTitle", e.target.value)
                              }
                              placeholder="เช่น ผู้ตรวจสอบข้อมูล / ผู้รับรองรายงาน"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              ชื่อ-นามสกุล <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={signer.name}
                              onChange={(e) =>
                                handleUpdateSigner(idx, "name", e.target.value)
                              }
                              placeholder="เช่น นายสมศักดิ์ สุขสวัสดิ์"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-medium"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              ตำแหน่ง <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={signer.position}
                              onChange={(e) =>
                                handleUpdateSigner(idx, "position", e.target.value)
                              }
                              placeholder="เช่น ผู้อำนวยการโรงเรียนหนองวัวซอพิทยาคม"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                              required
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>บันทึกข้อมูลสถานศึกษาและรายชื่อผู้ลงนาม</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* ========================================================== */}
      {/* OFFICIAL PDF REPORT MODAL PREVIEW */}
      {/* ========================================================== */}
      {pdfModalOpen && (() => {
        const todayStr = getThaiDateString();
        let initStart = pdfStartDate;
        let initEnd = pdfEndDate;
        let initMode: "single" | "range" = "range";

        if (pdfTimeRange === "week") {
          initStart = getThaiOffsetDate(7);
          initEnd = todayStr;
          initMode = "range";
        } else if (pdfTimeRange === "month") {
          initStart = `${todayStr.substring(0, 7)}-01`;
          initEnd = todayStr;
          initMode = "range";
        } else if (pdfTimeRange === "term") {
          const termRecords = attendanceLogs.filter(
            (r) => !pdfTermId || r.termId === pdfTermId
          );
          const dates = termRecords.map((r) => r.date).filter(Boolean).sort();
          initStart = dates[0] || getThaiOffsetDate(90);
          initEnd = dates[dates.length - 1] || todayStr;
          initMode = "range";
        } else if (pdfTimeRange === "custom") {
          initStart = pdfStartDate;
          initEnd = pdfEndDate;
          initMode = pdfStartDate === pdfEndDate ? "single" : "range";
        }

        return (
          <OfficialPdfReport
            schoolProfile={schoolProfile}
            term={currentPdfTermObj}
            teacher={selectedTeacherObj}
            teachers={teachers}
            timetable={timetable}
            records={filteredPdfRecords}
            allRecords={attendanceLogs}
            initialDate={initMode === "single" ? initStart : todayStr}
            initialStartDate={initStart}
            initialEndDate={initEnd}
            initialViewMode={initMode}
            dateRangeLabel={pdfDateRangeLabel}
            onClose={() => setPdfModalOpen(false)}
          />
        );
      })()}

      {/* ========================================================== */}
      {/* CLASSROOM QR CODE PRINT MODAL */}
      {/* ========================================================== */}
      <ClassroomQrPrint
        classrooms={classrooms}
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
      />

      {/* ========================================================== */}
      {/* CLASSROOM PIN SUMMARY PRINT MODAL */}
      {/* ========================================================== */}
      <ClassroomPinPrintModal
        classrooms={classrooms}
        isOpen={showPinPrintModal}
        onClose={() => setShowPinPrintModal(false)}
        activeTermLabel={
          (() => {
            const t = terms.find((term) => term.isActive) || terms[0];
            return t ? `ภาคเรียนที่ ${t.term}/${t.year}` : "ภาคเรียนที่ 2/2569";
          })()
        }
      />

      {/* ========================================================== */}
      {/* OFFICIAL SUBSTITUTE PDF REPORT MODAL PREVIEW */}
      {/* ========================================================== */}
      {showSubPdfModal && (
        <OfficialSubstitutePdfReport
          schoolProfile={schoolProfile}
          term={
            terms.find((t) => t.id === pdfTermId) ||
            terms.find((t) => t.isActive) ||
            terms[0] ||
            null
          }
          substitutes={
            filteredAdminSubstitutes.length > 0
              ? filteredAdminSubstitutes
              : substitutes
          }
          teachers={teachers}
          dateRangeLabel={
            subTimeFilter === "today"
              ? `วันนี้ (${formatThaiDateLong(getThaiDateString())})`
              : subTimeFilter === "week"
              ? "7 วันล่าสุด"
              : subTimeFilter === "month"
              ? "ประจำเดือนนี้"
              : subTimeFilter === "all"
              ? "ทั้งหมด (ภาคเรียนปัจจุบัน)"
              : `${formatThaiDateLong(subStartDate)} ถึง ${formatThaiDateLong(subEndDate)}`
          }
          onClose={() => setShowSubPdfModal(false)}
        />
      )}

      {/* ========================================================== */}
      {/* CLASSROOM PERIOD MATRIX MODAL (27 ROOMS x 7 PERIODS) */}
      {/* ========================================================== */}
      <ClassroomPeriodMatrixModal
        isOpen={showMatrixModal}
        onClose={() => setShowMatrixModal(false)}
        classrooms={classrooms}
        records={attendanceLogs}
        schoolProfile={schoolProfile}
        initialDate={getThaiDateString()}
        timetable={timetable}
      />

      {/* ========================================================== */}
      {/* ATTENDANCE RECORD EDIT HISTORY (AUDIT TRAIL MODAL) */}
      {/* ========================================================== */}
      {historyViewRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    ประวัติการแก้ไขข้อมูลบันทึกเข้าสอน
                  </h3>
                  <p className="text-xs text-slate-500">
                    ห้อง {historyViewRecord.gradeRoom} &bull; วันที่ {historyViewRecord.date} (คาบที่ {historyViewRecord.periodStart})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryViewRecord(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1">
              <div>วิชา: <strong>{historyViewRecord.subjectCode}</strong> {historyViewRecord.subjectName}</div>
              <div>ครูผู้สอนปัจจุบัน: <strong>{historyViewRecord.teacherName}</strong></div>
              <div>ผู้บันทึกคนแรก: <strong>{historyViewRecord.recordedByStudent || "ไม่ระบุ"}</strong> (เมื่อ {new Date(historyViewRecord.createdAt).toLocaleString("th-TH")})</div>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                บันทึกการเปลี่ยนแปลง ({historyViewRecord.editHistory?.length || 0} ครั้ง)
              </h4>

              {(!historyViewRecord.editHistory || historyViewRecord.editHistory.length === 0) ? (
                historyViewRecord.updatedAt ? (
                  <div className="p-3 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-amber-900 border-b border-amber-200/60 pb-1 font-semibold">
                      <span>การปรับปรุงข้อมูลล่าสุด</span>
                      <span className="text-slate-500 font-normal">
                        {new Date(historyViewRecord.updatedAt).toLocaleString("th-TH")}
                      </span>
                    </div>
                    <div className="text-slate-700">
                      <div>ผู้ปรับปรุง: <strong>{historyViewRecord.updatedByStudent || "ผู้ดูแลระบบ (Admin)"}</strong></div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        * รายการนี้ถูกแก้ไขก่อนการบันทึก Audit Log ละเอียด ระบบจึงแสดงวันเวลาและผู้แก้ไขล่าสุดไว้ โดยการแก้ไขครั้งถัดไปจะบันทึกทุกฟิลด์ที่เปลี่ยนแปลงอัตโนมัติ
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    ยังไม่มีประวัติการแก้ไขสำหรับรายการนี้ (ยังไม่เคยมีการแก้ไข)
                  </div>
                )
              ) : (
                historyViewRecord.editHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-amber-900 border-b border-amber-200/60 pb-1 font-semibold">
                      <span>ครั้งที่ {idx + 1} โดย {item.editorName}</span>
                      <span className="text-slate-500 font-normal">
                        {new Date(item.timestamp).toLocaleString("th-TH")}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-700">
                      {item.changes?.map((ch, cIdx) => (
                        <div key={cIdx} className="flex items-start gap-1.5 text-[11px]">
                          <span className="font-bold text-slate-800 shrink-0">&bull; {ch.field}:</span>
                          <span className="text-rose-700 line-through shrink-0">{ch.oldValue}</span>
                          <span className="text-slate-400 font-bold shrink-0">&rarr;</span>
                          <span className="text-emerald-800 font-bold">{ch.newValue}</span>
                        </div>
                      ))}
                    </div>

                    {item.clientIp && (
                      <div className="text-[10px] text-slate-400 pt-0.5">
                        ช่องทาง: {item.clientIp}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryViewRecord(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* SCHOOL TIMETABLE IMPORTER MODAL */}
      {/* ========================================================== */}
      <SchoolTimetableImporter
        isOpen={showSchoolImporter}
        onClose={() => setShowSchoolImporter(false)}
        onSuccess={loadAllData}
      />

      {/* ========================================================== */}
      {/* ADMIN EDIT ATTENDANCE RECORD MODAL */}
      {/* ========================================================== */}
      {showEditLogModal && editingLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    แก้ไขข้อมูลการเข้าสอน (สิทธิ์แอดมิน)
                  </h3>
                  <p className="text-xs text-slate-500">
                    ห้อง {editingLog.gradeRoom} &bull; วันที่ {editingLog.date}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditLogModal(false);
                  setEditingLog(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveEditLog({
                  ...editingLog,
                  updatedAt: new Date().toISOString(),
                  updatedByStudent: "Admin (ผู้ดูแลระบบ)",
                });
              }}
              className="space-y-3.5 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">วันที่สอน</label>
                  <input
                    type="date"
                    value={editingLog.date}
                    onChange={(e) =>
                      setEditingLog({ ...editingLog, date: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">คาบเริ่ม</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={editingLog.periodStart}
                      onChange={(e) =>
                        setEditingLog({
                          ...editingLog,
                          periodStart: Number(e.target.value),
                          periodEnd: Math.max(Number(e.target.value), editingLog.periodEnd),
                        })
                      }
                      className="w-full px-2 py-2 rounded-xl border border-slate-300 text-center font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">คาบสิ้นสุด</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={editingLog.periodEnd}
                      onChange={(e) =>
                        setEditingLog({
                          ...editingLog,
                          periodEnd: Number(e.target.value),
                        })
                      }
                      className="w-full px-2 py-2 rounded-xl border border-slate-300 text-center font-bold"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">วิชาที่สอน</label>
                <select
                  value={editingLog.subjectId}
                  onChange={(e) => {
                    const sb = subjects.find((s) => s.id === e.target.value);
                    setEditingLog({
                      ...editingLog,
                      subjectId: e.target.value,
                      subjectCode: sb?.code || editingLog.subjectCode,
                      subjectName: sb?.name || editingLog.subjectName,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  required
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">ครูผู้สอน</label>
                <select
                  value={editingLog.teacherId}
                  onChange={(e) => {
                    const tch = teachers.find((t) => t.id === e.target.value);
                    setEditingLog({
                      ...editingLog,
                      teacherId: e.target.value,
                      teacherName: tch ? `${tch.prefix}${tch.fullName}` : editingLog.teacherName,
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  required
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prefix}{t.fullName} ({t.department.replace("กลุ่มสาระการเรียนรู้", "สาระฯ ")})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">สถานะการเข้าสอน</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "on_time", label: "ตรงเวลา" },
                    { id: "late", label: "สาย >10 นาที" },
                    { id: "absent", label: "ไม่เข้าสอน" },
                  ].map((st) => (
                    <button
                      type="button"
                      key={st.id}
                      onClick={() =>
                        setEditingLog({
                          ...editingLog,
                          status: st.id as any,
                          absenceReason: st.id === "absent" ? (editingLog.absenceReason || "meeting") : undefined,
                        })
                      }
                      className={`py-2 rounded-xl font-bold border transition-all ${
                        editingLog.status === st.id
                          ? "bg-slate-800 text-white border-slate-900 shadow-sm"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {editingLog.status === "absent" && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 space-y-2">
                  <label className="block font-bold text-rose-950">สาเหตุการไม่เข้าสอน</label>
                  <select
                    value={editingLog.absenceReason || "other"}
                    onChange={(e) =>
                      setEditingLog({
                        ...editingLog,
                        absenceReason: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-xs"
                  >
                    <option value="meeting">ประชุม</option>
                    <option value="activity">เข้าร่วมกิจกรรมสำคัญของโรงเรียน</option>
                    <option value="official">ไปราชการ</option>
                    <option value="personal">ลากิจ</option>
                    <option value="sick">ลาป่วย</option>
                    <option value="other">เหตุผลอื่นๆ</option>
                  </select>

                  <input
                    type="text"
                    value={editingLog.absenceNote || ""}
                    onChange={(e) =>
                      setEditingLog({
                        ...editingLog,
                        absenceNote: e.target.value,
                      })
                    }
                    placeholder="พิมพ์ระบุสาเหตุเพิ่มเติม..."
                    className="w-full px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-xs"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditLogModal(false);
                    setEditingLog(null);
                  }}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
