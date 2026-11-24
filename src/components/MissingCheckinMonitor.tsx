"use client";

import React, { useState, useMemo } from "react";
import type {
  AttendanceRecord,
  Classroom,
  PeriodSetting,
  SchoolHoliday,
  SchoolProfile,
  TimetableEntry,
} from "@/types";
import {
  computeDailyMissingSummary,
  formatMissingLineMessage,
} from "@/lib/missingCheckinUtils";
import {
  getThaiDateString,
  getThaiOffsetDate,
  formatThaiDateLong,
} from "@/lib/dateUtils";
import {
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  CalendarOff,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";

interface MissingCheckinMonitorProps {
  classrooms: Classroom[];
  timetable: TimetableEntry[];
  attendanceLogs: AttendanceRecord[];
  holidays: SchoolHoliday[];
  periods: PeriodSetting[];
  schoolProfile: SchoolProfile;
  showNotice: (msg: string, type?: "success" | "error") => void;
}

const GRADES = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

export default function MissingCheckinMonitor({
  classrooms,
  timetable,
  attendanceLogs,
  holidays,
  periods,
  schoolProfile,
  showNotice,
}: MissingCheckinMonitorProps) {
  const [selectedDate, setSelectedDate] = useState(() => getThaiDateString());
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [showCompleteRooms, setShowCompleteRooms] = useState(false);
  const [onlyElapsedToday, setOnlyElapsedToday] = useState(true);
  const [copiedLine, setCopiedLine] = useState(false);

  const todayStr = getThaiDateString();
  const isToday = selectedDate === todayStr;

  const summary = useMemo(
    () =>
      computeDailyMissingSummary({
        dateStr: selectedDate,
        classrooms,
        timetable,
        attendanceLogs,
        holidays,
        periods,
        onlyElapsedToday,
      }),
    [selectedDate, classrooms, timetable, attendanceLogs, holidays, periods, onlyElapsedToday]
  );

  const filteredRooms = useMemo(() => {
    return summary.rooms.filter(
      (r) =>
        r.expectedCount > 0 &&
        (gradeFilter === "all" || r.classroom.grade === gradeFilter)
    );
  }, [summary.rooms, gradeFilter]);

  const incompleteRooms = useMemo(
    () => filteredRooms.filter((r) => !r.isComplete),
    [filteredRooms]
  );

  const completeRooms = useMemo(
    () => filteredRooms.filter((r) => r.isComplete),
    [filteredRooms]
  );

  const handleCopyLineMessage = async () => {
    const msg = formatMissingLineMessage(
      summary,
      gradeFilter,
      schoolProfile?.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"
    );
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedLine(true);
      showNotice("คัดลอกข้อความแจ้งเตือนสำหรับส่งกลุ่ม LINE เรียบร้อยแล้ว");
      setTimeout(() => setCopiedLine(false), 2500);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedLine(true);
      showNotice("คัดลอกข้อความแจ้งเตือนสำหรับส่งกลุ่ม LINE เรียบร้อยแล้ว");
      setTimeout(() => setCopiedLine(false), 2500);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800">
              ติดตามห้องเรียนที่ยังไม่เช็คชื่อประจำวัน (Missing Check-in Monitor)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              เทียบตารางสอนจริง (ตัดคาบว่าง/กิจกรรม/วันหยุดออกอัตโนมัติ) • {formatThaiDateLong(selectedDate)}
            </p>
          </div>
        </div>

        {/* Date Controls & Copy LINE Button */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate(getThaiDateString())}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              selectedDate === getThaiDateString()
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(getThaiOffsetDate(1))}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
              selectedDate === getThaiOffsetDate(1)
                ? "bg-sky-600 text-white border-sky-600"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            เมื่อวาน
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          />

          {!summary.isWeekend && !summary.fullDayHoliday && (
            <button
              type="button"
              onClick={handleCopyLineMessage}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all ${
                copiedLine
                  ? "bg-emerald-600 text-white"
                  : "bg-[#06C755] hover:bg-[#05b34c] text-white"
              }`}
            >
              {copiedLine ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>คัดลอกแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>คัดลอกข้อความส่ง LINE</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Holiday or Weekend Banner */}
      {summary.isWeekend ? (
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-1">
          <div className="text-sm font-bold text-slate-700">
            วันหยุดสุดสัปดาห์ (เสาร์–อาทิตย์)
          </div>
          <p className="text-xs text-slate-500">ไม่มีการเรียนการสอนในวันนี้</p>
        </div>
      ) : summary.fullDayHoliday ? (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-1.5">
          <CalendarOff className="w-7 h-7 text-amber-600 mx-auto" />
          <div className="text-sm font-bold text-amber-900">
            วันหยุด / งดการเรียนการสอนทั้งวัน: {summary.fullDayHoliday.title}
          </div>
          {summary.fullDayHoliday.note && (
            <p className="text-xs text-amber-700">{summary.fullDayHoliday.note}</p>
          )}
        </div>
      ) : (
        <>
          {/* Partial Holiday Notice */}
          {summary.partialHolidays.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <CalendarOff className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                วันนี้มีการงดการสอนบางคาบ:{" "}
                {summary.partialHolidays
                  .map((h) => `${h.title} (คาบ ${(h.periods || []).join(", ")})`)
                  .join(" • ")}{" "}
                — ระบบตัดคาบเหล่านี้ออกจากการนับแล้ว
              </span>
            </div>
          )}

          {/* KPI Strip + Grade Filter + Elapsed Toggle */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setGradeFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  gradeFilter === "all"
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                ทุกระดับชั้น ({filteredRooms.length})
              </button>
              {GRADES.map((g) => {
                const incCnt = summary.rooms.filter(
                  (r) => r.classroom.grade === g && !r.isComplete && r.expectedCount > 0
                ).length;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradeFilter(g)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                      gradeFilter === g
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{g}</span>
                    {incCnt > 0 && (
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                          gradeFilter === g
                            ? "bg-white/25 text-white"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {incCnt}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {isToday && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={onlyElapsedToday}
                  onChange={(e) => setOnlyElapsedToday(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500"
                />
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>ตรวจเฉพาะคาบที่ถึงเวลาเรียนแล้ว</span>
              </label>
            )}
          </div>

          {/* Summary Badges */}
          <div className="grid grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-[11px] text-rose-700 font-medium">ยังไม่ครบ</div>
              <div className="text-lg font-extrabold text-rose-800">
                {incompleteRooms.length} <span className="text-xs font-semibold">ห้อง</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[11px] text-emerald-700 font-medium">เช็คครบแล้ว</div>
              <div className="text-lg font-extrabold text-emerald-800">
                {completeRooms.length} <span className="text-xs font-semibold">ห้อง</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[11px] text-amber-700 font-medium">คาบที่ค้างรวม</div>
              <div className="text-lg font-extrabold text-amber-900">
                {incompleteRooms.reduce((s, r) => s + r.missingPeriods.length, 0)}{" "}
                <span className="text-xs font-semibold">คาบ</span>
              </div>
            </div>
          </div>

          {/* Incomplete Rooms Grid */}
          {filteredRooms.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
              ยังไม่ถึงเวลาเริ่มเรียนคาบแรกของวันนี้ หรือไม่มีคาบที่ต้องเช็คในช่วงเวลานี้
            </div>
          ) : incompleteRooms.length === 0 ? (
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
              <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
              <div className="text-sm font-bold text-emerald-900">
                เยี่ยมมาก! ทุกห้องเรียน{gradeFilter !== "all" ? ` (${gradeFilter})` : ""} เช็คชื่อครบถ้วนแล้ว
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {incompleteRooms.map((item) => (
                <div
                  key={item.classroom.id}
                  className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-200/90 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-rose-900 text-sm">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>ห้อง {item.classroom.gradeRoom}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-rose-200 text-rose-700 font-bold text-[10px]">
                      เช็คแล้ว {item.checkedCount}/{item.expectedCount} คาบ
                    </span>
                  </div>

                  <div className="space-y-1">
                    {item.missingPeriods.map((mp) => (
                      <div
                        key={mp.period}
                        className="text-[11px] bg-white rounded-lg px-2.5 py-1.5 border border-rose-100 flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-slate-700">
                          <strong className="text-rose-700">คาบ {mp.period}</strong> •{" "}
                          <span className="font-semibold">{mp.subjectCode}</span> {mp.subjectName}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 truncate max-w-[90px]">
                          {mp.teacherName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible Complete Rooms List */}
          {completeRooms.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowCompleteRooms((v) => !v)}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
              >
                {showCompleteRooms ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                <span>
                  {showCompleteRooms ? "ซ่อน" : "ดู"}รายชื่อห้องที่เช็คครบแล้ว ({completeRooms.length} ห้อง)
                </span>
              </button>

              {showCompleteRooms && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {completeRooms.map((item) => (
                    <span
                      key={item.classroom.id}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold"
                    >
                      ✓ {item.classroom.gradeRoom} ({item.checkedCount}/{item.expectedCount})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
