"use client";

import React, { useState, useRef } from "react";
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  Calendar,
  Sparkles,
  Users,
  Clock,
  Filter,
} from "lucide-react";
import { Teacher, Classroom, Subject, TimetableEntry, AcademicTerm, SubstituteAssignment } from "@/types";
import { parseSubstituteExcelFile, SubstituteExcelParseResult, ParsedExcelSubstituteRow } from "@/lib/substituteExcelParser";
import { saveSubstituteAssignment } from "@/lib/storage";
import { formatThaiDateLong } from "@/lib/dateUtils";

interface SubstituteExcelImporterProps {
  teachers: Teacher[];
  classrooms: Classroom[];
  subjects: Subject[];
  timetable: TimetableEntry[];
  activeTerm: AcademicTerm | null;
  onImportComplete: (count: number) => void;
}

export default function SubstituteExcelImporter({
  teachers,
  classrooms,
  subjects,
  timetable,
  activeTerm,
  onImportComplete,
}: SubstituteExcelImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<SubstituteExcelParseResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await processFile(selectedFile);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    await processFile(droppedFile);
  };

  const processFile = async (f: File) => {
    setFile(f);
    setError(null);
    setLoading(true);

    try {
      const result = await parseSubstituteExcelFile(f, teachers, classrooms, subjects, timetable);
      if (result.items.length === 0) {
        throw new Error("ไม่พบรายการจัดสอนแทนในไฟล์ที่เลือก กรุณาตรวจสอบหัวตารางและเนื้อหา");
      }
      setParseResult(result);
      setEffectiveDate(result.date);
      // Select all by default
      setSelectedIndices(new Set(result.items.map((_, idx) => idx)));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "เกิดข้อผิดพลาดในการอ่านไฟล์ Excel");
      setParseResult(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedIndices(next);
  };

  const selectAll = () => {
    if (!parseResult) return;
    setSelectedIndices(new Set(parseResult.items.map((_, idx) => idx)));
  };

  const selectAssignedOnly = () => {
    if (!parseResult) return;
    const assigned = parseResult.items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.substituteTeacherName.trim().length > 0)
      .map(({ idx }) => idx);
    setSelectedIndices(new Set(assigned));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleSaveToDatabase = async () => {
    if (!parseResult || selectedIndices.size === 0) return;
    setIsSaving(true);
    setError(null);

    try {
      const termId = activeTerm?.id || "term_2_2569";
      const finalDate = effectiveDate || parseResult.date;

      let savedCount = 0;
      for (const idx of Array.from(selectedIndices)) {
        const item = parseResult.items[idx];
        if (!item) continue;

        const dObj = new Date(finalDate);
        const dayOfWeek = dObj.getDay() || 1;

        const subAssignment: SubstituteAssignment = {
          id: `sub_excel_${finalDate}_${item.classroomId || item.gradeRoom}_p${item.periodStart}_${Date.now()}_${idx}`,
          termId,
          date: finalDate,
          dayOfWeek,
          periodStart: item.periodStart,
          periodEnd: item.periodEnd,
          classroomId: item.classroomId || item.gradeRoom,
          gradeRoom: item.gradeRoom,
          subjectCode: item.subjectCode,
          subjectName: item.subjectName || item.subjectCode,
          originalTeacherId: item.originalTeacherId,
          originalTeacherName: item.originalTeacherName,
          leaveType: item.leaveType,
          substituteTeacherId: item.substituteTeacherId,
          substituteTeacherName: item.substituteTeacherName,
          substituteDepartment: item.substituteDepartment,
          recordedByDept: "ฝ่ายบริหารงานวิชาการ",
          createdAt: new Date().toISOString(),
          department: item.department,
          note: item.notes || (item.isJointCare ? "ดูแลควบ" : ""),
        };

        await saveSubstituteAssignment(subAssignment);
        savedCount++;
      }

      onImportComplete(savedCount);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลจัดสอนแทนลงฐานข้อมูล");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Upload Zone */}
      {!parseResult && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-3xl p-8 text-center bg-gradient-to-b from-emerald-50/50 to-white transition-all cursor-pointer shadow-sm hover:shadow-md"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">
            คลิกเพื่อเลือกไฟล์ Excel / CSV หรือลากไฟล์มาวางที่นี่
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            รองรับไฟล์สรุปการจัดสอนแทนจากโปรแกรมจัดสอนแทน (.xlsx, .xls, .csv) แม่นยำ 100% รวดเร็ว และไม่มีปัญหาตัวอักษรเพี้ยน
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md">
            <Upload className="w-4 h-4" />
            <span>เลือกไฟล์รายงานการจัดสอนแทน</span>
          </div>

          {loading && (
            <div className="mt-4 text-xs font-semibold text-emerald-800 animate-pulse">
              กำลังอ่านและประมวลผลข้อมูลในไฟล์ Excel...
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <div className="flex-1">
            <strong>เกิดข้อผิดพลาด:</strong> {error}
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 text-rose-400 hover:text-rose-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Parse Preview & Confirmation */}
      {parseResult && (
        <div className="space-y-4 bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  ตรวจสอบข้อมูลการจัดสอนแทนจากไฟล์ Excel
                </h3>
                <p className="text-xs text-slate-500">
                  ไฟล์: <strong className="text-slate-700">{file?.name}</strong> &bull; พบทั้งหมด{" "}
                  <strong className="text-emerald-700">{parseResult.totalPeriods} คาบ</strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setParseResult(null);
                setFile(null);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-semibold transition-colors"
            >
              เลือกไฟล์ใหม่
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-[11px] text-slate-500">คาบทั้งหมด</span>
              <div className="text-xl font-black text-slate-900 mt-0.5">
                {parseResult.totalPeriods} <span className="text-xs font-normal">คาบ</span>
              </div>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
              <span className="text-[11px] text-emerald-700 font-semibold">จัดแทนได้แล้ว</span>
              <div className="text-xl font-black text-emerald-800 mt-0.5">
                {parseResult.assignedCount} <span className="text-xs font-normal">คาบ</span>
              </div>
            </div>
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200">
              <span className="text-[11px] text-amber-700 font-semibold">ยังไม่มีผู้สอนแทน</span>
              <div className="text-xl font-black text-amber-800 mt-0.5">
                {parseResult.unassignedCount} <span className="text-xs font-normal">คาบ</span>
              </div>
            </div>
            <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200">
              <span className="text-[11px] text-indigo-700 font-semibold">เลือกนำเข้า</span>
              <div className="text-xl font-black text-indigo-800 mt-0.5">
                {selectedIndices.size} <span className="text-xs font-normal">คาบ</span>
              </div>
            </div>
          </div>

          {/* Toolbar: Date & Selection filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700">วันที่จัดสอนแทน:</span>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {effectiveDate && (
                <span className="text-slate-500 text-[11px]">
                  ({formatThaiDateLong(effectiveDate)})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectAssignedOnly}
                className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-emerald-800 font-semibold text-xs"
              >
                เลือกเฉพาะที่มีครูสอนแทน ({parseResult.assignedCount})
              </button>
              <button
                type="button"
                onClick={selectAll}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-700 font-medium text-xs"
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-slate-500 text-xs"
              >
                ยกเลิก
              </button>
            </div>
          </div>

          {/* Table Preview */}
          <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="p-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIndices.size === parseResult.items.length}
                      onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      className="rounded"
                    />
                  </th>
                  <th className="p-2.5 w-10 text-center">ลำดับ</th>
                  <th className="p-2.5">กลุ่มสาระ</th>
                  <th className="p-2.5">ครูที่ไม่อยู่ & สาเหตุ</th>
                  <th className="p-2.5 w-16 text-center">คาบ/เวลา</th>
                  <th className="p-2.5">วิชาที่สอน</th>
                  <th className="p-2.5 w-20 text-center">ชั้น/ห้อง</th>
                  <th className="p-2.5">ครูผู้ปฏิบัติหน้าที่สอนแทน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {parseResult.items.map((item, idx) => {
                  const isChecked = selectedIndices.has(idx);
                  const hasSub = item.substituteTeacherName.trim().length > 0;

                  return (
                    <tr
                      key={idx}
                      onClick={() => toggleSelect(idx)}
                      className={`cursor-pointer transition-colors ${
                        isChecked ? "bg-emerald-50/40 hover:bg-emerald-50/70" : "hover:bg-slate-50 opacity-60"
                      }`}
                    >
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(idx)}
                          className="rounded"
                        />
                      </td>
                      <td className="p-2 text-center font-mono text-[11px] text-slate-500">
                        {item.index}
                      </td>
                      <td className="p-2 text-slate-600 whitespace-nowrap">
                        {item.department.replace("กลุ่มสาระการเรียนรู้", "")}
                      </td>
                      <td className="p-2">
                        <div className="font-bold text-slate-900">{item.originalTeacherName}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 inline-block mt-0.5">
                          {item.leaveType === "sick" ? "ลาป่วย" : item.leaveType === "official" ? "ไปราชการ" : "ลากิจ"}
                        </span>
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <div className="font-bold text-indigo-900">คาบ {item.periodStart}</div>
                        <span className="text-[10px] text-slate-400">{item.timeRange}</span>
                      </td>
                      <td className="p-2">
                        <span className="font-bold text-slate-900">{item.subjectCode}</span>{" "}
                        <span className="text-slate-500 text-[11px]">{item.subjectName}</span>
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <span className="font-bold text-slate-800">{item.gradeRoom}</span>
                        {item.roomLocation && (
                          <div className="text-[10px] text-slate-400">ห้อง {item.roomLocation}</div>
                        )}
                      </td>
                      <td className="p-2">
                        {hasSub ? (
                          <div>
                            <span className="font-bold text-emerald-800">
                              {item.substituteTeacherName}
                            </span>
                            {item.isJointCare && (
                              <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                                ดูแลควบ
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-700 font-semibold text-[11px] italic">
                            ⚠️ ยังไม่มีผู้สอนแทน
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Button */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              พร้อมนำเข้า <strong>{selectedIndices.size}</strong> รายการ สู่ฐานข้อมูลจัดสอนแทน
            </span>

            <button
              type="button"
              disabled={selectedIndices.size === 0 || isSaving}
              onClick={handleSaveToDatabase}
              className={`px-6 py-2.5 rounded-xl font-bold text-white text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 ${
                selectedIndices.size > 0 && !isSaving
                  ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/25 active:scale-95"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>กำลังบันทึกลงระบบ...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>บันทึกและนำเข้าข้อมูลจัดสอนแทน ({selectedIndices.size} คาบ)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
