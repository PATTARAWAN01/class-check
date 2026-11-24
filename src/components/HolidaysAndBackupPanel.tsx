"use client";

import React, { useState } from "react";
import type {
  BackupSectionKey,
  SchoolHoliday,
  SchoolHolidayScope,
  SchoolProfile,
  SystemBackupPayload,
} from "@/types";
import {
  saveSchoolHoliday,
  saveSchoolHolidays,
  deleteSchoolHoliday,
  saveSchoolProfile,
  exportFullSystemBackup,
  restoreSystemBackup,
} from "@/lib/storage";
import { getPresetThaiHolidays } from "@/lib/missingCheckinUtils";
import { formatThaiDateShort, getThaiDateString } from "@/lib/dateUtils";
import {
  CalendarOff,
  Plus,
  Trash2,
  Sparkles,
  Download,
  Upload,
  Database,
  ShieldAlert,
  CheckCircle2,
  CalendarClock,
  RefreshCw,
} from "lucide-react";

interface HolidaysAndBackupPanelProps {
  holidays: SchoolHoliday[];
  schoolProfile: SchoolProfile;
  onRefresh: () => Promise<void>;
  showNotice: (msg: string, type?: "success" | "error") => void;
}

const BACKUP_SECTIONS: { key: BackupSectionKey; label: string }[] = [
  { key: "terms", label: "ภาคเรียน (Academic Terms)" },
  { key: "classrooms", label: "ห้องเรียน & รหัส PIN" },
  { key: "teachers", label: "รายชื่อครูผู้สอน" },
  { key: "subjects", label: "รายวิชา" },
  { key: "periods", label: "ตั้งค่าคาบเรียนและเวลา" },
  { key: "timetable", label: "ตารางสอนทั้งหมด" },
  { key: "attendance", label: "ประวัติการเช็คเข้าสอนทั้งหมด" },
  { key: "substitutes", label: "ข้อมูลจัดสอนแทนทั้งหมด" },
  { key: "timetableUpdateLogs", label: "ประวัติการอัปเดตตารางสอน" },
  { key: "holidays", label: "วันหยุดราชการ / วันงดการสอน" },
  { key: "schoolProfile", label: "ข้อมูลโรงเรียน & ผู้ลงนาม & วันเริ่มนับ" },
];

function formatThaiDateTime(iso?: string): string {
  if (!iso) return "ยังไม่เคยสำรองข้อมูล";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function HolidaysAndBackupPanel({
  holidays,
  schoolProfile,
  onRefresh,
  showNotice,
}: HolidaysAndBackupPanelProps) {
  // 1. Tracking Start Date state
  const [trackingStartDate, setTrackingStartDate] = useState(
    schoolProfile.trackingStartDate || ""
  );
  const [savingTrackingDate, setSavingTrackingDate] = useState(false);

  // 2. Holiday form state
  const [holDate, setHolDate] = useState(() => getThaiDateString());
  const [holTitle, setHolTitle] = useState("");
  const [holScope, setHolScope] = useState<SchoolHolidayScope>("all_day");
  const [holPeriods, setHolPeriods] = useState<number[]>([5, 6, 7]);
  const [holNote, setHolNote] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);

  // 3. Backup / Restore state
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restorePayload, setRestorePayload] = useState<SystemBackupPayload | null>(null);
  const [restoreFileName, setRestoreFileName] = useState("");
  const [selectedSections, setSelectedSections] = useState<Set<BackupSectionKey>>(new Set());
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);

  const handleSaveTrackingDate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTrackingDate(true);
    try {
      await saveSchoolProfile({
        ...schoolProfile,
        trackingStartDate: trackingStartDate.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      await onRefresh();
      showNotice(
        trackingStartDate.trim()
          ? `ตั้งวันเริ่มนับคาบค้างเช็คเป็น ${formatThaiDateShort(trackingStartDate)} เรียบร้อยแล้ว`
          : "ล้างการกำหนดวันเริ่มนับแล้ว (ระบบจะนับจากวันแรกที่มีข้อมูลเช็คชื่ออัตโนมัติ)"
      );
    } catch (err: any) {
      console.error(err);
      showNotice("บันทึกวันเริ่มนับไม่สำเร็จ: " + (err.message || ""), "error");
    } finally {
      setSavingTrackingDate(false);
    }
  };

  const toggleHolidayPeriod = (p: number) => {
    setHolPeriods((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)
    );
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holDate || !holTitle.trim()) {
      showNotice("กรุณาระบุวันที่และชื่อวันหยุด/กิจกรรม", "error");
      return;
    }
    if (holScope === "periods" && holPeriods.length === 0) {
      showNotice("กรุณาเลือกอย่างน้อย 1 คาบที่งดการสอน", "error");
      return;
    }

    setSavingHoliday(true);
    try {
      const id =
        holScope === "all_day"
          ? `hol_${holDate}_all`
          : `hol_${holDate}_p${holPeriods.join("_")}`;
      const holiday: SchoolHoliday = {
        id,
        date: holDate,
        title: holTitle.trim(),
        scope: holScope,
        ...(holScope === "periods" ? { periods: holPeriods } : {}),
        ...(holNote.trim() ? { note: holNote.trim() } : {}),
        createdAt: new Date().toISOString(),
      };
      await saveSchoolHoliday(holiday);
      setHolTitle("");
      setHolNote("");
      await onRefresh();
      showNotice(`เพิ่มวันหยุด/วันงดการสอน "${holiday.title}" เรียบร้อยแล้ว`);
    } catch (err: any) {
      console.error(err);
      showNotice("ไม่สามารถเพิ่มวันหยุดได้: " + (err.message || ""), "error");
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleLoadThaiHolidays = async () => {
    const todayYear = Number(getThaiDateString().slice(0, 4)) || new Date().getFullYear();
    const beYear = todayYear + 543;
    if (
      !confirm(
        `ต้องการเพิ่มวันหยุดราชการไทยประจำปี พ.ศ. ${beYear} และ ${beYear + 1} เข้าสู่ปฏิทินอัตโนมัติหรือไม่?\n(วันหยุดที่คุณเพิ่มไว้เองแล้วจะไม่ถูกลบ และสามารถลบวันไหนออกทีหลังได้)`
      )
    ) {
      return;
    }
    setSavingHoliday(true);
    try {
      const nowIso = new Date().toISOString();
      const presets = [
        ...getPresetThaiHolidays(todayYear),
        ...getPresetThaiHolidays(todayYear + 1),
      ].map((h) => ({ ...h, createdAt: nowIso }));
      const existingIds = new Set(holidays.map((h) => h.id));
      const newOnly = presets.filter((p) => !existingIds.has(p.id));
      if (newOnly.length === 0) {
        showNotice("วันหยุดราชการไทยประจำปีเหล่านี้อยู่ในระบบครบแล้ว");
        return;
      }
      await saveSchoolHolidays(newOnly);
      await onRefresh();
      showNotice(`เพิ่มวันหยุดราชการไทยอัตโนมัติสำเร็จ ${newOnly.length} วัน`);
    } catch (err: any) {
      console.error(err);
      showNotice("เพิ่มวันหยุดอัตโนมัติไม่สำเร็จ: " + (err.message || ""), "error");
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (h: SchoolHoliday) => {
    if (!confirm(`ต้องการลบวันหยุด "${h.title}" (${formatThaiDateShort(h.date)}) หรือไม่?`)) {
      return;
    }
    try {
      await deleteSchoolHoliday(h.id);
      await onRefresh();
      showNotice(`ลบ "${h.title}" เรียบร้อยแล้ว`);
    } catch (err: any) {
      console.error(err);
      showNotice("ไม่สามารถลบวันหยุดได้: " + (err.message || ""), "error");
    }
  };

  const handleExportBackup = async () => {
    setExportingBackup(true);
    try {
      const payload = await exportFullSystemBackup();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `class-check-backup-${getThaiDateString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await onRefresh();
      showNotice("ดาวน์โหลดไฟล์สำรองข้อมูลทั้งระบบ (.json) เรียบร้อยแล้ว");
    } catch (err: any) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดในการสำรองข้อมูล: " + (err.message || ""), "error");
    } finally {
      setExportingBackup(false);
    }
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SystemBackupPayload;
      if (!parsed || !parsed.data || typeof parsed.data !== "object") {
        showNotice("ไฟล์นี้ไม่ใช่ไฟล์ Backup ของระบบ Class Check ที่ถูกต้อง", "error");
        return;
      }
      setRestorePayload(parsed);
      setRestoreFileName(file.name);
      setConfirmText("");

      const available = new Set<BackupSectionKey>();
      for (const sec of BACKUP_SECTIONS) {
        const val = parsed.data[sec.key];
        if ((Array.isArray(val) && val.length > 0) || (sec.key === "schoolProfile" && val)) {
          available.add(sec.key);
        }
      }
      setSelectedSections(available);
    } catch (err) {
      console.error(err);
      showNotice("ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจสอบไฟล์อีกครั้ง", "error");
    } finally {
      e.target.value = "";
    }
  };

  const toggleBackupSection = (key: BackupSectionKey) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getSectionCount = (payload: SystemBackupPayload, key: BackupSectionKey): number => {
    const val = payload.data[key];
    if (Array.isArray(val)) return val.length;
    return val ? 1 : 0;
  };

  const handleConfirmRestore = async () => {
    if (!restorePayload || selectedSections.size === 0) return;
    if (confirmText.trim().toUpperCase() !== "RESTORE") {
      showNotice('กรุณาพิมพ์คำว่า "RESTORE" เพื่อยืนยันการกู้คืนข้อมูล', "error");
      return;
    }

    setRestoring(true);
    try {
      const counts = await restoreSystemBackup(
        restorePayload,
        Array.from(selectedSections)
      );
      const totalItems = Object.values(counts).reduce((sum, n) => sum + n, 0);
      setRestorePayload(null);
      setRestoreFileName("");
      setConfirmText("");
      await onRefresh();
      showNotice(
        `กู้คืนข้อมูลสำเร็จ ${selectedSections.size} หมวด (รวม ${totalItems} รายการ) เรียบร้อยแล้ว`
      );
    } catch (err: any) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดระหว่างกู้คืนข้อมูล: " + (err.message || ""), "error");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ==================== CARD 1: TRACKING START DATE ==================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-3">
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-800">
              วันเริ่มนับคาบค้างเช็คของภาคเรียน (Tracking Start Date)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Popup แจ้งเตือนคาบค้างเช็คตอนนักเรียนล็อกอิน จะตรวจย้อนหลังตั้งแต่วันนี้เป็นต้นไป (ไม่ทวงวันก่อนเปิดใช้งานระบบ)
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveTrackingDate} className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              วันที่เริ่มใช้งานการเช็คชื่อของภาคเรียน
            </label>
            <input
              type="date"
              value={trackingStartDate}
              onChange={(e) => setTrackingStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={savingTrackingDate}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
          >
            {savingTrackingDate ? "กำลังบันทึก..." : "บันทึกวันเริ่มนับ"}
          </button>
          {trackingStartDate && (
            <button
              type="button"
              onClick={() => setTrackingStartDate("")}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold"
            >
              ใช้ค่าอัตโนมัติ
            </button>
          )}
        </form>
      </div>

      {/* ==================== CARD 2: SCHOOL HOLIDAYS ==================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <CalendarOff className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">
                ปฏิทินวันหยุดราชการ / วันงดการเรียนการสอน ({holidays.length} รายการ)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ในวันหยุดหรือคาบที่ตั้งงดการสอน หน้าเช็คชื่อนักเรียนจะถูกล็อกไม่ให้บันทึก และไม่นับเป็นคาบค้างเช็ค
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={savingHoliday}
            onClick={handleLoadThaiHolidays}
            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>เพิ่มวันหยุดราชการไทยอัตโนมัติ</span>
          </button>
        </div>

        {/* Add Holiday Form */}
        <form
          onSubmit={handleAddHoliday}
          className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3">
              <label className="block font-bold text-slate-700 mb-1">วันที่ *</label>
              <input
                type="date"
                value={holDate}
                onChange={(e) => setHolDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block font-bold text-slate-700 mb-1">
                ชื่อวันหยุด / กิจกรรมโรงเรียน *
              </label>
              <input
                type="text"
                value={holTitle}
                onChange={(e) => setHolTitle(e.target.value)}
                placeholder="เช่น วันกีฬาสี, สอบกลางภาค, วันพ่อแห่งชาติ"
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block font-bold text-slate-700 mb-1">ขอบเขตการงดสอน</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHolScope("all_day")}
                  className={`flex-1 py-2 px-2.5 rounded-lg font-bold border transition-all ${
                    holScope === "all_day"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  งดทั้งวัน
                </button>
                <button
                  type="button"
                  onClick={() => setHolScope("periods")}
                  className={`flex-1 py-2 px-2.5 rounded-lg font-bold border transition-all ${
                    holScope === "periods"
                      ? "bg-amber-600 text-white border-amber-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  งดบางคาบ
                </button>
              </div>
            </div>
          </div>

          {holScope === "periods" && (
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-700">เลือกคาบที่งดการสอน:</label>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
                  const active = holPeriods.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => toggleHolidayPeriod(p)}
                      className={`px-3 py-1.5 rounded-lg font-bold border text-xs transition-all ${
                        active
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-slate-600 border-slate-300 hover:bg-amber-50"
                      }`}
                    >
                      คาบ {p}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={holNote}
              onChange={(e) => setHolNote(e.target.value)}
              placeholder="หมายเหตุเพิ่มเติม (ไม่บังคับ)"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={savingHoliday}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มวันหยุด / งดสอน</span>
            </button>
          </div>
        </form>

        {/* Holiday List */}
        {holidays.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">
            ยังไม่มีวันหยุดที่กำหนดไว้ — กดปุ่ม &ldquo;เพิ่มวันหยุดราชการไทยอัตโนมัติ&rdquo; หรือเพิ่มเองด้านบนได้เลย
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3 w-36">วันที่</th>
                  <th className="py-2.5 px-3">ชื่อวันหยุด / กิจกรรม</th>
                  <th className="py-2.5 px-3 w-36">ขอบเขต</th>
                  <th className="py-2.5 px-3 text-center w-16">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                      {formatThaiDateShort(h.date)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">{h.title}</div>
                      {h.note && <div className="text-[11px] text-slate-400">{h.note}</div>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {h.scope === "all_day" ? (
                        <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                          งดทั้งวัน
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px]">
                          งดคาบ {(h.periods || []).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="ลบ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================== CARD 3: FULL BACKUP & SELECTIVE RESTORE JSON ==================== */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">
                สำรองข้อมูลและกู้คืนทั้งระบบ (Backup &amp; Selective Restore JSON)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                สำรองข้อมูล Firestore ทั้งหมดเก็บไว้ในเครื่อง 1 ไฟล์ • สำรองล่าสุด:{" "}
                <strong className="text-indigo-700">
                  {formatThaiDateTime(schoolProfile.lastBackupAt)}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exportingBackup}
              onClick={handleExportBackup}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {exportingBackup ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{exportingBackup ? "กำลังส่งออก..." : "ดาวน์โหลด Backup (.json)"}</span>
            </button>

            <label className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold cursor-pointer flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              <span>เลือกไฟล์เพื่อกู้คืน (Restore)</span>
              <input
                type="file"
                accept=".json"
                onChange={handleSelectBackupFile}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Selective Restore Preview Card */}
        {restorePayload && (
          <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-4 text-xs animate-in fade-in">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/70 pb-3">
              <div>
                <div className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ตรวจสอบไฟล์ Backup: {restoreFileName}
                </div>
                <div className="text-[11px] text-indigo-700 mt-0.5">
                  โรงเรียน: {restorePayload.schoolName} • สำรองเมื่อ:{" "}
                  {formatThaiDateTime(restorePayload.exportedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRestorePayload(null);
                  setRestoreFileName("");
                  setConfirmText("");
                }}
                className="px-3 py-1 rounded-lg bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 font-semibold"
              >
                ยกเลิกไฟล์นี้
              </button>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-slate-800">
                เลือกหมวดข้อมูลที่ต้องการกู้คืน (ติ๊กเลือกเฉพาะหมวดที่ต้องการได้):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {BACKUP_SECTIONS.map((sec) => {
                  const count = getSectionCount(restorePayload, sec.key);
                  const disabled = count === 0;
                  const checked = selectedSections.has(sec.key);
                  return (
                    <label
                      key={sec.key}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                        disabled
                          ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                          : checked
                          ? "bg-white border-indigo-400 text-indigo-950 shadow-xs cursor-pointer"
                          : "bg-white/70 border-slate-200 text-slate-700 hover:bg-white cursor-pointer"
                      }`}
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={checked}
                          onChange={() => toggleBackupSection(sec.key)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{sec.label}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px]">
                        {count}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Confirmation Guard */}
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 space-y-2.5">
              <div className="flex items-start gap-2 text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">ยืนยันความปลอดภัยก่อนกู้คืนข้อมูล</div>
                  <div className="text-[11px] mt-0.5">
                    ระบบจะเขียนข้อมูลจากไฟล์ Backup กลับเข้าสู่ฐานข้อมูล Firestore เฉพาะหมวดที่ติ๊กเลือก ({selectedSections.size} หมวด)
                    กรุณาพิมพ์คำว่า <strong>RESTORE</strong> เพื่อปลดล็อกปุ่มยืนยัน
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='พิมพ์คำว่า RESTORE เพื่อยืนยัน'
                  className="flex-1 px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono text-xs uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  disabled={
                    restoring ||
                    selectedSections.size === 0 ||
                    confirmText.trim().toUpperCase() !== "RESTORE"
                  }
                  onClick={handleConfirmRestore}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-xs disabled:opacity-40"
                >
                  {restoring
                    ? "กำลังกู้คืนข้อมูล..."
                    : `ยืนยันกู้คืน (${selectedSections.size} หมวด)`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
