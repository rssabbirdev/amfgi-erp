/**
 * UAE (Dubai) is UTC+4 year-round (no DST).
 * Build wall-clock datetimes for attendance expectations.
 */
const DUBAI_OFFSET_HOURS = 4;

/** Parse "5:00 AM", "6:30 PM", "17:30", "5:00 am" → { hour24, minute } */
export function parseTimeCell(raw: string | null | undefined): { hour: number; minute: number } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { hour: h, minute: min };
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { hour: h, minute: min };
  }
  return null;
}

/** `workDate` as calendar date string YYYY-MM-DD (no TZ). */
export function dubaiWallTimeToUtc(
  workDateYmd: string,
  hour: number,
  minute: number
): Date {
  const [y, mo, d] = workDateYmd.split('-').map((x) => parseInt(x, 10));
  const utcMs = Date.UTC(y, mo - 1, d, hour - DUBAI_OFFSET_HOURS, minute, 0, 0);
  return new Date(utcMs);
}

export function atDubaiStartOfDayUtc(workDateYmd: string): Date {
  return dubaiWallTimeToUtc(workDateYmd, 0, 0);
}
