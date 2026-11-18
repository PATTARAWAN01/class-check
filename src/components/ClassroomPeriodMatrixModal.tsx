"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Printer, X, Calendar, CheckCircle2, AlertTriangle, XCircle, Clock, Filter, Eye } from "lucide-react";
import { Classroom, AttendanceRecord, SchoolProfile } from "@/types";
import { formatThaiDateLong, getThaiDateString } from "@/lib/dateUtils";

interface ClassroomPeriodMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  classrooms: Classroom[];
  records: AttendanceRecord[];
  schoolProfile: SchoolProfile;
  initialDate?: string;
}

export default function ClassroomPeriodMatrixModal({
  isOpen,
  onClose,
  classrooms,
  records,
  schoolProfile,
  initialDate,
}: ClassroomPeriodMatrixModalProps) {
  const [selectedDate, setSelectedDate] = useState(() => initialDate || getThaiDateString());
  const [selectedGrade, setSelectedGrade] = useState<string>("all");

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

  // Overall Statistics for selected date
  const stats = useMemo(() => {
    let fullyChecked = 0;
    let partiallyChecked = 0;
    let notChecked = 0;
    let totalCheckedPeriods = 0;

    sortedClassrooms.forEach((c) => {
      const roomMap = matrixMap.get(c.id);
      const count = roomMap ? roomMap.size : 0;
      totalCheckedPeriods += count;
      if (count >= 7) fullyChecked++;
      else if (count > 0) partiallyChecked++;
      else notChecked++;
    });

    return { fullyChecked, partiallyChecked, notChecked, totalCheckedPeriods };
  }, [sortedClassrooms, matrixMap]);

  if (!isOpen) return null;

  const thaiDateLabel = formatThaiDateLong(selectedDate);
  const periods = [1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-white">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm 6mm 8mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 8.5pt !important;
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
          }
          .matrix-table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          .matrix-table th, .matrix-table td {
            border: 1px solid #475569 !important;
            padding: 2.5px 3px !important;
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
        <div className="bg-slate-900 text-white p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 no-print">
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
        <div className="p-4 sm:p-6 overflow-y-auto print:p-0 print:overflow-visible text-slate-800 font-sans matrix-print-sheet">
          {/* Header */}
          <div className="text-center border-b pb-2 mb-2 relative">
            <div className="flex items-center justify-center gap-2 mb-1">
              <img
                src="/LOGO-N.png"
                alt="โรงเรียนหนองวัวซอพิทยาคม"
                className="w-10 h-10 object-contain"
              />
              <div className="text-center">
                <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"}
                </h1>
                <p className="text-[10px] text-slate-600 font-semibold leading-tight">
                  ตารางสรุปการปฏิบัติการสอนของครูผู้สอนรายห้องและรายคาบ &bull; กลุ่มบริหารงานวิชาการ
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-700 font-bold px-1 mt-1">
              <span>ประจำวัน: <strong>{thaiDateLabel}</strong> ({selectedDate})</span>
              <span className="text-[10px] text-slate-500 font-normal">
                สัญลักษณ์: <span className="text-emerald-700 font-bold">● ตรงเวลา</span> &bull; <span className="text-amber-700 font-bold">▲ สาย</span> &bull; <span className="text-rose-700 font-bold">✕ ไม่เข้าสอน</span> &bull; <span className="text-slate-400">- ยังไม่เช็ค</span>
              </span>
            </div>
          </div>

          {/* Quick Stats Pill (Hidden on Print) */}
          <div className="mb-3 grid grid-cols-4 gap-2 text-center text-xs no-print">
            <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="text-[10px] text-emerald-800">เช็คครบ 7 คาบ</div>
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
                  <th className="p-1 border border-slate-300 w-16 text-center">ห้องเรียน</th>
                  <th className="p-1 border border-slate-300">คาบ 1<br/><span className="text-[8px] font-normal text-slate-300">08:40-09:30</span></th>
                  <th className="p-1 border border-slate-300">คาบ 2<br/><span className="text-[8px] font-normal text-slate-300">09:30-10:20</span></th>
                  <th className="p-1 border border-slate-300">คาบ 3<br/><span className="text-[8px] font-normal text-slate-300">10:20-11:10</span></th>
                  <th className="p-1 border border-slate-300">คาบ 4<br/><span className="text-[8px] font-normal text-slate-300">11:10-12:00</span></th>
                  <th className="p-1 border border-slate-300">คาบ 5<br/><span className="text-[8px] font-normal text-slate-300">13:00-13:50</span></th>
                  <th className="p-1 border border-slate-300">คาบ 6<br/><span className="text-[8px] font-normal text-slate-300">13:50-14:40</span></th>
                  <th className="p-1 border border-slate-300">คาบ 7<br/><span className="text-[8px] font-normal text-slate-300">14:40-15:30</span></th>
                  <th className="p-1 border border-slate-300 w-16 text-center">ความคืบหน้า</th>
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
                      <td className="p-1 border border-slate-300 font-bold bg-slate-50 text-slate-900 text-left pl-2 whitespace-nowrap">
                        {cls.gradeRoom}
                      </td>

                      {periods.map((pNum) => {
                        const rec = roomMap ? roomMap.get(pNum) : undefined;
                        if (!rec) {
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 text-slate-300 bg-white"
                            >
                              -
                            </td>
                          );
                        }

                        if (rec.status === "on_time") {
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 bg-emerald-50 text-emerald-900 font-semibold"
                              title={`${rec.teacherName} (${rec.subjectCode}) - ตรงเวลา`}
                            >
                              <div className="flex items-center justify-center gap-0.5">
                                <span className="text-[9px] text-emerald-700 font-bold">●</span>
                                <span className="text-[9px] truncate max-w-[70px]">
                                  {rec.subjectCode || "ตรงเวลา"}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        if (rec.status === "late") {
                          return (
                            <td
                              key={pNum}
                              className="p-1 border border-slate-300 bg-amber-50 text-amber-900 font-semibold"
                              title={`${rec.teacherName} (${rec.subjectCode}) - เข้าสอนสาย`}
                            >
                              <div className="flex items-center justify-center gap-0.5">
                                <span className="text-[9px] text-amber-700 font-bold">▲</span>
                                <span className="text-[9px] truncate max-w-[70px]">
                                  {rec.subjectCode || "สาย"}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={pNum}
                            className="p-1 border border-slate-300 bg-rose-50 text-rose-900 font-bold"
                            title={`${rec.teacherName} (${rec.subjectCode}) - ไม่เข้าสอน: ${rec.absenceReason || ""}`}
                          >
                            <div className="flex items-center justify-center gap-0.5">
                              <span className="text-[9px] text-rose-600 font-bold">✕</span>
                              <span className="text-[9px] truncate max-w-[70px]">
                                {rec.subjectCode || "ไม่เข้า"}
                              </span>
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-1 border border-slate-300 font-bold text-center text-[10px] whitespace-nowrap">
                        <span
                          className={
                            checkedCount === 7
                              ? "text-emerald-700"
                              : checkedCount > 0
                              ? "text-amber-700"
                              : "text-slate-400"
                          }
                        >
                          {checkedCount}/7 คาบ
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Note */}
          <div className="mt-2 text-right text-[9px] text-slate-500">
            เอกสารสรุปอัตโนมัติจากระบบ Class Check &bull; พิมพ์เมื่อ {formatThaiDateLong(getThaiDateString())}
          </div>
        </div>

        {/* Modal Footer (Hidden on Print) */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 text-xs text-slate-500 flex items-center justify-between no-print">
          <div>
            💡 <strong className="text-slate-700">คำแนะนำ:</strong> จัดหน้ากระดาษแบบ A4 แนวตั้ง (Portrait) ตาราง 27 ห้องเรียนจะพอดีใน 1 หน้ากระดาษพอดี
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
