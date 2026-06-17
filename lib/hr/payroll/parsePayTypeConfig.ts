import type { PayCalculationMode, PayTypeConfig } from '@/lib/hr/payroll/types';

import { resolveExcludedWeekdays } from '@/lib/hr/payroll/payTypeConfigHelpers';



const MODES: PayCalculationMode[] = [

  'MONTHLY_FIXED',

  'MONTHLY_CALENDAR_DEDUCT',

  'DAILY_WAGE',

  'HOURLY_SPLIT',

  'CUSTOM',

];



function normalizeExcludedWeekdays(raw: unknown): number[] | undefined {

  if (!Array.isArray(raw)) return undefined;

  const values = [...new Set(raw.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))].sort(

    (a, b) => a - b

  );

  return values;

}



export function parsePayTypeConfig(raw: unknown): PayTypeConfig {

  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const mode = o.mode as PayCalculationMode;

  if (!MODES.includes(mode)) {

    throw new Error('Invalid pay type config mode');

  }



  let customParams: Record<string, number> | undefined;

  if (o.customParams && typeof o.customParams === 'object') {

    customParams = {};

    for (const [key, value] of Object.entries(o.customParams as Record<string, unknown>)) {

      if (typeof value === 'number' && Number.isFinite(value)) customParams[key] = value;

    }

  }



  const formulaScript = typeof o.formulaScript === 'string' ? o.formulaScript.trim() : undefined;



  if (mode === 'CUSTOM' && !formulaScript) {

    throw new Error('Custom pay type requires formulaScript');

  }



  const otPercent = typeof o.otPercent === 'number' && o.otPercent > 0 ? o.otPercent : undefined;

  const otDivisor = typeof o.otDivisor === 'number' && o.otDivisor > 0 ? o.otDivisor : undefined;

  const excludedWeekdays = normalizeExcludedWeekdays(o.excludedWeekdays);
  const deductDenominator =
    o.deductDenominator === 'CALENDAR_DAYS' || o.deductDenominator === 'WORKING_DAYS'
      ? o.deductDenominator
      : undefined;

  const config: PayTypeConfig = {
    mode,
    deductDenominator,
    otPercent,

    otDivisor,

    defaultBasicHours: typeof o.defaultBasicHours === 'number' ? o.defaultBasicHours : undefined,

    formulaScript: formulaScript || undefined,

    customParams,

    payExcludedWeekdayWorkAtOt:
      o.payExcludedWeekdayWorkAtOt === true &&
      (mode === 'MONTHLY_CALENDAR_DEDUCT' || mode === 'MONTHLY_FIXED')
        ? true
        : undefined,

  };



  if (excludedWeekdays !== undefined) {

    config.excludedWeekdays = excludedWeekdays;

  } else if (mode === 'HOURLY_SPLIT' || mode === 'CUSTOM') {

    config.excludedWeekdays = resolveExcludedWeekdays({ mode });

  } else if (mode === 'MONTHLY_CALENDAR_DEDUCT') {

    config.excludedWeekdays = resolveExcludedWeekdays({ mode });

    if (!deductDenominator) config.deductDenominator = 'WORKING_DAYS';

  } else if (mode === 'DAILY_WAGE') {

    config.excludedWeekdays = [];

  }



  return config;

}

