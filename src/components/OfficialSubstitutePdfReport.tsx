"use client";

import React, { useEffect } from "react";
import { Printer, X, Sparkles, UserCheck } from "lucide-react";
import { AcademicTerm, SchoolProfile, SubstituteAssignment, Teacher } from "@/types";
import { formatThaiDateLong, formatThaiDateShort, getThaiDateString } from "@/lib/dateUtils";

interface OfficialSubstitutePdfReportProps {
  schoolProfile: SchoolProfile;
  term: AcademicTerm | null;
  substitutes: SubstituteAssignment[];
  teachers: Teacher[];
  dateRangeLabel: string;
  onClose: () => void;
}

export default function OfficialSubstitutePdfReport({
  schoolProfile,
  term,
  substitutes,
  teachers,
  dateRangeLabel,
  onClose,
}: OfficialSubstitutePdfReportProps) {
  const totalSubPeriods = substitutes.length;

  // Aggregate stats per substitute teacher
  const teacherSubStats = React.useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        dept: string;
        periodsCount: number;
        details: { date: string; period: number; gradeRoom: string; subject: string }[];
      }
    >();

    substitutes.forEach((sub) => {
      const key = sub.substituteTeacherName || sub.substituteTeacherId || "unknown";
      if (!map.has(key)) {
        // Try finding official department from teachers list
        const found = teachers.find(
          (t) =>
            t.id === sub.substituteTeacherId ||
            t.fullName === sub.substituteTeacherName ||
            `${t.prefix}${t.fullName}` === sub.substituteTeacherName
        );
        map.set(key, {
          id: sub.substituteTeacherId,
          name: sub.substituteTeacherName,
          dept: found ? found.department : sub.substituteDepartment || "กลุ่มสาระการเรียนรู้",
          periodsCount: 0,
          details: [],
        });
      }

      const item = map.get(key)!;
      item.periodsCount += 1;
      item.details.push({
        date: sub.date,
        period: sub.periodStart,
        gradeRoom: sub.gradeRoom,
        subject: sub.subjectCode || sub.subjectName,
      });
    });

    // Sort descending by periodsCount
    return Array.from(map.values()).sort((a, b) => b.periodsCount - a.periodsCount);
  }, [substitutes, teachers]);

  const pdfFileName = `รายงานสรุปสอนแทนสะสมรายบุคคล_${getThaiDateString()}`;

  // Automatically set document.title so browser's "Save as PDF" uses this filename
  useEffect(() => {
    const prevTitle = document.title;
    document.title = pdfFileName;
    return () => {
      document.title = prevTitle;
    };
  }, [pdfFileName]);

  const handlePrint = () => {
    const prevTitle = document.title;
    document.title = pdfFileName;
    window.print();
    setTimeout(() => {
      document.title = prevTitle;
    }, 1000);
  };

  const termDisplay = term
    ? `ภาคเรียนที่ ${term.term} ปีการศึกษา ${term.year}`
    : "ภาคเรียนที่ 2 ปีการศึกษา 2569";

  const todayThai = formatThaiDateLong(getThaiDateString());

  // Default Signers
  const signers =
    schoolProfile.signers && schoolProfile.signers.length > 0
      ? schoolProfile.signers
      : [
          {
            id: "s1",
            roleTitle: "ผู้จัดทำรายงาน",
            name: "นางสาวพัทธวรรณ สุวรรณวาปี",
            position: "เจ้าหน้าที่งานตารางสอนและจัดสอนแทน",
          },
          {
            id: "s2",
            roleTitle: "ผู้ตรวจสอบ",
            name: schoolProfile.academicHeadName || "นายทนงศักดิ์ สมใจคง",
            position: "หัวหน้ากลุ่มบริหารงานวิชาการ",
          },
          {
            id: "s3",
            roleTitle: "ผู้อนุมัติ",
            name: schoolProfile.directorName || "นายสุขุม สร้อยคำ",
            position: "ผู้อำนวยการโรงเรียนหนองวัวซอพิทยาคม",
          },
        ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 print:p-0 print:static print:bg-white">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }
          html, body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 11pt !important;
          }
          .no-print {
            display: none !important;
          }
          .report-sheet {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Top Bar (Hidden on Print) */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                รายงานสรุปจำนวนคาบการปฏิบัติหน้าที่เข้าสอนแทนสะสมรายบุคคล (PDF)
              </h2>
              <p className="text-xs text-slate-400">
                โรงเรียนหนองวัวซอพิทยาคม &bull; เอกสารทางการฝ่ายบริหารงานวิชาการ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์รายงาน (Print / Save as PDF)</span>
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

        {/* Printable Official Document */}
        <div className="p-6 sm:p-10 overflow-y-auto print:p-0 print:overflow-visible text-slate-800 font-['TH_Sarabun_New','Sarabun',sans-serif] leading-relaxed report-sheet">
          {/* 1. Official Standardized Header */}
          <div className="text-center border-b-2 border-slate-900 pb-4 mb-4 relative">
            <div className="flex flex-col items-center justify-center gap-1 mb-2">
              {/* Line 1: Logo */}
              <img
                src={schoolProfile.logoUrl || "/LOGO-N.png"}
                alt="ตราโรงเรียนหนองวัวซอพิทยาคม"
                className="w-16 h-16 object-contain mx-auto print:w-14 print:h-14"
              />
              {/* Line 2: Title */}
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                รายงานสรุปจำนวนคาบการปฏิบัติหน้าที่เข้าสอนแทนสะสมรายบุคคล
              </h2>
              {/* Line 3: School Name */}
              <h1 className="text-sm sm:text-base font-semibold text-slate-800">
                {schoolProfile.schoolName || "โรงเรียนหนองวัวซอพิทยาคม"} &bull; กลุ่มบริหารงานวิชาการ
              </h1>
              {/* Line 4: Term & Short Thai Date */}
              <p className="text-xs text-slate-600 font-medium">
                ประจำ{termDisplay} &bull; วันที่ {formatThaiDateShort(getThaiDateString())}
              </p>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 border-t pt-1 border-slate-200 mt-2">
              <span>ช่วงเวลาที่รายงาน: <strong>{dateRangeLabel}</strong></span>
              <span>วันที่พิมพ์เอกสาร: {todayThai}</span>
            </div>
          </div>

          {/* 2. Main Summary Table per Substitute Teacher */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                บัญชีสรุปจำนวนคาบการปฏิบัติหน้าที่เข้าสอนแทนสะสมรายบุคคล
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                (ครูผู้สอนแทนทั้งหมด {teacherSubStats.length} ท่าน)
              </span>
            </div>

            <table className="w-full text-xs text-left border-collapse border border-slate-300">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                <tr>
                  <th className="p-2 border border-slate-300 w-12 text-center">ลำดับ</th>
                  <th className="p-2 border border-slate-300">ชื่อ-สกุล ครูผู้เข้าสอนแทน</th>
                  <th className="p-2 border border-slate-300">กลุ่มสาระการเรียนรู้</th>
                  <th className="p-2 border border-slate-300 text-center w-28">
                    จำนวนคาบสอนแทน
                  </th>
                  <th className="p-2 border border-slate-300">ห้องเรียนและวิชาที่สอนแทน</th>
                  <th className="p-2 border border-slate-300 w-24 text-center">ลายมือชื่อ</th>
                </tr>
              </thead>
              <tbody>
                {teacherSubStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 border border-slate-300">
                      ไม่พบข้อมูลการปฏิบัติหน้าที่สอนแทนในช่วงเวลานี้
                    </td>
                  </tr>
                ) : (
                  teacherSubStats.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="p-2 border border-slate-300 text-center font-mono">
                        {idx + 1}
                      </td>
                      <td className="p-2 border border-slate-300 font-bold text-slate-900">
                        {item.name}
                      </td>
                      <td className="p-2 border border-slate-300 text-slate-600">
                        {item.dept.replace("กลุ่มสาระการเรียนรู้", "")}
                      </td>
                      <td className="p-2 border border-slate-300 text-center font-bold text-indigo-950 font-mono text-sm">
                        {item.periodsCount}
                      </td>
                      <td className="p-2 border border-slate-300 text-[10px] text-slate-600">
                        {item.details
                          .map((d) => `${d.gradeRoom} (คาบ ${d.period})`)
                          .slice(0, 5)
                          .join(", ")}
                        {item.details.length > 5 && ` และอีก ${item.details.length - 5} คาบ`}
                      </td>
                      <td className="p-2 border border-slate-300 text-center text-slate-300">
                        .....................
                      </td>
                    </tr>
                  ))
                )}
                {teacherSubStats.length > 0 && (
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td colSpan={3} className="p-2 border border-slate-300 text-right">
                      รวมจำนวนคาบที่ครูเข้าสอนแทนทั้งสิ้น:
                    </td>
                    <td className="p-2 border border-slate-300 text-center text-sm font-mono text-indigo-950">
                      {totalSubPeriods} คาบ
                    </td>
                    <td colSpan={2} className="p-2 border border-slate-300 text-slate-500 text-[10px]">
                      (เฉลี่ย {teacherSubStats.length > 0 ? (totalSubPeriods / teacherSubStats.length).toFixed(1) : 0} คาบ/ท่าน)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 3. Official Signatures (3 Signers) */}
          <div className="mt-8 pt-4 border-t border-slate-300 avoid-break">
            <p className="text-[11px] text-slate-600 mb-6 text-center italic">
              ขอรับรองว่ารายงานสรุปจำนวนคาบการปฏิบัติหน้าที่เข้าสอนแทนสะสมรายบุคคลฉบับนี้ ถูกต้องตรงตามความเป็นจริงทุกประการ
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
              {signers.map((signer, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="font-semibold text-slate-700 text-[11px]">
                    ({signer.roleTitle || "ผู้ลงนาม"})
                  </div>
                  <div className="pt-10 border-b border-dotted border-slate-400 mx-auto w-44"></div>
                  <div className="font-bold text-slate-900 pt-1">
                    ({signer.name})
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {signer.position}
                  </div>
                  <div className="text-[10px] text-slate-400 pt-0.5">
                    วันที่ .......... / .......... / ..........
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer (Hidden on Print) */}
        <div className="bg-slate-50 border-t border-slate-200 p-3 sm:p-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            💡 <strong className="text-slate-700">คำแนะนำ:</strong> เมื่อกดสั่งพิมพ์และเลือก <strong>&quot;บันทึกเป็น PDF (Save as PDF)&quot;</strong> ระบบจะตั้งชื่อไฟล์เริ่มต้นเป็น <strong>&quot;{pdfFileName}.pdf&quot;</strong> ให้อัตโนมัติ
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
