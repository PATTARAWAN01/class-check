"use client";

import React, { useState } from "react";
import { Classroom } from "@/types";
import { Printer, X, Copy, Check, ShieldCheck, KeyRound } from "lucide-react";
import { formatThaiDateLong, getThaiDateString } from "@/lib/dateUtils";

interface ClassroomPinPrintModalProps {
  classrooms: Classroom[];
  isOpen: boolean;
  onClose: () => void;
  activeTermLabel?: string;
}

export default function ClassroomPinPrintModal({
  classrooms,
  isOpen,
  onClose,
  activeTermLabel = "ภาคเรียนที่ 2/2569",
}: ClassroomPinPrintModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const grades = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

  const handleCopyAll = () => {
    let text = `📋 สรุปรหัส PIN ประจำห้องเรียน (${activeTermLabel})\nโรงเรียนหนองวัวซอพิทยาคม\n--------------------------\n`;
    for (const g of grades) {
      const rooms = classrooms
        .filter((c) => c.grade === g)
        .sort((a, b) => a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true }));
      if (rooms.length > 0) {
        text += `\n【 ระดับชั้น ${g} 】\n`;
        for (const r of rooms) {
          text += `ห้อง ${r.gradeRoom} : PIN [ ${r.pinCode} ]\n`;
        }
      }
    }
    text += `\nพิมพ์เมื่อ: ${formatThaiDateLong(getThaiDateString())}\n`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 print:p-0 print:static print:bg-white">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Top Bar (Hidden on Print) */}
        <div className="bg-slate-900 text-white p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">
                ใบสรุปรหัส PIN ประจำห้องเรียน (Official PIN Sheet)
              </h2>
              <p className="text-xs text-slate-400">
                สำหรับฝ่ายวิชาการ ครูประจำชั้น และงานบริหารจัดการระบบ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAll}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">คัดลอกทั้งหมดแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-300" />
                  <span>คัดลอกข้อความทั้งหมด</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>สั่งพิมพ์ (Print / PDF)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Content Body */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 print:p-6 print:overflow-visible">
          {/* Header on Printable Sheet */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/LOGO-N.png"
                alt="โรงเรียนหนองวัวซอพิทยาคม"
                className="w-14 h-14 object-contain"
              />
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                  โรงเรียนหนองวัวซอพิทยาคม
                </h1>
                <p className="text-xs font-bold text-indigo-700">
                  ฝ่ายวิชาการ &bull; ระบบบันทึกเวลาเข้าสอน (Class Check)
                </p>
                <p className="text-[11px] text-slate-500">
                  ใบสรุปรหัส PIN ประจำห้องเรียน ({activeTermLabel})
                </p>
              </div>
            </div>

            <div className="text-right text-[11px] text-slate-600 space-y-0.5">
              <div className="flex items-center justify-end gap-1 font-semibold text-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>เอกสารข้อมูลเฉพาะภายใน</span>
              </div>
              <p>วันที่พิมพ์: {formatThaiDateLong(getThaiDateString())}</p>
              <p>จำนวนทั้งหมด: {classrooms.length} ห้องเรียน</p>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5 print:border-slate-300 print:bg-slate-50">
            <KeyRound className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <strong>ข้อควรระวังในการรักษาความปลอดภัย:</strong> รหัส PIN นี้เป็นรหัสผ่านสำหรับนักเรียนหัวหน้าห้องใช้เข้าสู่ระบบเช็คชื่อในแต่ละห้องเรียน กรุณาแจ้งเฉพาะครูที่ปรึกษาและหัวหน้าห้องของห้องนั้นๆ เพื่อป้องกันไม่ให้นักเรียนห้องอื่นนำรหัสไปใช้โดยไม่ได้รับอนุญาต
            </div>
          </div>

          {/* Grade Sections Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
            {grades.map((grade) => {
              const roomsInGrade = classrooms
                .filter((c) => c.grade === grade)
                .sort((a, b) => a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true }));

              return (
                <div
                  key={grade}
                  className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3 break-inside-avoid print:border-slate-300 print:bg-white print:p-3"
                  style={{ pageBreakInside: "avoid" }}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center">
                        {grade}
                      </span>
                      <span>ชั้นมัธยมศึกษาปีที่ {grade.replace("ม.", "")}</span>
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ({roomsInGrade.length} ห้องเรียน)
                    </span>
                  </div>

                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                        <th className="text-left py-1.5 px-2">ห้องเรียน</th>
                        <th className="text-center py-1.5 px-2">รหัส PIN</th>
                        <th className="text-right py-1.5 px-2">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {roomsInGrade.map((room) => (
                        <tr key={room.id} className="hover:bg-white/80 transition-colors">
                          <td className="py-2 px-2 font-bold text-slate-800">
                            ห้อง {room.gradeRoom}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className="font-mono font-black text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg tracking-widest inline-block print:bg-transparent print:border-none print:text-black">
                              {room.pinCode}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 print:border-none print:bg-transparent">
                              ใช้งาน
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Footer on Printable Sheet */}
          <div className="border-t border-slate-200 pt-4 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Class Check &bull; โรงเรียนหนองวัวซอพิทยาคม</span>
            <span>กลุ่มบริหารวิชาการ &bull; พิมพ์เอกสารเมื่อ {formatThaiDateLong(getThaiDateString())}</span>
          </div>
        </div>

        {/* Modal Footer (Hidden on Print) */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 text-xs text-slate-500 flex items-center justify-between no-print">
          <span>💡 สามารถกดพิมพ์หรือบันทึกเป็น PDF เพื่อจัดเก็บในแฟ้มวิชาการได้ทันที</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
