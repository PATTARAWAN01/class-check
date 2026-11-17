"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  QrCode,
  KeyRound,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  Smartphone,
  ChevronRight,
} from "lucide-react";

export default function UserGuidePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-slate-50 text-slate-800 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/LOGO-N.png"
              alt="โรงเรียนหนองวัวซอพิทยาคม"
              className="w-9 h-9 object-contain"
            />
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">
                คู่มือการใช้งานระบบ Class Check
              </h1>
              <p className="text-[11px] text-sky-700 font-semibold">
                โรงเรียนหนองวัวซอพิทยาคม &bull; สำหรับนักเรียนและหัวหน้าห้อง
              </p>
            </div>
          </div>

          <Link
            href="/check"
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>ไปหน้าเช็คชื่อ</span>
          </Link>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 rounded-3xl p-6 text-white shadow-lg space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>คำแนะนำการบันทึกเวลาเข้าสอนอย่างถูกต้อง</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black">
            ขั้นตอนการบันทึกเวลาเข้าสอนของครู (5 ขั้นตอนง่ายๆ)
          </h2>
          <p className="text-xs sm:text-sm text-sky-100 leading-relaxed">
            คู่มือนี้จัดทำขึ้นเพื่อให้นักเรียนหัวหน้าห้องหรือตัวแทนห้อง สามารถบันทึกเวลาเข้าสอนของครูผู้สอนในแต่ละคาบได้อย่างแม่นยำ รวดเร็ว และเป็นระเบียบ
          </p>
        </div>

        {/* STEP 1 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-sky-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
              1
            </div>
            <div>
              <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider">
                ขั้นตอนที่ 1
              </span>
              <h3 className="text-base font-bold text-slate-900">
                เข้าสู่ระบบห้องเรียน
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed pl-12">
            สามารถเข้าสู่ระบบได้ 2 วิธี:
          </p>

          <div className="pl-12 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                <QrCode className="w-4 h-4 text-sky-600" />
                <span>วิธีที่ 1: สแกน QR Code ประจำห้อง</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ใช้กล้องมือถือสแกนแผ่น QR Code ประจำห้อง ระบบจะเลือกระดับชั้นและห้องเรียนให้โดยอัตโนมัติ
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>วิธีที่ 2: กรอก PIN และชื่อผู้บันทึก</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                เลือกระดับชั้น/ห้อง ใส่ <strong>รหัส PIN 4 หลัก</strong> ของห้อง และกรอกชื่อหรือเลขที่ผู้บันทึก แล้วกดปุ่ม <strong>&quot;เข้าสู่หน้าบันทึกการสอน&quot;</strong>
              </p>
            </div>
          </div>

          <div className="pl-12">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>ข้อควรระวัง:</strong> หากใส่รหัส PIN ผิดติดต่อกัน 5 ครั้ง ระบบจะระงับการลองใหม่ชั่วคราว 60 วินาที เพื่อความปลอดภัย
              </span>
            </div>
          </div>
        </div>

        {/* STEP 2 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
              2
            </div>
            <div>
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                ขั้นตอนที่ 2
              </span>
              <h3 className="text-base font-bold text-slate-900">
                เลือกวันที่และคาบเรียน
              </h3>
            </div>
          </div>

          <div className="pl-12 space-y-2.5 text-xs text-slate-600">
            <p className="leading-relaxed">
              • <strong>ระบบจะตรวจจับคาบเรียนปัจจุบันให้อัตโนมัติ</strong> ตามเวลาจริงในตารางสอนของโรงเรียน
            </p>
            <p className="leading-relaxed">
              • <strong>กรณีวิชาคาบคู่ (2 คาบติดกัน):</strong> ให้กดเปิดสวิตช์ <strong>&quot;เป็นวิชาคาบคู่ (2 คาบติดกัน)&quot;</strong> เช่น คาบ 1-2 หรือ คาบ 3-4 เพื่อบันทึกครั้งเดียวได้ทั้งสองคาบ
            </p>
            <p className="leading-relaxed">
              • <strong>การบันทึกย้อนหลัง:</strong> สามารถเลือกปุ่ม &quot;เมื่อวาน&quot; หรือแตะเลือกวันที่ที่ต้องการบันทึกย้อนหลังได้
            </p>
          </div>
        </div>

        {/* STEP 3 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-purple-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
              3
            </div>
            <div>
              <span className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">
                ขั้นตอนที่ 3
              </span>
              <h3 className="text-base font-bold text-slate-900">
                ตรวจสอบวิชาและครูผู้สอน
              </h3>
            </div>
          </div>

          <div className="pl-12 space-y-2.5 text-xs text-slate-600">
            <p className="leading-relaxed">
              • ระบบจะดึง <strong>รหัสวิชา, ชื่อวิชา และชื่อครูผู้สอน</strong> ตามตารางสอนของห้องท่านในคาบนั้นขึ้นมาให้โดยอัตโนมัติ
            </p>
            <p className="leading-relaxed">
              • <strong>หากมีครูสอนแทน หรือมีการสลับวิชา/ครู:</strong> นักเรียนสามารถแตะเลือกเปลี่ยนชื่อวิชา หรือเปลี่ยนชื่อครูผู้สอนเป็นครูที่มาสอนจริงในคาบนั้นได้ทันที
            </p>
          </div>
        </div>

        {/* STEP 4 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
              4
            </div>
            <div>
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                ขั้นตอนที่ 4
              </span>
              <h3 className="text-base font-bold text-slate-900">
                เลือกสถานะการเข้าสอนของครู
              </h3>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed pl-12">
            แตะเลือกสถานะ 1 ใน 3 ข้อต่อไปนี้ ตามความเป็นจริง:
          </p>

          <div className="pl-12 space-y-2.5 pt-1">
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs text-emerald-900">
                  1. เข้าสอนตรงเวลา (ภายใน 10 นาทีแรก)
                </span>
                <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                  เลือกเมื่อครูเข้าสอนในห้องเรียนตรงเวลาปกติ
                </p>
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs text-amber-900">
                  2. เข้าสอนหลัง 10 นาที (เข้าสอนสาย)
                </span>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                  เลือกเมื่อครูเข้าสอนช้ากว่าเวลาเริ่มคาบเกิน 10 นาที (สามารถระบุหมายเหตุเพิ่มเติมได้)
                </p>
              </div>
            </div>

            <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-3 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-xs text-rose-900">
                  3. ไม่เข้าสอน
                </span>
                <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                  เลือกเมื่อครูไม่ได้มาสอนในคาบนี้ และ <strong>ต้องเลือกสาเหตุ</strong> เช่น ไปราชการ, ลากิจ, ลาป่วย, มีสอนแทน หรือไม่ทราบสาเหตุ
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* STEP 5 */}
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-teal-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
              5
            </div>
            <div>
              <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">
                ขั้นตอนที่ 5
              </span>
              <h3 className="text-base font-bold text-slate-900">
                กดยืนยันบันทึกข้อมูล
              </h3>
            </div>
          </div>

          <div className="pl-12 space-y-2.5 text-xs text-slate-600">
            <p className="leading-relaxed">
              • เมื่อเลือกข้อมูลครบถ้วน ให้แตะปุ่มสีฟ้า <strong>&quot;บันทึกเวลาเข้าสอน&quot;</strong> ด้านล่างสุด
            </p>
            <p className="leading-relaxed">
              • ระบบจะแสดงการแจ้งเตือนสีเขียว <strong>&quot;บันทึกข้อมูลสำเร็จเรียบร้อย&quot;</strong> และข้อมูลจะแสดงในตารางประวัติของห้องเรียนทันที
            </p>
            <p className="leading-relaxed">
              • <strong>หากบันทึกผิดพลาด:</strong> หัวหน้าห้องสามารถแตะปุ่ม <strong>แก้ไข</strong> ในตารางประวัติด้านล่างเพื่อปรับปรุงข้อมูลให้ถูกต้องได้
            </p>
          </div>
        </div>

        {/* FAQ & Tips Box */}
        <div className="bg-slate-100 rounded-3xl p-5 sm:p-6 border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
            <HelpCircle className="w-4 h-4 text-sky-600" />
            <span>คำถามที่พบบ่อย (FAQ)</span>
          </div>

          <div className="space-y-2.5 text-xs text-slate-600">
            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <strong className="text-slate-800">Q: หากลืมรหัส PIN ของห้องเรียนต้องทำอย่างไร?</strong>
              <p className="text-[11px] text-slate-500 mt-1">
                A: ติดต่อครูที่ปรึกษาประจำห้อง หรือครูฝ่ายวิชาการเพื่อขอรหัส PIN ประจำห้องเรียน
              </p>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200">
              <strong className="text-slate-800">Q: นักเรียนคนอื่นในห้องสามารถช่วยบันทึกแทนหัวหน้าห้องได้ไหม?</strong>
              <p className="text-[11px] text-slate-500 mt-1">
                A: ได้ โดยกรอกชื่อหรือเลขที่ของผู้บันทึกจริงในคาบนั้น เพื่อความโปร่งใสและตรวจสอบย้อนหลังได้
              </p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="pt-2 text-center">
          <Link
            href="/check"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-98 text-white text-sm font-bold rounded-2xl shadow-lg shadow-sky-600/30 transition-all"
          >
            <span>ไปที่หน้าบันทึกเวลาเข้าสอนทันที</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
