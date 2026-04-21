/** Calendar date for Prisma `@db.Date` (UTC midnight). */
export function dateFromYmd(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('Invalid date format, expected YYYY-MM-DD');
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function ymdFromInput(workDate: string): string {
  const t = workDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid work date');
  return d.toISOString().slice(0, 10);
}
