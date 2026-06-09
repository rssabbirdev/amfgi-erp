import type { PayLineInput } from '@/lib/hr/payroll/types';

/** Standard hours for a day — from the attendance row snapshot, not salary structure. */
export function lineBasicHours(line: PayLineInput): number | null {
  const hours = Number(line.basicHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return hours;
}

/** Average basic hours across attendance lines (month-level formula variables only). */
export function averageLineBasicHours(lines: PayLineInput[]): number {
  const values = lines.map(lineBasicHours).filter((h): h is number => h != null);
  if (values.length === 0) return 0;
  return values.reduce((sum, h) => sum + h, 0) / values.length;
}
