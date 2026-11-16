"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  parseSchoolTimetableText,
  ParsedTimetableResult,
} from "@/lib/timetableParser";
import {
  saveTerm,
  setActiveTerm,
  saveTeachers,
  saveSubjects,
  saveClassroom,
  saveTimetable,
  getClassrooms,
  getTeachers,
  getSubjects,
} from "@/lib/storage";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  School,
  Users,
  BookOpen,
  Calendar,
  Layers,
  ArrowRight,
} from "lucide-react";

interface SchoolTimetableImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export default function SchoolTimetableImporter({
  isOpen,
  onClose,
  onSuccess,
}: SchoolTimetableImporterProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [parsedResult, setParsedResult] = useState<ParsedTimetableResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // Import options
  const [importTeachers, setImportTeachers] = useState(true);
  const [importSubjects, setImportSubjects] = useState(true);
  const [importClassrooms, setImportClassrooms] = useState(true);
  const [setActive, setSetActive] = useState(true);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg("");
    setParsedResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        processText(csvText);
      } else {
        const text = await file.text();
        processText(text);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ตารางสอนที่ถูกต้อง");
    }
  };

  const handlePasteProcess = () => {
    setErrorMsg("");
    if (!pasteText.trim()) {
      setErrorMsg("กรุณาวางข้อความจากไฟล์ตารางสอนก่อนกดวิเคราะห์");
      return;
    }
    processText(pasteText);
  };

  const processText = (text: string) => {
    try {
      const res = parseSchoolTimetableText(text);
      if (res.timetableEntries.length === 0 && res.teachers.length === 0) {
        setErrorMsg(
          "ไม่พบรูปแบบข้อมูลตารางสอนที่รู้จัก กรุณาตรวจสอบว่ามีข้อความ 'ตารางเรียน ชั้น ม.' หรือ 'ตารางสอน'"
        );
        return;
      }
      setParsedResult(res);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("เกิดข้อผิดพลาดในการประมวลผลข้อมูล: " + (err.message || ""));
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedResult) return;
    setImporting(true);
    setErrorMsg("");

    try {
      // 1. Save and activate term
      await saveTerm(parsedResult.term);
      if (setActive) {
        await setActiveTerm(parsedResult.term.id);
      }

      // 2. Classrooms
      if (importClassrooms && parsedResult.classrooms.length > 0) {
        const existingClassrooms = await getClassrooms();
        for (const cls of parsedResult.classrooms) {
          const found = existingClassrooms.find((c) => c.gradeRoom === cls.gradeRoom);
          if (found) {
            await saveClassroom({ ...cls, pinCode: found.pinCode || cls.pinCode });
          } else {
            await saveClassroom(cls);
          }
        }
      }

      // 3. Teachers
      if (importTeachers && parsedResult.teachers.length > 0) {
        const existingTeachers = await getTeachers();
        const mergedTeachers = [...existingTeachers];
        for (const t of parsedResult.teachers) {
          const idx = mergedTeachers.findIndex(
            (ex) => ex.fullName === t.fullName || ex.code === t.code
          );
          if (idx >= 0) {
            mergedTeachers[idx] = { ...mergedTeachers[idx], ...t };
          } else {
            mergedTeachers.push(t);
          }
        }
        await saveTeachers(mergedTeachers);
      }

      // 4. Subjects
      if (importSubjects && parsedResult.subjects.length > 0) {
        const existingSubjects = await getSubjects();
        const mergedSubjects = [...existingSubjects];
        for (const s of parsedResult.subjects) {
          const idx = mergedSubjects.findIndex((ex) => ex.code === s.code);
          if (idx >= 0) {
            mergedSubjects[idx] = { ...mergedSubjects[idx], ...s };
          } else {
            mergedSubjects.push(s);
          }
        }
        await saveSubjects(mergedSubjects);
      }

      // 5. Timetable Entries
      if (parsedResult.timetableEntries.length > 0) {
        await saveTimetable(parsedResult.timetableEntries);
      }

      setImportSuccess(true);
      setTimeout(async () => {
        await onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("เกิดข้อผิดพลาดในการบันทึกข้อมูลเข้าระบบ: " + (err.message || ""));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-800 to-indigo-900 text-white p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-sky-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                นำเข้าข้อมูลจากโปรแกรมจัดตารางสอนของโรงเรียน
              </h3>
              <p className="text-xs text-sky-200">
                รองรับไฟล์ตารางสอน (CSV, TXT, Excel) จากโปรแกรมจัดตารางสอนมาตรฐาน
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-sky-200 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 bg-slate-50">
          {importSuccess ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl animate-bounce">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">
                นำเข้าข้อมูลตารางสอนเรียบร้อยแล้ว!
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                ระบบได้ปรับปรุงข้อมูลครูผู้สอน รายวิชา ห้องเรียน และตารางสอนของ{" "}
                <strong>{parsedResult?.summary.termTitle}</strong> เข้าสู่ระบบเรียบร้อยแล้ว
              </p>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Mode Selector Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === "file"
                      ? "bg-sky-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200/60"
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>อัปโหลดไฟล์ (.csv / .xlsx / .txt)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paste")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeTab === "paste"
                      ? "bg-sky-600 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200/60"
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>วางข้อความ (Paste Text)</span>
                </button>
              </div>

              {/* Tab 1: File Upload */}
              {activeTab === "file" && (
                <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center bg-white hover:bg-sky-50/50 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".csv, .txt, .xlsx, .xls"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="w-12 h-12 bg-sky-100 text-sky-700 rounded-2xl flex items-center justify-center mx-auto mb-2">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="font-bold text-slate-800 text-sm">
                    คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    รองรับไฟล์ที่ Export ออกมาจากโปรแกรมจัดตารางสอน (นามสกุล .csv, .txt, .xlsx)
                  </div>
                </div>
              )}

              {/* Tab 2: Paste Text */}
              {activeTab === "paste" && (
                <div className="space-y-2">
                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="เปิดไฟล์ CSV หรือข้อความตารางสอน แล้ว Copy นำมาวางที่นี่..."
                    className="w-full p-3 border border-slate-300 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  ></textarea>
                  <button
                    type="button"
                    onClick={handlePasteProcess}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
                  >
                    ประมวลผลข้อความ
                  </button>
                </div>
              )}

              {/* Parsed Result Preview */}
              {parsedResult && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <h4 className="font-bold text-slate-800 text-sm sm:text-base">
                        ผลการวิเคราะห์โครงสร้างตารางสอน
                      </h4>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                      {parsedResult.summary.termTitle}
                    </span>
                  </div>

                  {/* Stat KPI Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5">
                      <School className="w-4 h-4 text-sky-600" />
                      <div>
                        <div className="text-[10px] text-slate-500">ห้องเรียน</div>
                        <div className="font-bold text-slate-900 text-sm">
                          {parsedResult.summary.totalClassrooms} ห้อง
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <div>
                        <div className="text-[10px] text-slate-500">ครูผู้สอน</div>
                        <div className="font-bold text-slate-900 text-sm">
                          {parsedResult.summary.totalTeachers} ท่าน
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      <div>
                        <div className="text-[10px] text-slate-500">รายวิชา</div>
                        <div className="font-bold text-slate-900 text-sm">
                          {parsedResult.summary.totalSubjects} วิชา
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-amber-600" />
                      <div>
                        <div className="text-[10px] text-slate-500">คาบสอนทั้งหมด</div>
                        <div className="font-bold text-slate-900 text-sm">
                          {parsedResult.summary.totalPeriods} คาบ
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Options Checkboxes */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                    <div className="font-bold text-slate-700">ตัวเลือกการนำเข้า:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 font-medium">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importTeachers}
                          onChange={(e) => setImportTeachers(e.target.checked)}
                          className="rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span>อัปเดตรายชื่อครูผู้สอน ({parsedResult.summary.totalTeachers} คน)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importSubjects}
                          onChange={(e) => setImportSubjects(e.target.checked)}
                          className="rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span>อัปเดตรายชื่อวิชา ({parsedResult.summary.totalSubjects} วิชา)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importClassrooms}
                          onChange={(e) => setImportClassrooms(e.target.checked)}
                          className="rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span>ตรวจสอบรหัสห้องเรียนทั้ง {parsedResult.summary.totalClassrooms} ห้อง</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={setActive}
                          onChange={(e) => setSetActive(e.target.checked)}
                          className="rounded text-sky-600 focus:ring-sky-500"
                        />
                        <span>ตั้งให้เป็นภาคเรียนปัจจุบัน (Active Term)</span>
                      </label>
                    </div>
                  </div>

                  {/* Sample Preview Rows */}
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-slate-500">
                      ตัวอย่างคาบสอนที่ดึงได้ (5 รายการแรก):
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-100 text-slate-600 text-[11px]">
                          <tr>
                            <th className="py-2 px-3">ห้อง</th>
                            <th className="py-2 px-3">วัน</th>
                            <th className="py-2 px-3">คาบ</th>
                            <th className="py-2 px-3">วิชา</th>
                            <th className="py-2 px-3">ครูผู้สอน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {parsedResult.timetableEntries.slice(0, 5).map((e) => (
                            <tr key={e.id}>
                              <td className="py-1.5 px-3 font-semibold text-sky-700">
                                {e.gradeRoom}
                              </td>
                              <td className="py-1.5 px-3">
                                {["จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์"][e.dayOfWeek - 1]}
                              </td>
                              <td className="py-1.5 px-3 font-mono">
                                {e.periodStart === e.periodEnd
                                  ? `คาบ ${e.periodStart}`
                                  : `คาบคู่ ${e.periodStart}-${e.periodEnd}`}
                              </td>
                              <td className="py-1.5 px-3">
                                <span className="font-semibold">{e.subjectCode}</span> {e.subjectName}
                              </td>
                              <td className="py-1.5 px-3">{e.teacherName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={handleConfirmImport}
                      className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:from-sky-800 active:to-indigo-800 text-white font-bold rounded-xl transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                      {importing ? (
                        <span>กำลังนำเข้าข้อมูล...</span>
                      ) : (
                        <>
                          <span>ยืนยันและนำเข้าตารางสอน {parsedResult.summary.termTitle} เข้าสู่ระบบ</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 p-4 text-xs text-slate-500 flex justify-between items-center">
          <span>💡 สามารถ Export ไฟล์จากโปรแกรมจัดตารางสอนโรงเรียนมานำเข้าได้ทุกเทอมใหม่</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}
