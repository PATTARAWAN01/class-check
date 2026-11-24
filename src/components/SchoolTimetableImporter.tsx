"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import {
  parseSchoolTimetableText,
  ParsedTimetableResult,
} from "@/lib/timetableParser";
import {
  getTerms,
  saveTerm,
  setActiveTerm,
  saveTeachers,
  saveSubjects,
  saveClassroom,
  replaceTimetableForClassrooms,
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
  const [sheetInfo, setSheetInfo] = useState<{ totalSheets: number; fileName: string } | null>(null);
  const [importSummaryMsg, setImportSummaryMsg] = useState("");
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
    setSheetInfo(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetCsvParts: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (!csv.trim()) continue;

          // If a sheet doesn't explicitly contain a "ตารางเรียน ... ม.X/Y" header inside cells,
          // check whether its tab name indicates a classroom (e.g. "ม.1-2", "ม.1/2", "1-2")
          const hasExplicitRoomHeader =
            csv.includes("ตารางเรียน") && /ม\.\s*\d+\/\d+/.test(csv);
          const hasWeekday =
            csv.includes("จันทร์") || csv.includes("อังคาร") || csv.includes("พุธ");

          if (!hasExplicitRoomHeader && hasWeekday) {
            const tabMatch =
              sheetName.match(/ม\.?\s*(\d+)\s*[\/\-_.]\s*(\d+)/) ||
              sheetName.trim().match(/^(\d+)\s*[\/\-_]\s*(\d+)$/);
            if (tabMatch) {
              sheetCsvParts.push(`ตารางเรียน ชั้น ม. ${tabMatch[1]}/${tabMatch[2]}\n${csv}`);
              continue;
            }
          }

          sheetCsvParts.push(csv);
        }

        setSheetInfo({
          totalSheets: workbook.SheetNames.length,
          fileName: file.name,
        });
        processText(sheetCsvParts.join("\n"));
      } else {
        setSheetInfo({ totalSheets: 1, fileName: file.name });
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
    setSheetInfo(null);
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
      // 1. Resolve & save term (preserve existing term ID if same year & term)
      const existingTerms = await getTerms();
      const matchedTerm = existingTerms.find(
        (t) => t.year === parsedResult.term.year && t.term === parsedResult.term.term
      );
      const finalTerm = matchedTerm
        ? { ...matchedTerm, isActive: setActive ? true : matchedTerm.isActive }
        : parsedResult.term;

      await saveTerm(finalTerm);
      if (setActive) {
        await setActiveTerm(finalTerm.id);
      }

      // 2. Classrooms — preserve existing ID and PIN if classroom already exists
      const existingClassrooms = await getClassrooms();
      const classroomIdByGradeRoom = new Map<string, string>();
      for (const ex of existingClassrooms) {
        classroomIdByGradeRoom.set(ex.gradeRoom, ex.id);
      }

      if (importClassrooms && parsedResult.classrooms.length > 0) {
        for (const cls of parsedResult.classrooms) {
          const found = existingClassrooms.find(
            (c) => c.gradeRoom === cls.gradeRoom || c.id === cls.id
          );
          if (found) {
            classroomIdByGradeRoom.set(cls.gradeRoom, found.id);
            await saveClassroom({
              ...cls,
              id: found.id,
              pinCode: found.pinCode || cls.pinCode,
            });
          } else {
            classroomIdByGradeRoom.set(cls.gradeRoom, cls.id);
            await saveClassroom(cls);
          }
        }
      }

      // 3. Teachers — match ONLY by normalized fullName (never overwrite another teacher by code!)
      const existingTeachers = await getTeachers();
      const normalizeName = (s: string) => s.replace(/\s+/g, " ").trim();
      const teacherByFullName = new Map<string, typeof existingTeachers[number]>();
      let maxTeacherCodeNum = 0;

      for (const ex of existingTeachers) {
        teacherByFullName.set(normalizeName(ex.fullName), ex);
        const m = ex.code?.match(/^T(\d+)$/i);
        if (m) maxTeacherCodeNum = Math.max(maxTeacherCodeNum, Number(m[1]));
      }

      if (importTeachers && parsedResult.teachers.length > 0) {
        const mergedTeachers = [...existingTeachers];
        for (const t of parsedResult.teachers) {
          const norm = normalizeName(t.fullName);
          const idx = mergedTeachers.findIndex((ex) => normalizeName(ex.fullName) === norm);
          if (idx >= 0) {
            const ex = mergedTeachers[idx];
            const keepExistingDept =
              ex.department &&
              ex.department !== "กลุ่มสาระการเรียนรู้ทั่วไป" &&
              (!t.department || t.department === "กลุ่มสาระการเรียนรู้ทั่วไป");
            const updated = {
              ...ex,
              prefix: ex.prefix || t.prefix,
              department: keepExistingDept ? ex.department : t.department || ex.department,
            };
            mergedTeachers[idx] = updated;
            teacherByFullName.set(norm, updated);
          } else {
            maxTeacherCodeNum += 1;
            const newTeacher = {
              ...t,
              code: `T${String(maxTeacherCodeNum).padStart(3, "0")}`,
            };
            mergedTeachers.push(newTeacher);
            teacherByFullName.set(norm, newTeacher);
          }
        }
        await saveTeachers(mergedTeachers);
      }

      // 4. Subjects — merge by code and union assignedClassroomIds
      if (importSubjects && parsedResult.subjects.length > 0) {
        const existingSubjects = await getSubjects();
        const mergedSubjects = [...existingSubjects];
        for (const s of parsedResult.subjects) {
          const remappedRooms = (s.assignedClassroomIds || []).map((cid) => {
            const matchedCls = parsedResult.classrooms.find((c) => c.id === cid);
            return matchedCls
              ? classroomIdByGradeRoom.get(matchedCls.gradeRoom) || cid
              : cid;
          });
          const idx = mergedSubjects.findIndex((ex) => ex.code === s.code);
          if (idx >= 0) {
            const ex = mergedSubjects[idx];
            const unionRooms = Array.from(
              new Set([...(ex.assignedClassroomIds || []), ...remappedRooms])
            ).sort();
            mergedSubjects[idx] = {
              ...ex,
              name: s.name && s.name !== s.code ? s.name : ex.name,
              department:
                s.department && s.department !== "กลุ่มสาระการเรียนรู้ทั่วไป"
                  ? s.department
                  : ex.department,
              ...(unionRooms.length > 0 ? { assignedClassroomIds: unionRooms } : {}),
            };
          } else {
            mergedSubjects.push({
              ...s,
              ...(remappedRooms.length > 0 ? { assignedClassroomIds: remappedRooms } : {}),
            });
          }
        }
        await saveSubjects(mergedSubjects);
      }

      // 5. Timetable Entries — normalize termId, classroomId, teacherId & safely replace per classroom
      if (parsedResult.timetableEntries.length > 0) {
        const normalizedEntries = parsedResult.timetableEntries.map((entry) => {
          const resolvedClassroomId =
            classroomIdByGradeRoom.get(entry.gradeRoom) || entry.classroomId;
          const periodSuffix =
            entry.periodStart === entry.periodEnd
              ? `p${entry.periodStart}`
              : `p${entry.periodStart}_${entry.periodEnd}`;
          const normalizedId = `tt_${resolvedClassroomId}_d${entry.dayOfWeek}_${periodSuffix}`;

          // Match saved teacher record if available
          const cleanTchName = normalizeName(
            entry.teacherName.replace(/^(นางสาว|นาย|นาง|ครู)\s*/, "")
          );
          const matchedTch = teacherByFullName.get(cleanTchName);

          return {
            ...entry,
            id: normalizedId,
            termId: finalTerm.id,
            classroomId: resolvedClassroomId,
            teacherId: matchedTch ? matchedTch.id : entry.teacherId,
            teacherName: matchedTch
              ? `${matchedTch.prefix}${matchedTch.fullName}`
              : entry.teacherName,
          };
        });

        const { saved, deleted } = await replaceTimetableForClassrooms(
          normalizedEntries,
          finalTerm.id
        );
        setImportSummaryMsg(
          `อัปเดตตารางสอน ${parsedResult.summary.totalClassrooms} ห้อง (${saved} คาบ` +
            (deleted > 0 ? `, ล้างคาบเก่าที่เปลี่ยนออก ${deleted} คาบ` : "") +
            `) เรียบร้อยแล้ว`
        );
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
                {importSummaryMsg ? (
                  <span>{importSummaryMsg}</span>
                ) : (
                  <>
                    ระบบได้ปรับปรุงข้อมูลครูผู้สอน รายวิชา ห้องเรียน และตารางสอนของ{" "}
                    <strong>{parsedResult?.summary.termTitle}</strong> เข้าสู่ระบบเรียบร้อยแล้ว
                  </>
                )}
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
                    onClick={(e) => {
                      (e.currentTarget as HTMLInputElement).value = "";
                    }}
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
                    รองรับไฟล์ Excel หลายแท็บ (อ่านทุกแท็บอัตโนมัติ) และไฟล์ .csv, .txt
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
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <h4 className="font-bold text-slate-800 text-sm sm:text-base">
                        ผลการวิเคราะห์โครงสร้างตารางสอน
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      {sheetInfo && sheetInfo.totalSheets > 1 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold border border-sky-200 flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          อ่านครบ {sheetInfo.totalSheets} แท็บ
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                        {parsedResult.summary.termTitle}
                      </span>
                    </div>
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

                  {/* Detected Classrooms List */}
                  {parsedResult.classrooms.length > 0 && (
                    <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-200/80 space-y-2 text-xs">
                      <div className="font-bold text-sky-900 flex items-center justify-between">
                        <span>ห้องเรียนที่พบในไฟล์ ({parsedResult.classrooms.length} ห้อง):</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {parsedResult.classrooms.map((cls) => (
                          <span
                            key={cls.id}
                            className="px-2 py-0.5 rounded-md bg-white border border-sky-200 text-sky-800 font-semibold text-[11px]"
                          >
                            {cls.gradeRoom}
                          </span>
                        ))}
                      </div>
                      <p className="text-[11px] text-sky-800/90 leading-relaxed">
                        ✓ ระบบจะอัปเดตตารางสอนเฉพาะ <strong>{parsedResult.classrooms.length} ห้องนี้</strong>{" "}
                        (ล้างคาบเก่าของห้องเหล่านี้ที่เปลี่ยนไปแล้วออกอัตโนมัติ) โดยไม่กระทบห้องเรียนอื่นที่ไม่อยู่ในไฟล์ และไม่ลบประวัติการเช็คชื่อย้อนหลัง
                      </p>
                    </div>
                  )}

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
