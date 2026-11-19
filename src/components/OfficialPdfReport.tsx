"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Printer, X, Image as ImageIcon, Loader2, Calendar } from "lucide-react";
import { AcademicTerm, AttendanceRecord, SchoolProfile, Teacher, TimetableEntry } from "@/types";
import { getThaiDateString, getThaiOffsetDate, formatThaiDateShort, formatThaiDateLong } from "@/lib/dateUtils";
import { getEffectivePeriodCount, deduplicateAttendanceRecords } from "@/lib/attendanceUtils";
import { toPng } from "html-to-image";

interface OfficialPdfReportProps {
  schoolProfile: SchoolProfile;
  term: AcademicTerm | null;
  teacher: Teacher | null; // null = all teachers summary
  teachers?: Teacher[]; // All teachers list for overview report
  timetable?: TimetableEntry[];
  records: AttendanceRecord[];
  allRecords?: AttendanceRecord[];
  initialDate?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  initialViewMode?: "single" | "range";
  dateRangeLabel?: string;
  onClose: () => void;
}

export default function OfficialPdfReport({
  schoolProfile,
  term,
  teacher,
  teachers = [],
  timetable = [],
  records,
  allRecords,
  initialDate,
  initialStartDate,
  initialEndDate,
  initialViewMode,
  dateRangeLabel = "",
  onClose,
}: OfficialPdfReportProps) {
  const [viewMode, setViewMode] = useState<"single" | "range">(() => {
    if (initialViewMode) return initialViewMode;
    if (initialStartDate && initialEndDate && initialStartDate !== initialEndDate) return "range";
    if (dateRangeLabel && (dateRangeLabel.includes("ช่วง") || dateRangeLabel.includes("สัปดาห์") || dateRangeLabel.includes("เดือน"))) return "range";
    return "range";
  });

  const [singleDate, setSingleDate] = useState(() => initialDate || getThaiDateString());
  const [rangeStartDate, setRangeStartDate] = useState(() => initialStartDate || getThaiOffsetDate(7));
  const [rangeEndDate, setRangeEndDate] = useState(() => initialEndDate || getThaiDateString());
  const [isExportingImage, setIsExportingImage] = useState(false);

  // Find the earliest date in records for "Both/Full Term" shortcut
  const earliestRecordDate = useMemo(() => {
    const pool = allRecords && allRecords.length > 0 ? allRecords : records;
    if (!pool.length) return getThaiOffsetDate(90);
    const dates = pool.map((r) => r.date).filter(Boolean).sort();
    return dates[0] || getThaiOffsetDate(90);
  }, [allRecords, records]);

  // Filter records dynamically when allRecords is supplied
  const effectiveRecords = useMemo(() => {
    const pool = allRecords && allRecords.length > 0 ? allRecords : records;

    return pool.filter((r) => {
      // 1. Term filter (if specified)
      if (term?.id && r.termId && r.termId !== term.id) return false;

      // 2. Teacher filter (if single teacher modal)
      if (teacher) {
        const matchesTeacher =
          r.teacherId === teacher.id ||
          (teacher.fullName && r.teacherName && r.teacherName.includes(teacher.fullName));
        if (!matchesTeacher) return false;
      }

      // 3. Date filtering based on viewMode
      if (viewMode === "single") {
        return r.date === singleDate;
      } else {
        if (rangeStartDate && r.date < rangeStartDate) return false;
        if (rangeEndDate && r.date > rangeEndDate) return false;
        return true;
      }
    });
  }, [allRecords, records, term, teacher, viewMode, singleDate, rangeStartDate, rangeEndDate]);

  // Clean and deduplicate records to eliminate accidental duplicate check-ins
  const cleanRecords = useMemo(() => deduplicateAttendanceRecords(effectiveRecords), [effectiveRecords]);

  // Aggregate statistics for this report
  let totalPeriods = 0;
  let onTimePeriods = 0;
  let latePeriods = 0;
  let absentPeriods = 0;
  let absentMeeting = 0;
  let absentActivity = 0;
  let absentOther = 0;

  // List of all late and absence notes for summary
  const allLateNotes: {
    teacherName: string;
    gradeRoom: string;
    subject: string;
    date: string;
    note: string;
  }[] = [];

  const allAbsentNotes: {
    teacherName: string;
    gradeRoom: string;
    subject: string;
    date: string;
    note: string;
  }[] = [];

  cleanRecords.forEach((r) => {
    const count = getEffectivePeriodCount(r, timetable);
    totalPeriods += count;
    if (r.status === "on_time") onTimePeriods += count;
    else if (r.status === "late") {
      latePeriods += count;
      if (r.lateNote && r.lateNote.trim()) {
        allLateNotes.push({
          teacherName: r.teacherName,
          gradeRoom: r.gradeRoom,
          subject: r.subjectName || r.subjectCode,
          date: r.date,
          note: r.lateNote.trim(),
        });
      }
    }
    else if (r.status === "absent") {
      absentPeriods += count;
      if (r.absenceReason === "meeting") absentMeeting += count;
      else if (r.absenceReason === "activity") absentActivity += count;
      else absentOther += count;

      const noteText = (r.absenceNote && r.absenceNote.trim()) || (
        r.absenceReason === "meeting" ? "ประชุม" :
        r.absenceReason === "activity" ? "เข้าร่วมกิจกรรมของโรงเรียน" :
        r.absenceReason === "sick" ? "ลาป่วย" :
        r.absenceReason === "personal" ? "ลากิจ" :
        r.absenceReason === "official" ? "ไปราชการ" :
        "ไม่ระบุเหตุผล"
      );

      allAbsentNotes.push({
        teacherName: r.teacherName,
        gradeRoom: r.gradeRoom,
        subject: r.subjectName || r.subjectCode,
        date: r.date,
        note: noteText,
      });
    }
  });

  const onTimeRate =
    totalPeriods > 0 ? ((onTimePeriods / totalPeriods) * 100).toFixed(1) : "0.0";
  const lateRate =
    totalPeriods > 0 ? ((latePeriods / totalPeriods) * 100).toFixed(1) : "0.0";
  const absentRate =
    totalPeriods > 0 ? ((absentPeriods / totalPeriods) * 100).toFixed(1) : "0.0";
  const overallRate =
    totalPeriods > 0
      ? (((onTimePeriods + latePeriods) / totalPeriods) * 100).toFixed(1)
      : "0.0";

  // Compute breakdown for all teachers when in Overview Mode
  const teacherSummaries = useMemo(() => {
    if (teacher || !teachers.length) return [];
    return teachers
      .map((t) => {
        const tRecords = cleanRecords.filter(
          (r) => r.teacherId === t.id || r.teacherName.includes(t.fullName)
        );
        let tTotal = 0;
        let tOnTime = 0;
        let tLate = 0;
        let tAbsent = 0;
        let tMeeting = 0;
        let tActivity = 0;
        let tOther = 0;
        const tLateNotes: string[] = [];
        const tAbsentNotes: string[] = [];

        tRecords.forEach((r) => {
          const count = getEffectivePeriodCount(r, timetable);
          tTotal += count;
          if (r.status === "on_time") tOnTime += count;
          else if (r.status === "late") {
            tLate += count;
            if (r.lateNote && r.lateNote.trim()) {
              const datePrefix = viewMode === "range" && r.date ? `${formatThaiDateShort(r.date)}: ` : "";
              const roomSuffix = r.gradeRoom ? ` (${r.gradeRoom})` : "";
              tLateNotes.push(`${datePrefix}${r.lateNote.trim()}${roomSuffix}`);
            }
          }
          else if (r.status === "absent") {
            tAbsent += count;
            if (r.absenceReason === "meeting") tMeeting += count;
            else if (r.absenceReason === "activity") tActivity += count;
            else tOther += count;

            const noteText = (r.absenceNote && r.absenceNote.trim()) || (
              r.absenceReason === "meeting" ? "ประชุม" :
              r.absenceReason === "activity" ? "เข้าร่วมกิจกรรมของโรงเรียน" :
              r.absenceReason === "sick" ? "ลาป่วย" :
              r.absenceReason === "personal" ? "ลากิจ" :
              r.absenceReason === "official" ? "ไปราชการ" :
              "ไม่ระบุเหตุผล"
            );

            const datePrefix = viewMode === "range" && r.date ? `${formatThaiDateShort(r.date)}: ` : "";
            const roomSuffix = r.gradeRoom ? ` (${r.gradeRoom})` : "";
            tAbsentNotes.push(`${datePrefix}${noteText}${roomSuffix}`);
          }
        });

        // Attendance rate formula: ((OnTime + Late) / Total) * 100
        const rate =
          tTotal > 0
            ? (((tOnTime + tLate) / tTotal) * 100).toFixed(1) + "%"
            : "-";

        return {
          teacher: t,
          total: tTotal,
          onTime: tOnTime,
          late: tLate,
          absent: tAbsent,
          meeting: tMeeting,
          activity: tActivity,
          other: tOther,
          lateNotes: Array.from(new Set(tLateNotes)),
          absentNotes: Array.from(new Set(tAbsentNotes)),
          rate,
        };
      })
      .sort((a, b) =>
        a.teacher.code.localeCompare(b.teacher.code, undefined, { numeric: true })
      );
  }, [teacher, teachers, cleanRecords, timetable, viewMode]);

  const pdfFileName = useMemo(() => {
    const dateStr =
      viewMode === "single"
        ? singleDate
        : `${rangeStartDate}_ถึง_${rangeEndDate}`;
    return teacher
      ? `รายงานการเข้าสอน_${teacher.fullName.replace(/\s+/g, "_")}_${dateStr}`
      : `รายงานสรุปภาพรวมการปฏิบัติการสอน_${dateStr}`;
  }, [teacher, viewMode, singleDate, rangeStartDate, rangeEndDate]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = pdfFileName;
    return () => {
      document.title = prevTitle;
    };
  }, [pdfFileName]);

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = pdfFileName;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 1000);
  };

  const handleExportImage = async () => {
    const modal = document.getElementById("official-pdf-report-modal");
    const element = document.getElementById("official-report-sheet");
    if (!element) return;
    try {
      setIsExportingImage(true);
      if (modal) modal.scrollLeft = 0;

      // Exact dimension capture with pixelRatio 3.5 (prevents right whitespace gap)
      const fullHeight = element.scrollHeight;
      const fullWidth = element.scrollWidth;

      const dataUrl = await toPng(element, {
        quality: 1.0,
        backgroundColor: "#ffffff",
        pixelRatio: 3.5,
        height: fullHeight,
        width: fullWidth,
        style: {
          width: `${fullWidth}px`,
          height: `${fullHeight}px`,
          margin: "0 auto",
          transform: "none",
          maxWidth: "none",
        },
      });
      const link = document.createElement("a");
      link.download = `${pdfFileName}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export image error:", err);
      alert("เกิดข้อผิดพลาดในการบันทึกรูปภาพ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsExportingImage(false);
    }
  };

  const shortenDept = (dept: string) => {
    const clean = (dept || "").replace("กลุ่มสาระการเรียนรู้", "").trim();
    if (clean.includes("วิทยาศาสตร์")) return "วิทย์ฯ";
    if (clean.includes("คณิตศาสตร์")) return "คณิตฯ";
    if (clean.includes("ภาษาไทย")) return "ภาษาไทย";
    if (clean.includes("ต่างประเทศ")) return "ต่างประเทศ";
    if (clean.includes("สังคม")) return "สังคมฯ";
    if (clean.includes("สุขศึกษา") || clean.includes("พลศึกษา")) return "สุขฯ/พละ";
    if (clean.includes("ศิลปะ")) return "ศิลปะ";
    if (clean.includes("การงาน")) return "การงานฯ";
    return clean;
  };

  return (
    <div
      id="official-pdf-report-modal"
      className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm overflow-x-auto overflow-y-auto p-2 sm:p-6 print:static print:inset-auto print:overflow-visible print:p-0 print:m-0 print:bg-white print:block print:w-full print:h-auto"
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 portrait !important;
                margin: 8mm 6mm 6mm 6mm !important;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-size: 7.2pt !important;
              }
              .report-document-sheet {
                padding: 0 !important;
                padding-top: 2.5mm !important;
                margin: 0 auto !important;
                box-shadow: none !important;
                max-width: 100% !important;
                min-width: 0 !important;
                width: 100% !important;
                min-height: auto !important;
                border-radius: 0 !important;
              }
              thead {
                display: table-header-group !important;
              }
              tr {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .no-print {
                display: none !important;
              }
            }
          `,
        }}
      />

      {/* Sticky Action Controls (Hidden on Print) */}
      <div className="sticky top-2 z-50 mb-3 bg-slate-900/95 text-white p-2.5 sm:px-4 sm:py-3 rounded-2xl shadow-2xl border border-slate-700 flex flex-wrap items-center justify-between gap-2.5 no-print max-w-5xl mx-auto backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-bold leading-tight">
              {teacher
                ? `รายงานผลการสอน: ${teacher.prefix}${teacher.fullName}`
                : "รายงานสรุปภาพรวมการปฏิบัติการสอนของครูทุกคน"}
            </h2>
            <p className="text-[10.5px] text-slate-400 hidden sm:block">
              {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"} &bull; กลุ่มบริหารงานวิชาการ
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode Switcher Pill */}
          <div className="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode("single")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "single"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              📆 รายวัน (1 วัน)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("range")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "range"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              📅 ช่วงเวลา (สะสม)
            </button>
          </div>

          {/* Date Selector(s) based on ViewMode */}
          {viewMode === "single" ? (
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 text-[11px]">วันที่:</span>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              />
              <button
                type="button"
                onClick={() => setSingleDate(getThaiDateString())}
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-colors ${
                  singleDate === getThaiDateString()
                    ? "bg-sky-600 text-white border-sky-500"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                }`}
                title="เลือกวันนี้"
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => setSingleDate(getThaiOffsetDate(1))}
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-colors ${
                  singleDate === getThaiOffsetDate(1)
                    ? "bg-sky-600 text-white border-sky-500"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600"
                }`}
                title="เลือกเมื่อวาน"
              >
                เมื่อวาน
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 text-[11px]">ตั้งแต่:</span>
              <input
                type="date"
                value={rangeStartDate}
                onChange={(e) => setRangeStartDate(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              />
              <span className="text-slate-400 text-[11px]">ถึง:</span>
              <input
                type="date"
                value={rangeEndDate}
                onChange={(e) => setRangeEndDate(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              />
              <div className="flex items-center gap-1 pl-1 border-l border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setRangeStartDate(getThaiOffsetDate(7));
                    setRangeEndDate(getThaiDateString());
                  }}
                  className="px-1.5 py-0.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium transition-colors"
                  title="7 วันล่าสุด"
                >
                  7 วัน
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = getThaiDateString();
                    setRangeStartDate(`${today.substring(0, 7)}-01`);
                    setRangeEndDate(today);
                  }}
                  className="px-1.5 py-0.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium transition-colors"
                  title="ประจำเดือนนี้"
                >
                  เดือนนี้
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRangeStartDate(getThaiOffsetDate(30));
                    setRangeEndDate(getThaiDateString());
                  }}
                  className="px-1.5 py-0.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium transition-colors"
                  title="30 วันล่าสุด"
                >
                  30 วัน
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRangeStartDate(earliestRecordDate);
                    setRangeEndDate(getThaiDateString());
                  }}
                  className="px-1.5 py-0.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-medium transition-colors"
                  title="ทั้งภาคเรียน (ข้อมูลทั้งหมดที่มีในระบบ)"
                >
                  ทั้งเทอม
                </button>
              </div>
            </div>
          )}

          {/* Save as PNG Image Button */}
          <button
            type="button"
            onClick={handleExportImage}
            disabled={isExportingImage}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95"
            title="บันทึกรายงานเป็นรูปภาพ PNG ความละเอียดสูง (Ultra-HD 300 DPI)"
          >
            {isExportingImage ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ImageIcon className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{isExportingImage ? "กำลังบันทึกภาพ..." : "📷 บันทึกรูปภาพ (PNG)"}</span>
          </button>

          {/* Print / PDF Button */}
          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>สั่งพิมพ์ / PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
            title="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Centering and Mobile Horizontal Panning Wrapper */}
      <div className="w-full flex justify-center items-center pb-8 sm:pb-6 pt-1">
        {/* Official A4 Document Container */}
        <div
          id="official-report-sheet"
          className="report-document-sheet bg-white text-slate-900 shrink-0 w-[210mm] max-w-[210mm] min-h-[297mm] p-6 sm:p-10 rounded-2xl shadow-2xl mx-auto print:m-0 print:p-0 print:shadow-none print:w-full print:max-w-none print:min-w-0 print:min-h-0 print:rounded-none font-['TH_Sarabun_New','Sarabun',sans-serif] leading-relaxed print:text-black"
        >
          {/* Document Header (Standardized Format) */}
          <div className="text-center border-b-2 border-slate-900 pb-3 mb-3 print:pb-1 print:mb-1">
            {/* Line 1: Logo (Enlarged and balanced with top headroom to prevent PDF clipping) */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-1 flex items-center justify-center print:w-12 print:h-12 print:mb-0.5 print:pt-1">
              <img
                src={schoolProfile.logoUrl || "/LOGO-N.png"}
                alt="ตราโรงเรียนหนองวัวซอพิทยาคม"
                width={80}
                height={80}
                style={{ width: "80px", height: "80px", objectFit: "contain" }}
                className="w-full h-full object-contain drop-shadow-sm print:w-12 print:h-12"
              />
            </div>

            {/* Line 2: Title */}
            <h2 className="text-base sm:text-lg font-bold text-slate-900 print:text-[8.8pt] print:leading-tight">
              {teacher
                ? "รายงานผลการปฏิบัติการสอนของครูผู้สอน (รายบุคคล)"
                : "รายงานสรุปภาพรวมการปฏิบัติการสอนของครูผู้สอนทุกคน"}
            </h2>

            {/* Line 3: School Name */}
            <h1 className="text-xs sm:text-sm font-semibold text-slate-800 mt-0.5 print:text-[7.8pt] print:leading-tight print:mt-0">
              {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"} &bull; กลุ่มบริหารงานวิชาการ
            </h1>

            {/* Line 4: Term & Short Thai Date */}
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5 print:text-[6.8pt] print:leading-tight print:mt-0 font-medium">
              ภาคเรียนที่ {term?.term || "2"} ปีการศึกษา {term?.year || "2569"} &bull;{" "}
              {viewMode === "single" ? (
                <>ประจำ{formatThaiDateLong(singleDate)} (วันที่ {singleDate})</>
              ) : (
                <>
                  ข้อมูลสะสมระหว่างวันที่ {formatThaiDateShort(rangeStartDate)} ถึง{" "}
                  {formatThaiDateShort(rangeEndDate)}
                </>
              )}
            </p>

            {teacher && (
              <div className="mt-1.5 text-sm font-bold text-sky-900 bg-sky-50 inline-block px-4 py-0.5 rounded-full border border-sky-200 print:text-[7pt] print:py-0">
                ครูผู้สอน: {teacher.prefix}{teacher.fullName} ({teacher.department})
              </div>
            )}
          </div>

          {/* Statistical Summary Box */}
          <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 text-sm print:p-0.5 print:mb-1 print:border-slate-300 print:bg-white">
            <div className="hidden print:flex items-center justify-between text-[6.8pt] font-semibold text-slate-800">
              <span>คาบรวมทั้งหมด: <strong className="text-slate-900">{totalPeriods}</strong> คาบ</span>
              <span className="text-emerald-800">ตรงเวลา: <strong>{onTimePeriods}</strong> ({onTimeRate}%)</span>
              <span className="text-amber-800">สาย: <strong>{latePeriods}</strong> ({lateRate}%)</span>
              <span className="text-rose-800 font-bold">ไม่เข้าสอน: <strong>{absentPeriods}</strong> ({absentRate}%)</span>
              <span>ร้อยละเข้าสอนรวม: <strong className="text-slate-900">{overallRate}%</strong></span>
            </div>

            <div className="print:hidden">
              <h3 className="font-bold text-slate-900 mb-2 border-b border-slate-200 pb-1">
                {teacher ? "สรุปผลการปฏิบัติการสอน" : "สรุปผลการปฏิบัติการสอนภาพรวมทั้งโรงเรียน"}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-xs text-slate-500">คาบสอนทั้งหมด</div>
                  <div className="text-lg font-bold text-slate-900">{totalPeriods} คาบ</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-xs text-emerald-700">เข้าสอนตรงเวลา</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {onTimePeriods} คาบ ({onTimeRate}%)
                  </div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-xs text-amber-700">เข้าสอนสาย (&gt;10น.)</div>
                  <div className="text-lg font-bold text-amber-700">
                    {latePeriods} คาบ ({lateRate}%)
                  </div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-xs text-rose-700">ไม่เข้าสอน</div>
                  <div className="text-lg font-bold text-rose-700">
                    {absentPeriods} คาบ ({absentRate}%)
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600">
                <div>
                  <span>ร้อยละการเข้าสอนรวม (ตรงเวลา + สาย): </span>
                  <strong className="text-sky-900 font-bold text-sm">{overallRate}%</strong>
                </div>
                {absentPeriods > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-600 font-medium">
                    <span>&bull; ไม่เข้าสอน: <strong className="text-rose-900 font-bold">{absentPeriods} คาบ</strong> (ระบุเหตุผลครบทุกรายการ)</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CONTENT TABLE: OVERVIEW TABLE (ALL TEACHERS) vs DETAIL TABLE (SINGLE TEACHER) */}
          {!teacher ? (
            /* ==================== 1. ALL TEACHERS SUMMARY TABLE (11 COLUMNS) ==================== */
            <div className="mb-6 print:mb-1">
              <div className="flex items-center justify-between mb-2 print:mb-0.5">
                <h3 className="font-bold text-slate-900 text-sm print:text-[7.5pt]">
                  ตารางสรุปผลการปฏิบัติการสอนของครูผู้สอนทุกคน ({teacherSummaries.length} ท่าน)
                </h3>
                <span className="text-[11px] text-slate-500 print:text-[6.2pt]">
                  ร้อยละการเข้าสอน = ((ตรงเวลา + สาย) / คาบรวม) &times; 100
                </span>
              </div>

              <table className="w-full text-left text-xs print:text-[6.8pt] print:leading-none border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-semibold text-center print:bg-slate-100">
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-6 print:w-5 text-center whitespace-nowrap">ที่</th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-1 w-[125px] print:w-[115px] sm:print:w-[122px] text-left whitespace-nowrap">
                      ชื่อ - สกุลครูผู้สอน
                    </th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-14 print:w-[42px] text-left whitespace-nowrap">
                      กลุ่มสาระ
                    </th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-9 print:w-7 text-center whitespace-nowrap">คาบรวม</th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-9 print:w-7 text-center whitespace-nowrap text-emerald-800">ตรงเวลา</th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-8 print:w-6 text-center whitespace-nowrap text-amber-800">สาย</th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-10 print:w-8 text-center whitespace-nowrap text-rose-800 font-bold">ไม่เข้าสอน</th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-1 text-left whitespace-nowrap text-slate-700">
                      เหตุผลการเข้าสอนสาย/ไม่เข้าสอน
                    </th>
                    <th className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 w-11 print:w-9 text-center whitespace-nowrap font-bold text-slate-900">ร้อยละเข้า</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherSummaries.map((ts, idx) => (
                    <tr key={ts.teacher.id} className="hover:bg-slate-50 print:hover:bg-transparent">
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-center">{idx + 1}</td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-1 font-semibold text-slate-900 whitespace-nowrap truncate max-w-[125px]">
                        {ts.teacher.prefix}{ts.teacher.fullName}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-slate-700 whitespace-nowrap">
                        {shortenDept(ts.teacher.department)}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-center font-bold">
                        {ts.total}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-center text-emerald-700 font-semibold">
                        {ts.onTime}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-center text-amber-700 font-semibold">
                        {ts.late}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-center text-rose-700 font-bold">
                        {ts.absent > 0 ? ts.absent : "-"}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-1 text-slate-700">
                        {ts.lateNotes.length > 0 || ts.absentNotes.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {ts.lateNotes.map((note, nIdx) => (
                              <span key={`l_${nIdx}`} className="text-[9px] print:text-[5.8pt] text-amber-700 font-semibold leading-tight">
                                ● สาย: {note}
                              </span>
                            ))}
                            {ts.absentNotes.map((note, nIdx) => (
                              <span key={`a_${nIdx}`} className="text-[9px] print:text-[5.8pt] text-rose-700 font-bold leading-tight">
                                ✕ ไม่เข้า: {note}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-slate-400">-</div>
                        )}
                      </td>
                      <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-center font-bold text-slate-800">
                        {ts.rate}
                      </td>
                    </tr>
                  ))}

                  {/* SUMMARY ROW: Rendered as the final row of tbody so it only prints once at the end of the entire table */}
                  <tr className="bg-slate-100 font-bold text-slate-900 text-center border-t-2 border-slate-400 print:bg-slate-100">
                    <td colSpan={3} className="border border-slate-300 p-1 print:py-[1px] print:px-1 text-right whitespace-nowrap">
                      รวมทั้งโรงเรียน ({teacherSummaries.length} ท่าน):
                    </td>
                    <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5">{totalPeriods}</td>
                    <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-emerald-800">{onTimePeriods}</td>
                    <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-amber-800">{latePeriods}</td>
                    <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-rose-800 font-bold">{absentPeriods}</td>
                    <td className="border border-slate-300 p-1 print:py-[1px] print:px-1 text-left text-slate-700">
                      {allLateNotes.length > 0 || allAbsentNotes.length > 0
                        ? `ระบุเหตุผล ${allLateNotes.length + allAbsentNotes.length} รายการ (สาย ${allLateNotes.length}, ไม่เข้า ${allAbsentNotes.length})`
                        : "-"}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-[1px] print:px-0.5 text-sky-900">{overallRate}%</td>
                  </tr>
                </tbody>
              </table>

              {/* Late & Absence Reasons Notes Summary Box */}
              {(allLateNotes.length > 0 || allAbsentNotes.length > 0) && (
                <div className="mt-2.5 print:mt-1 p-2 print:p-1 bg-slate-50 border border-slate-300 rounded-lg text-xs print:text-[5.8pt] print:leading-tight break-inside-avoid">
                  {allLateNotes.length > 0 && (
                    <div className="mb-2 print:mb-1">
                      <div className="font-bold text-amber-900 mb-0.5 flex items-center gap-1">
                        <span>⚠️ สรุปสาเหตุการเข้าสอนสาย ({allLateNotes.length} รายการ):</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-slate-700">
                        {allLateNotes.map((item, i) => (
                          <div key={i} className="flex items-start gap-1">
                            <span className="text-amber-500 font-bold">&bull;</span>
                            <span className="truncate">
                              <strong>{item.teacherName}</strong> ({item.gradeRoom} {item.subject}
                              {viewMode === "range" && item.date ? ` • ${formatThaiDateShort(item.date)}` : ""}):{" "}
                              <span className="font-semibold text-amber-800 bg-amber-50 px-1 rounded">{item.note}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {allAbsentNotes.length > 0 && (
                    <div>
                      <div className="font-bold text-rose-900 mb-0.5 flex items-center gap-1">
                        <span>📌 สรุปเหตุผลการไม่เข้าสอน ({allAbsentNotes.length} รายการ):</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-slate-700">
                        {allAbsentNotes.map((item, i) => (
                          <div key={i} className="flex items-start gap-1">
                            <span className="text-rose-500 font-bold">&bull;</span>
                            <span className="truncate">
                              <strong>{item.teacherName}</strong> ({item.gradeRoom} {item.subject}
                              {viewMode === "range" && item.date ? ` • ${formatThaiDateShort(item.date)}` : ""}):{" "}
                              <span className="font-bold text-rose-800 bg-rose-50 px-1 rounded">{item.note}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ==================== 2. SINGLE TEACHER DETAIL TABLE ==================== */
            <div className="mb-6">
              <h3 className="font-bold text-slate-900 mb-2 text-sm">
                รายละเอียดบันทึกการเข้าสอนแต่ละคาบ ({cleanRecords.length} รายการ)
              </h3>
              <table className="w-full text-left text-xs print:text-[11px] border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 print:bg-slate-100">
                    <th className="border border-slate-300 p-2 text-center w-8">ที่</th>
                    <th className="border border-slate-300 p-2 text-center w-20">วันที่</th>
                    <th className="border border-slate-300 p-2 text-center w-14">คาบ</th>
                    <th className="border border-slate-300 p-2 text-center w-14">ห้อง</th>
                    <th className="border border-slate-300 p-2">วิชา</th>
                    <th className="border border-slate-300 p-2 text-center w-28">สถานะการเข้าสอน</th>
                    <th className="border border-slate-300 p-2">หมายเหตุ/สาเหตุ</th>
                    <th className="border border-slate-300 p-2 text-center w-24">ผู้บันทึก</th>
                  </tr>
                </thead>
                <tbody>
                  {cleanRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="border border-slate-300 p-4 text-center text-slate-400"
                      >
                        ไม่พบข้อมูลบันทึกการเข้าสอนในช่วงเวลานี้
                      </td>
                    </tr>
                  ) : (
                    cleanRecords.map((r, idx) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-1.5 text-center">{idx + 1}</td>
                        <td className="border border-slate-300 p-1.5 text-center">{r.date}</td>
                        <td className="border border-slate-300 p-1.5 text-center font-semibold">
                          {r.periodStart === r.periodEnd
                            ? `${r.periodStart}`
                            : `${r.periodStart}-${r.periodEnd}`}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center">{r.gradeRoom}</td>
                        <td className="border border-slate-300 p-1.5">
                          {r.subjectCode} {r.subjectName}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center font-medium">
                          {r.status === "on_time" && (
                            <span className="text-emerald-700">ตรงเวลา</span>
                          )}
                          {r.status === "late" && (
                            <span className="text-amber-700">สาย (&gt;10น.)</span>
                          )}
                          {r.status === "absent" && (
                            <span className="text-rose-700">ไม่เข้าสอน</span>
                          )}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-slate-600">
                          {r.status === "absent"
                            ? `${
                                r.absenceReason === "official"
                                  ? "ไปราชการ"
                                  : r.absenceReason === "personal"
                                  ? "ลากิจ"
                                  : r.absenceReason === "sick"
                                  ? "ลาป่วย"
                                  : r.absenceReason === "meeting"
                                  ? "ประชุม"
                                  : r.absenceReason === "activity"
                                  ? "เข้าร่วมกิจกรรมสำคัญของโรงเรียน"
                                  : "อื่นๆ"
                              } ${r.absenceNote ? `(${r.absenceNote})` : ""}`
                            : r.isSubstitute
                            ? `(สอนแทน: ${r.originalTeacherName || ""})`
                            : "-"}
                        </td>
                        <td className="border border-slate-300 p-1.5 text-center text-slate-500">
                          {r.recordedByStudent}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Dynamic Signatures Section (Configured by Admin) */}
          {(() => {
            const signersList =
              schoolProfile.signers && schoolProfile.signers.length > 0
                ? schoolProfile.signers
                : [
                    {
                      id: "default_1",
                      roleTitle: "ผู้ตรวจสอบข้อมูล",
                      name: schoolProfile.academicHeadName || "นางสาวศิริพร บุญช่วย",
                      position: "หัวหน้ากลุ่มบริหารงานวิชาการ",
                    },
                    {
                      id: "default_2",
                      roleTitle: "ผู้รับรองรายงาน",
                      name: schoolProfile.directorName || "นายสมศักดิ์ สุขสวัสดิ์",
                      position: `ผู้อำนวยการ${schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"}`,
                    },
                  ];

            const gridColsClass =
              signersList.length === 1
                ? "grid-cols-1 max-w-xs mx-auto"
                : signersList.length === 2
                ? "grid-cols-2 max-w-2xl mx-auto"
                : signersList.length === 3
                ? "grid-cols-3 max-w-4xl mx-auto"
                : "grid-cols-2 sm:grid-cols-4";

            return (
              <div className="mt-6 pt-2 print:mt-1 print:pt-0.5 border-t border-slate-200 text-xs text-slate-700 break-inside-avoid">
                <div className={`grid ${gridColsClass} gap-3 text-center print:gap-1.5`}>
                  {signersList.map((signer) => (
                    <div key={signer.id} className="space-y-0.5 print:space-y-0">
                      <p className="font-semibold text-slate-800 print:text-[6.8pt]">{signer.roleTitle}</p>
                      <div className="h-8 print:h-3.5"></div>
                      <p className="font-medium print:text-[6.8pt]">({signer.name || "..................................................."})</p>
                      <p className="text-slate-500 text-[10px] print:text-[5.8pt]">{signer.position}</p>
                      <p className="text-slate-400 text-[9px] print:text-[5.5pt]">
                        วันที่ ........ เดือน .................... พ.ศ. ............
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Official Document Footer */}
          <div className="mt-4 pt-1.5 print:mt-0.5 print:pt-0.5 border-t border-slate-200 flex items-center justify-between text-[9px] print:text-[5.5pt] text-slate-400 print:text-slate-500">
            <div>
              <span>ระบบ Class Check &bull; {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"}</span>
            </div>
            <div>
              <span>พิมพ์เมื่อ: {new Date().toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} น.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
