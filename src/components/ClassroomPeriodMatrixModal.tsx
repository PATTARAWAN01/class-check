"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Printer,
  X,
  Calendar,
  Filter,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Classroom, AttendanceRecord, SchoolProfile, TimetableEntry } from "@/types";
import { formatThaiDateLong, formatThaiDateShort, getThaiDateString } from "@/lib/dateUtils";
import { getSpecialNonCheckedPeriodInfo } from "@/lib/attendanceUtils";
import { toPng } from "html-to-image";

interface ClassroomPeriodMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  classrooms: Classroom[];
  records: AttendanceRecord[];
  schoolProfile: SchoolProfile;
  initialDate?: string;
  timetable?: TimetableEntry[];
}

function getTeacherFirstName(fullName: string = ""): string {
  if (!fullName) return "";
  const clean = fullName
    .replace(/^(นาย|นางสาว|นาง|ว่าที่ร้อยตรี|ดร\.|อ\.|ครู)\s*/g, "")
    .trim();
  const parts = clean.split(/\s+/);
  return parts[0] || clean;
}

export default function ClassroomPeriodMatrixModal({
  isOpen,
  onClose,
  classrooms,
  records,
  schoolProfile,
  initialDate,
  timetable = [],
}: ClassroomPeriodMatrixModalProps) {
  const [selectedDate, setSelectedDate] = useState(() => initialDate || getThaiDateString());
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [isExportingImage, setIsExportingImage] = useState(false);

  const pdfFileName = `ตารางสรุปการเช็คเข้าสอนรายห้องรายคาบ_${selectedDate}`;

  useEffect(() => {
    if (!isOpen) return;
    const prevTitle = document.title;
    document.title = pdfFileName;
    return () => {
      document.title = prevTitle;
    };
  }, [isOpen, pdfFileName]);

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = pdfFileName;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 1000);
  };

  const handleExportImage = async () => {
    const element = document.getElementById("matrix-printable-sheet");
    if (!element) return;
    try {
      setIsExportingImage(true);
      // Ensure full scroll height and width are captured completely without viewport clipping
      const fullHeight = element.scrollHeight;
      const fullWidth = Math.max(element.scrollWidth, 980);

      const dataUrl = await toPng(element, {
        quality: 0.95,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        height: fullHeight,
        width: fullWidth,
        style: {
          width: `${fullWidth}px`,
          minWidth: `${fullWidth}px`,
          height: `${fullHeight}px`,
          maxHeight: "none",
          overflow: "visible",
          margin: "0",
          transform: "none",
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

  // Day of week for selected date (0 = Sunday, 1 = Monday ... 6 = Saturday)
  const dayOfWeek = useMemo(() => {
    const parts = selectedDate.split("-").map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return 1;
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  }, [selectedDate]);

  // Filter records for the selected date
  const dayRecords = useMemo(() => {
    return records.filter((r) => r.date === selectedDate);
  }, [records, selectedDate]);

  // Sort classrooms naturally: ม.1/1, ม.1/2 ... ม.6/4
  const sortedClassrooms = useMemo(() => {
    const list = selectedGrade === "all"
      ? classrooms
      : classrooms.filter((c) => c.grade === selectedGrade);

    return [...list].sort((a, b) =>
      a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true })
    );
  }, [classrooms, selectedGrade]);

  // Quick lookup map: classroomId -> periodNumber -> record
  const matrixMap = useMemo(() => {
    const map = new Map<string, Map<number, AttendanceRecord>>();
    dayRecords.forEach((r) => {
      if (!map.has(r.classroomId)) {
        map.set(r.classroomId, new Map());
      }
      const roomMap = map.get(r.classroomId)!;
      for (let p = r.periodStart; p <= r.periodEnd; p++) {
        roomMap.set(p, r);
      }
    });
    return map;
  }, [dayRecords]);

  // Look up timetable entry for this classroom, day of week, and period
  const getTimetableEntry = (
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

  // Count expected check-in periods for a classroom on the selected date (excluding activities and free periods)
  const getExpectedPeriodCount = (clsId: string, gradeRoom: string): number => {
    let count = 0;
    for (let p = 1; p <= 7; p++) {
      const tt = getTimetableEntry(clsId, gradeRoom, p, dayOfWeek);
      const special = getSpecialNonCheckedPeriodInfo(clsId, gradeRoom, dayOfWeek, p, tt);
      if (!special) {
        count++;
      }
    }
    return count > 0 ? count : 7;
  };

  // Overall Statistics for selected date
  const stats = useMemo(() => {
    let fullyChecked = 0;
    let partiallyChecked = 0;
    let notChecked = 0;
    let totalCheckedPeriods = 0;

    sortedClassrooms.forEach((c) => {
      const roomMap = matrixMap.get(c.id);
      const count = roomMap ? roomMap.size : 0;
      const expected = getExpectedPeriodCount(c.id, c.gradeRoom);
      totalCheckedPeriods += count;
      if (count >= expected) fullyChecked++;
      else if (count > 0) partiallyChecked++;
      else notChecked++;
    });

    return { fullyChecked, partiallyChecked, notChecked, totalCheckedPeriods };
  }, [sortedClassrooms, matrixMap, dayOfWeek, timetable]);

  if (!isOpen) return null;

  const thaiDateLabel = formatThaiDateLong(selectedDate);
  const periods = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-white font-['TH_Sarabun_New','Sarabun',sans-serif]">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm 5mm 4mm 5mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 8pt !important;
            font-family: 'TH Sarabun New', 'Sarabun', sans-serif !important;
          }
          .no-print {
            display: none !important;
          }
          .matrix-print-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            font-family: 'TH Sarabun New', 'Sarabun', sans-serif !important;
          }
          .matrix-table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .matrix-table th, .matrix-table td {
            border: 1px solid #475569 !important;
            padding: 1.5px 2px !important;
            line-height: 1.1 !important;
          }
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl max-w-6xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Top Bar (Hidden on Print) */}
        <div className="bg-slate-900 text-white p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 no-print font-sans">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold">
                ตารางสรุปการเช็คเข้าสอนรายห้อง &bull; รายคาบ (1 หน้า A4)
              </h2>
              <p className="text-[11px] text-slate-400">
                โรงเรียนหนองวัวซอพิทยาคม &bull; สรุปสถานะการเช็คเวลา 27 ห้องเรียน
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Selector */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 text-[11px]">วันที่:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer text-xs"
              />
            </div>

            {/* Grade Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-800">ทุกระดับชั้น (27 ห้อง)</option>
                {["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"].map((g) => (
                  <option key={g} value={g} className="bg-slate-800">เฉพาะระดับ {g}</option>
                ))}
              </select>
            </div>

            {/* Save as PNG Image Button */}
            <button
              type="button"
              onClick={handleExportImage}
              disabled={isExportingImage}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
              title="บันทึกตารางเป็นไฟล์รูปภาพ PNG สำหรับส่งไลน์หรือใส่เอกสาร"
            >
              {isExportingImage ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5" />
              )}
              <span>{isExportingImage ? "กำลังบันทึกภาพ..." : "📷 บันทึกเป็นรูปภาพ (PNG)"}</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>พิมพ์ตาราง (1 หน้า A4)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Matrix Sheet */}
        <div
          id="matrix-printable-sheet"
          className="p-4 sm:p-5 overflow-y-auto print:p-0 print:overflow-visible text-slate-800 matrix-print-sheet bg-white"
        >
          {/* Standardized Header */}
          <div className="text-center border-b pb-2.5 mb-2.5 relative">
            <div className="flex flex-col items-center justify-center gap-1 mb-1">
              {/* Line 1: Logo (Enlarged and balanced) */}
              <img
                src={schoolProfile.logoUrl || "/LOGO-N.png"}
                alt="ตราโรงเรียนหนองวัวซอพิทยาคม"
                className="w-14 h-14 object-contain mx-auto print:w-12 print:h-12"
              />
              {/* Line 2: Title */}
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                ตารางสรุปการปฏิบัติการสอนของครูผู้สอนรายห้องและรายคาบ
              </h2>
              {/* Line 3: School Name */}
              <h1 className="text-xs sm:text-sm font-semibold text-slate-800 leading-tight">
                {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"} &bull; กลุ่มบริหารงานวิชาการ
              </h1>
              {/* Line 4: Term & Short Thai Date */}
              <p className="text-[11px] text-slate-600 font-medium leading-tight">
                ภาคเรียนที่ 2 ปีการศึกษา 2569 &bull; วันที่ {formatThaiDateShort(selectedDate)}
              </p>
            </div>

            <div className="flex items-center justify-between text-[10.5px] text-slate-700 font-bold px-1 mt-1 border-t pt-1 border-slate-200">
              <span>ประจำวัน: <strong>{thaiDateLabel}</strong> ({selectedDate})</span>
              <span className="text-[9px] text-slate-500 font-normal">
                สัญลักษณ์: <span className="text-emerald-700 font-bold">● ตรงเวลา</span> &bull; <span className="text-amber-700 font-bold">▲ สาย</span> &bull; <span className="text-rose-700 font-bold">✕ ไม่เข้าสอน</span> &bull; <span className="border border-dashed border-slate-400 px-1 rounded text-slate-600 bg-white">รหัสวิชา ครู [รอเช็ค]</span> &bull; <span className="text-slate-600 font-medium bg-slate-100 px-1 rounded border border-slate-200">[กิจกรรม/คาบว่าง]</span>
              </span>
            </div>
          </div>

          {/* Quick Stats Pill (Hidden on Print) */}
          <div className="mb-2.5 grid grid-cols-4 gap-2 text-center text-xs no-print font-sans">
            <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="text-[10px] text-emerald-800">เช็คครบทุกคาบ</div>
              <div className="text-base font-bold text-emerald-900">{stats.fullyChecked} ห้อง</div>
            </div>
            <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
              <div className="text-[10px] text-amber-800">เช็คบางส่วน</div>
              <div className="text-base font-bold text-amber-900">{stats.partiallyChecked} ห้อง</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200">
              <div className="text-[10px] text-slate-600">ยังไม่เช็คเลย</div>
              <div className="text-base font-bold text-slate-800">{stats.notChecked} ห้อง</div>
            </div>
            <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-200">
              <div className="text-[10px] text-indigo-800">คาบที่บันทึกแล้ว</div>
              <div className="text-base font-bold text-indigo-900">{stats.totalCheckedPeriods} คาบ</div>
            </div>
          </div>

          {/* 27 Classrooms x 7 Periods Matrix Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-slate-300 matrix-table">
              <thead>
                <tr className="bg-slate-800 text-white font-bold text-center text-[10px] sm:text-xs">
                  <th className="p-1 border border-slate-300 w-14 min-w-[56px] text-center">ห้องเรียน</th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 1<br/><span className="text-[8px] font-normal text-slate-300">08:40-09:30</span></th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 2<br/><span className="text-[8px] font-normal text-slate-300">09:30-10:20</span></th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 3<br/><span className="text-[8px] font-normal text-slate-300">10:20-11:10</span></th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 4<br/><span className="text-[8px] font-normal text-slate-300">11:10-12:00</span></th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 5<br/><span className="text-[8px] font-normal text-slate-300">13:00-13:50</span></th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 6<br/><span className="text-[8px] font-normal text-slate-300">13:50-14:40</span></th>
                  <th className="p-1 border border-slate-300 w-[11.5%]">คาบ 7<br/><span className="text-[8px] font-normal text-slate-300">14:40-15:30</span></th>
                  <th className="p-1 border border-slate-300 w-16 min-w-[64px] text-center">ความคืบหน้า</th>
                </tr>
              </thead>
              <tbody>
                {sortedClassrooms.map((cls, idx) => {
                  const roomMap = matrixMap.get(cls.id);
                  const checkedCount = roomMap ? roomMap.size : 0;
                  const isNewGrade = idx === 0 || sortedClassrooms[idx - 1].grade !== cls.grade;

                  return (
                    <tr
                      key={cls.id}
                      className={`text-center hover:bg-slate-50 ${
                        isNewGrade && idx > 0 ? "border-t-2 border-slate-400" : ""
                      }`}
                    >
                      <td className="p-1 border border-slate-300 font-bold bg-slate-50 text-slate-900 text-center whitespace-nowrap">
                        {cls.gradeRoom}
                      </td>

                      {periods.map((pNum) => {
                        const rec = roomMap ? roomMap.get(pNum) : undefined;
                        const ttMatch = getTimetableEntry(cls.id, cls.gradeRoom, pNum, dayOfWeek);
                        const specialInfo = getSpecialNonCheckedPeriodInfo(cls.id, cls.gradeRoom, dayOfWeek, pNum, ttMatch);

                        // Case 1: Checked records (On Time, Late, Absent) with subject code + teacher first name
                        if (rec) {
                          const teacherName = getTeacherFirstName(rec.teacherName);
                          const label = `${rec.subjectCode || ""} ${teacherName}`.trim();

                          if (rec.status === "on_time") {
                            return (
                              <td
                                key={pNum}
                                className="p-1 border border-slate-300 bg-emerald-50 text-emerald-950 font-semibold"
                                title={`${rec.teacherName} (${rec.subjectCode}) - ตรงเวลา`}
                              >
                                <div className="flex items-center justify-center gap-0.5 leading-tight">
                                  <span className="text-[9px] text-emerald-700 font-bold shrink-0">●</span>
                                  <span className="text-[8.5px] truncate max-w-[72px]">
                                    {label || "ตรงเวลา"}
                                  </span>
                                </div>
                              </td>
                            );
                          }

                          if (rec.status === "late") {
                            return (
                              <td
                                key={pNum}
                                className="p-1 border border-slate-300 bg-amber-50 text-amber-950 font-semibold"
                                title={`${rec.teacherName} (${rec.subjectCode}) - เข้าสอนสาย`}
                              >
                                <div className="flex items-center justify-center gap-0.5 leading-tight">
                                  <span className="text-[9px] text-amber-700 font-bold shrink-0">▲</span>
                                  <span className="text-[8.5px] truncate max-w-[72px]">
                                    {label || "สาย"}
                                  </span>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 bg-rose-50 text-rose-950 font-bold"
                              title={`${rec.teacherName} (${rec.subjectCode}) - ไม่เข้าสอน: ${rec.absenceReason || ""}`}
                            >
                              <div className="flex items-center justify-center gap-0.5 leading-tight">
                                <span className="text-[9px] text-rose-600 font-bold shrink-0">✕</span>
                                <span className="text-[8.5px] truncate max-w-[72px]">
                                  {label || "ไม่เข้า"}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        // Case 2: Special Activity or Free Period (ชุมนุม, ลูกเสือ, ผู้บำเพ็ญ, ทักษะชีวิต, ติว O-NET, เลือกเสรี, ซ่อมเสริม, คาบว่าง - ไม่ต้องเช็ค)
                        if (specialInfo) {
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 bg-slate-100 text-slate-500 text-center font-medium"
                              title={specialInfo.description}
                            >
                              <span className="text-[8.5px] px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold inline-block">
                                [{specialInfo.label}]
                              </span>
                            </td>
                          );
                        }

                        // Case 3: Unchecked period but has scheduled class in timetable (white bg, dashed border, slate text)
                        if (ttMatch && (ttMatch.subjectCode || ttMatch.teacherName)) {
                          const teacherName = getTeacherFirstName(ttMatch.teacherName);
                          const label = `${ttMatch.subjectCode || ""} ${teacherName}`.trim();
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 border-dashed bg-white text-slate-700 text-center font-normal"
                              title={`${ttMatch.teacherName} (${ttMatch.subjectCode}) - ยังไม่เช็ค`}
                            >
                              <span className="text-[8.5px] truncate max-w-[72px] inline-block opacity-85">
                                {label}
                              </span>
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
                            <span className="text-[8px] text-slate-500">[คาบว่าง]</span>
                          </td>
                        );
                      })}

                      {(() => {
                        const expected = getExpectedPeriodCount(cls.id, cls.gradeRoom);
                        const isComplete = checkedCount >= expected;
                        return (
                          <td className="p-1 border border-slate-300 font-bold text-center text-[10px] whitespace-nowrap">
                            <span
                              className={
                                isComplete
                                  ? "text-emerald-700"
                                  : checkedCount > 0
                                  ? "text-amber-700"
                                  : "text-slate-400"
                              }
                            >
                              {checkedCount}/{expected} คาบ
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

          {/* Footer Note */}
          <div className="mt-1.5 text-right text-[8.5px] text-slate-500">
            เอกสารสรุปอัตโนมัติจากระบบ Class Check &bull; พิมพ์เมื่อ {formatThaiDateLong(getThaiDateString())}
          </div>
        </div>

        {/* Modal Footer (Hidden on Print) */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 text-xs text-slate-500 flex items-center justify-between no-print font-sans">
          <div>
            💡 <strong className="text-slate-700">คำแนะนำ:</strong> จัดหน้ากระดาษแบบ A4 แนวตั้ง (Portrait) ตาราง 27 ห้องเรียนจะพอดีใน 1 หน้ากระดาษพอดี หรือกด "บันทึกเป็นรูปภาพ (PNG)" เพื่อเซฟเป็นรูปภาพส่งไลน์ได้ทันที
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
