import type { PayCalculationMode, DeductDenominator, PayTypeConfig } from '@/lib/hr/payroll/types';
import {
  resolveDeductDenominator,
  resolveExcludedWeekdays,
  resolveOtPercent,
} from '@/lib/hr/payroll/payTypeConfigHelpers';

export const PAY_CALCULATION_MODE_OPTIONS: Array<{
  value: PayCalculationMode;
  label: string;
  description: string;
}> = [
  {
    value: 'MONTHLY_CALENDAR_DEDUCT',
    label: 'Fixed monthly',
    description:
      'Monthly basic minus unpaid absent work-days; divides by working days (default) or all calendar days.',
  },
  {
    value: 'DAILY_WAGE',
    label: 'Daily wage',
    description:
      'Daily rate with standard hours from each attendance row and overtime as a % of the basic hourly rate.',
  },
  {
    value: 'HOURLY_SPLIT',
    label: 'Hourly split',
    description:
      'Monthly basic + allowance split across working days; standard hours per day come from attendance.',
  },
  {
    value: 'CUSTOM',
    label: 'Custom formula',
    description: 'Write your own multi-line formula script with live preview.',
  },
];

export function slugifyPayTypeCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function normalizeExcludedWeekdayInput(raw: number[] | null | undefined): number[] {
  if (!raw || raw.length === 0) return [];
  return [...new Set(raw.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b);
}

export function buildPayTypeConfigFromFields(input: {
  mode: PayCalculationMode;
  otPercent?: number | null;
  excludedWeekdays?: number[] | null;
  deductDenominator?: DeductDenominator | null;
  payExcludedWeekdayWorkAtOt?: boolean | null;
  formulaScript?: string | null;
  customParams?: Record<string, number> | null;
}): PayTypeConfig {
  const config: PayTypeConfig = { mode: input.mode };
  if (
    input.mode === 'DAILY_WAGE' ||
    input.mode === 'CUSTOM' ||
    (input.mode === 'MONTHLY_CALENDAR_DEDUCT' && input.payExcludedWeekdayWorkAtOt)
  ) {
    config.otPercent = input.otPercent && input.otPercent > 0 ? input.otPercent : 125;
  }
  if (
    input.mode === 'DAILY_WAGE' ||
    input.mode === 'HOURLY_SPLIT' ||
    input.mode === 'CUSTOM' ||
    input.mode === 'MONTHLY_CALENDAR_DEDUCT'
  ) {
    config.excludedWeekdays =
      input.mode === 'DAILY_WAGE'
        ? normalizeExcludedWeekdayInput(input.excludedWeekdays)
        : resolveExcludedWeekdays({
            mode: input.mode,
            excludedWeekdays: input.excludedWeekdays ?? undefined,
          });
  }
  if (input.mode === 'MONTHLY_CALENDAR_DEDUCT') {
    config.deductDenominator =
      input.deductDenominator === 'CALENDAR_DAYS' ? 'CALENDAR_DAYS' : 'WORKING_DAYS';
    if (input.payExcludedWeekdayWorkAtOt) {
      config.payExcludedWeekdayWorkAtOt = true;
    }
  }
  if (input.mode === 'CUSTOM') {
    const script = input.formulaScript?.trim();
    if (script) config.formulaScript = script;
    if (input.customParams && Object.keys(input.customParams).length > 0) {
      config.customParams = input.customParams;
    }
  }
  return config;
}

export function payTypeConfigFields(config: Record<string, unknown>) {
  const mode = (config.mode as PayCalculationMode) ?? 'MONTHLY_CALENDAR_DEDUCT';
  let customParams: Record<string, number> | undefined;
  if (config.customParams && typeof config.customParams === 'object') {
    customParams = {};
    for (const [key, value] of Object.entries(config.customParams as Record<string, unknown>)) {
      if (typeof value === 'number') customParams[key] = value;
    }
  }
  const parsed: PayTypeConfig = {
    mode,
    deductDenominator:
      config.deductDenominator === 'CALENDAR_DAYS' || config.deductDenominator === 'WORKING_DAYS'
        ? config.deductDenominator
        : undefined,
    otPercent: typeof config.otPercent === 'number' ? config.otPercent : undefined,
    otDivisor: typeof config.otDivisor === 'number' ? config.otDivisor : undefined,
    defaultBasicHours: typeof config.defaultBasicHours === 'number' ? config.defaultBasicHours : undefined,
    excludedWeekdays: Array.isArray(config.excludedWeekdays)
      ? (config.excludedWeekdays as number[]).filter((d) => typeof d === 'number')
      : undefined,
    formulaScript: typeof config.formulaScript === 'string' ? config.formulaScript : '',
    customParams,
    payExcludedWeekdayWorkAtOt: config.payExcludedWeekdayWorkAtOt === true ? true : undefined,
  };
  return {
    mode,
    deductDenominator: resolveDeductDenominator(parsed),
    otPercent: resolveOtPercent(parsed),
    excludedWeekdays: resolveExcludedWeekdays(parsed),
    formulaScript: parsed.formulaScript ?? '',
    customParams,
    payExcludedWeekdayWorkAtOt: parsed.payExcludedWeekdayWorkAtOt === true,
  };
}
