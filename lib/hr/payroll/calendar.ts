const DUBAI_TZ = 'Asia/Dubai';

export function daysInMonth(month: string): number {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month YYYY-MM');
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function weekdayIndexYmd(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00`);
  const short = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: DUBAI_TZ });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 0;
}

export function countWeekdaysInMonth(month: string, weekdays: number[]): number {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month YYYY-MM');
  if (weekdays.length === 0) return 0;
  const set = new Set(weekdays);
  const [y, m] = month.split('-').map(Number);
  const total = daysInMonth(month);
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    const d = new Date(Date.UTC(y, m - 1, day));
    if (set.has(d.getUTCDay())) count += 1;
  }
  return count;
}

export function sundaysInMonth(month: string): number {
  return countWeekdaysInMonth(month, [0]);
}

export function denomDaysExcludingWeekdays(month: string, excludedWeekdays: number[]): number {
  const excluded = countWeekdaysInMonth(month, excludedWeekdays);
  return daysInMonth(month) - excluded;
}

export function denomDaysExcludingSundays(month: string): number {
  return denomDaysExcludingWeekdays(month, [0]);
}

export function isSundayYmd(ymd: string): boolean {
  return weekdayIndexYmd(ymd) === 0;
}

export function isExcludedWeekdayYmd(ymd: string, excludedWeekdays: number[]): boolean {
  return excludedWeekdays.includes(weekdayIndexYmd(ymd));
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month, expected YYYY-MM');
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  return { start, end };
}

export function monthEndDate(month: string): Date {
  const { end } = monthBounds(month);
  return new Date(end.getTime() - 86400000);
}
