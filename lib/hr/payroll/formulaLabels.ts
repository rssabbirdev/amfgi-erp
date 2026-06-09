/** Human-readable labels for formula variables, breakdown keys, and helpers. */

export const COMPENSATION_INPUT_LABELS: Record<string, string> = {
  monthly_basic: 'Monthly basic salary',
  monthly_allowance: 'Total monthly allowances',
  daily_rate: 'Daily wage rate',
};

export const FORMULA_VARIABLE_META: Record<
  string,
  { label: string; description: string }
> = {
  monthly_basic: {
    label: 'Monthly basic',
    description: 'Employee monthly basic from their compensation package.',
  },
  monthly_allowance: {
    label: 'Monthly allowances',
    description: 'Sum of all typed allowances on the employee package.',
  },
  daily_rate: {
    label: 'Daily rate',
    description: 'Employee daily wage from their compensation package.',
  },
  days_in_month: {
    label: 'Days in month',
    description: 'Calendar days in the payroll month (28–31).',
  },
  sundays_in_month: {
    label: 'Sundays in month',
    description: 'Number of Sundays in the payroll month.',
  },
  denom_days: {
    label: 'Working days',
    description: 'Calendar days in the month minus weekdays you exclude in salary structure settings.',
  },
  absent_days: {
    label: 'Absent days',
    description: 'Count of attendance days marked absent.',
  },
  leave_days: {
    label: 'Leave days',
    description: 'All leave days in the month.',
  },
  paid_leave_days: {
    label: 'Paid leave days',
    description: 'Leave days that are paid (annual, sick, etc.).',
  },
  present_days: {
    label: 'Present days',
    description: 'Days marked present with attendance.',
  },
  worked_hours_total: {
    label: 'Total worked hours',
    description: 'Sum of worked hours across all days in the month.',
  },
  ot_percent: {
    label: 'OT percentage',
    description: 'Overtime hourly rate as a % of the basic hourly rate (e.g. 125 = 1.25× basic hour).',
  },
  ot_divisor: {
    label: 'OT divisor (legacy)',
    description: 'Deprecated — use ot_percent instead.',
  },
  basic_hours: {
    label: 'Basic hours',
    description: 'Standard hours for the day — from the attendance row snapshot (inside sum_days()).',
  },
  worked_hours: {
    label: 'Worked hours (day)',
    description: 'Hours worked on the current day inside sum_days().',
  },
  worked_minutes: {
    label: 'Worked minutes (day)',
    description: 'Minutes worked on the current day inside sum_days().',
  },
  is_absent: {
    label: 'Is absent (day)',
    description: '1 if the day is absent, 0 otherwise — use inside sum_days().',
  },
  is_leave: {
    label: 'Is leave (day)',
    description: '1 if the day is leave, 0 otherwise.',
  },
  is_paid_leave: {
    label: 'Is paid leave (day)',
    description: '1 if the day is paid leave, 0 otherwise.',
  },
  is_present: {
    label: 'Is present (day)',
    description: '1 if the day is present, 0 otherwise.',
  },
  is_sunday: {
    label: 'Is Sunday (day)',
    description: '1 if the day is Sunday, 0 otherwise.',
  },
  is_excluded_day: {
    label: 'Is excluded weekday (day)',
    description: '1 if the day falls on a weekday excluded from working-day count, 0 otherwise.',
  },
};

export const BREAKDOWN_KEY_LABELS: Record<string, string> = {
  monthlyBasic: 'Monthly basic',
  deductions: 'Absence deductions',
  deductDays: 'Unpaid absent days',
  dailyWageTotal: 'Daily wage total',
  hourlyTotal: 'Hourly split total',
  gross: 'Gross pay',
};

export const FORMULA_FUNCTION_META: Array<{ signature: string; description: string }> = [
  { signature: 'if(cond, then, else)', description: 'Return one value when condition is true, another when false.' },
  { signature: 'min(a, b, ...)', description: 'Smallest of the given numbers.' },
  { signature: 'max(a, b, ...)', description: 'Largest of the given numbers.' },
  { signature: 'round(x)', description: 'Round to 2 decimal places.' },
  { signature: 'abs(x)', description: 'Absolute value (always positive).' },
  {
    signature: 'sum_days(expr)',
    description: 'Run expr once per attendance day and add the results. Use day variables inside.',
  },
];

export function labelForFormulaVariable(key: string): string {
  return FORMULA_VARIABLE_META[key]?.label ?? key.replace(/_/g, ' ');
}

export function labelForBreakdownKey(key: string): string {
  return BREAKDOWN_KEY_LABELS[key] ?? labelForFormulaVariable(key) ?? key.replace(/_/g, ' ');
}

export function labelForCompensationInput(key: string): string {
  return COMPENSATION_INPUT_LABELS[key] ?? key.replace(/_/g, ' ');
}
