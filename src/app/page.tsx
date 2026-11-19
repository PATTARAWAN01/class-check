"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Users,
  Search,
  Filter,
  Eye,
  FileSpreadsheet,
  ChevronRight,
  TrendingUp,
  Clock,
  Building2,
  X,
  Sparkles,
  LayoutGrid,
  Maximize2,
} from "lucide-react";
import {
  getClassrooms,
  getTerms,
  getTeachers,
  getSchoolProfile,
  subscribeAttendance,
  getSubstituteAssignments,
  getTimetable,
} from "@/lib/storage";
import { exportAttendanceToExcel } from "@/lib/excel";
import { AcademicTerm, Classroom, Teacher, AttendanceRecord, SchoolProfile, SubstituteAssignment, SubstituteLeaveType, TimetableEntry } from "@/types";
import { DEPARTMENTS } from "@/lib/constants";
import { getThaiDateString, getThaiOffsetDate, formatThaiDateLong } from "@/lib/dateUtils";
import { getEffectivePeriodCount, deduplicateAttendanceRecords, getSpecialNonCheckedPeriodInfo } from "@/lib/attendanceUtils";
import ClassroomPeriodMatrixModal from "@/components/ClassroomPeriodMatrixModal";

type TimeFilter = "today" | "week" | "month" | "term" | "custom";

export default function StatisticsPage() {
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [substitutes, setSubstitutes] = useState<SubstituteAssignment[]>([]);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);

  // Embedded Matrix State (above teacher search)
  const [matrixDate, setMatrixDate] = useState(() => getThaiDateString());
  const [matrixGrade, setMatrixGrade] = useState<string>("all");
  const [showMatrixModal, setShowMatrixModal] = useState(false);

  // View Mode: Regular Teaching Attendance vs Substitute Teaching Stats
  const [statViewMode, setStatViewMode] = useState<"attendance" | "substitute">("attendance");

  // Filters (in Thai Bangkok Timezone UTC+7)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("today");
  const [customStartDate, setCustomStartDate] = useState(() => getThaiOffsetDate(7));
  const [customEndDate, setCustomEndDate] = useState(() => getThaiDateString());
  const [searchTeacher, setSearchTeacher] = useState("");
  const [selectedDept, setSelectedDept] = useState("all");

  // Modal Detail State
  const [inspectTeacher, setInspectTeacher] = useState<Teacher | null>(null);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (inspectTeacher) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow || "unset";
      };
    }
  }, [inspectTeacher]);

  // Load Initial Data
  useEffect(() => {
    async function init() {
      const [termList, tchList, prof, subList, ttList, clsList] = await Promise.all([
        getTerms(),
        getTeachers(),
        getSchoolProfile(),
        getSubstituteAssignments(),
        getTimetable(),
        getClassrooms(),
      ]);
      setTerms(termList);
      setTeachers(tchList);
      setSchoolProfile(prof);
      setSubstitutes(subList);
      setTimetable(ttList);
      setClassrooms(clsList);

      const active = termList.find((t) => t.isActive) || termList[0];
      if (active) setSelectedTermId(active.id);
    }
    init();

    // Subscribe to attendance real-time
    const unsubscribe = subscribeAttendance((records) => {
      setAllAttendance(records);
    });
    return () => unsubscribe();
  }, []);

  // Filter records by Term and Time range
  const filteredRecords = useMemo(() => {
    if (!selectedTermId) return [];

    let list = allAttendance.filter((r) => r.termId === selectedTermId);

    const todayStr = getThaiDateString();

    if (timeFilter === "today") {
      list = list.filter((r) => r.date === todayStr);
    } else if (timeFilter === "week") {
      const weekAgoStr = getThaiOffsetDate(7);
      list = list.filter((r) => r.date >= weekAgoStr && r.date <= todayStr);
    } else if (timeFilter === "month") {
      const currentYearMonth = todayStr.substring(0, 7);
      list = list.filter((r) => r.date.startsWith(currentYearMonth));
    } else if (timeFilter === "custom") {
      list = list.filter((r) => r.date >= customStartDate && r.date <= customEndDate);
    }

    // Deduplicate records: safely resolve overlapping periods per room & date, keeping only latest check-in
    return deduplicateAttendanceRecords(list);
  }, [allAttendance, selectedTermId, timeFilter, customStartDate, customEndDate]);

  // Filter substitute records by Time range and Department
  const filteredSubstitutes = useMemo(() => {
    let list = substitutes;
    if (selectedTermId) {
      list = list.filter((s) => !s.termId || s.termId === selectedTermId);
    }

    const todayStr = getThaiDateString();

    if (timeFilter === "today") {
      list = list.filter((s) => s.date === todayStr);
    } else if (timeFilter === "week") {
      const weekAgoStr = getThaiOffsetDate(7);
      list = list.filter((s) => s.date >= weekAgoStr && s.date <= todayStr);
    } else if (timeFilter === "month") {
      const currentYearMonth = todayStr.substring(0, 7);
      list = list.filter((s) => s.date.startsWith(currentYearMonth));
    } else if (timeFilter === "custom") {
      list = list.filter((s) => s.date >= customStartDate && s.date <= customEndDate);
    }

    if (selectedDept !== "all") {
      list = list.filter(
        (s) =>
          s.department === selectedDept ||
          s.substituteDepartment === selectedDept ||
          s.department.replace("กลุ่มสาระการเรียนรู้", "") === selectedDept.replace("กลุ่มสาระการเรียนรู้", "")
      );
    }

    if (searchTeacher.trim()) {
      const q = searchTeacher.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.originalTeacherName.toLowerCase().includes(q) ||
          s.substituteTeacherName.toLowerCase().includes(q) ||
          s.subjectCode.toLowerCase().includes(q) ||
          s.subjectName.toLowerCase().includes(q) ||
          s.gradeRoom.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.date.localeCompare(a.date) || a.periodStart - b.periodStart);
  }, [substitutes, selectedTermId, timeFilter, customStartDate, customEndDate, selectedDept, searchTeacher]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let totalPeriods = 0;
    let onTimePeriods = 0;
    let latePeriods = 0;
    let absentPeriods = 0;

    let absentMeeting = 0;
    let absentActivity = 0;
    let absentOther = 0;

    filteredRecords.forEach((r) => {
      const count = getEffectivePeriodCount(r, timetable);
      totalPeriods += count;
      if (r.status === "on_time") {
        onTimePeriods += count;
      } else if (r.status === "late") {
        latePeriods += count;
      } else if (r.status === "absent") {
        absentPeriods += count;
        if (r.absenceReason === "meeting") absentMeeting += count;
        else if (r.absenceReason === "activity") absentActivity += count;
        else absentOther += count;
      }
    });

    const onTimePercent = totalPeriods > 0 ? (onTimePeriods / totalPeriods) * 100 : 0;
    const latePercent = totalPeriods > 0 ? (latePeriods / totalPeriods) * 100 : 0;
    const absentPercent = totalPeriods > 0 ? (absentPeriods / totalPeriods) * 100 : 0;
    const totalAttendanceRate =
      totalPeriods > 0 ? ((onTimePeriods + latePeriods) / totalPeriods) * 100 : 0;

    return {
      totalPeriods,
      onTimePeriods,
      latePeriods,
      absentPeriods,
      absentMeeting,
      absentActivity,
      absentOther,
      onTimePercent: Math.round(onTimePercent * 10) / 10,
      latePercent: Math.round(latePercent * 10) / 10,
      absentPercent: Math.round(absentPercent * 10) / 10,
      totalAttendanceRate: Math.round(totalAttendanceRate * 10) / 10,
    };
  }, [filteredRecords, timetable]);

  // Teacher aggregated statistics
  const teacherStats = useMemo(() => {
    return teachers
      .filter((t) => {
        const matchSearch =
          t.fullName.toLowerCase().includes(searchTeacher.toLowerCase()) ||
          t.code.toLowerCase().includes(searchTeacher.toLowerCase());
        const matchDept = selectedDept === "all" || t.department === selectedDept;
        return matchSearch && matchDept;
      })
      .map((t) => {
        // Teacher's records in filtered scope
        const records = filteredRecords.filter(
          (r) =>
            r.teacherId === t.id ||
            r.teacherName.includes(t.fullName) ||
            r.teacherName === `${t.prefix}${t.fullName}`
        );

        let total = 0;
        let onTime = 0;
        let late = 0;
        let absent = 0;

        records.forEach((r) => {
          const count = getEffectivePeriodCount(r, timetable);
          total += count;
          if (r.status === "on_time") onTime += count;
          else if (r.status === "late") late += count;
          else if (r.status === "absent") absent += count;
        });

        const rate = total > 0 ? Math.round(((onTime + late) / total) * 1000) / 10 : 0;
        const onTimeRate = total > 0 ? Math.round((onTime / total) * 1000) / 10 : 0;

        return {
          teacher: t,
          total,
          onTime,
          late,
          absent,
          rate,
          onTimeRate,
          records,
        };
      })
      .sort((a, b) => {
        // Enforce permanent sorting by Department order as in database, then by teacher code (T001 - T056)
        const deptOrderMap = new Map(DEPARTMENTS.map((d, i) => [d, i]));
        const deptA = a.teacher.department || "";
        const deptB = b.teacher.department || "";
        const orderA = deptOrderMap.has(deptA) ? deptOrderMap.get(deptA)! : 999;
        const orderB = deptOrderMap.has(deptB) ? deptOrderMap.get(deptB)! : 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.teacher.code || "").localeCompare(b.teacher.code || "", undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });
  }, [teachers, filteredRecords, searchTeacher, selectedDept, timetable]);

  // Current active term object
  const currentTerm = terms.find((t) => t.id === selectedTermId);

  // Substitute KPIs
  const substituteKpis = useMemo(() => {
    const totalPeriods = filteredSubstitutes.length;
    const substituteTeacherSet = new Set(filteredSubstitutes.map((s) => s.substituteTeacherId).filter(Boolean));
    const absentTeacherSet = new Set(filteredSubstitutes.map((s) => s.originalTeacherId).filter(Boolean));
    const sickCount = filteredSubstitutes.filter((s) => s.leaveType === "sick").length;
    const personalCount = filteredSubstitutes.filter((s) => s.leaveType === "personal").length;
    const officialCount = filteredSubstitutes.filter((s) => s.leaveType === "official").length;

    return {
      totalPeriods,
      substituteTeachersCount: substituteTeacherSet.size,
      absentTeachersCount: absentTeacherSet.size,
      sickCount,
      personalCount,
      officialCount,
    };
  }, [filteredSubstitutes]);

  // Handle Export Excel
  const handleExportExcel = () => {
    const termLabel = currentTerm ? `เทอม${currentTerm.term}_${currentTerm.year}` : "all";
    exportAttendanceToExcel(
      filteredRecords,
      schoolProfile?.schoolName || "โรงเรียน",
      `${termLabel}_${timeFilter}`
    );
  };

  function getTeacherFirstName(fullName: string = ""): string {
    if (!fullName) return "";
    const clean = fullName
      .replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.|อ\.|ครู)\s*/g, "")
      .trim();
    const parts = clean.split(/\s+/);
    return parts[0] || clean;
  }

  const matrixDayOfWeek = useMemo(() => {
    const parts = matrixDate.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return 1;
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }, [matrixDate]);

  const matrixDayRecords = useMemo(() => {
    return allAttendance.filter((r) => r.date === matrixDate);
  }, [allAttendance, matrixDate]);

  const matrixSortedClassrooms = useMemo(() => {
    const list =
      matrixGrade === "all"
        ? classrooms
        : classrooms.filter((c) => c.grade === matrixGrade);

    return [...list].sort((a, b) =>
      a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true })
    );
  }, [classrooms, matrixGrade]);

  const matrixMap = useMemo(() => {
    const map = new Map<string, Map<number, AttendanceRecord>>();
    matrixDayRecords.forEach((r) => {
      if (!map.has(r.classroomId)) {
        map.set(r.classroomId, new Map());
      }
      const roomMap = map.get(r.classroomId)!;
      for (let p = r.periodStart; p <= r.periodEnd; p++) {
        roomMap.set(p, r);
      }
    });
    return map;
  }, [matrixDayRecords]);

  const getTimetableEntryForMatrix = (
    clsId: string,
    gradeRoom: string,
    pNum: number,
    dOfWeek: number
  ): TimetableEntry | undefined => {
    if (!timetable || timetable.length === 0) return undefined;
    return timetable.find(
      (tt) =>
        (tt.classroomId === clsId || tt.gradeRoom === gradeRoom) &&
        tt.dayOfWeek === dOfWeek &&
        pNum >= tt.periodStart &&
        pNum <= tt.periodEnd
    );
  };

  const getExpectedPeriodCountForMatrix = (clsId: string, gradeRoom: string): number => {
    let count = 0;
    for (let p = 1; p <= 7; p++) {
      const tt = getTimetableEntryForMatrix(clsId, gradeRoom, p, matrixDayOfWeek);
      const special = getSpecialNonCheckedPeriodInfo(clsId, gradeRoom, matrixDayOfWeek, p, tt);
      if (!special) count++;
    }
    return count > 0 ? count : 7;
  };

  const matrixStats = useMemo(() => {
    let fullyChecked = 0;
    let partiallyChecked = 0;
    let notChecked = 0;
    let totalCheckedPeriods = 0;

    matrixSortedClassrooms.forEach((c) => {
      const roomMap = matrixMap.get(c.id);
      const count = roomMap ? roomMap.size : 0;
      const expected = getExpectedPeriodCountForMatrix(c.id, c.gradeRoom);
      totalCheckedPeriods += count;
      if (count >= expected) fullyChecked++;
      else if (count > 0) partiallyChecked++;
      else notChecked++;
    });

    return { fullyChecked, partiallyChecked, notChecked, totalCheckedPeriods };
  }, [matrixSortedClassrooms, matrixMap, matrixDayOfWeek, timetable]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              สถิติการเข้าสอนของครูผู้สอน
            </h1>
          </div>

          {/* Term Selector & Quick Export */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-1.5 border border-white/20 flex items-center gap-2">
              <span className="text-xs text-sky-200 pl-2">ภาคเรียน:</span>
              <select
                value={selectedTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
                className="bg-slate-800 text-white text-xs font-semibold rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-400"
              >
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    เทอม {t.term}/{t.year} {t.isActive ? "(ปัจจุบัน)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center gap-2"
              title="ส่งออกข้อมูลช่วงเวลานี้เป็น Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ส่งออก Excel</span>
            </button>
          </div>
        </div>

        {/* View Mode Toggle: Regular Attendance vs Substitute Teaching */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatViewMode("attendance")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              statViewMode === "attendance"
                ? "bg-sky-500 text-white shadow-md shadow-sky-500/25 scale-[1.02]"
                : "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>สถิติการเข้าสอน (ปกติ)</span>
          </button>

          <button
            onClick={() => setStatViewMode("substitute")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              statViewMode === "substitute"
                ? "bg-amber-500 text-white shadow-md shadow-amber-500/25 scale-[1.02]"
                : "bg-white/10 text-slate-300 hover:bg-white/20 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>สถิติการจัดสอนแทนย้อนหลัง ({substitutes.length})</span>
          </button>
        </div>

        {/* Time Filters Bar */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> ช่วงเวลา:
          </span>

          {[
            { id: "today", label: "วันนี้" },
            { id: "week", label: "7 วันล่าสุด (สัปดาห์นี้)" },
            { id: "month", label: "เดือนนี้" },
            { id: "term", label: "ทั้งภาคเรียน" },
            { id: "custom", label: "📅 กำหนดช่วงเวลา (ปฏิทิน)" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTimeFilter(tab.id as TimeFilter)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                timeFilter === tab.id
                  ? "bg-white text-slate-900 shadow-md scale-105"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Custom Date Range Picker */}
          {timeFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-xs ml-auto">
              <span className="text-slate-300">ตั้งแต่:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-white text-xs font-bold focus:ring-1 focus:ring-sky-400"
              />
              <span className="text-slate-300">ถึง:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-600 rounded-lg px-2 py-1 text-white text-xs font-bold focus:ring-1 focus:ring-sky-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* ==================== ATTENDANCE STATS VIEW ==================== */}
      {statViewMode === "attendance" && (
        <>
          {/* KPI STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Teaching */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            คาบสอนที่มีการเช็ค
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-800">
              {kpis.totalPeriods}
            </span>
            <span className="text-xs text-slate-500 font-medium">คาบ</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-sky-600 font-medium">
            <span>อัตราเข้าสอนรวม {kpis.totalAttendanceRate}%</span>
          </div>
          <div className="absolute right-3 bottom-3 text-slate-100 -z-0">
            <BarChart3 className="w-14 h-14" />
          </div>
        </div>

        {/* Card 2: On-time */}
        <div className="bg-white rounded-2xl p-5 border border-emerald-100 shadow-sm bg-gradient-to-b from-white to-emerald-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              เข้าสอนตรงเวลา
            </span>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-700">
              {kpis.onTimePercent}%
            </span>
            <span className="text-xs text-emerald-600 font-medium">
              ({kpis.onTimePeriods} คาบ)
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(kpis.onTimePercent, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Card 3: Late */}
        <div className="bg-white rounded-2xl p-5 border border-amber-100 shadow-sm bg-gradient-to-b from-white to-amber-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              เข้าสอนหลัง 10 นาที (สาย)
            </span>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-700">
              {kpis.latePercent}%
            </span>
            <span className="text-xs text-amber-600 font-medium">
              ({kpis.latePeriods} คาบ)
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(kpis.latePercent, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Card 4: Absent */}
        <div className="bg-white rounded-2xl p-5 border border-rose-100 shadow-sm bg-gradient-to-b from-white to-rose-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">
              ไม่เข้าสอน
            </span>
            <XCircle className="w-5 h-5 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-rose-700">
              {kpis.absentPercent}%
            </span>
            <span className="text-xs text-rose-600 font-medium">
              ({kpis.absentPeriods} คาบ)
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
            <span>ประชุม: {kpis.absentMeeting}</span>
            <span>&bull;</span>
            <span>กิจกรรมสำคัญ: {kpis.absentActivity}</span>
            <span>&bull;</span>
            <span>อื่นๆ: {kpis.absentOther}</span>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* 27 CLASSROOMS x 7 PERIODS MATRIX SECTION */}
      {/* ========================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm sm:text-base leading-tight">
                ตารางสรุปการปฏิบัติการสอนของครูผู้สอนรายห้องและรายคาบ
              </h2>
              <p className="text-[11px] text-slate-500">
                สถานะการเข้าสอนประจำวัน 27 ห้องเรียน &bull; ประจำ{formatThaiDateLong(matrixDate)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500 text-[11px]">วันที่:</span>
              <input
                type="date"
                value={matrixDate}
                onChange={(e) => setMatrixDate(e.target.value)}
                className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer text-xs"
              />
              <button
                type="button"
                onClick={() => setMatrixDate(getThaiDateString())}
                className="px-1.5 py-0.5 rounded-md bg-sky-100 hover:bg-sky-200 text-sky-800 text-[10px] font-medium transition-colors"
                title="เลือกวันนี้"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => setMatrixDate(getThaiOffsetDate(1))}
                className="px-1.5 py-0.5 rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-medium transition-colors"
                title="เลือกเมื่อวาน"
              >
                เมื่อวาน
              </button>
            </div>

            {/* Grade Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={matrixGrade}
                onChange={(e) => setMatrixGrade(e.target.value)}
                className="bg-transparent text-slate-800 font-medium focus:outline-none cursor-pointer"
              >
                <option value="all">ทุกระดับชั้น (27 ห้อง)</option>
                {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((g) => (
                  <option key={g} value={g}>เฉพาะระดับ {g}</option>
                ))}
              </select>
            </div>

            {/* Expand / Print Modal Button */}
            <button
              type="button"
              onClick={() => setShowMatrixModal(true)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-all"
              title="เปิดดูตารางขนาดเต็มหน้าจอ บันทึกเป็นรูปภาพ หรือพิมพ์ A4"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>ขยายเต็มจอ / พิมพ์ตาราง</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="text-[10px] text-emerald-800">เช็คครบทุกคาบ</div>
            <div className="text-base font-bold text-emerald-900">{matrixStats.fullyChecked} ห้อง</div>
          </div>
          <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
            <div className="text-[10px] text-amber-800">เช็คบางส่วน</div>
            <div className="text-base font-bold text-amber-900">{matrixStats.partiallyChecked} ห้อง</div>
          </div>
          <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
            <div className="text-[10px] text-slate-600">ยังไม่เช็คเลย</div>
            <div className="text-base font-bold text-slate-800">{matrixStats.notChecked} ห้อง</div>
          </div>
          <div className="p-2 bg-sky-50 rounded-xl border border-sky-200">
            <div className="text-[10px] text-sky-800">คาบที่บันทึกแล้ว</div>
            <div className="text-base font-bold text-sky-900">{matrixStats.totalCheckedPeriods} คาบ</div>
          </div>
        </div>

        {/* Responsive Table Container */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
          <table className="w-full text-xs border-collapse border border-slate-300 table-fixed min-w-[760px]">
            <thead>
              <tr className="bg-sky-800 text-white font-bold text-center text-xs sm:text-[13px]">
                <th className="p-1.5 border border-sky-900 w-[11%] min-w-[50px] text-center">ห้องเรียน</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 1</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 2</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 3</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 4</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 5</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 6</th>
                <th className="p-1.5 border border-sky-900 w-[11.5%] text-center">คาบ 7</th>
                <th className="p-1.5 border border-sky-900 w-[8.5%] min-w-[40px] text-center">สรุป</th>
              </tr>
            </thead>
            <tbody>
              {matrixSortedClassrooms.map((cls, idx) => {
                const roomMap = matrixMap.get(cls.id);
                const checkedCount = roomMap ? roomMap.size : 0;
                const isNewGrade = idx === 0 || matrixSortedClassrooms[idx - 1].grade !== cls.grade;

                return (
                  <tr
                    key={cls.id}
                    className={`text-center hover:bg-slate-50 transition-colors ${
                      isNewGrade && idx > 0 ? "border-t-2 border-slate-400" : ""
                    }`}
                  >
                    <td className="p-1 border border-slate-300 font-bold bg-slate-50 text-slate-900 text-center whitespace-nowrap text-xs sm:text-[13px]">
                      {cls.gradeRoom}
                    </td>

                    {[1, 2, 3, 4, 5, 6, 7].map((pNum) => {
                      const rec = roomMap ? roomMap.get(pNum) : undefined;
                      const ttMatch = getTimetableEntryForMatrix(cls.id, cls.gradeRoom, pNum, matrixDayOfWeek);
                      const specialInfo = getSpecialNonCheckedPeriodInfo(cls.id, cls.gradeRoom, matrixDayOfWeek, pNum, ttMatch);

                      // Case 1: Checked records (On Time, Late, Absent)
                      if (rec) {
                        const teacherName = getTeacherFirstName(rec.teacherName);
                        const teacherLabel = teacherName ? `ครู${teacherName}` : "";

                        if (rec.status === "on_time") {
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 bg-emerald-50 text-emerald-950 font-semibold text-center"
                              title={`${rec.teacherName} (${rec.subjectCode}) - ตรงเวลา`}
                            >
                              <div className="flex flex-col items-center justify-center leading-tight">
                                <div className="flex items-center justify-center gap-0.5 font-bold">
                                  <span className="text-[11px] text-emerald-700 font-bold shrink-0">●</span>
                                  <span className="text-[11px] sm:text-[11.5px] font-bold tracking-tight text-slate-900 truncate">
                                    {rec.subjectCode || "ตรงเวลา"}
                                  </span>
                                </div>
                                {teacherLabel && (
                                  <div className="text-[10px] sm:text-[10.5px] font-semibold text-slate-700 truncate mt-0.5">
                                    {teacherLabel}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (rec.status === "late") {
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 bg-amber-50 text-amber-950 font-semibold text-center"
                              title={`${rec.teacherName} (${rec.subjectCode}) - เข้าสอนสาย: ${rec.lateNote || ""}`}
                            >
                              <div className="flex flex-col items-center justify-center leading-tight">
                                <div className="flex items-center justify-center gap-0.5 font-bold">
                                  <span className="text-[11px] text-amber-700 font-bold shrink-0">▲</span>
                                  <span className="text-[11px] sm:text-[11.5px] font-bold tracking-tight text-slate-900 truncate">
                                    {rec.subjectCode || "สาย"}
                                  </span>
                                </div>
                                {teacherLabel && (
                                  <div className="text-[10px] sm:text-[10.5px] font-semibold text-slate-700 truncate mt-0.5">
                                    {teacherLabel}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={pNum}
                            className="p-1 border border-slate-300 bg-rose-50 text-rose-950 font-bold text-center"
                            title={`${rec.teacherName} (${rec.subjectCode}) - ไม่เข้าสอน: ${rec.absenceNote || rec.absenceReason || ""}`}
                          >
                            <div className="flex flex-col items-center justify-center leading-tight">
                              <div className="flex items-center justify-center gap-0.5 font-bold">
                                <span className="text-[11px] text-rose-600 font-bold shrink-0">✕</span>
                                <span className="text-[11px] sm:text-[11.5px] font-bold tracking-tight text-rose-950 truncate">
                                  {rec.subjectCode || "ไม่เข้า"}
                                </span>
                              </div>
                              {teacherLabel && (
                                <div className="text-[10px] sm:text-[10.5px] font-semibold text-slate-700 truncate mt-0.5">
                                  {teacherLabel}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      }

                      // Case 2: Special Activity or Free Period
                      if (specialInfo) {
                        return (
                          <td
                            key={pNum}
                            className="p-1 border border-slate-300 bg-slate-100 text-slate-500 text-center font-medium"
                            title={specialInfo.description}
                          >
                            <span className="text-[10px] sm:text-[10.5px] px-1 py-0.5 rounded bg-slate-200/90 text-slate-700 font-bold inline-block">
                              [{specialInfo.label}]
                            </span>
                          </td>
                        );
                      }

                      // Case 3: Unchecked scheduled timetable slot
                      if (ttMatch && (ttMatch.subjectCode || ttMatch.teacherName)) {
                        const teacherName = getTeacherFirstName(ttMatch.teacherName);
                        const teacherLabel = teacherName ? `ครู${teacherName}` : "";
                        return (
                          <td
                            key={pNum}
                            className="p-1 border border-slate-300 border-dashed bg-white text-slate-700 text-center font-normal"
                            title={`${ttMatch.teacherName} (${ttMatch.subjectCode}) - ยังไม่เช็ค`}
                          >
                            <div className="flex flex-col items-center justify-center leading-tight opacity-90">
                              <span className="text-[11px] sm:text-[11.5px] font-bold text-slate-800 tracking-tight truncate">
                                {ttMatch.subjectCode}
                              </span>
                              {teacherLabel && (
                                <span className="text-[10px] sm:text-[10.5px] text-slate-600 truncate mt-0.5 font-medium">
                                  {teacherLabel}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      }

                      // Case 4: Free period fallback
                      return (
                        <td
                          key={pNum}
                          className="p-1 border border-slate-300 bg-slate-100 text-slate-400 text-center"
                          title="คาบว่าง (ไม่มีในตารางสอน)"
                        >
                          <span className="text-[10px] text-slate-500 font-normal">[คาบว่าง]</span>
                        </td>
                      );
                    })}

                    {(() => {
                      const expected = getExpectedPeriodCountForMatrix(cls.id, cls.gradeRoom);
                      const isComplete = checkedCount >= expected;
                      return (
                        <td className="p-1 border border-slate-300 font-bold text-center text-xs sm:text-[12px] whitespace-nowrap">
                          <span
                            className={
                              isComplete
                                ? "text-emerald-700 font-bold"
                                : checkedCount > 0
                                ? "text-amber-700 font-bold"
                                : "text-slate-400 font-medium"
                            }
                          >
                            {checkedCount}/{expected}
                          </span>
                        </td>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span>สัญลักษณ์:</span>
            <span className="text-emerald-700 font-bold">● ตรงเวลา</span>
            <span className="text-amber-700 font-bold">▲ สาย</span>
            <span className="text-rose-700 font-bold">✕ ไม่เข้าสอน</span>
            <span className="border border-dashed border-slate-400 px-1 rounded text-slate-600 bg-white">รหัสวิชา ครู [รอเช็ค]</span>
            <span className="text-slate-600 font-medium bg-slate-100 px-1 rounded border border-slate-200">[กิจกรรม/คาบว่าง]</span>
          </div>
          <span className="text-[10.5px] text-slate-400">
            * คลิก "ขยายเต็มจอ / พิมพ์ตาราง" เพื่อดูภาพใหญ่ บันทึกเป็น PNG หรือสั่งพิมพ์ 1 หน้า A4
          </span>
        </div>
      </div>

      {/* SEARCH & DEPARTMENT FILTER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTeacher}
            onChange={(e) => setSearchTeacher(e.target.value)}
            placeholder="ค้นหาชื่อครู หรือรหัสครู..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs text-slate-700"
          />
        </div>

        {/* Department Dropdown */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full md:w-64 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
          >
            <option value="all">ทุกกลุ่มสาระการเรียนรู้</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d.replace("กลุ่มสาระการเรียนรู้", "")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TEACHERS STATISTICS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-base">
            ตารางสรุปการเข้าสอนรายบุคคล
          </h2>
          <span className="text-xs text-slate-500 font-semibold">
            ครู {teacherStats.length} ท่าน
          </span>
        </div>

        {/* Desktop & Tablet Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">ครูผู้สอน</th>
                <th className="py-3.5 px-4 hidden md:table-cell">กลุ่มสาระฯ</th>
                <th className="py-3.5 px-3 text-center">คาบรวม</th>
                <th className="py-3.5 px-3 text-center text-emerald-700">ตรงเวลา</th>
                <th className="py-3.5 px-3 text-center text-amber-700">สาย (&gt;10น.)</th>
                <th className="py-3.5 px-3 text-center text-rose-700">ไม่เข้าสอน</th>
                <th className="py-3.5 px-4 text-center">ร้อยละการเข้าสอน</th>
                <th className="py-3.5 px-4 text-center">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {teacherStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                    ไม่พบข้อมูลครูผู้สอนที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                teacherStats.map((item) => {
                  const t = item.teacher;
                  let badgeBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                  if (item.rate < 80 && item.total > 0) {
                    badgeBg = "bg-rose-50 text-rose-700 border-rose-200";
                  } else if (item.rate < 90 && item.total > 0) {
                    badgeBg = "bg-amber-50 text-amber-700 border-amber-200";
                  }

                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      onClick={() => setInspectTeacher(t)}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 group-hover:text-sky-600 transition-colors">
                          {t.prefix}{t.fullName}
                        </div>
                        <div className="text-[11px] text-slate-400 md:hidden">
                          {t.department.replace("กลุ่มสาระการเรียนรู้", "")}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 hidden md:table-cell text-xs text-slate-500">
                        {t.department.replace("กลุ่มสาระการเรียนรู้", "")}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                        {item.total}
                      </td>
                      <td className="py-3.5 px-3 text-center font-medium text-emerald-600">
                        {item.onTime}
                      </td>
                      <td className="py-3.5 px-3 text-center font-medium text-amber-600">
                        {item.late}
                      </td>
                      <td className="py-3.5 px-3 text-center font-medium text-rose-600">
                        {item.absent}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${badgeBg}`}>
                          <span>{item.rate}%</span>
                        </div>
                        <div className="w-20 mx-auto bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full ${
                              item.rate >= 90
                                ? "bg-emerald-500"
                                : item.rate >= 80
                                ? "bg-amber-500"
                                : "bg-rose-500"
                            }`}
                            style={{ width: `${Math.min(item.rate, 100)}%` }}
                          ></div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectTeacher(t);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>ดูประวัติ</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Screen Card View (No Horizontal Scroll Needed) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {teacherStats.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              ไม่พบข้อมูลครูผู้สอนที่ตรงกับเงื่อนไขการค้นหา
            </div>
          ) : (
            teacherStats.map((item) => {
              const t = item.teacher;
              let badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-200";
              if (item.rate < 80 && item.total > 0) {
                badgeColor = "bg-rose-100 text-rose-800 border-rose-200";
              } else if (item.rate < 90 && item.total > 0) {
                badgeColor = "bg-amber-100 text-amber-800 border-amber-200";
              }

              return (
                <div
                  key={t.id}
                  onClick={() => setInspectTeacher(t)}
                  className="p-4 hover:bg-slate-50 transition-colors cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {t.prefix}{t.fullName}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t.department.replace("กลุ่มสาระการเรียนรู้", "")}
                      </p>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${badgeColor}`}>
                      เข้าสอน {item.rate}%
                    </span>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] text-slate-500">คาบรวม</div>
                      <div className="font-bold text-slate-800 mt-0.5">{item.total}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                      <div className="text-[10px] text-emerald-600">ตรงเวลา</div>
                      <div className="font-bold mt-0.5">{item.onTime}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                      <div className="text-[10px] text-amber-600">สาย</div>
                      <div className="font-bold mt-0.5">{item.late}</div>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                      <div className="text-[10px] text-rose-600">ไม่เข้า</div>
                      <div className="font-bold mt-0.5">{item.absent}</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.rate >= 90
                          ? "bg-emerald-500"
                          : item.rate >= 80
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.min(item.rate, 100)}%` }}
                    ></div>
                  </div>

                  {/* Action button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspectTeacher(t);
                    }}
                    className="w-full py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-sky-100"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>ดูประวัติการสอนรายคาบ</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  )}

      {/* ==================== SUBSTITUTE TEACHING STATS VIEW ==================== */}
      {statViewMode === "substitute" && (
        <>
          {/* SUBSTITUTE KPI STAT CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Substitute Periods */}
            <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm relative overflow-hidden bg-gradient-to-br from-white to-amber-50/30">
              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                คาบจัดสอนแทนรวม
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-amber-700">
                  {substituteKpis.totalPeriods}
                </span>
                <span className="text-xs text-slate-500 font-medium">คาบ</span>
              </div>
              <p className="mt-3 text-xs text-amber-700 font-medium">
                ในช่วงเวลาที่เลือก
              </p>
              <div className="absolute right-3 bottom-3 text-amber-100 pointer-events-none">
                <Sparkles className="w-14 h-14" />
              </div>
            </div>

            {/* Card 2: Substitute Teachers */}
            <div className="bg-white rounded-2xl p-5 border border-sky-200 shadow-sm bg-gradient-to-br from-white to-sky-50/30">
              <div className="text-xs font-semibold text-sky-800 uppercase tracking-wider">
                ครูผู้เข้าสอนแทน
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-sky-700">
                  {substituteKpis.substituteTeachersCount}
                </span>
                <span className="text-xs text-slate-500 font-medium">ท่าน</span>
              </div>
              <p className="mt-3 text-xs text-sky-700 font-medium">
                ได้รับคะแนนการสอนแทน
              </p>
            </div>

            {/* Card 3: Absent Teachers */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                ครูที่ลาและมีคนสอนแทน
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-slate-800">
                  {substituteKpis.absentTeachersCount}
                </span>
                <span className="text-xs text-slate-500 font-medium">ท่าน</span>
              </div>
              <p className="mt-3 text-xs text-slate-500 font-medium">
                ไม่ถูกหักสถิติขาดสอน
              </p>
            </div>

            {/* Card 4: Breakdown by Leave Type */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                แยกตามประเภทการลา
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-rose-700 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> ลาป่วย:
                  </span>
                  <span className="font-bold text-slate-800">{substituteKpis.sickCount} คาบ</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-amber-700 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span> ลากิจ:
                  </span>
                  <span className="font-bold text-slate-800">{substituteKpis.personalCount} คาบ</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-700 font-medium flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> ไปราชการ:
                  </span>
                  <span className="font-bold text-slate-800">{substituteKpis.officialCount} คาบ</span>
                </div>
              </div>
            </div>
          </div>

          {/* SUBSTITUTE EVENTS TABLE */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Filters Toolbar */}
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">
                  ประวัติและรายการจัดสอนแทนย้อนหลัง ({filteredSubstitutes.length} รายการ)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  เรียกดูสถิติการจัดสอนแทนย้อนหลังทั้งรายวัน สัปดาห์ เดือน หรือช่วงเวลาที่เลือกจากปฏิทิน
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTeacher}
                    onChange={(e) => setSearchTeacher(e.target.value)}
                    placeholder="ค้นหาชื่อครู, วิชา, ห้อง..."
                    className="pl-9 pr-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 w-44 sm:w-56"
                  />
                  {searchTeacher && (
                    <button
                      onClick={() => setSearchTeacher("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Department Filter */}
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
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

            {/* Desktop Substitute Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 w-12 text-center">ลำดับ</th>
                    <th className="p-3.5 w-28 text-center">วันที่ & คาบ</th>
                    <th className="p-3.5 w-28">ห้องเรียน</th>
                    <th className="p-3.5 w-44">วิชาที่สอน</th>
                    <th className="p-3.5 w-52">ครูที่ขอลา & สาเหตุ</th>
                    <th className="p-3.5">ครูผู้เข้าสอนแทน</th>
                    <th className="p-3.5">หมายเหตุ / ข้อมูลบันทึก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubstitutes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                        ไม่พบประวัติการจัดสอนแทนในช่วงเวลาที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredSubstitutes.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="p-3.5 text-center font-mono text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <p className="font-bold text-slate-800">{s.date}</p>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-bold text-[10px] border border-sky-200">
                            คาบที่ {s.periodStart}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-800 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 inline-block">
                            {s.gradeRoom}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold text-slate-800 font-mono text-[11px]">
                            {s.subjectCode}
                          </span>
                          <p className="text-slate-600 text-[11px] line-clamp-1">
                            {s.subjectName}
                          </p>
                        </td>
                        <td className="p-3.5">
                          <p className="font-bold text-slate-800">{s.originalTeacherName}</p>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            s.leaveType === "sick"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : s.leaveType === "personal"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-blue-50 text-blue-700 border-blue-200"
                          }`}>
                            {s.leaveType === "sick" ? "ลาป่วย" : s.leaveType === "personal" ? "ลากิจ" : "ไปราชการ"}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              สอนแทน
                            </span>
                            <span className="font-bold text-slate-900 text-xs">
                              {s.substituteTeacherName}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {s.substituteDepartment.replace("กลุ่มสาระการเรียนรู้", "")}
                          </p>
                        </td>
                        <td className="p-3.5 text-slate-500 text-[11px]">
                          {s.note || "จัดสอนแทนโดยงานวิชาการ"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Substitute Card View */}
            <div className="block md:hidden divide-y divide-slate-100">
              {filteredSubstitutes.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  ไม่พบประวัติการจัดสอนแทนในช่วงเวลาที่เลือก
                </div>
              ) : (
                filteredSubstitutes.map((s) => (
                  <div key={s.id} className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{s.date}</span>
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-bold border border-sky-200">
                        คาบ {s.periodStart} &bull; ห้อง {s.gradeRoom}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 space-y-1">
                      <p className="text-slate-600">
                        วิชา: <strong className="text-slate-800">{s.subjectCode} {s.subjectName}</strong>
                      </p>
                      <p className="text-slate-600">
                        ครูที่ลา: <strong className="text-slate-800">{s.originalTeacherName}</strong> ({s.leaveType === "sick" ? "ลาป่วย" : s.leaveType === "personal" ? "ลากิจ" : "ไปราชการ"})
                      </p>
                      <p className="text-emerald-800 font-bold flex items-center gap-1 pt-1 border-t border-slate-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ครูสอนแทน: {s.substituteTeacherName}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* TEACHER DETAIL DRILL-DOWN MODAL */}
      {inspectTeacher && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-hidden"
          onClick={() => setInspectTeacher(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header - Sticky with Close Button Fixed at Top-Right Always */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-sky-700 via-indigo-700 to-indigo-800 text-white flex items-center justify-between sticky top-0 z-30 shrink-0 shadow-md pr-16">
              <div>
                <div className="text-xs text-sky-200 uppercase tracking-wider font-semibold">
                  ประวัติการเข้าสอนรายบุคคล
                </div>
                <h3 className="text-xl font-bold mt-0.5">
                  {inspectTeacher.prefix}{inspectTeacher.fullName}
                </h3>
                <p className="text-xs text-sky-100 mt-0.5">
                  {inspectTeacher.department}
                </p>
              </div>

              {/* Close Button Fixed Top-Right */}
              <button
                onClick={() => setInspectTeacher(null)}
                className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all active:scale-95 shadow-sm z-40"
                title="ปิดหน้าต่าง"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable Only */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
              {(() => {
                const teacherRecords = filteredRecords.filter(
                  (r) =>
                    r.teacherId === inspectTeacher.id ||
                    r.teacherName.includes(inspectTeacher.fullName) ||
                    r.teacherName === `${inspectTeacher.prefix}${inspectTeacher.fullName}`
                );

                const teacherTotalPeriods = teacherRecords.reduce(
                  (acc, r) => acc + getEffectivePeriodCount(r, timetable),
                  0
                );

                if (teacherRecords.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400">
                      ไม่พบประวัติการเข้าสอนของครูท่านนี้ในช่วงเวลาที่เลือก
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
                      <span>ประวัติการเข้าสอนในช่วงเวลาที่เลือก</span>
                      <span className="font-bold bg-sky-50 text-sky-800 px-2.5 py-1 rounded-full border border-sky-200">
                        รวม {teacherTotalPeriods} คาบ ({teacherRecords.length} รายการบันทึก)
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {teacherRecords.map((r) => (
                        <div
                          key={r.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">
                                {r.date}
                              </span>
                              <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-semibold">
                                {r.periodStart === r.periodEnd
                                  ? `คาบ ${r.periodStart}`
                                  : `คาบ ${r.periodStart}-${r.periodEnd}`}
                              </span>
                              {getEffectivePeriodCount(r, timetable) > 1 && (
                                <span className="px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                                  คาบคู่ ({getEffectivePeriodCount(r, timetable)} คาบ)
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded text-xs bg-sky-50 text-sky-700 font-medium">
                                ห้อง {r.gradeRoom}
                              </span>
                            </div>

                            <div className="text-xs text-slate-600 mt-1">
                              วิชา: <strong className="text-slate-800">{r.subjectCode} {r.subjectName}</strong>
                            </div>

                            <div className="text-[11px] text-slate-400 mt-0.5">
                              บันทึกโดย: {r.recordedByStudent} &bull; เวลา {new Date(r.createdAt).toLocaleTimeString("th-TH")}
                            </div>

                          {r.status === "absent" && r.absenceNote && (
                            <div className="text-xs text-rose-600 mt-1 bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                              หมายเหตุ: {r.absenceNote}
                            </div>
                          )}
                        </div>

                        {/* Status badge */}
                        <div className="shrink-0">
                          {r.status === "on_time" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              เข้าสอนตรงเวลา
                            </span>
                          )}
                          {r.status === "late" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                              สาย &gt;10 นาที
                            </span>
                          )}
                          {r.status === "absent" && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              ไม่เข้าสอน (
                              {r.absenceReason === "meeting"
                                ? "ประชุม"
                                : r.absenceReason === "activity"
                                ? "เข้าร่วมกิจกรรมสำคัญของโรงเรียน"
                                : r.absenceReason === "official"
                                ? "ไปราชการ"
                                : r.absenceReason === "sick"
                                ? "ลาป่วย"
                                : r.absenceReason === "personal"
                                ? "ลากิจ"
                                : "อื่นๆ"}
                              {r.absenceNote ? `: ${r.absenceNote}` : ""})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end sticky bottom-0 z-20 shrink-0">
              <button
                onClick={() => setInspectTeacher(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Classroom Period Matrix Modal for Full Screen / Printing */}
      {showMatrixModal && schoolProfile && (
        <ClassroomPeriodMatrixModal
          isOpen={showMatrixModal}
          onClose={() => setShowMatrixModal(false)}
          classrooms={classrooms}
          records={allAttendance}
          schoolProfile={schoolProfile}
          initialDate={matrixDate}
          timetable={timetable}
        />
      )}
    </div>
  );
}
