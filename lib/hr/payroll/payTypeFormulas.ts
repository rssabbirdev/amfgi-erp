import type { PayCalculationMode, PayTypeConfig } from '@/lib/hr/payroll/types';
import { payTypeConfigFields } from '@/lib/hr/payroll/payTypeForm';
import { formatExcludedWeekdaysLabel } from '@/lib/hr/payroll/payTypeConfigHelpers';

export type PayModeFormulaDefinition = {
  mode: PayCalculationMode;
  label: string;
  compensationInputs: string[];
  configParameters: Array<{ key: string; label: string; defaultValue?: number }>;
  formulaLines: string[];
  attendanceRules: string[];
};

export const PAY_MODE_FORMULA_DEFINITIONS: PayModeFormulaDefinition[] = [
  {
    mode: 'MONTHLY_FIXED',
    label: 'Fixed monthly',
    compensationInputs: ['monthly_basic'],
    configParameters: [],
    formulaLines: ['gross = monthly_basic'],
    attendanceRules: ['Attendance is not used in this mode.'],
  },
  {
    mode: 'MONTHLY_CALENDAR_DEDUCT',
    label: 'Fixed monthly',
    compensationInputs: ['monthly_basic'],
    configParameters: [
      { key: 'deductDenominator', label: 'Divide monthly basic by', defaultValue: undefined },
      { key: 'excludedWeekdays', label: 'Weekly off-days', defaultValue: 0 },
    ],
    formulaLines: [
      'daily_rate = monthly_basic ÷ working days in month',
      'gross = Σ daily_rate for each present / paid leave / paid holiday attendance row',
      'gross is capped at monthly_basic',
    ],
    attendanceRules: [
      'Pay accrues only for days with saved attendance (or merged leave / holiday).',
      'Present, paid leave, and paid holidays earn daily_rate.',
      'Unpaid absent days earn nothing.',
    ],
  },
  {
    mode: 'DAILY_WAGE',
    label: 'Daily wage',
    compensationInputs: ['daily_rate'],
    configParameters: [{ key: 'otPercent', label: 'OT % of basic hour rate', defaultValue: 125 }],
    formulaLines: [
      'basic_rate = daily_rate ÷ basic_hours (from attendance row)',
      'ot_rate = basic_rate × (ot_percent ÷ 100)',
      'if worked_hours ≥ basic_hours:',
      '  day_pay = daily_rate + (worked_hours − basic_hours) × ot_rate',
      'else:',
      '  day_pay = worked_hours × basic_rate',
      'gross = Σ day_pay (approved attendance days)',
    ],
    attendanceRules: [
      'Skips ABSENT and LEAVE days.',
      'basic_hours comes from each attendance row snapshot (employee type timing).',
    ],
  },
  {
    mode: 'CUSTOM',
    label: 'Custom formula',
    compensationInputs: ['monthly_basic', 'monthly_allowance', 'daily_rate'],
    configParameters: [
      { key: 'otPercent', label: 'OT % of basic hour rate', defaultValue: 125 },
      { key: 'excludedWeekdays', label: 'Excluded weekdays', defaultValue: 0 },
    ],
    formulaLines: [
      'Multi-line script with assignments ending in gross = ...',
      'Use sum_days(expr) for per-day attendance logic',
      'Variables: monthly_basic, absent_days, worked_hours, basic_hours, is_absent, ...',
    ],
    attendanceRules: [
      'basic_hours inside sum_days() is per attendance row.',
      'Month-level basic_hours is the average across rows when needed.',
    ],
  },
  {
    mode: 'HOURLY_SPLIT',
    label: 'Hourly split',
    compensationInputs: ['monthly_basic', 'monthly_allowance'],
    configParameters: [{ key: 'excludedWeekdays', label: 'Excluded weekdays', defaultValue: 0 }],
    formulaLines: [
      'denom = days_in_month − excluded weekdays you selected',
      'line_basic_rate = monthly_basic ÷ denom ÷ basic_hours (attendance row)',
      'ot_hour_rate = (monthly_basic × 12) ÷ 365 ÷ basic_hours (attendance row)',
      'allowance_per_day = monthly_allowance ÷ denom',
      'day_pay = basic_hours_worked × line_basic_rate + ot_hours × ot_hour_rate + allowance_per_day',
      'gross = Σ day_pay',
    ],
    attendanceRules: [
      'Skips ABSENT days.',
      'Skips paid LEAVE days.',
      'basic_hours per day from attendance row, not salary structure.',
    ],
  },
];

export function formulaDefinitionForMode(mode: PayCalculationMode) {
  return PAY_MODE_FORMULA_DEFINITIONS.find((d) => d.mode === mode);
}

export function describePayTypeRow(config: Record<string, unknown>) {
  const fields = payTypeConfigFields(config);
  const def = formulaDefinitionForMode(fields.mode);
  if (!def) return { summary: 'Unknown mode', formulaLines: [] as string[], parameters: [] as string[] };

  const parameters: string[] = [];
  if (fields.mode === 'DAILY_WAGE') {
    parameters.push(`OT ${fields.otPercent}% of basic hour`);
  }
  if (fields.mode === 'HOURLY_SPLIT' || fields.mode === 'CUSTOM') {
    parameters.push(`Excluded: ${formatExcludedWeekdaysLabel(fields.excludedWeekdays)}`);
  }
  if (fields.mode === 'MONTHLY_CALENDAR_DEDUCT') {
    const denom =
      fields.deductDenominator === 'CALENDAR_DAYS' ? 'all calendar days' : 'working days';
    parameters.push(`Divide by: ${denom}`);
    if (fields.deductDenominator !== 'CALENDAR_DAYS') {
      parameters.push(`Weekly off: ${formatExcludedWeekdaysLabel(fields.excludedWeekdays)}`);
    }
  }
  if (fields.mode === 'CUSTOM' && fields.formulaScript) {
    return {
      summary: 'Custom formula script',
      formulaLines: fields.formulaScript.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')),
      parameters,
      compensationInputs: def.compensationInputs,
      attendanceRules: def.attendanceRules,
    };
  }

  const substituted = def.formulaLines.map((line) =>
    line.replace(/ot_percent/g, String(fields.otPercent))
  );

  return {
    summary: def.formulaLines[0] ?? def.label,
    formulaLines: substituted,
    parameters,
    compensationInputs: def.compensationInputs,
    attendanceRules: def.attendanceRules,
  };
}

export function substituteConfigInFormulaLines(
  mode: PayCalculationMode,
  config: PayTypeConfig
): string[] {
  const def = formulaDefinitionForMode(mode);
  if (!def) return [];
  const fields = payTypeConfigFields(config as Record<string, unknown>);
  return def.formulaLines.map((line) =>
    line
      .replace(/ot_percent/g, String(fields.otPercent))
      .replace(/excluded weekdays you selected/g, formatExcludedWeekdaysLabel(fields.excludedWeekdays))
  );
}
