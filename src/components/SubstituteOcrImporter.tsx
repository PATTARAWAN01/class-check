"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Calendar,
  Clock,
  UserCheck,
  ChevronRight,
  CheckSquare,
  Square,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  Teacher,
  Classroom,
  Subject,
  AcademicTerm,
  SubstituteAssignment,
  SubstituteLeaveType,
} from "@/types";
import { saveSubstituteAssignment } from "@/lib/storage";
import { DEPARTMENTS } from "@/lib/constants";
import { getThaiDateString } from "@/lib/dateUtils";
import {
  extractJpegFromPdf,
  parseThaiDate,
  parseDepartment,
  parseOcrTextToItems,
} from "@/lib/ocrService";

export interface OcrParsedItem {
  id: string;
  periodStart: number;
  periodEnd: number;
  timeRange: string;
  gradeRoom: string;
  classroomId: string;
  roomLocation?: string;
  subjectCode: string;
  subjectName: string;
  leaveType: SubstituteLeaveType;
  originalTeacherId: string;
  originalTeacherName: string;
  originalTeacherDept: string;
  substituteTeacherId: string;
  substituteTeacherName: string;
  substituteDept: string;
  isAssigned: boolean;
  selected: boolean;
  rawAbsentTeacher: string;
  rawSubstituteTeacher: string;
}

export interface OcrApiResponse {
  success: boolean;
  fileName?: string;
  isoDate?: string;
  thaiDisplayDate?: string;
  dayOfWeek?: number;
  department?: string;
  itemsCount?: number;
  assignedCount?: number;
  unassignedCount?: number;
  items?: OcrParsedItem[];
  rawText?: string;
  error?: string;
}

interface SubstituteOcrImporterProps {
  teachers: Teacher[];
  classrooms: Classroom[];
  subjects: Subject[];
  activeTerm: AcademicTerm | null;
  authDept?: string;
  onImportComplete: (count: number) => void;
}

export default function SubstituteOcrImporter({
  teachers,
  classrooms,
  subjects,
  activeTerm,
  authDept = "งานวิชาการ",
  onImportComplete,
}: SubstituteOcrImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string>("");
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Result state
  const [ocrData, setOcrData] = useState<OcrApiResponse | null>(null);
  const [items, setItems] = useState<OcrParsedItem[]>([]);
  const [targetDate, setTargetDate] = useState<string>("");
  const [targetDept, setTargetDept] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Leave badge colors
  const leaveLabels: Record<
    SubstituteLeaveType,
    { text: string; bg: string; textCol: string }
  > = {
    sick: { text: "ลาป่วย", bg: "bg-rose-50", textCol: "text-rose-700" },
    personal: { text: "ลากิจ", bg: "bg-amber-50", textCol: "text-amber-700" },
    official: { text: "ไปราชการ", bg: "bg-blue-50", textCol: "text-blue-700" },
  };

  // Handle file drop / select
  const handleFileSelect = (selectedFile: File) => {
    setErrorMsg("");
    setFile(selectedFile);
    processOcr(selectedFile);
  };

  // Browser-side OCR fallback (guarantees zero timeout and works anywhere)
  const runBrowserOcr = async (fileToUpload: File) => {
    setScanStep("กำลังสลับประมวลผล OCR อัตโนมัติบนเบราว์เซอร์ของท่าน (ไม่ติดขีดจำกัดเวลา)...");
    setProgressPercent(10);

    const arrayBuf = await fileToUpload.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const images = extractJpegFromPdf(buf);

    if (images.length === 0) {
      throw new Error("ไม่สามารถแยกรูปภาพออกจากไฟล์ PDF หรือรูปภาพนี้ได้");
    }

    setScanStep("กำลังเตรียมโมเดล AI OCR ภาษาไทย...");
    setProgressPercent(25);

    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("tha+eng");

    let fullOcrText = "";
    try {
      for (let idx = 0; idx < Math.min(images.length, 2); idx++) {
        setScanStep(`กำลังอ่านและวิเคราะห์หน้าเอกสารที่ ${idx + 1}/${Math.min(images.length, 2)}...`);
        setProgressPercent(35 + idx * 30);
        const u8 = new Uint8Array(images[idx]);
        const imgBlob = new Blob([u8], { type: "image/jpeg" });
        const res = await worker.recognize(imgBlob);
        fullOcrText += "\n" + res.data.text;
      }
    } finally {
      await worker.terminate();
    }

    setProgressPercent(95);
    setScanStep("กำลังจับคู่ตารางสอน ครูผู้สอน และห้องเรียน...");

    const parsedDate = parseThaiDate(fullOcrText);
    const department = parseDepartment(fullOcrText);
    const parsedItems = parseOcrTextToItems(fullOcrText, department);

    const mappedItems: OcrParsedItem[] = parsedItems.map((p) => ({
      id: p.id,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      timeRange: p.timeRange,
      gradeRoom: p.gradeRoom,
      classroomId: p.classroomId,
      roomLocation: p.roomLocation,
      subjectCode: p.subjectCode,
      subjectName: p.subjectName,
      leaveType: p.leaveType,
      originalTeacherId: p.originalTeacherId,
      originalTeacherName: p.originalTeacherName,
      originalTeacherDept: p.originalTeacherDept,
      substituteTeacherId: p.substituteTeacherId,
      substituteTeacherName: p.substituteTeacherName,
      substituteDept: p.substituteTeacherDept || department || "กลุ่มสาระการเรียนรู้",
      isAssigned: Boolean(p.substituteTeacherId && p.substituteTeacherName !== "ยังไม่มีผู้สอนแทน"),
      selected: true,
      rawAbsentTeacher: p.originalTeacherName,
      rawSubstituteTeacher: p.substituteTeacherName,
    }));

    setOcrData({
      success: true,
      department,
      thaiDisplayDate: parsedDate ? parsedDate.thaiDisplayDate : "วันที่ระบุในเอกสาร",
      isoDate: parsedDate ? parsedDate.isoDate : getThaiDateString(),
      dayOfWeek: parsedDate ? parsedDate.dayOfWeek : 1,
      rawText: fullOcrText,
      items: mappedItems,
    });
    setItems(mappedItems);
    setTargetDate(parsedDate ? parsedDate.isoDate : getThaiDateString());
    setTargetDept(department || authDept || "กลุ่มสาระการเรียนรู้");
    setProgressPercent(100);
  };

  const processOcr = async (fileToUpload: File) => {
    setIsScanning(true);
    setProgressPercent(10);
    setScanStep("กำลังอัปโหลดและส่งให้ระบบ AI OCR วิเคราะห์...");
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout for server

      let serverSuccess = false;
      try {
        const res = await fetch("/api/substitute/ocr", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data: any = await res.json();
          if (data && data.success) {
            serverSuccess = true;
            setProgressPercent(100);
            setOcrData(data);
            const serverMapped: OcrParsedItem[] = (data.items || []).map((it: any) => ({
              id: it.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              periodStart: Number(it.periodStart) || 1,
              periodEnd: Number(it.periodEnd) || 1,
              timeRange: it.timeRange || "",
              gradeRoom: it.gradeRoom || "",
              classroomId: it.classroomId || "",
              roomLocation: it.roomLocation || "",
              subjectCode: it.subjectCode || "",
              subjectName: it.subjectName || "",
              leaveType: it.leaveType || "official",
              originalTeacherId: it.originalTeacherId || "",
              originalTeacherName: it.originalTeacherName || "",
              originalTeacherDept: it.originalTeacherDept || "",
              substituteTeacherId: it.substituteTeacherId || "",
              substituteTeacherName: it.substituteTeacherName || "ยังไม่มีผู้สอนแทน",
              substituteDept: it.substituteDept || it.substituteTeacherDept || data.department || authDept || "กลุ่มสาระการเรียนรู้",
              isAssigned: it.isAssigned !== undefined ? it.isAssigned : Boolean(it.substituteTeacherId && it.substituteTeacherName !== "ยังไม่มีผู้สอนแทน"),
              selected: it.selected !== undefined ? it.selected : true,
              rawAbsentTeacher: it.rawAbsentTeacher || it.originalTeacherName || "",
              rawSubstituteTeacher: it.rawSubstituteTeacher || it.substituteTeacherName || "",
            }));
            setItems(serverMapped);
            setTargetDate(data.isoDate || getThaiDateString());
            setTargetDept(data.department || authDept || "กลุ่มสาระการเรียนรู้");
            return;
          }
        }
      } catch (serverErr) {
        console.warn("Server OCR call did not finish in time, switching to browser OCR:", serverErr);
      }

      // If server OCR failed or timed out, run browser OCR directly
      if (!serverSuccess) {
        await runBrowserOcr(fileToUpload);
      }
    } catch (err: any) {
      console.error("OCR upload error:", err);
      try {
        await runBrowserOcr(fileToUpload);
      } catch (browserErr: any) {
        setErrorMsg(browserErr?.message || "เกิดข้อผิดพลาดในการอ่านเอกสาร OCR");
      }
    } finally {
      setIsScanning(false);
      setScanStep("");
    }
  };

  // Toggle item selection
  const handleToggleSelect = (index: number) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, selected: !it.selected } : it))
    );
  };

  // Bulk selection
  const handleSelectAll = (selectVal: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: selectVal })));
  };

  const handleSelectOnlyAssigned = () => {
    setItems((prev) =>
      prev.map((it) => ({ ...it, selected: !!it.substituteTeacherId && it.isAssigned }))
    );
  };

  // Update specific field in row
  const handleRowChange = (index: number, field: keyof OcrParsedItem, value: any) => {
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it;
        const updated = { ...it, [field]: value };

        // If teacher changed, update name and department
        if (field === "substituteTeacherId") {
          const t = teachers.find((tch) => tch.id === value);
          if (t) {
            updated.substituteTeacherName = `${t.prefix}${t.fullName}`;
            updated.substituteDept = t.department;
            updated.isAssigned = true;
            updated.selected = true;
          } else {
            updated.substituteTeacherName = "ยังไม่มีผู้สอนแทน";
            updated.isAssigned = false;
          }
        }
        return updated;
      })
    );
  };

  // Confirm and Save All Checked Items
  const handleConfirmImport = async () => {
    const selectedItems = items.filter((it) => it.selected);
    if (selectedItems.length === 0) {
      alert("กรุณาเลือกรายการที่ต้องการนำเข้าอย่างน้อย 1 คาบ");
      return;
    }

    // Check for unassigned teachers among selected items
    const missingTeacher = selectedItems.find((it) => !it.substituteTeacherId);
    if (missingTeacher) {
      const confirmProceed = confirm(
        `คาบที่ ${missingTeacher.periodStart} (${missingTeacher.gradeRoom}) ยังไม่ได้ระบุครูผู้สอนแทน ต้องการนำเข้าเฉพาะรายการที่มีครูสอนแทนหรือไม่?`
      );
      if (!confirmProceed) return;
    }

    const itemsToSave = selectedItems.filter((it) => !!it.substituteTeacherId);
    if (itemsToSave.length === 0) {
      alert("ไม่พบรายการที่มีครูผู้สอนแทน กรุณาระบุครูผู้สอนแทนในตารางก่อนยืนยัน");
      return;
    }

    setIsSaving(true);
    try {
      const termId = activeTerm?.id || "term_2_2569";
      const nowIso = new Date().toISOString();

      // Compute day of week from targetDate
      const d = new Date(targetDate);
      const jsDay = d.getDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;

      for (const it of itemsToSave) {
        const subAssignment: SubstituteAssignment = {
          id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          termId,
          date: targetDate,
          dayOfWeek,
          department: it.originalTeacherDept || targetDept || authDept,
          originalTeacherId: it.originalTeacherId || "t_unknown",
          originalTeacherName: it.originalTeacherName,
          leaveType: it.leaveType,
          periodStart: it.periodStart,
          periodEnd: it.periodEnd,
          classroomId: it.classroomId,
          gradeRoom: it.gradeRoom,
          subjectCode: it.subjectCode,
          subjectName: it.subjectName,
          substituteTeacherId: it.substituteTeacherId,
          substituteTeacherName: it.substituteTeacherName,
          substituteDepartment: it.substituteDept || targetDept,
          note: "",
          recordedByDept: authDept || "งานวิชาการ",
          createdAt: nowIso,
        };

        await saveSubstituteAssignment(subAssignment);
      }

      onImportComplete(itemsToSave.length);
    } catch (err: any) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCount = items.filter((it) => it.selected).length;

  return (
    <div className="space-y-6">
      {/* Upload Zone (Show if no ocrData or user wants to re-upload) */}
      {!ocrData && (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
          <div className="max-w-2xl mx-auto text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-800">
                นำเข้ารายงานการจัดสอนแทนประจำวัน (PDF OCR)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                อ่านไฟล์ PDF จากระบบจัดสอนแทนอัตโนมัติของโรงเรียนหนองวัวซอพิทยาคมด้วย AI OCR
              </p>
            </div>

            {errorMsg && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3 text-left">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Drag and Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 border-2 border-dashed rounded-3xl cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? "border-sky-500 bg-sky-50/50 scale-[1.01]"
                  : "border-slate-300 hover:border-sky-400 hover:bg-slate-50/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              {isScanning ? (
                <div className="py-6 flex flex-col items-center justify-center gap-3 w-full max-w-sm mx-auto">
                  <RefreshCw className="w-8 h-8 text-sky-600 animate-spin" />
                  <p className="text-sm font-semibold text-sky-900 text-center">{scanStep}</p>
                  {progressPercent > 0 && (
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden shadow-inner">
                      <div
                        className="bg-gradient-to-r from-sky-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 text-center">
                    โปรดรอสักครู่ ระบบกำลังอ่านภาษาไทยและจับคู่ตารางสอน...
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-sky-600 hover:underline">
                      คลิกเพื่อเลือกไฟล์ PDF
                    </span>{" "}
                    <span className="text-xs text-slate-500">
                      หรือลากไฟล์มาวางในบริเวณนี้
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    รองรับไฟล์เอกสาร PDF หรือรูปภาพ (เช่น รายงานสอนแทน_วิทยาศาสตร์, รายงานสอนแทน_คณิตศาสตร์)
                  </p>
                </>
              )}
            </div>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 text-left">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>OCR ภาษาไทยแม่นยำ</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  ถอดรหัสคาบเรียน วันที่ และชื่อครูด้วย Tesseract AI Model ภาษาไทย
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <UserCheck className="w-4 h-4 text-sky-500" />
                  <span>จับคู่ฐานข้อมูลอัตโนมัติ</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  เชื่อมโยงกับครู 56 ท่าน ห้องเรียน 27 ห้อง และ 134 รายวิชาในโรงเรียน
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>ตรวจสอบก่อนบันทึก</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  ดูตารางตัวอย่าง แก้ไขข้อมูล หรือเลือกนำเข้าเฉพาะคาบที่ต้องการได้
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OCR Result Verification Screen */}
      {ocrData && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 mb-1">
                  <FileText className="w-4 h-4" />
                  <span>ผลการอ่านรายงานจัดสอนแทนอัตโนมัติ</span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="font-mono text-slate-500">{ocrData.fileName}</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  {ocrData.department || targetDept}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  ข้อความวันที่จากเอกสาร:{" "}
                  <span className="font-semibold text-slate-700">
                    {ocrData.thaiDisplayDate}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setOcrData(null);
                    setItems([]);
                    setFile(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition-colors"
                >
                  อัปโหลดไฟล์ใหม่
                </button>
              </div>
            </div>

            {/* Editable Controls & Metric Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  📅 วันที่บันทึกผล (ปรับเปลี่ยนได้)
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  🏫 กลุ่มสาระการเรียนรู้
                </label>
                <select
                  value={targetDept}
                  onChange={(e) => setTargetDept(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 flex items-center justify-between gap-3 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <div className="text-center px-3 border-r border-slate-200">
                  <p className="text-[11px] text-slate-500">พบทั้งหมด</p>
                  <p className="text-lg font-black text-slate-800">{items.length} คาบ</p>
                </div>
                <div className="text-center px-3 border-r border-slate-200">
                  <p className="text-[11px] text-emerald-600">จัดแทนแล้ว</p>
                  <p className="text-lg font-black text-emerald-700">
                    {items.filter((i) => i.isAssigned).length} คาบ
                  </p>
                </div>
                <div className="text-center px-3 border-r border-slate-200">
                  <p className="text-[11px] text-amber-600">ยังไม่มีผู้แทน</p>
                  <p className="text-lg font-black text-amber-700">
                    {items.filter((i) => !i.isAssigned).length} คาบ
                  </p>
                </div>
                <div className="text-center px-3">
                  <p className="text-[11px] text-sky-600">เลือกนำเข้า</p>
                  <p className="text-lg font-black text-sky-700">{selectedCount} คาบ</p>
                </div>
              </div>
            </div>

            {/* Quick Filter Selection */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">การเลือกข้อมูล:</span>
                <button
                  type="button"
                  onClick={handleSelectOnlyAssigned}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-semibold transition-colors"
                >
                  ✓ เลือกเฉพาะที่มีครูสอนแทน (
                  {items.filter((i) => i.isAssigned).length})
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
                >
                  เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors"
                >
                  ยกเลิกการเลือก
                </button>
              </div>

              <div className="text-slate-400 text-[11px]">
                💡 สามารถแก้ไขชื่อครูผู้สอนแทนหรือประเภทการลาในตารางด้านล่างได้โดยตรง
              </div>
            </div>
          </div>

          {/* Table Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5 text-center w-12">
                      <input
                        type="checkbox"
                        checked={selectedCount > 0 && selectedCount === items.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="p-3.5 text-center w-28">คาบ / เวลา</th>
                    <th className="p-3.5 w-32">ชั้นเรียน / สถานที่</th>
                    <th className="p-3.5 w-44">วิชาที่สอน</th>
                    <th className="p-3.5 w-52">ครูที่ลา & สาเหตุ</th>
                    <th className="p-3.5 min-w-[240px]">ครูผู้สอนแทน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => {
                    const isSelected = item.selected;
                    const hasSub = !!item.substituteTeacherId && item.isAssigned;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isSelected
                            ? hasSub
                              ? "bg-white hover:bg-sky-50/30"
                              : "bg-amber-50/20 hover:bg-amber-50/40"
                            : "bg-slate-50/50 opacity-60 hover:opacity-100"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(index)}
                            className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                          />
                        </td>

                        {/* Period & Time */}
                        <td className="p-3.5 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 font-bold border border-sky-200 mb-0.5">
                            คาบที่ {item.periodStart}
                          </span>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {item.timeRange || "08:40-09:30"}
                          </p>
                        </td>

                        {/* Room & Location */}
                        <td className="p-3.5">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 font-bold text-slate-800 border border-slate-200">
                            {item.gradeRoom}
                          </span>
                          {item.roomLocation && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {item.roomLocation}
                            </p>
                          )}
                        </td>

                        {/* Subject */}
                        <td className="p-3.5">
                          <span className="font-bold text-slate-800 font-mono text-[11px]">
                            {item.subjectCode}
                          </span>
                          <p className="text-slate-600 text-[11px] line-clamp-1">
                            {item.subjectName}
                          </p>
                        </td>

                        {/* Absent Teacher & Leave Type */}
                        <td className="p-3.5">
                          <p className="font-bold text-slate-800">
                            {item.originalTeacherName}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <select
                              value={item.leaveType}
                              onChange={(e) =>
                                handleRowChange(
                                  index,
                                  "leaveType",
                                  e.target.value as SubstituteLeaveType
                                )
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                leaveLabels[item.leaveType].bg
                              } ${leaveLabels[item.leaveType].textCol}`}
                            >
                              <option value="sick">ลาป่วย</option>
                              <option value="personal">ลากิจ</option>
                              <option value="official">ไปราชการ</option>
                            </select>
                          </div>
                        </td>

                        {/* Substitute Teacher Selector */}
                        <td className="p-3.5">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {hasSub ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>มีครูสอนแทน</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>ยังไม่มีผู้สอนแทน</span>
                                </span>
                              )}
                            </div>

                            <select
                              value={item.substituteTeacherId}
                              onChange={(e) =>
                                handleRowChange(
                                  index,
                                  "substituteTeacherId",
                                  e.target.value
                                )
                              }
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium focus:ring-2 focus:ring-sky-500 bg-white ${
                                hasSub
                                  ? "border-emerald-300 text-slate-800 font-semibold"
                                  : "border-amber-300 text-amber-900 bg-amber-50/30"
                              }`}
                            >
                              <option value="">-- ยังไม่มีผู้สอนแทน (เว้นว่าง) --</option>
                              {teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.prefix}
                                  {t.fullName} ({t.department.replace("กลุ่มสาระการเรียนรู้", "")})
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-600">
                เลือกนำเข้าข้อมูลจัดสอนแทน:{" "}
                <span className="font-bold text-sky-700 text-sm">{selectedCount}</span> จาก{" "}
                {items.length} คาบ
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setOcrData(null);
                    setItems([]);
                    setFile(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-white transition-colors"
                >
                  ยกเลิก
                </button>

                <button
                  type="button"
                  disabled={selectedCount === 0 || isSaving}
                  onClick={handleConfirmImport}
                  className={`px-6 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md flex items-center gap-2 ${
                    selectedCount === 0 || isSaving
                      ? "bg-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25"
                  }`}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึกข้อมูล...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ยืนยันนำเข้าข้อมูลจัดสอนแทน ({selectedCount} คาบ)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
