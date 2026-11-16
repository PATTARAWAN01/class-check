"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Classroom } from "@/types";
import { Printer, Download, QrCode, X, Filter } from "lucide-react";

interface ClassroomQrPrintProps {
  classrooms: Classroom[];
  isOpen: boolean;
  onClose: () => void;
}

interface QrCardData {
  room: Classroom;
  qrDataUrl: string;
  checkUrl: string;
}

export default function ClassroomQrPrint({
  classrooms,
  isOpen,
  onClose,
}: ClassroomQrPrintProps) {
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [qrCards, setQrCards] = useState<QrCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    async function generateQrs() {
      setLoading(true);
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://nongwua-classcheck.web.app";

      const filtered =
        selectedGrade === "all"
          ? classrooms
          : classrooms.filter((c) => c.grade === selectedGrade);

      const cards: QrCardData[] = [];
      for (const room of filtered) {
        const checkUrl = `${origin}/check?roomId=${room.id}`;
        try {
          const qrDataUrl = await QRCode.toDataURL(checkUrl, {
            width: 320,
            margin: 1.5,
            color: {
              dark: "#0f172a",
              light: "#ffffff",
            },
          });
          cards.push({ room, qrDataUrl, checkUrl });
        } catch (err) {
          console.error("QR Code generation error for room:", room.gradeRoom, err);
        }
      }
      setQrCards(cards);
      setLoading(false);
    }

    generateQrs();
  }, [isOpen, selectedGrade, classrooms]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 print:p-0 print:static print:bg-white">
      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Header (Hidden on print) */}
        <div className="bg-slate-900 text-white p-4 sm:p-6 flex flex-wrap items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <QrCode className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold">
                พิมพ์แผ่น QR Code ประจำห้องเรียน
              </h2>
              <p className="text-xs text-slate-400">
                โรงเรียนหนองวัวซอพิทยาคม &bull; สแกนแล้วเข้าสู่ระบบของห้องเรียนทันที
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Grade Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-800 text-white">
                  ทุกระดับชั้น (27 ห้อง)
                </option>
                <option value="ม.1" className="bg-slate-800 text-white">
                  เฉพาะ มัธยมศึกษาปีที่ 1 (5 ห้อง)
                </option>
                <option value="ม.2" className="bg-slate-800 text-white">
                  เฉพาะ มัธยมศึกษาปีที่ 2 (5 ห้อง)
                </option>
                <option value="ม.3" className="bg-slate-800 text-white">
                  เฉพาะ มัธยมศึกษาปีที่ 3 (5 ห้อง)
                </option>
                <option value="ม.4" className="bg-slate-800 text-white">
                  เฉพาะ มัธยมศึกษาปีที่ 4 (4 ห้อง)
                </option>
                <option value="ม.5" className="bg-slate-800 text-white">
                  เฉพาะ มัธยมศึกษาปีที่ 5 (4 ห้อง)
                </option>
                <option value="ม.6" className="bg-slate-800 text-white">
                  เฉพาะ มัธยมศึกษาปีที่ 6 (4 ห้อง)
                </option>
              </select>
            </div>

            {/* Print Button */}
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-md shadow-sky-600/30"
            >
              <Printer className="w-4 h-4" />
              <span>สั่งพิมพ์การ์ด (Print)</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50 print:bg-white print:p-0">
          {loading ? (
            <div className="py-20 text-center text-slate-400 text-sm">
              <QrCode className="w-10 h-10 animate-spin mx-auto text-sky-500 mb-3" />
              กำลังประมวลผลสร้างรหัส QR Code ประจำห้องเรียน...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 print:grid-cols-2 print:gap-4">
              {qrCards.map(({ room, qrDataUrl, checkUrl }) => (
                <div
                  key={room.id}
                  className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-5 shadow-sm text-center flex flex-col justify-between break-inside-avoid print:shadow-none print:border-slate-400 print:rounded-2xl print:p-4"
                  style={{ pageBreakInside: "avoid" }}
                >
                  {/* Top Header with School Branding */}
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <img
                        src="/LOGO-N.png"
                        alt="โรงเรียนหนองวัวซอพิทยาคม"
                        className="w-8 h-8 object-contain"
                      />
                      <div className="text-left">
                        <div className="font-extrabold text-xs text-slate-800 leading-tight">
                          โรงเรียนหนองวัวซอพิทยาคม
                        </div>
                        <div className="text-[10px] text-sky-700 font-semibold">
                          Class Check &bull; จุดบันทึกเวลาสอน
                        </div>
                      </div>
                    </div>

                    {/* Room Badge */}
                    <div className="bg-sky-50 border border-sky-200 py-2 px-3 rounded-2xl my-2 inline-block w-full">
                      <div className="text-[10px] text-sky-700 font-semibold uppercase tracking-wider">
                        ห้องเรียนประจำ
                      </div>
                      <div className="text-2xl font-black text-slate-900 tracking-tight">
                        {room.gradeRoom}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        (มัธยมศึกษาปีที่ {room.grade.replace("ม.", "")} ห้อง {room.room})
                      </div>
                    </div>
                  </div>

                  {/* QR Code Image */}
                  <div className="my-3 flex flex-col items-center justify-center">
                    <div className="p-2 bg-white rounded-2xl border border-slate-200 shadow-inner inline-block">
                      <img
                        src={qrDataUrl}
                        alt={`QR Code ห้อง ${room.gradeRoom}`}
                        className="w-44 h-44 object-contain mx-auto"
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-600 font-medium max-w-[220px] mx-auto leading-tight">
                      📲 ใช้กล้องมือถือสแกน เพื่อเปิดหน้าเช็คชื่อห้องนี้ทันที
                    </div>
                  </div>

                  {/* Footer Instructions */}
                  <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>รหัสห้อง: {room.id}</span>
                    <span>รหัส PIN ดูได้จากหัวหน้าห้อง</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer (Hidden on print) */}
        <div className="bg-white border-t border-slate-200 p-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            💡 <strong className="text-slate-700">คำแนะนำ:</strong> สามารถกด{" "}
            <span className="font-semibold text-sky-600">
              &quot;สั่งพิมพ์การ์ด (Print)&quot;
            </span>{" "}
            เพื่อพิมพ์ใส่กระดาษ A4 ตัดแจกติดไว้หน้าโต๊ะหรือป้ายหน้าห้องเรียนทั้ง 27 ห้องได้ทันที
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 transition-colors"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
