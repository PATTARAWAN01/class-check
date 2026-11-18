import { AttendanceRecord, TimetableEntry } from "@/types";

/**
 * Calculates the true effective period count for an attendance record.
 * Handles erroneous data where periodCount was saved as 2 due to legacy double-period toggle,
 * but the period span or official timetable curriculum defines it as a single period (1 period).
 */
export function getEffectivePeriodCount(
  record: AttendanceRecord,
  timetable?: TimetableEntry[]
): number {
  if (!record) return 1;

  const pStart = record.periodStart || 1;
  const pEnd = record.periodEnd || pStart;

  // 1. If start equals end, it is strictly 1 period by definition
  if (pStart === pEnd) {
    return 1;
  }

  // 2. Cross-reference with timetable if available
  if (timetable && timetable.length > 0 && record.classroomId) {
    const match = timetable.find(
      (tt) =>
        (tt.classroomId === record.classroomId || tt.gradeRoom === record.gradeRoom) &&
        (record.dayOfWeek ? tt.dayOfWeek === record.dayOfWeek : true) &&
        tt.periodStart === pStart
    );

    if (match) {
      const ttSpan = match.periodEnd > match.periodStart ? match.periodEnd - match.periodStart + 1 : 1;
      return ttSpan;
    }
  }

  // 3. If periodEnd > periodStart, use the actual period span
  if (pEnd > pStart) {
    return Math.max(1, pEnd - pStart + 1);
  }

  return 1;
}

/**
 * Deduplicates attendance records safely by resolving overlapping period slots per classroom & date.
 * Keeps only the latest updated/created record when conflicts or accidental duplicate check-ins occur.
 */
export function deduplicateAttendanceRecords(
  records: AttendanceRecord[]
): AttendanceRecord[] {
  if (!records || records.length === 0) return [];

  // Sort descending by timestamp (newest first)
  const sorted = [...records].sort((a, b) => {
    const timeA = a.updatedAt || a.createdAt || "";
    const timeB = b.updatedAt || b.createdAt || "";
    return timeB.localeCompare(timeA);
  });

  const occupiedSlots = new Set<string>();
  const result: AttendanceRecord[] = [];

  for (const r of sorted) {
    const pStart = r.periodStart || 1;
    const pEnd = r.periodEnd || pStart;

    let hasOverlap = false;
    for (let p = pStart; p <= pEnd; p++) {
      const slotKey = `${r.classroomId}_${r.date}_p${p}`;
      if (occupiedSlots.has(slotKey)) {
        hasOverlap = true;
        break;
      }
    }

    if (!hasOverlap) {
      for (let p = pStart; p <= pEnd; p++) {
        occupiedSlots.add(`${r.classroomId}_${r.date}_p${p}`);
      }
      result.push(r);
    }
  }

  return result;
}
