"use client";

import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  parseSchoolTimetableText,
  computeTimetableDiff,
  ParsedTimetableResult,
  TimetableDiffResult,
} from "@/lib/timetableParser";
import {
  getTerms,
  saveTerm,
  setActiveTerm,
  saveTeachers,
  saveSubjects,
  saveClassroom,
  getTimetable,
  applyTimetableDiff,
  addTimetableUpdateLog,
  getClassrooms,
  getTeachers,
  getSubjects,
} from "@/lib/storage";
import type {
  AcademicTerm,
  Classroom,
  Subject,
  Teacher,
  TimetableEntry,
  TimetableChangeItem,
} from "@/types";
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
  GitCompare,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  Check,
} from "lucide-react";

interface SchoolTimetableImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

interface ExistingSnapshot {
  finalTerm: AcademicTerm;
  termExists: boolean;
  existingClassrooms: Classroom[];
  existingTeachers: Teacher[];
  existingSubjects: Subject[];
  classroomIdByGradeRoom: Map<string, string>;
}

const DAY_LABELS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์"];

function normalizeName(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function stripTeacherPrefix(s: string): string {
  return normalizeName(s.replace(/^(นางสาว|นาย|นาง|ครู)\s*/, ""));
}

function findMatchingTeacher(
  rawFullName: string,
  teachers: Teacher[]
): Teacher | undefined {
  const clean = stripTeacherPrefix(rawFullName);
  if (!clean) return undefined;

  // 1. Exact fullName match
  const exact = teachers.find((t) => normalizeName(t.fullName) === clean);
  if (exact) return exact;

  // 2. If only first name is given (no space), match uniquely against full names starting with "<firstName> "
  if (!clean.includes(" ")) {
    const firstNameMatches = teachers.filter((t) => {
      const f = normalizeName(t.fullName);
      return f.startsWith(clean + " ") || f === clean;
    });
    if (firstNameMatches.length === 1) return firstNameMatches[0];
  }

  return undefined;
}

export default function SchoolTimetableImporter({
  isOpen,
  onClose,
  onSuccess,
}: SchoolTimetableImporterProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [parsedResult, setParsedResult] = useState<ParsedTimetableResult | null>(null);
  const [diffResult, setDiffResult] = useState<TimetableDiffResult | null>(null);
  const [snapshot, setSnapshot] = useState<ExistingSnapshot | null>(null);
  const [selectedDiffKeys, setSelectedDiffKeys] = useState<Set<string>>(new Set());
  const [diffRoomFilter, setDiffRoomFilter] = useState<string>("all");
  const [comparing, setComparing] = useState(false);

  const [sheetInfo, setSheetInfo] = useState<{ totalSheets: number; fileName: string } | null>(null);
  const [updateNote, setUpdateNote] = useState("");
  const [importSummaryMsg, setImportSummaryMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  // Import options
  const [importTeachers, setImportTeachers] = useState(true);
  const [importSubjects, setImportSubjects] = useState(true);
  const [importClassrooms, setImportClassrooms] = useState(true);
  const [setActive, setSetActive] = useState(true);

  const filteredDiffItems = useMemo(() => {
    if (!diffResult) return [];
    if (diffRoomFilter === "all") return diffResult.items;
    return diffResult.items.filter((item) => item.gradeRoom === diffRoomFilter);
  }, [diffResult, diffRoomFilter]);

  if (!isOpen) return null;

  const resetState = () => {
    setErrorMsg("");
    setParsedResult(null);
    setDiffResult(null);
    setSnapshot(null);
    setSelectedDiffKeys(new Set());
    setDiffRoomFilter("all");
    setSheetInfo(null);
    setUpdateNote("");
    setImportSummaryMsg("");
    setImportSuccess(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    resetState();
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
        await processText(sheetCsvParts.join("\n"));
      } else {
        setSheetInfo({ totalSheets: 1, fileName: file.name });
        const text = await file.text();
        await processText(text);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg("ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบว่าเป็นไฟล์ตารางสอนที่ถูกต้อง");
    }
  };

  const handlePasteProcess = async () => {
    resetState();
    if (!pasteText.trim()) {
      setErrorMsg("กรุณาวางข้อความจากไฟล์ตารางสอนก่อนกดวิเคราะห์");
      return;
    }
    await processText(pasteText);
  };

  const processText = async (text: string) => {
    setComparing(true);
    try {
      const res = parseSchoolTimetableText(text);
      if (res.timetableEntries.length === 0 && res.teachers.length === 0) {
        setErrorMsg(
          "ไม่พบรูปแบบข้อมูลตารางสอนที่รู้จัก กรุณาตรวจสอบว่ามีข้อความ 'ตารางเรียน ชั้น ม.' หรือ 'ตารางสอน'"
        );
        return;
      }

      // Load current system data to normalize IDs & compute exact diff
      const [existingTerms, existingClassrooms, existingTeachers, existingSubjects] =
        await Promise.all([
          getTerms(),
          getClassrooms(),
          getTeachers(),
          getSubjects(),
        ]);

      const matchedTerm = existingTerms.find(
        (t) => t.year === res.term.year && t.term === res.term.term
      );
      const finalTerm: AcademicTerm = matchedTerm ? { ...matchedTerm } : res.term;

      const classroomIdByGradeRoom = new Map<string, string>();
      for (const ex of existingClassrooms) {
        classroomIdByGradeRoom.set(ex.gradeRoom, ex.id);
      }
      for (const cls of res.classrooms) {
        if (!classroomIdByGradeRoom.has(cls.gradeRoom)) {
          classroomIdByGradeRoom.set(cls.gradeRoom, cls.id);
        }
      }

      const existingTimetable = matchedTerm ? await getTimetable(finalTerm.id) : [];

      // Normalize incoming timetable entries so comparison against existing Firestore is exact
      const normalizedEntries: TimetableEntry[] = res.timetableEntries.map((entry) => {
        const resolvedClassroomId =
          classroomIdByGradeRoom.get(entry.gradeRoom) || entry.classroomId;
        const periodSuffix =
          entry.periodStart === entry.periodEnd
            ? `p${entry.periodStart}`
            : `p${entry.periodStart}_${entry.periodEnd}`;
        const normalizedId = `tt_${resolvedClassroomId}_d${entry.dayOfWeek}_${periodSuffix}`;
        const matchedTch = findMatchingTeacher(entry.teacherName, existingTeachers);

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

      const diff = computeTimetableDiff(
        existingTimetable,
        normalizedEntries,
        res.classrooms.map((c) => c.gradeRoom)
      );

      setParsedResult({
        ...res,
        timetableEntries: normalizedEntries,
      });
      setDiffResult(diff);
      setSelectedDiffKeys(new Set(diff.items.map((i) => i.key)));
      setSnapshot({
        finalTerm,
        termExists: Boolean(matchedTerm),
        existingClassrooms,
        existingTeachers,
        existingSubjects,
        classroomIdByGradeRoom,
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg("เกิดข้อผิดพลาดในการประมวลผลข้อมูล: " + (err.message || ""));
    } finally {
      setComparing(false);
    }
  };

  const toggleDiffKey = (key: string) => {
    setSelectedDiffKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedDiffKeys((prev) => {
      const next = new Set(prev);
      filteredDiffItems.forEach((item) => next.add(item.key));
      return next;
    });
  };

  const deselectAllVisible = () => {
    setSelectedDiffKeys((prev) => {
      const next = new Set(prev);
      filteredDiffItems.forEach((item) => next.delete(item.key));
      return next;
    });
  };

  const handleConfirmImport = async () => {
    if (!parsedResult || !diffResult || !snapshot) return;
    setImporting(true);
    setErrorMsg("");

    try {
      const {
        finalTerm,
        termExists,
        existingClassrooms,
        existingTeachers,
        existingSubjects,
        classroomIdByGradeRoom,
      } = snapshot;

      // 1. Only save/activate term if it's new or not active yet
      if (!termExists) {
        await saveTerm({ ...finalTerm, isActive: setActive });
      }
      if (setActive && !finalTerm.isActive) {
        await setActiveTerm(finalTerm.id);
      }

      // 2. Classrooms — only save genuinely new classrooms
      if (importClassrooms && parsedResult.classrooms.length > 0) {
        for (const cls of parsedResult.classrooms) {
          const found = existingClassrooms.find(
            (c) => c.gradeRoom === cls.gradeRoom || c.id === cls.id
          );
          if (!found) {
            await saveClassroom(cls);
          }
        }
      }

      // 3. Teachers — only add truly new teachers (or upgrade generic department)
      const teacherByFullName = new Map<string, Teacher>();
      let maxTeacherCodeNum = 0;
      for (const ex of existingTeachers) {
        teacherByFullName.set(normalizeName(ex.fullName), ex);
        const m = ex.code?.match(/^T(\d+)$/i);
        if (m) maxTeacherCodeNum = Math.max(maxTeacherCodeNum, Number(m[1]));
      }

      if (importTeachers && parsedResult.teachers.length > 0) {
        let teachersChanged = false;
        const mergedTeachers = [...existingTeachers];
        for (const t of parsedResult.teachers) {
          const matched = findMatchingTeacher(t.fullName, mergedTeachers);
          if (matched) {
            // Only update if existing department was generic and parsed has a real department
            if (
              matched.department === "กลุ่มสาระการเรียนรู้ทั่วไป" &&
              t.department &&
              t.department !== "กลุ่มสาระการเรียนรู้ทั่วไป"
            ) {
              const idx = mergedTeachers.findIndex((ex) => ex.id === matched.id);
              if (idx >= 0) {
                mergedTeachers[idx] = { ...matched, department: t.department };
                teacherByFullName.set(normalizeName(matched.fullName), mergedTeachers[idx]);
                teachersChanged = true;
              }
            }
          } else {
            maxTeacherCodeNum += 1;
            const newTeacher: Teacher = {
              ...t,
              code: `T${String(maxTeacherCodeNum).padStart(3, "0")}`,
            };
            mergedTeachers.push(newTeacher);
            teacherByFullName.set(normalizeName(newTeacher.fullName), newTeacher);
            teachersChanged = true;
          }
        }
        if (teachersChanged) {
          await saveTeachers(mergedTeachers);
        }
      }

      // 4. Subjects — only write if new subject or improved metadata/assignedClassroomIds
      if (importSubjects && parsedResult.subjects.length > 0) {
        let subjectsChanged = false;
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
            const prevRooms = ex.assignedClassroomIds || [];
            const unionRooms = Array.from(new Set([...prevRooms, ...remappedRooms])).sort();
            const roomsGrew = unionRooms.length > prevRooms.length;
            const nameImproved =
              Boolean(s.name && s.name !== s.code) && (!ex.name || ex.name === ex.code);

            if (roomsGrew || nameImproved) {
              mergedSubjects[idx] = {
                ...ex,
                name: nameImproved ? s.name : ex.name,
                ...(unionRooms.length > 0 ? { assignedClassroomIds: unionRooms } : {}),
              };
              subjectsChanged = true;
            }
          } else {
            mergedSubjects.push({
              ...s,
              ...(remappedRooms.length > 0 ? { assignedClassroomIds: remappedRooms } : {}),
            });
            subjectsChanged = true;
          }
        }
        if (subjectsChanged) {
          await saveSubjects(mergedSubjects);
        }
      }

      // 5. Timetable Entries — apply ONLY selected diffs (unchanged entries are NOT touched!)
      const selectedItems = diffResult.items.filter((item) => selectedDiffKeys.has(item.key));
      const toUpsert: TimetableEntry[] = [];
      const toDeleteIds: string[] = [];

      let modCount = 0;
      let addCount = 0;
      let remCount = 0;

      for (const item of selectedItems) {
        if (item.type === "added" && item.newEntry) {
          toUpsert.push(item.newEntry);
          addCount += 1;
        } else if (item.type === "modified" && item.newEntry) {
          toUpsert.push(item.newEntry);
          if (item.oldEntry && item.oldEntry.id !== item.newEntry.id) {
            toDeleteIds.push(item.oldEntry.id);
          }
          modCount += 1;
        } else if (item.type === "removed" && item.oldEntry) {
          toDeleteIds.push(item.oldEntry.id);
          remCount += 1;
        }
      }

      if (toUpsert.length > 0 || toDeleteIds.length > 0) {
        await applyTimetableDiff({ toUpsert, toDeleteIds });

        const changeItems: TimetableChangeItem[] = selectedItems.map((item) => ({
          type: item.type,
          gradeRoom: item.gradeRoom,
          dayOfWeek: item.dayOfWeek,
          periodStart: item.periodStart,
          periodEnd: item.periodEnd,
          oldEntry: item.oldEntry,
          newEntry: item.newEntry,
          changedFields: item.changedFields,
        }));
        const affectedRooms = Array.from(new Set(selectedItems.map((i) => i.gradeRoom)));

        await addTimetableUpdateLog({
          id: `ttlog_${Date.now()}_xl`,
          termId: finalTerm.id,
          createdAt: new Date().toISOString(),
          source: "excel_import",
          sourceLabel: sheetInfo?.fileName
            ? `นำเข้าไฟล์ ${sheetInfo.fileName}`
            : "นำเข้าจากข้อความตารางสอน",
          note: updateNote.trim() || undefined,
          summary: {
            added: addCount,
            modified: modCount,
            removed: remCount,
            unchanged: diffResult.unchangedCount,
            affectedClassrooms: affectedRooms,
          },
          changes: changeItems,
        });
      }

      const parts: string[] = [];
      if (modCount > 0) parts.push(`แก้ไข ${modCount} คาบ`);
      if (addCount > 0) parts.push(`เพิ่มใหม่ ${addCount} คาบ`);
      if (remCount > 0) parts.push(`ลบออก ${remCount} คาบ`);

      setImportSummaryMsg(
        `อัปเดตเฉพาะรายการที่เปลี่ยนแปลงเรียบร้อยแล้ว (${parts.join(" • ")}) — ข้ามคาบที่เหมือนเดิม ${diffResult.unchangedCount} คาบโดยไม่เขียนทับ`
      );

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

  const selectedCount = selectedDiffKeys.size;
  const totalChanges = diffResult ? diffResult.items.length : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-800 to-indigo-900 text-white p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-sky-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">
                นำเข้า / อัปเดตตารางสอนจากไฟล์โรงเรียน (อัปเดตเฉพาะจุดที่เปลี่ยน)
              </h3>
              <p className="text-xs text-sky-200">
                รองรับไฟล์ Excel หลายแท็บ (.xlsx, .xls, .csv) • เปรียบเทียบกับตารางเดิมอัตโนมัติและแก้เฉพาะรายการที่เปลี่ยน
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
                อัปเดตตารางสอนเรียบร้อยแล้ว!
              </h4>
              <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                {importSummaryMsg || (
                  <>
                    ระบบได้ปรับปรุงข้อมูลตารางสอนของ{" "}
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
                  <span>อัปโหลดไฟล์ (.xlsx / .csv / .txt)</span>
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
                    {sheetInfo ? `เลือกไฟล์แล้ว: ${sheetInfo.fileName} (คลิกเพื่อเปลี่ยนไฟล์)` : "คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่"}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    อ่านครบทุกแท็บอัตโนมัติ และเปรียบเทียบหาเฉพาะคาบที่มีการเปลี่ยนแปลงให้ตรวจสอบก่อนบันทึก
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
                    disabled={comparing}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
                  >
                    {comparing ? "กำลังเปรียบเทียบข้อมูล..." : "ประมวลผลและเทียบความต่าง"}
                  </button>
                </div>
              )}

              {/* Comparing Indicator */}
              {comparing && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-2">
                  <RefreshCw className="w-6 h-6 text-sky-600 animate-spin mx-auto" />
                  <div className="text-sm font-semibold text-slate-700">
                    กำลังเปรียบเทียบไฟล์ใหม่กับตารางสอนปัจจุบันในระบบ...
                  </div>
                </div>
              )}

              {/* Parsed & Diff Result Preview */}
              {!comparing && parsedResult && diffResult && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 animate-in fade-in">
                  {/* Top Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <GitCompare className="w-4 h-4 text-sky-600" />
                      <h4 className="font-bold text-slate-800 text-sm sm:text-base">
                        ผลการเปรียบเทียบความเปลี่ยนแปลง (Smart Diff)
                      </h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {sheetInfo && sheetInfo.totalSheets > 1 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 text-xs font-semibold border border-sky-200 flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          อ่านครบ {sheetInfo.totalSheets} แท็บ
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 flex items-center gap-1">
                        <School className="w-3 h-3" />
                        {parsedResult.summary.totalClassrooms} ห้อง ({parsedResult.summary.totalPeriods} คาบ)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                        {parsedResult.summary.termTitle}
                      </span>
                    </div>
                  </div>

                  {/* Diff KPI Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
                      <div>
                        <div className="text-[10px] text-amber-700 font-medium">แก้ไข (เปลี่ยนวิชา/ครู)</div>
                        <div className="font-bold text-amber-900 text-sm">
                          {diffResult.modified.length} คาบ
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5">
                      <PlusCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="text-[10px] text-emerald-700 font-medium">เพิ่มคาบใหม่</div>
                        <div className="font-bold text-emerald-900 text-sm">
                          {diffResult.added.length} คาบ
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5">
                      <MinusCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <div className="text-[10px] text-rose-700 font-medium">ลบคาบเดิมออก</div>
                        <div className="font-bold text-rose-900 text-sm">
                          {diffResult.removed.length} คาบ
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-slate-500 shrink-0" />
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium">เหมือนเดิม (ข้าม)</div>
                        <div className="font-bold text-slate-700 text-sm">
                          {diffResult.unchangedCount} คาบ
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Case 1: Zero changes */}
                  {totalChanges === 0 ? (
                    <div className="p-5 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-center space-y-1.5">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <div className="font-bold text-emerald-900 text-sm">
                        ตารางสอนในไฟล์เหมือนกับข้อมูลปัจจุบันทุกประการ!
                      </div>
                      <p className="text-xs text-emerald-700">
                        ตรวจสอบทั้ง {parsedResult.summary.totalClassrooms} ห้อง ({diffResult.unchangedCount} คาบ) แล้ว ไม่พบรายการที่เปลี่ยนแปลง จึงไม่จำเป็นต้องบันทึกทับ
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Affected Classrooms Filter Chips */}
                      <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-200/80 space-y-2 text-xs">
                        <div className="font-bold text-sky-900 flex flex-wrap items-center justify-between gap-2">
                          <span>
                            พบการเปลี่ยนแปลงเฉพาะ {diffResult.affectedClassrooms.length} ห้อง (จากทั้งหมด {parsedResult.summary.totalClassrooms} ห้องในไฟล์):
                          </span>
                          <span className="text-[11px] font-medium text-sky-700">
                            คลิกชื่อห้องเพื่อกรองดูรายการ
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                          <button
                            type="button"
                            onClick={() => setDiffRoomFilter("all")}
                            className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all border ${
                              diffRoomFilter === "all"
                                ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                                : "bg-white text-sky-800 border-sky-200 hover:bg-sky-100"
                            }`}
                          >
                            ทุกห้องที่เปลี่ยน ({totalChanges})
                          </button>
                          {diffResult.affectedClassrooms.map((room) => {
                            const cnt = diffResult.items.filter((i) => i.gradeRoom === room).length;
                            return (
                              <button
                                key={room}
                                type="button"
                                onClick={() => setDiffRoomFilter(room)}
                                className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all border ${
                                  diffRoomFilter === room
                                    ? "bg-sky-600 text-white border-sky-600 shadow-xs"
                                    : "bg-white text-sky-800 border-sky-200 hover:bg-sky-100"
                                }`}
                              >
                                {room} ({cnt})
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Diff List Table with Per-Row Checkboxes */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="font-bold text-slate-700">
                            รายการที่จะอัปเดต (เลือกแล้ว {selectedCount} / {totalChanges} รายการ):
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={selectAllVisible}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px]"
                            >
                              เลือกทั้งหมด
                            </button>
                            <button
                              type="button"
                              onClick={deselectAllVisible}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[11px]"
                            >
                              ยกเลิกทั้งหมด
                            </button>
                          </div>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                          <div className="max-h-72 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead className="bg-slate-100 text-slate-600 text-[11px] sticky top-0 z-10">
                                <tr>
                                  <th className="py-2 px-2.5 w-8 text-center">เลือก</th>
                                  <th className="py-2 px-2.5 w-20">ประเภท</th>
                                  <th className="py-2 px-2.5 w-28">ห้อง / วัน / คาบ</th>
                                  <th className="py-2 px-2.5">รายละเอียดการเปลี่ยนแปลง (เดิม → ใหม่)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                                {filteredDiffItems.map((item) => {
                                  const checked = selectedDiffKeys.has(item.key);
                                  const periodLabel =
                                    item.periodStart === item.periodEnd
                                      ? `คาบ ${item.periodStart}`
                                      : `คาบคู่ ${item.periodStart}-${item.periodEnd}`;

                                  return (
                                    <tr
                                      key={item.key}
                                      onClick={() => toggleDiffKey(item.key)}
                                      className={`cursor-pointer transition-colors ${
                                        checked ? "hover:bg-sky-50/60" : "opacity-50 bg-slate-50/70"
                                      }`}
                                    >
                                      <td
                                        className="py-2 px-2.5 text-center align-top"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleDiffKey(item.key)}
                                          className="rounded text-sky-600 focus:ring-sky-500 mt-0.5"
                                        />
                                      </td>
                                      <td className="py-2 px-2.5 align-top">
                                        {item.type === "modified" && (
                                          <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-200">
                                            แก้ไข
                                          </span>
                                        )}
                                        {item.type === "added" && (
                                          <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                                            เพิ่มใหม่
                                          </span>
                                        )}
                                        {item.type === "removed" && (
                                          <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-200">
                                            ลบออก
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2.5 align-top whitespace-nowrap">
                                        <div className="font-bold text-sky-800">{item.gradeRoom}</div>
                                        <div className="text-[11px] text-slate-500">
                                          {DAY_LABELS[item.dayOfWeek - 1]} • {periodLabel}
                                        </div>
                                      </td>
                                      <td className="py-2 px-2.5 align-top space-y-1">
                                        {item.type === "modified" && item.oldEntry && item.newEntry && (
                                          <>
                                            <div className="text-[11px] text-rose-700 line-through">
                                              เดิม: <span className="font-semibold">{item.oldEntry.subjectCode}</span>{" "}
                                              {item.oldEntry.subjectName} • {item.oldEntry.teacherName}
                                              {item.oldEntry.roomLocation ? ` (${item.oldEntry.roomLocation})` : ""}
                                            </div>
                                            <div className="text-[11px] text-emerald-800 font-semibold">
                                              ใหม่: <span>{item.newEntry.subjectCode}</span>{" "}
                                              {item.newEntry.subjectName} • {item.newEntry.teacherName}
                                              {item.newEntry.roomLocation ? ` (${item.newEntry.roomLocation})` : ""}
                                            </div>
                                            {item.changedFields && item.changedFields.length > 0 && (
                                              <div className="flex flex-wrap gap-1 pt-0.5">
                                                {item.changedFields.map((f) => (
                                                  <span
                                                    key={f}
                                                    className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/70 text-[10px]"
                                                  >
                                                    เปลี่ยน{f}
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </>
                                        )}
                                        {item.type === "added" && item.newEntry && (
                                          <div className="text-[11px] text-emerald-800 font-semibold">
                                            + <span>{item.newEntry.subjectCode}</span> {item.newEntry.subjectName} •{" "}
                                            {item.newEntry.teacherName}
                                            {item.newEntry.roomLocation ? ` (${item.newEntry.roomLocation})` : ""}
                                          </div>
                                        )}
                                        {item.type === "removed" && item.oldEntry && (
                                          <div className="text-[11px] text-rose-700 line-through">
                                            - <span className="font-semibold">{item.oldEntry.subjectCode}</span>{" "}
                                            {item.oldEntry.subjectName} • {item.oldEntry.teacherName}
                                            {item.oldEntry.roomLocation ? ` (${item.oldEntry.roomLocation})` : ""}
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Options Checkboxes */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                        <div className="font-bold text-slate-700">
                          ตัวเลือกเพิ่มเติม (บันทึกเฉพาะข้อมูลใหม่ที่ยังไม่มีในระบบ):
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 font-medium">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importTeachers}
                              onChange={(e) => setImportTeachers(e.target.checked)}
                              className="rounded text-sky-600 focus:ring-sky-500"
                            />
                            <span>เพิ่มรายชื่อครูใหม่ (ถ้ามีในไฟล์)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importSubjects}
                              onChange={(e) => setImportSubjects(e.target.checked)}
                              className="rounded text-sky-600 focus:ring-sky-500"
                            />
                            <span>เพิ่มรายวิชาใหม่ (ถ้ามีในไฟล์)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={importClassrooms}
                              onChange={(e) => setImportClassrooms(e.target.checked)}
                              className="rounded text-sky-600 focus:ring-sky-500"
                            />
                            <span>เพิ่มห้องเรียนใหม่ (ถ้ามีในไฟล์)</span>
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

                      {/* Optional Update Note */}
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-700">
                          หมายเหตุการอัปเดต (ไม่บังคับ — จะถูกบันทึกไว้ในประวัติการอัปเดตตารางเรียน):
                        </label>
                        <input
                          type="text"
                          value={updateNote}
                          onChange={(e) => setUpdateNote(e.target.value)}
                          placeholder='เช่น "ฝ่ายวิชาการแจ้งปรับตาราง ม.5 ฉบับที่ 2"'
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      {/* Safety Notice */}
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        ✓ คาบสอนที่เหมือนเดิม <strong>{diffResult.unchangedCount} คาบ</strong> จะไม่ถูกเขียนทับ •
                        ไม่กระทบห้องเรียนอื่นที่ไม่อยู่ในไฟล์ • ไม่ลบประวัติการเช็คชื่อย้อนหลัง
                      </p>

                      {/* Action Button */}
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={importing || selectedCount === 0}
                          onClick={handleConfirmImport}
                          className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:from-sky-800 active:to-indigo-800 text-white font-bold rounded-xl transition-all shadow-md shadow-sky-600/25 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                          {importing ? (
                            <span>กำลังอัปเดตเฉพาะรายการที่เลือก...</span>
                          ) : (
                            <>
                              <span>
                                ยืนยันอัปเดตเฉพาะรายการที่เปลี่ยน ({selectedCount} รายการ)
                              </span>
                              <ArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 p-4 text-xs text-slate-500 flex justify-between items-center">
          <span>💡 อัปโหลดไฟล์ทั้งโรงเรียนได้เลย ระบบจะเทียบและแก้เฉพาะจุดที่เปลี่ยนแปลงให้อัตโนมัติ</span>
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
