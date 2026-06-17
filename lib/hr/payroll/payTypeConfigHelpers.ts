import type { PayTypeConfig } from '@/lib/hr/payroll/types';
import { daysInMonth, denomDaysExcludingWeekdays } from '@/lib/hr/payroll/calendar';

export const WEEKDAY_OPTIONS: Array<{ value: number; label: string; short: string }> = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

const DEFAULT_EXCLUDED_WEEKDAYS = [0];

/** OT hourly rate = basic hourly rate × (otPercent / 100). Migrates legacy otDivisor when needed. */
export function resolveOtPercent(
  config: Pick<PayTypeConfig, 'otPercent' | 'otDivisor' | 'defaultBasicHours'>
): number {
  if (typeof config.otPercent === 'number' && config.otPercent > 0) {
    return config.otPercent;
  }
  const basicHours = config.defaultBasicHours && config.defaultBasicHours > 0 ? config.defaultBasicHours : 9;
  const otDivisor = config.otDivisor && config.otDivisor > 0 ? config.otDivisor : 10;
  return (basicHours / otDivisor) * 100;
}

export function resolveExcludedWeekdays(
  config: Pick<PayTypeConfig, 'excludedWeekdays' | 'mode'>
): number[] {
  if (Array.isArray(config.excludedWeekdays)) {
    const normalized = [...new Set(config.excludedWeekdays.filter((d) => d >= 0 && d <= 6))].sort(
      (a, b) => a - b
    );
    return normalized;
  }
  if (config.mode === 'DAILY_WAGE') return [];
  return [...DEFAULT_EXCLUDED_WEEKDAYS];
}

export function formatExcludedWeekdaysLabel(excluded: number[]): string {
  if (excluded.length === 0) return 'None (all calendar days count)';
  return excluded
    .map((d) => WEEKDAY_OPTIONS.find((o) => o.value === d)?.short ?? String(d))
    .join(', ');
}

/** Office calendar deduct defaults to working days (Sundays excluded). */
export function resolveDeductDenominator(
  config: Pick<PayTypeConfig, 'mode' | 'deductDenominator'>
): 'CALENDAR_DAYS' | 'WORKING_DAYS' {
  if (config.deductDenominator === 'CALENDAR_DAYS') return 'CALENDAR_DAYS';
  if (config.deductDenominator === 'WORKING_DAYS') return 'WORKING_DAYS';
  if (config.mode === 'MONTHLY_CALENDAR_DEDUCT') return 'WORKING_DAYS';
  return 'CALENDAR_DAYS';
}

export function resolveCalendarDeductDayCount(month: string, config: PayTypeConfig): number {
  if (resolveDeductDenominator(config) === 'WORKING_DAYS') {
    return denomDaysExcludingWeekdays(month, resolveExcludedWeekdays(config));
  }
  return daysInMonth(month);
}
