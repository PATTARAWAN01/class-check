"use client";

import React, { useState, useMemo } from "react";
import type {
  AcademicTerm,
  Classroom,
  Subject,
  Teacher,
  TimetableEntry,
  TimetableUpdateLog,
  TimetableUpdateSource,
} from "@/types";
import { THAI_DAYS } from "@/lib/constants";
import {
  applyTimetableDiff,
  addTimetableUpdateLog,
  rollbackTimetableUpdateLog,
} from "@/lib/storage";
import {
  Sparkles,
  Download,
  Upload,
  Plus,
  Edit3,
  Trash2,
  Search,
  History,
  Calendar,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Filter,
} from "lucide-react";

interface TimetableManagerPanelProps {
  timetable: TimetableEntry[];
  classrooms: Classroom[];
  subjects: Subject[];
  teachers: Teacher[];
  activeTerm: AcademicTerm | null;
  updateLogs: TimetableUpdateLog[];
  onOpenSchoolImporter: () => void;
  onDownloadTemplate: () => void;
  onImportExcelTemplate: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRefresh: () => Promise<void>;
  showNotice: (msg: string, type?: "success" | "error") => void;
}

const DAY_LABELS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์"];

const SOURCE_META: Record<
  TimetableUpdateSource,
  { label: string; badgeClass: string }
> = {
  excel_import: {
    label: "นำเข้า Excel (Smart Diff)",
    badgeClass: "bg-sky-100 text-sky-800 border-sky-200",
  },
  manual_add: {
    label: "เพิ่มคาบด้วยมือ",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  manual_edit: {
    label: "แก้ไขคาบด้วยมือ",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  manual_delete: {
    label: "ลบคาบด้วยมือ",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-200",
  },
  subject_sync: {
    label: "ซิงก์จากแท็บรายวิชา",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
  },
  rollback: {
    label: "ย้อนกลับ (Undo)",
    badgeClass: "bg-slate-200 text-slate-700 border-slate-300",
  },
};

function parseRoomOrder(gradeRoom: string): number {
  const m = gradeRoom.match(/(\d+)\/(\d+)/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 9999;
}

function formatThaiDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
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

function periodText(start: number, end: number): string {
  return start === end ? `คาบ ${start}` : `คาบคู่ ${start}-${end}`;
}

export default function TimetableManagerPanel({
  timetable,
  classrooms,
  subjects,
  teachers,
  activeTerm,
  updateLogs,
  onOpenSchoolImporter,
  onDownloadTemplate,
  onImportExcelTemplate,
  onRefresh,
  showNotice,
}: TimetableManagerPanelProps) {
  const [subTab, setSubTab] = useState<"list" | "history">("list");

  // Filters
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Add/Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [formClassroomId, setFormClassroomId] = useState("");
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1);
  const [formPeriodStart, setFormPeriodStart] = useState<number>(1);
  const [formPeriodEnd, setFormPeriodEnd] = useState<number>(1);
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formSubjectCode, setFormSubjectCode] = useState("");
  const [formSubjectName, setFormSubjectName] = useState("");
  const [formTeacherId, setFormTeacherId] = useState("");
  const [formRoomLocation, setFormRoomLocation] = useState("");
  const [formNote, setFormNote] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  // History UI State
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  const sortedClassrooms = useMemo(
    () =>
      [...classrooms].sort(
        (a, b) => parseRoomOrder(a.gradeRoom) - parseRoomOrder(b.gradeRoom)
      ),
    [classrooms]
  );

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.code.localeCompare(b.code, "th")),
    [subjects]
  );

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => a.fullName.localeCompare(b.fullName, "th")),
    [teachers]
  );

  const filteredTimetable = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return timetable
      .filter((tt) => {
        if (roomFilter !== "all" && tt.classroomId !== roomFilter && tt.gradeRoom !== roomFilter) {
          return false;
        }
        if (dayFilter !== "all" && tt.dayOfWeek !== Number(dayFilter)) {
          return false;
        }
        if (q) {
          const hay = `${tt.gradeRoom} ${tt.subjectCode} ${tt.subjectName} ${tt.teacherName} ${tt.roomLocation || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ra = parseRoomOrder(a.gradeRoom);
        const rb = parseRoomOrder(b.gradeRoom);
        if (ra !== rb) return ra - rb;
        if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
        return a.periodStart - b.periodStart;
      });
  }, [timetable, roomFilter, dayFilter, searchQuery]);

  // Detect period overlap conflict in the modal
  const conflictingEntry = useMemo(() => {
    if (!modalOpen || !formClassroomId) return null;
    const selectedCls = classrooms.find((c) => c.id === formClassroomId);
    return (
      timetable.find((tt) => {
        if (editingEntry && tt.id === editingEntry.id) return false;
        const sameRoom =
          tt.classroomId === formClassroomId ||
          (selectedCls && tt.gradeRoom === selectedCls.gradeRoom);
        if (!sameRoom || tt.dayOfWeek !== formDayOfWeek) return false;
        return tt.periodStart <= formPeriodEnd && tt.periodEnd >= formPeriodStart;
      }) || null
    );
  }, [
    modalOpen,
    formClassroomId,
    formDayOfWeek,
    formPeriodStart,
    formPeriodEnd,
    timetable,
    editingEntry,
    classrooms,
  ]);

  const openAddModal = () => {
    setEditingEntry(null);
    const defaultRoom =
      roomFilter !== "all"
        ? sortedClassrooms.find((c) => c.id === roomFilter || c.gradeRoom === roomFilter)?.id ||
          sortedClassrooms[0]?.id ||
          ""
        : sortedClassrooms[0]?.id || "";
    setFormClassroomId(defaultRoom);
    setFormDayOfWeek(dayFilter !== "all" ? Number(dayFilter) : 1);
    setFormPeriodStart(1);
    setFormPeriodEnd(1);
    setFormSubjectId("");
    setFormSubjectCode("");
    setFormSubjectName("");
    setFormTeacherId(sortedTeachers[0]?.id || "");
    setFormRoomLocation("");
    setFormNote("");
    setModalOpen(true);
  };

  const openEditModal = (tt: TimetableEntry) => {
    setEditingEntry(tt);
    const matchedCls = classrooms.find(
      (c) => c.id === tt.classroomId || c.gradeRoom === tt.gradeRoom
    );
    setFormClassroomId(matchedCls?.id || tt.classroomId);
    setFormDayOfWeek(tt.dayOfWeek);
    setFormPeriodStart(tt.periodStart);
    setFormPeriodEnd(tt.periodEnd);

    const matchedSubj = subjects.find(
      (s) => s.id === tt.subjectId || s.code === tt.subjectCode
    );
    setFormSubjectId(matchedSubj?.id || "");
    setFormSubjectCode(tt.subjectCode);
    setFormSubjectName(tt.subjectName);

    const matchedTch = teachers.find(
      (t) =>
        t.id === tt.teacherId ||
        `${t.prefix}${t.fullName}`.trim() === tt.teacherName.trim()
    );
    setFormTeacherId(matchedTch?.id || "");
    setFormRoomLocation(tt.roomLocation || "");
    setFormNote("");
    setModalOpen(true);
  };

  const handleSubjectDropdownChange = (subjId: string) => {
    setFormSubjectId(subjId);
    const found = subjects.find((s) => s.id === subjId);
    if (found) {
      setFormSubjectCode(found.code);
      setFormSubjectName(found.name);
    }
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cls = classrooms.find((c) => c.id === formClassroomId);
    if (!cls) {
      showNotice("กรุณาเลือกห้องเรียน", "error");
      return;
    }
    const cleanCode = formSubjectCode.trim();
    const cleanName = formSubjectName.trim();
    if (!cleanCode || !cleanName) {
      showNotice("กรุณาระบุรหัสวิชาและชื่อวิชา", "error");
      return;
    }
    const tch = teachers.find((t) => t.id === formTeacherId);
    const teacherName = tch
      ? `${tch.prefix}${tch.fullName}`
      : editingEntry?.teacherName || "ไม่ระบุ";
    const teacherId = tch ? tch.id : editingEntry?.teacherId || `tch_${teacherName}`;

    if (formPeriodEnd < formPeriodStart) {
      showNotice("คาบสิ้นสุดต้องมากกว่าหรือเท่ากับคาบเริ่มต้น", "error");
      return;
    }

    if (conflictingEntry) {
      const ok = confirm(
        `⚠️ พบคาบสอนทับซ้อนในห้อง ${cls.gradeRoom} วัน${DAY_LABELS[formDayOfWeek - 1]} (${periodText(
          conflictingEntry.periodStart,
          conflictingEntry.periodEnd
        )}: ${conflictingEntry.subjectCode} ${conflictingEntry.subjectName})\n\nต้องการบันทึกต่อไปหรือไม่?`
      );
      if (!ok) return;
    }

    setSavingEntry(true);
    try {
      const termId = editingEntry?.termId || activeTerm?.id || "term_2_2569";
      const periodSuffix =
        formPeriodStart === formPeriodEnd
          ? `p${formPeriodStart}`
          : `p${formPeriodStart}_${formPeriodEnd}`;
      const newId = `tt_${cls.id}_d${formDayOfWeek}_${periodSuffix}`;
      const cleanLoc = formRoomLocation.trim();

      const newEntry: TimetableEntry = {
        id: newId,
        termId,
        dayOfWeek: formDayOfWeek,
        periodStart: formPeriodStart,
        periodEnd: formPeriodEnd,
        classroomId: cls.id,
        gradeRoom: cls.gradeRoom,
        subjectId: formSubjectId || `subj_${cleanCode}`,
        subjectCode: cleanCode,
        subjectName: cleanName,
        teacherId,
        teacherName,
        ...(cleanLoc ? { roomLocation: cleanLoc } : {}),
      };

      const toDeleteIds: string[] = [];
      if (editingEntry && editingEntry.id !== newId) {
        toDeleteIds.push(editingEntry.id);
      }

      await applyTimetableDiff({ toUpsert: [newEntry], toDeleteIds });

      if (editingEntry) {
        const changedFields: string[] = [];
        if (editingEntry.gradeRoom !== newEntry.gradeRoom) changedFields.push("ห้องเรียน");
        if (editingEntry.dayOfWeek !== newEntry.dayOfWeek) changedFields.push("วัน");
        if (
          editingEntry.periodStart !== newEntry.periodStart ||
          editingEntry.periodEnd !== newEntry.periodEnd
        ) {
          changedFields.push("คาบเรียน");
        }
        if (
          editingEntry.subjectCode !== newEntry.subjectCode ||
          editingEntry.subjectName !== newEntry.subjectName
        ) {
          changedFields.push("วิชา");
        }
        if (editingEntry.teacherName !== newEntry.teacherName) changedFields.push("ครูผู้สอน");
        if ((editingEntry.roomLocation || "") !== (newEntry.roomLocation || "")) {
          changedFields.push("ห้องเรียน/สถานที่");
        }

        await addTimetableUpdateLog({
          id: `ttlog_${Date.now()}_edit`,
          termId,
          createdAt: new Date().toISOString(),
          source: "manual_edit",
          sourceLabel: `แก้ไขคาบสอน ${newEntry.gradeRoom} วัน${DAY_LABELS[newEntry.dayOfWeek - 1]} ${periodText(newEntry.periodStart, newEntry.periodEnd)}`,
          note: formNote.trim() || undefined,
          summary: {
            added: 0,
            modified: 1,
            removed: 0,
            affectedClassrooms: Array.from(
              new Set([editingEntry.gradeRoom, newEntry.gradeRoom])
            ),
          },
          changes: [
            {
              type: "modified",
              gradeRoom: newEntry.gradeRoom,
              dayOfWeek: newEntry.dayOfWeek,
              periodStart: newEntry.periodStart,
              periodEnd: newEntry.periodEnd,
              oldEntry: editingEntry,
              newEntry,
              changedFields: changedFields.length > 0 ? changedFields : ["รายละเอียดคาบ"],
            },
          ],
        });
        showNotice(`แก้ไขคาบสอน ${newEntry.gradeRoom} (${newEntry.subjectCode}) เรียบร้อยแล้ว`);
      } else {
        await addTimetableUpdateLog({
          id: `ttlog_${Date.now()}_add`,
          termId,
          createdAt: new Date().toISOString(),
          source: "manual_add",
          sourceLabel: `เพิ่มคาบสอน ${newEntry.gradeRoom} วัน${DAY_LABELS[newEntry.dayOfWeek - 1]} ${periodText(newEntry.periodStart, newEntry.periodEnd)}`,
          note: formNote.trim() || undefined,
          summary: {
            added: 1,
            modified: 0,
            removed: 0,
            affectedClassrooms: [newEntry.gradeRoom],
          },
          changes: [
            {
              type: "added",
              gradeRoom: newEntry.gradeRoom,
              dayOfWeek: newEntry.dayOfWeek,
              periodStart: newEntry.periodStart,
              periodEnd: newEntry.periodEnd,
              newEntry,
            },
          ],
        });
        showNotice(`เพิ่มคาบสอน ${newEntry.gradeRoom} (${newEntry.subjectCode}) เรียบร้อยแล้ว`);
      }

      setModalOpen(false);
      await onRefresh();
    } catch (err: any) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดในการบันทึกคาบสอน: " + (err.message || ""), "error");
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (tt: TimetableEntry) => {
    if (
      !confirm(
        `ต้องการลบคาบสอนนี้หรือไม่?\n\nห้อง ${tt.gradeRoom} • วัน${DAY_LABELS[tt.dayOfWeek - 1]} ${periodText(
          tt.periodStart,
          tt.periodEnd
        )}\nวิชา ${tt.subjectCode} ${tt.subjectName} (${tt.teacherName})\n\n(สามารถกดย้อนกลับได้จากแท็บประวัติการอัปเดต)`
      )
    ) {
      return;
    }

    try {
      await applyTimetableDiff({ toUpsert: [], toDeleteIds: [tt.id] });
      await addTimetableUpdateLog({
        id: `ttlog_${Date.now()}_del`,
        termId: tt.termId || activeTerm?.id || "term_2_2569",
        createdAt: new Date().toISOString(),
        source: "manual_delete",
        sourceLabel: `ลบคาบสอน ${tt.gradeRoom} วัน${DAY_LABELS[tt.dayOfWeek - 1]} ${periodText(
          tt.periodStart,
          tt.periodEnd
        )}`,
        summary: {
          added: 0,
          modified: 0,
          removed: 1,
          affectedClassrooms: [tt.gradeRoom],
        },
        changes: [
          {
            type: "removed",
            gradeRoom: tt.gradeRoom,
            dayOfWeek: tt.dayOfWeek,
            periodStart: tt.periodStart,
            periodEnd: tt.periodEnd,
            oldEntry: tt,
          },
        ],
      });
      showNotice("ลบรายการตารางสอนและบันทึกประวัติเรียบร้อยแล้ว");
      await onRefresh();
    } catch (err: any) {
      console.error(err);
      showNotice("ไม่สามารถลบคาบสอนได้: " + (err.message || ""), "error");
    }
  };

  const toggleExpandLog = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRollback = async (log: TimetableUpdateLog) => {
    if (log.rolledBackAt) return;
    const total = log.changes?.length || 0;
    if (
      !confirm(
        `ยืนยันการย้อนกลับ (Undo) รายการนี้หรือไม่?\n\n"${log.sourceLabel}"\nจำนวน ${total} รายการที่เปลี่ยนแปลงจะถูกคืนค่ากลับเป็นก่อนการอัปเดตครั้งนี้`
      )
    ) {
      return;
    }

    setRollingBackId(log.id);
    try {
      const { restored, deleted } = await rollbackTimetableUpdateLog(log);
      showNotice(
        `ย้อนกลับตารางสอนเรียบร้อยแล้ว (คืนค่า ${restored} คาบ, ลบคาบที่เพิ่มออก ${deleted} คาบ)`
      );
      await onRefresh();
    } catch (err: any) {
      console.error(err);
      showNotice("เกิดข้อผิดพลาดในการย้อนกลับตารางสอน: " + (err.message || ""), "error");
    } finally {
      setRollingBackId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        {/* Header & Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              จัดการตารางสอนประจำภาคเรียน (Timetable)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              อัปเดตเฉพาะจุดที่เปลี่ยนจากไฟล์ Excel, แก้ไขรายคาบด้วยมือ และดูประวัติการเปลี่ยนแปลงย้อนหลัง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openAddModal}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มคาบสอน</span>
            </button>

            <button
              type="button"
              onClick={onOpenSchoolImporter}
              className="px-3.5 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>นำเข้า / อัปเดตจาก Excel (Smart Diff)</span>
            </button>

            <button
              type="button"
              onClick={onDownloadTemplate}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 border border-slate-200"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>เทมเพลต</span>
            </button>

            <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer border border-slate-200 transition-all flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>นำเข้าเทมเพลต</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={onImportExcelTemplate}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100/80 p-1.5 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setSubTab("list")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              subTab === "list"
                ? "bg-white text-sky-700 shadow-xs"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>รายการตารางสอน</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
              {timetable.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("history")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              subTab === "history"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>ประวัติการอัปเดตตารางเรียน</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                updateLogs.length > 0
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {updateLogs.length}
            </span>
          </button>
        </div>

        {/* ==================== SUB-TAB 1: TIMETABLE LIST ==================== */}
        {subTab === "list" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> กรองตามห้องเรียน
                </label>
                <select
                  value={roomFilter}
                  onChange={(e) => setRoomFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">ทุกห้องเรียน ({sortedClassrooms.length} ห้อง)</option>
                  {sortedClassrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      ห้อง {c.gradeRoom}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  กรองตามวัน
                </label>
                <select
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">ทุกวัน (จันทร์–ศุกร์)</option>
                  {THAI_DAYS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-6">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  ค้นหารหัสวิชา / ชื่อวิชา / ชื่อครูผู้สอน / สถานที่
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="เช่น ค32102, ภาษาไทย, ชลาธิป, 322..."
                    className="w-full pl-8 pr-8 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                แสดง <strong className="text-slate-800">{filteredTimetable.length}</strong> จากทั้งหมด{" "}
                {timetable.length} คาบ
              </span>
              {(roomFilter !== "all" || dayFilter !== "all" || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setRoomFilter("all");
                    setDayFilter("all");
                    setSearchQuery("");
                  }}
                  className="text-sky-600 hover:text-sky-800 font-semibold"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>

            {/* Timetable Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">ห้องเรียน</th>
                    <th className="py-3 px-3">วัน</th>
                    <th className="py-3 px-3 text-center">คาบเรียน</th>
                    <th className="py-3 px-3">รหัสวิชา & วิชา</th>
                    <th className="py-3 px-3">ครูผู้สอน</th>
                    <th className="py-3 px-3">สถานที่</th>
                    <th className="py-3 px-3 text-center w-24">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTimetable.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400">
                        ไม่พบรายการตารางสอนที่ตรงกับเงื่อนไข
                      </td>
                    </tr>
                  ) : (
                    filteredTimetable.map((tt) => {
                      const dayObj = THAI_DAYS.find((d) => d.id === tt.dayOfWeek);
                      return (
                        <tr key={tt.id} className="hover:bg-sky-50/40 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-sky-700 whitespace-nowrap">
                            {tt.gradeRoom}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                            {dayObj?.full || `วัน${tt.dayOfWeek}`}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                tt.periodStart === tt.periodEnd
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              }`}
                            >
                              {periodText(tt.periodStart, tt.periodEnd)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-slate-900">{tt.subjectCode}</span>{" "}
                            <span>{tt.subjectName}</span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {tt.teacherName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {tt.roomLocation ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                                <MapPin className="w-2.5 h-2.5 text-slate-400" />
                                {tt.roomLocation}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(tt)}
                                className="p-1.5 rounded-lg text-sky-600 hover:bg-sky-100 transition-colors"
                                title="แก้ไขคาบสอน"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteEntry(tt)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="ลบคาบสอน"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== SUB-TAB 2: UPDATE HISTORY ==================== */}
        {subTab === "history" && (
          <div className="space-y-3">
            {updateLogs.length === 0 ? (
              <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
                <History className="w-8 h-8 text-slate-400 mx-auto" />
                <div className="font-bold text-slate-700 text-sm">
                  ยังไม่มีประวัติการอัปเดตตารางเรียน
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  เมื่อมีการอัปเดตตารางเรียนจากไฟล์ Excel, เพิ่ม/แก้ไข/ลบรายคาบ หรือซิงก์ชื่อวิชาจากแท็บรายวิชา ระบบจะบันทึกประวัติไว้ที่นี่โดยอัตโนมัติ
                </p>
              </div>
            ) : (
              updateLogs.map((log) => {
                const meta = SOURCE_META[log.source] || SOURCE_META.manual_edit;
                const isExpanded = expandedLogIds.has(log.id);
                const canRollback =
                  !log.rolledBackAt &&
                  log.source !== "rollback" &&
                  (log.changes?.length || 0) > 0;

                return (
                  <div
                    key={log.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      log.rolledBackAt
                        ? "bg-slate-50/80 border-slate-200 opacity-80"
                        : "bg-white border-slate-200 shadow-xs"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">
                            {formatThaiDateTime(log.createdAt)}
                          </span>
                          {log.rolledBackAt && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              ย้อนกลับแล้วเมื่อ {formatThaiDateTime(log.rolledBackAt)}
                            </span>
                          )}
                        </div>

                        <div className="font-bold text-slate-800 text-sm">
                          {log.sourceLabel}
                        </div>

                        {log.note && (
                          <div className="text-xs text-indigo-800 bg-indigo-50/80 border border-indigo-100 rounded-lg px-2.5 py-1.5 inline-block">
                            📝 หมายเหตุ: {log.note}
                          </div>
                        )}

                        {/* Summary Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                          {log.summary.modified > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                              แก้ไข {log.summary.modified} คาบ
                            </span>
                          )}
                          {log.summary.added > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                              เพิ่มใหม่ {log.summary.added} คาบ
                            </span>
                          )}
                          {log.summary.removed > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                              ลบออก {log.summary.removed} คาบ
                            </span>
                          )}
                          {typeof log.summary.unchanged === "number" && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                              ข้ามคาบเดิม {log.summary.unchanged} คาบ
                            </span>
                          )}
                          {log.summary.affectedClassrooms?.length > 0 && (
                            <span className="text-slate-500 pl-1">
                              ห้องที่เปลี่ยน:{" "}
                              <strong className="text-sky-700">
                                {log.summary.affectedClassrooms.join(", ")}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleExpandLog(log.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              <span>ซ่อนรายละเอียด</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>ดูรายละเอียด ({log.changes?.length || 0})</span>
                            </>
                          )}
                        </button>

                        {canRollback && (
                          <button
                            type="button"
                            disabled={rollingBackId === log.id}
                            onClick={() => handleRollback(log)}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>
                              {rollingBackId === log.id ? "กำลังย้อนกลับ..." : "ย้อนกลับ (Undo)"}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Before -> After Details */}
                    {isExpanded && log.changes && log.changes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                          <div className="max-h-64 overflow-y-auto">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 text-slate-600 text-[11px] sticky top-0">
                                <tr>
                                  <th className="py-2 px-3 w-20">ประเภท</th>
                                  <th className="py-2 px-3 w-32">ห้อง / วัน / คาบ</th>
                                  <th className="py-2 px-3">รายละเอียด (เดิม → ใหม่)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {log.changes.map((ch, idx) => (
                                  <tr key={`${log.id}_${idx}`}>
                                    <td className="py-2 px-3 align-top">
                                      {ch.type === "modified" && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                                          แก้ไข
                                        </span>
                                      )}
                                      {ch.type === "added" && (
                                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                          เพิ่มใหม่
                                        </span>
                                      )}
                                      {ch.type === "removed" && (
                                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                          ลบออก
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 align-top whitespace-nowrap">
                                      <div className="font-bold text-sky-800">{ch.gradeRoom}</div>
                                      <div className="text-[11px] text-slate-500">
                                        {DAY_LABELS[ch.dayOfWeek - 1]} •{" "}
                                        {periodText(ch.periodStart, ch.periodEnd)}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 align-top space-y-0.5">
                                      {ch.type === "modified" && ch.oldEntry && ch.newEntry && (
                                        <>
                                          <div className="text-[11px] text-rose-700 line-through">
                                            เดิม: {ch.oldEntry.subjectCode} {ch.oldEntry.subjectName} •{" "}
                                            {ch.oldEntry.teacherName}
                                            {ch.oldEntry.roomLocation
                                              ? ` (${ch.oldEntry.roomLocation})`
                                              : ""}
                                          </div>
                                          <div className="text-[11px] text-emerald-800 font-semibold">
                                            ใหม่: {ch.newEntry.subjectCode} {ch.newEntry.subjectName} •{" "}
                                            {ch.newEntry.teacherName}
                                            {ch.newEntry.roomLocation
                                              ? ` (${ch.newEntry.roomLocation})`
                                              : ""}
                                          </div>
                                        </>
                                      )}
                                      {ch.type === "added" && ch.newEntry && (
                                        <div className="text-[11px] text-emerald-800 font-semibold">
                                          + {ch.newEntry.subjectCode} {ch.newEntry.subjectName} •{" "}
                                          {ch.newEntry.teacherName}
                                          {ch.newEntry.roomLocation
                                            ? ` (${ch.newEntry.roomLocation})`
                                            : ""}
                                        </div>
                                      )}
                                      {ch.type === "removed" && ch.oldEntry && (
                                        <div className="text-[11px] text-rose-700 line-through">
                                          - {ch.oldEntry.subjectCode} {ch.oldEntry.subjectName} •{" "}
                                          {ch.oldEntry.teacherName}
                                          {ch.oldEntry.roomLocation
                                            ? ` (${ch.oldEntry.roomLocation})`
                                            : ""}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ==================== ADD / EDIT PERIOD MODAL ==================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-sky-800 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">
                  {editingEntry ? "แก้ไขรายละเอียดคาบสอน" : "เพิ่มคาบสอนใหม่ในตารางเรียน"}
                </h3>
                <p className="text-xs text-sky-200 mt-0.5">
                  การเปลี่ยนแปลงจะถูกบันทึกไว้ในประวัติการอัปเดตและสามารถย้อนกลับได้
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-sky-200 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-5 space-y-4 text-xs">
              {/* Room & Day */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ห้องเรียน *</label>
                  <select
                    value={formClassroomId}
                    onChange={(e) => setFormClassroomId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {sortedClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        ห้อง {c.gradeRoom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">วัน *</label>
                  <select
                    value={formDayOfWeek}
                    onChange={(e) => setFormDayOfWeek(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {THAI_DAYS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.full}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Period Start & End */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">คาบเริ่มต้น *</label>
                  <select
                    value={formPeriodStart}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setFormPeriodStart(val);
                      if (formPeriodEnd < val) setFormPeriodEnd(val);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                      <option key={p} value={p}>
                        คาบที่ {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    คาบสิ้นสุด (กรณีคาบคู่) *
                  </label>
                  <select
                    value={formPeriodEnd}
                    onChange={(e) => setFormPeriodEnd(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8]
                      .filter((p) => p >= formPeriodStart)
                      .map((p) => (
                        <option key={p} value={p}>
                          คาบที่ {p} {p === formPeriodStart ? "(คาบเดี่ยว)" : "(คาบคู่)"}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Overlap Conflict Warning */}
              {conflictingEntry && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">พบคาบเรียนทับซ้อนในวันและห้องเดียวกัน!</div>
                    <div className="text-[11px] mt-0.5">
                      ชนกับ {periodText(conflictingEntry.periodStart, conflictingEntry.periodEnd)}:{" "}
                      <strong>
                        {conflictingEntry.subjectCode} {conflictingEntry.subjectName}
                      </strong>{" "}
                      ({conflictingEntry.teacherName})
                    </div>
                  </div>
                </div>
              )}

              {/* Subject Picker + Editable Code & Name */}
              <div className="space-y-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    เลือกรายวิชาจากฐานข้อมูล (เพื่อเติมรหัสและชื่ออัตโนมัติ)
                  </label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => handleSubjectDropdownChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- เลือกรายวิชา หรือพิมพ์แก้ไขด้านล่าง --</option>
                    {sortedSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">รหัสวิชา *</label>
                    <input
                      type="text"
                      value={formSubjectCode}
                      onChange={(e) => setFormSubjectCode(e.target.value)}
                      placeholder="เช่น ว32102"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">ชื่อรายวิชา *</label>
                    <input
                      type="text"
                      value={formSubjectName}
                      onChange={(e) => setFormSubjectName(e.target.value)}
                      placeholder="เช่น วิทยาศาสตร์พื้นฐาน"
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Teacher & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ครูผู้สอน *</label>
                  <select
                    value={formTeacherId}
                    onChange={(e) => setFormTeacherId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">-- เลือกครูผู้สอน --</option>
                    {sortedTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.prefix}
                        {t.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ห้องเรียน / สถานที่ (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    value={formRoomLocation}
                    onChange={(e) => setFormRoomLocation(e.target.value)}
                    placeholder="เช่น 322, ห้องศิลปะ1, สนาม 1"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Optional Note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  หมายเหตุการแก้ไข (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder='เช่น "สลับคาบตามแจ้งจากฝ่ายวิชาการ"'
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingEntry}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white font-bold shadow-sm disabled:opacity-50"
                >
                  {savingEntry
                    ? "กำลังบันทึก..."
                    : editingEntry
                    ? "บันทึกการแก้ไข"
                    : "เพิ่มคาบสอน"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
