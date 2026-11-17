"use client";

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Classroom } from "@/types";
import {
  Printer,
  X,
  Copy,
  Check,
  Filter,
  KeyRound,
  QrCode,
  BookOpen,
  Scissors,
} from "lucide-react";

interface ClassroomPinPrintModalProps {
  classrooms: Classroom[];
  isOpen: boolean;
  onClose: () => void;
  activeTermLabel?: string;
}

interface RoomCardData {
  room: Classroom;
  checkUrl: string;
  checkQrDataUrl: string;
  guideUrl: string;
  guideQrDataUrl: string;
}

export default function ClassroomPinPrintModal({
  classrooms,
  isOpen,
  onClose,
  activeTermLabel = "ภาคเรียนที่ 2/2569",
}: ClassroomPinPrintModalProps) {
  const [selectedGrade, setSelectedGrade] = useState<string>("all");
  const [roomCards, setRoomCards] = useState<RoomCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function generateQrs() {
      setLoading(true);
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://nwsp-class-check.vercel.app";

      const filtered =
        selectedGrade === "all"
          ? classrooms
          : classrooms.filter((c) => c.grade === selectedGrade);

      // Sort by gradeRoom
      const sorted = [...filtered].sort((a, b) =>
        a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true })
      );

      const cards: RoomCardData[] = [];
      const guideUrl = `${origin}/guide`;

      // Generate guide QR once
      let guideQrDataUrl = "";
      try {
        guideQrDataUrl = await QRCode.toDataURL(guideUrl, {
          width: 200,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
      } catch (e) {
        console.error("Guide QR error:", e);
      }

      for (const room of sorted) {
        const checkUrl = `${origin}/check?roomId=${room.id}`;
        try {
          const checkQrDataUrl = await QRCode.toDataURL(checkUrl, {
            width: 200,
            margin: 1,
            color: { dark: "#0f172a", light: "#ffffff" },
          });

          cards.push({
            room,
            checkUrl,
            checkQrDataUrl,
            guideUrl,
            guideQrDataUrl,
          });
        } catch (err) {
          console.error("QR Error for room:", room.gradeRoom, err);
        }
      }

      setRoomCards(cards);
      setLoading(false);
    }

    generateQrs();
  }, [isOpen, selectedGrade, classrooms]);

  if (!isOpen) return null;

  const grades = ["all", "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"];

  const handleCopyText = () => {
    const targetRooms =
      selectedGrade === "all"
        ? classrooms
        : classrooms.filter((c) => c.grade === selectedGrade);

    const sorted = [...targetRooms].sort((a, b) =>
      a.gradeRoom.localeCompare(b.gradeRoom, "th", { numeric: true })
    );

    let text = `📋 รหัส PIN เข้าเช็คชื่อ (${activeTermLabel})\nโรงเรียนหนองวัวซอพิทยาคม\n--------------------------\n`;
    for (const r of sorted) {
      text += `ห้อง ${r.gradeRoom} : PIN [ ${r.pinCode} ]\n`;
    }
    text += `\nลิงก์ระบบ: https://nwsp-class-check.vercel.app/check\nคู่มือวิธีใช้งาน: https://nwsp-class-check.vercel.app/guide\n`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  // Chunk cards into groups of 6 (for strict 6-cards-per-A4 page printing)
  const cardChunks: RoomCardData[][] = [];
  for (let i = 0; i < roomCards.length; i += 6) {
    cardChunks.push(roomCards.slice(i, i + 6));
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 print:p-0 print:static print:bg-white">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm 6mm 5mm 6mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-chunk-grid {
            display: grid !important;
            grid-template-columns: repeat(2, 97mm) !important;
            grid-auto-rows: 91mm !important;
            column-gap: 4mm !important;
            row-gap: 3mm !important;
            justify-content: center !important;
            align-content: start !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            height: 285mm !important;
            max-height: 285mm !important;
            box-sizing: border-box !important;
          }
          .page-break-after-6 {
            page-break-after: always !important;
            break-after: page !important;
          }
          .room-handout-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1.5px dashed #475569 !important;
            border-radius: 10px !important;
            padding: 6px 8px !important;
            background: white !important;
            box-shadow: none !important;
            height: 91mm !important;
            max-height: 91mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            overflow: hidden !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Top Bar (Hidden on Print) */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                พิมพ์บัตรประจำห้องเรียน (6 ห้องต่อ 1 แผ่น A4)
              </h2>
              <p className="text-xs text-slate-400">
                ขนาดกะทัดรัดพอดีมือ มีรอยประตัดแจกหัวหน้าห้อง ({activeTermLabel})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Grade Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                {grades.map((g) => (
                  <option key={g} value={g} className="bg-slate-800 text-white">
                    {g === "all"
                      ? `พิมพ์ทุกระดับชั้น (${classrooms.length} ห้อง)`
                      : `เฉพาะระดับ ${g} (${
                          classrooms.filter((c) => c.grade === g).length
                        } ห้อง)`}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleCopyText}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">คัดลอกแล้ว!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-300" />
                  <span>คัดลอกข้อความ</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>สั่งพิมพ์การ์ด 6 ห้อง/แผ่น</span>
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
        <div className="p-4 sm:p-6 overflow-y-auto print:p-0 print:overflow-visible">
          {/* Instructions banner on screen (Hidden on print) */}
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-center justify-between gap-2 no-print">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>รูปแบบจัดพิมพ์ 6 ห้องต่อ 1 แผ่น A4 (2 คอลัมน์ × 3 แถว):</strong> ลดพื้นที่ว่าง ปรับขนาดให้กระชับพอดีกับการตัดแจก มี QR เข้าเช็คชื่อ + QR คู่มือวิธีใช้งาน
              </span>
            </div>
            <span className="font-bold text-amber-800 shrink-0">
              พบ {roomCards.length} ห้อง (พิมพ์ {cardChunks.length} แผ่น A4)
            </span>
          </div>

          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              กำลังประมวลผลสร้างรหัส PIN และ QR Code ทั้งหมด...
            </div>
          ) : (
            <div className="space-y-6 print:space-y-0">
              {cardChunks.map((chunk, chunkIdx) => (
                <div
                  key={chunkIdx}
                  className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 print-chunk-grid ${
                    chunkIdx < cardChunks.length - 1 ? "page-break-after-6 mb-6" : ""
                  }`}
                >
                  {chunk.map(({ room, checkUrl, checkQrDataUrl, guideUrl, guideQrDataUrl }) => (
                    <div
                      key={room.id}
                      className="room-handout-card bg-white border-2 border-dashed border-slate-300 rounded-2xl p-3 shadow-xs text-center flex flex-col justify-between relative break-inside-avoid"
                      style={{ pageBreakInside: "avoid" }}
                    >
                      {/* Top Scissors Indicator */}
                      <div className="absolute top-1 right-2 text-[8px] text-slate-400 font-mono flex items-center gap-0.5 no-print">
                        <Scissors className="w-2.5 h-2.5" />
                        <span>ตัดตามรอย</span>
                      </div>

                      {/* 1. Header with School Branding */}
                      <div>
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <img
                            src="/LOGO-N.png"
                            alt="โรงเรียนหนองวัวซอพิทยาคม"
                            className="w-5 h-5 object-contain"
                          />
                          <div className="text-left">
                            <div className="font-black text-[11px] text-slate-900 leading-tight">
                              โรงเรียนหนองวัวซอพิทยาคม
                            </div>
                            <div className="text-[8px] text-sky-700 font-semibold leading-tight">
                              Class Check &bull; บัตรประจำตัวแทนห้องเช็คชื่อ
                            </div>
                          </div>
                        </div>

                        {/* Room Badge */}
                        <div className="bg-sky-50 border border-sky-200 py-1 px-2.5 rounded-lg mb-1.5 flex items-center justify-between">
                          <div className="text-left">
                            <span className="text-[8px] font-bold text-sky-700 uppercase tracking-wider block">
                              ห้องเรียนประจำ
                            </span>
                            <span className="text-base font-black text-slate-900 tracking-tight leading-none">
                              ห้อง {room.gradeRoom}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-600 font-semibold block">
                              ม.{room.grade.replace("ม.", "")} ห้อง {room.room}
                            </span>
                            <span className="text-[8px] text-slate-400">
                              {activeTermLabel}
                            </span>
                          </div>
                        </div>

                        {/* 2. PIN CODE BOX (BIG & EYE-CATCHING) */}
                        <div className="bg-gradient-to-r from-amber-50 via-amber-100/70 to-amber-50 border border-amber-300 rounded-lg py-1 px-2 mb-1.5 flex items-center justify-between shadow-xs">
                          <span className="text-[9px] font-bold text-amber-900 uppercase">
                            🔑 รหัส PIN:
                          </span>
                          <span className="text-xl sm:text-2xl font-black font-mono tracking-widest text-indigo-950">
                            {room.pinCode}
                          </span>
                          <span className="text-[8px] text-amber-800">
                            * ห้ามเผยแพร่ข้ามห้อง
                          </span>
                        </div>
                      </div>

                      {/* 3. DUAL QR CODES: LOGIN & GUIDE */}
                      <div className="grid grid-cols-2 gap-1.5 my-0.5">
                        {/* QR 1: Check-in Login */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-center flex flex-col items-center justify-between">
                          <span className="text-[8px] font-bold text-sky-800 mb-0.5 flex items-center gap-0.5">
                            <QrCode className="w-2.5 h-2.5 text-sky-600" />
                            <span>1. สแกนเข้าเช็คชื่อ</span>
                          </span>
                          <div className="p-0.5 bg-white rounded border border-slate-200 shadow-inner">
                            <img
                              src={checkQrDataUrl}
                              alt={`QR เช็คชื่อห้อง ${room.gradeRoom}`}
                              className="w-16 h-16 object-contain"
                            />
                          </div>
                          <span className="text-[7px] text-slate-400 mt-0.5 leading-tight line-clamp-1 font-mono">
                            /check?roomId={room.id}
                          </span>
                        </div>

                        {/* QR 2: User Guide */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-center flex flex-col items-center justify-between">
                          <span className="text-[8px] font-bold text-indigo-800 mb-0.5 flex items-center gap-0.5">
                            <BookOpen className="w-2.5 h-2.5 text-indigo-600" />
                            <span>2. สแกนดูวิธีใช้งาน</span>
                          </span>
                          <div className="p-0.5 bg-white rounded border border-slate-200 shadow-inner">
                            <img
                              src={guideQrDataUrl}
                              alt="QR คู่มือวิธีใช้งาน"
                              className="w-16 h-16 object-contain"
                            />
                          </div>
                          <span className="text-[7px] text-slate-400 mt-0.5 leading-tight line-clamp-1 font-mono">
                            /guide (คู่มือ 5 สเต็ป)
                          </span>
                        </div>
                      </div>

                      {/* 4. Footer link & Info */}
                      <div className="border-t border-slate-100 pt-1 text-[8px] text-slate-400 flex items-center justify-between">
                        <span>Class Check &bull; รหัสห้อง: {room.id}</span>
                        <span>nwsp-class-check.vercel.app</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer (Hidden on print) */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            💡 <strong className="text-slate-700">คำแนะนำ:</strong> รูปแบบจัดพิมพ์ 6 ห้อง/แผ่น A4 ตัดตามรอยประแจกให้หัวหน้าห้องหรือติดไว้ที่โต๊ะหัวหน้าห้องได้พอดี ไม่เหลือพื้นที่ว่างเทอะทะ
          </div>
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
