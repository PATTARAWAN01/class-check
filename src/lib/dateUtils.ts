/**
 * Thai Timezone (Asia/Bangkok, UTC+7) Date Utilities
 * Ensures accurate date calculations regardless of server or local machine UTC offset.
 */

export function getThaiDateString(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    // Fallback: manually offset to UTC+7
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const bangkokTime = new Date(utc + 3600000 * 7);
    const y = bangkokTime.getFullYear();
    const m = String(bangkokTime.getMonth() + 1).padStart(2, "0");
    const day = String(bangkokTime.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

export function getThaiOffsetDate(offsetDays: number = 0): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bangkokTime = new Date(utc + 3600000 * 7);
  bangkokTime.setDate(bangkokTime.getDate() - offsetDays);
  return getThaiDateString(bangkokTime);
}

export function formatThaiDateShort(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return dateStr;
  const [y, m, d] = parts;
  const thaiShortMonths = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
  ];
  const shortMonth = thaiShortMonths[m - 1] || "";
  const thaiYear = y + 543;
  return `${d} ${shortMonth} ${thaiYear}`;
}

export function formatThaiDateLong(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return dateStr;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  const thaiDays = [
    "วันอาทิตย์",
    "วันจันทร์",
    "วันอังคาร",
    "วันพุธ",
    "วันพฤหัสบดี",
    "วันศุกร์",
    "วันเสาร์",
  ];
  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  const dayName = thaiDays[date.getDay()] || "";
  const monthName = thaiMonths[m - 1] || "";
  const thaiYear = y + 543;
  return `${dayName}ที่ ${d} ${monthName} ${thaiYear}`;
}

export function isWithin7DaysThai(dateStr: string): boolean {
  if (!dateStr) return false;
  const todayStr = getThaiDateString();
  const parts = dateStr.split("-").map(Number);
  const todayParts = todayStr.split("-").map(Number);
  if (parts.length < 3 || todayParts.length < 3) return false;

  const recordDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);

  const diffTime = todayDate.getTime() - recordDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= -1 && diffDays <= 7;
}
