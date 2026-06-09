import type { PayCalculationMode } from '@/lib/hr/payroll/types';

export const FORMULA_MODE_SCRIPTS: Record<PayCalculationMode, string> = {
  MONTHLY_FIXED: `# Fixed monthly
gross = monthly_basic`,

  MONTHLY_CALENDAR_DEDUCT: `# Office — deduct unpaid absent days
daily_rate = monthly_basic / days_in_month
deduction = absent_days * daily_rate
gross = monthly_basic - deduction`,

  DAILY_WAGE: `# Daily wage with OT as % of basic hourly rate
day_basic_rate = daily_rate / basic_hours
day_ot_rate = day_basic_rate * (ot_percent / 100)
gross = sum_days(if(is_absent + is_leave > 0, 0, if(worked_hours >= basic_hours, daily_rate + (worked_hours - basic_hours) * day_ot_rate, worked_hours * day_basic_rate)))`,

  HOURLY_SPLIT: `# Hourly split — basic + allowance per working day
denom = denom_days
basic_hour_rate = monthly_basic / denom / basic_hours
ot_hour_rate = (monthly_basic * 12) / 365 / basic_hours
allowance_per_day = monthly_allowance / denom
gross = sum_days(if(is_absent > 0, 0, if(is_paid_leave > 0, 0, min(worked_hours, basic_hours) * basic_hour_rate + max(0, worked_hours - basic_hours) * ot_hour_rate + if(worked_hours > 0, allowance_per_day, 0))))`,

  CUSTOM: `# Custom formula — edit freely
gross = monthly_basic`,
};

export function formulaScriptForMode(mode: PayCalculationMode): string {
  return FORMULA_MODE_SCRIPTS[mode] ?? FORMULA_MODE_SCRIPTS.CUSTOM;
}
