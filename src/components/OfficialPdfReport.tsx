"use client";

import React, { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { AcademicTerm, AttendanceRecord, SchoolProfile, Teacher } from "@/types";
import { getThaiDateString } from "@/lib/dateUtils";

interface OfficialPdfReportProps {
  schoolProfile: SchoolProfile;
  term: AcademicTerm | null;
  teacher: Teacher | null; // null = all teachers summary
  teachers?: Teacher[]; // All teachers list for overview report
  records: AttendanceRecord[];
  dateRangeLabel: string;
  onClose: () => void;
}

export default function OfficialPdfReport({
  schoolProfile,
  term,
  teacher,
  teachers = [],
  records,
  dateRangeLabel,
  onClose,
}: OfficialPdfReportProps) {
  // Aggregate statistics for this report
  let totalPeriods = 0;
  let onTimePeriods = 0;
  let latePeriods = 0;
  let absentPeriods = 0;
  let absentMeeting = 0;
  let absentActivity = 0;
  let absentOther = 0;

  // List of other notes
  const allOtherNotes: {
    teacherName: string;
    gradeRoom: string;
    subject: string;
    date: string;
    note: string;
  }[] = [];

  records.forEach((r) => {
    // If it was a leave record (sick, personal, official), ignore because substitute taught it
    if (
      r.status === "absent" &&
      (r.absenceReason === "sick" ||
        r.absenceReason === "personal" ||
        r.absenceReason === "official")
    ) {
      return;
    }

    const count = r.periodCount || 1;
    totalPeriods += count;
    if (r.status === "on_time") onTimePeriods += count;
    else if (r.status === "late") latePeriods += count;
    else if (r.status === "absent") {
      absentPeriods += count;
      if (r.absenceReason === "meeting") absentMeeting += count;
      else if (r.absenceReason === "activity") absentActivity += count;
      else {
        absentOther += count;
        if (r.absenceNote && r.absenceNote.trim()) {
          allOtherNotes.push({
            teacherName: r.teacherName,
            gradeRoom: r.gradeRoom,
            subject: r.subjectName || r.subjectCode,
            date: r.date,
            note: r.absenceNote.trim(),
          });
        }
      }
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
  const teacherSummaries = React.useMemo(() => {
    if (teacher || !teachers.length) return [];
    return teachers
      .map((t) => {
        const tRecords = records.filter(
          (r) => r.teacherId === t.id || r.teacherName.includes(t.fullName)
        );
        let tTotal = 0;
        let tOnTime = 0;
        let tLate = 0;
        let tAbsent = 0;
        let tMeeting = 0;
        let tActivity = 0;
        let tOther = 0;
        const tOtherNotes: string[] = [];

        tRecords.forEach((r) => {
          if (
            r.status === "absent" &&
            (r.absenceReason === "sick" ||
              r.absenceReason === "personal" ||
              r.absenceReason === "official")
          ) {
            return;
          }
          const count = r.periodCount || 1;
          tTotal += count;
          if (r.status === "on_time") tOnTime += count;
          else if (r.status === "late") tLate += count;
          else if (r.status === "absent") {
            tAbsent += count;
            if (r.absenceReason === "meeting") tMeeting += count;
            else if (r.absenceReason === "activity") tActivity += count;
            else {
              tOther += count;
              if (r.absenceNote && r.absenceNote.trim()) {
                tOtherNotes.push(r.absenceNote.trim());
              }
            }
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
          otherNotes: Array.from(new Set(tOtherNotes)),
          rate,
        };
      })
      .sort((a, b) =>
        a.teacher.code.localeCompare(b.teacher.code, undefined, { numeric: true })
      );
  }, [teacher, teachers, records]);

  const pdfFileName = teacher
    ? `รายงานการเข้าสอน_${teacher.fullName.replace(/\s+/g, "_")}_${getThaiDateString()}`
    : `รายงานการเข้าสอนภาพรวม_${getThaiDateString()}`;

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

  const isLandscape = false; // Locked to A4 portrait to strictly guarantee 1 single page!

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
                margin: 5mm 6mm 5mm 6mm !important;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-size: 8.5pt !important;
              }
              .report-document-sheet {
                padding: 0 !important;
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

      {/* Floating Action Controls (Hidden on Print) */}
      <div className="fixed top-3 left-3 sm:left-auto sm:top-4 sm:right-4 z-50 flex items-center gap-2 sm:gap-3 no-print max-w-[calc(100vw-24px)] overflow-x-auto">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-200 bg-slate-900/90 px-3.5 py-2 rounded-xl shadow-lg border border-slate-700">
          <span>💡 เพื่อความสะอาดของเอกสาร: ในหน้าต่างพิมพ์ ให้เอาเครื่องหมายถูกที่ <strong>"หัวกระดาษและท้ายกระดาษ" (Headers & Footers)</strong> ออก</span>
        </div>
        <div className="sm:hidden flex items-center gap-1 text-[11px] text-slate-200 bg-slate-900/90 px-2.5 py-1.5 rounded-xl shadow-lg border border-slate-700 whitespace-nowrap">
          <span>📱</span>
          <span>เลื่อนซ้าย-ขวา หรือหมุนจอนอน</span>
        </div>
        <button
          onClick={handlePrint}
          className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg flex items-center gap-1.5 sm:gap-2 transition-all active:scale-95 whitespace-nowrap"
        >
          <Printer className="w-4 h-4 shrink-0" />
          <span>สั่งพิมพ์ / PDF</span>
        </button>
        <button
          onClick={onClose}
          className="p-2 sm:p-2.5 bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 rounded-xl shadow-lg transition-colors shrink-0"
          title="ปิด"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Centering and Mobile Horizontal Panning Wrapper */}
      <div className="min-w-fit w-full flex justify-start sm:justify-center pt-14 pb-8 sm:py-6">
        {/* Official A4 Document Container */}
        <div
          className={`report-document-sheet bg-white text-slate-900 shrink-0 ${
            isLandscape ? "w-[297mm] min-w-[297mm] min-h-[210mm]" : "w-[210mm] min-w-[210mm] min-h-[297mm]"
          } p-6 sm:p-12 rounded-2xl shadow-2xl mx-auto print:m-0 print:p-0 print:shadow-none print:w-full print:max-w-none print:min-w-0 print:min-h-0 print:rounded-none font-['Sarabun'] leading-relaxed print:text-black`}
        >
        {/* Document Header */}
        <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
          <div className="w-20 h-20 mx-auto mb-2 flex items-center justify-center">
            <img
              src={schoolProfile.logoUrl || "/LOGO-N.png"}
              alt="ตราโรงเรียนหนองวัวซอพิทยาคม"
              width={80}
              height={80}
              style={{ width: "80px", height: "80px", objectFit: "contain" }}
              className="w-full h-full object-contain drop-shadow-sm"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"}
          </h1>
          <h2 className="text-base sm:text-lg font-semibold text-slate-800 mt-1">
            {teacher
              ? "รายงานผลการปฏิบัติการสอนของครูผู้สอน (รายบุคคล)"
              : "รายงานสรุปภาพรวมการปฏิบัติการสอนของครูผู้สอนทุกคน"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            ภาคเรียนที่ {term?.term || "2"} ปีการศึกษา {term?.year || "2569"} &bull;{" "}
            {dateRangeLabel}
          </p>

          {teacher && (
            <div className="mt-2 text-sm font-bold text-sky-900 bg-sky-50 inline-block px-4 py-1 rounded-full border border-sky-200">
              ครูผู้สอน: {teacher.prefix}{teacher.fullName} ({teacher.department})
            </div>
          )}
        </div>

        {/* Statistical Summary Box */}
        <div className="bg-slate-50 border border-slate-300 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6 text-sm print:p-1.5 print:mb-2 print:border-slate-300 print:bg-white">
          <div className="hidden print:flex items-center justify-between text-[8.5pt] font-semibold text-slate-800">
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
                  <span>&bull; ประชุม: <strong className="text-slate-900">{absentMeeting}</strong></span>
                  <span>&bull; กิจกรรมสำคัญ: <strong className="text-slate-900">{absentActivity}</strong></span>
                  <span>&bull; อื่นๆ: <strong className="text-slate-900">{absentOther}</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CONTENT TABLE: OVERVIEW TABLE (ALL TEACHERS) vs DETAIL TABLE (SINGLE TEACHER) */}
        {!teacher ? (
          /* ==================== 1. ALL TEACHERS SUMMARY TABLE (11 COLUMNS) ==================== */
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-slate-900 text-sm">
                ตารางสรุปผลการปฏิบัติการสอนของครูผู้สอนทุกคน ({teacherSummaries.length} ท่าน)
              </h3>
              <span className="text-[11px] text-slate-500">
                ร้อยละการเข้าสอน = ((ตรงเวลา + สาย) / คาบรวม) &times; 100
              </span>
            </div>

            <table className="w-full text-left text-xs print:text-[7.8pt] border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-semibold text-center print:bg-slate-100">
                  <th className="border border-slate-300 p-1 print:p-0.5 w-7 text-center whitespace-nowrap">ที่</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 text-left whitespace-nowrap">
                    ชื่อ - สกุลครูผู้สอน
                  </th>
                  <th className="border border-slate-300 p-1 print:p-0.5 text-left whitespace-nowrap">
                    กลุ่มสาระ
                  </th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-11 text-center whitespace-nowrap">คาบรวม</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-11 text-center whitespace-nowrap text-emerald-800">ตรงเวลา</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-9 text-center whitespace-nowrap text-amber-800">สาย</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-12 text-center whitespace-nowrap text-rose-800 font-bold">ไม่เข้าสอน</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-10 text-center whitespace-nowrap text-slate-700">ประชุม</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-11 text-center whitespace-nowrap text-slate-700">กิจกรรม</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 text-left whitespace-nowrap text-slate-700">อื่นๆ/เหตุผล</th>
                  <th className="border border-slate-300 p-1 print:p-0.5 w-14 text-center whitespace-nowrap font-bold text-slate-900">ร้อยละเข้า</th>
                </tr>
              </thead>
              <tbody>
                {teacherSummaries.map((ts, idx) => (
                  <tr key={ts.teacher.id} className="hover:bg-slate-50 print:hover:bg-transparent">
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center">{idx + 1}</td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-1 font-semibold text-slate-900 whitespace-nowrap">
                      {ts.teacher.prefix}{ts.teacher.fullName}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-1 text-slate-700 whitespace-nowrap">
                      {shortenDept(ts.teacher.department)}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center font-bold">
                      {ts.total}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center text-emerald-700 font-semibold">
                      {ts.onTime}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center text-amber-700 font-semibold">
                      {ts.late}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center text-rose-700 font-bold">
                      {ts.absent}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center text-slate-600">
                      {ts.meeting > 0 ? ts.meeting : "-"}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center text-slate-600">
                      {ts.activity > 0 ? ts.activity : "-"}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-1 text-slate-700">
                      {ts.other > 0 ? (
                        <div>
                          <span className="font-bold text-rose-700">{ts.other}</span>
                          {ts.otherNotes.length > 0 && (
                            <span className="text-[9px] text-slate-600 block leading-tight">
                              ({ts.otherNotes.slice(0, 2).join(", ")})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-center text-slate-400">-</div>
                      )}
                    </td>
                    <td className="border border-slate-300 p-1 print:py-0.5 print:px-0.5 text-center font-bold text-slate-800">
                      {ts.rate}
                    </td>
                  </tr>
                ))}

                {/* SUMMARY ROW: Rendered as the final row of tbody so it only prints once at the end of the entire table */}
                <tr className="bg-slate-100 font-bold text-slate-900 text-center border-t-2 border-slate-400 print:bg-slate-100">
                  <td colSpan={3} className="border border-slate-300 p-1 print:py-0.5 print:px-1 text-right whitespace-nowrap">
                    รวมทั้งโรงเรียน ({teacherSummaries.length} ท่าน):
                  </td>
                  <td className="border border-slate-300 p-1.5">{totalPeriods}</td>
                  <td className="border border-slate-300 p-1.5 text-emerald-800">{onTimePeriods}</td>
                  <td className="border border-slate-300 p-1.5 text-amber-800">{latePeriods}</td>
                  <td className="border border-slate-300 p-1.5 text-rose-800 font-bold">{absentPeriods}</td>
                  <td className="border border-slate-300 p-1.5">{absentMeeting > 0 ? absentMeeting : "-"}</td>
                  <td className="border border-slate-300 p-1.5">{absentActivity > 0 ? absentActivity : "-"}</td>
                  <td className="border border-slate-300 p-1.5">{absentOther > 0 ? absentOther : "-"}</td>
                  <td className="border border-slate-300 p-1.5 text-sky-900">{overallRate}%</td>
                </tr>
              </tbody>
            </table>

            {/* Absence Reasons Notes Summary Box (if students specified any notes) */}
            {allOtherNotes.length > 0 && (
              <div className="mt-3.5 p-3 bg-slate-50 border border-slate-300 rounded-lg text-xs break-inside-avoid">
                <div className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <span>📌 สรุปเหตุผลการไม่เข้าสอนที่นักเรียนระบุเพิ่มเติม ({allOtherNotes.length} รายการ):</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-slate-700">
                  {allOtherNotes.map((item, i) => (
                    <div key={i} className="flex items-start gap-1">
                      <span className="text-slate-400">&bull;</span>
                      <span>
                        <strong>{item.teacherName}</strong> ({item.gradeRoom} {item.subject}, {item.date}):{" "}
                        <span className="font-medium text-rose-900 bg-rose-50 px-1 rounded">{item.note}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ==================== 2. SINGLE TEACHER DETAIL TABLE ==================== */
          <div className="mb-8">
            <h3 className="font-bold text-slate-900 mb-2 text-sm">
              รายละเอียดบันทึกการเข้าสอนแต่ละคาบ ({records.length} รายการ)
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
                {records.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="border border-slate-300 p-4 text-center text-slate-400"
                    >
                      ไม่พบข้อมูลบันทึกการเข้าสอนในช่วงเวลานี้
                    </td>
                  </tr>
                ) : (
                  records.map((r, idx) => (
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
            <div className="mt-8 pt-3 print:mt-2 print:pt-1 border-t border-slate-200 text-xs text-slate-700 break-inside-avoid">
              <div className={`grid ${gridColsClass} gap-4 sm:gap-6 text-center print:gap-2`}>
                {signersList.map((signer) => (
                  <div key={signer.id} className="space-y-1 print:space-y-0.5">
                    <p className="font-semibold text-slate-800 print:text-[8pt]">{signer.roleTitle}</p>
                    <div className="h-12 print:h-6"></div>
                    <p className="font-medium print:text-[8pt]">({signer.name || "..................................................."})</p>
                    <p className="text-slate-500 text-[11px] print:text-[7pt]">{signer.position}</p>
                    <p className="text-slate-400 text-[10px] print:text-[6.5pt]">
                      วันที่ ........ เดือน .................... พ.ศ. ............
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Official Document Footer */}
        <div className="mt-8 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400 print:text-slate-500">
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
