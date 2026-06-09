export type PayCalculationMode =
  | 'MONTHLY_FIXED'
  | 'MONTHLY_CALENDAR_DEDUCT'
  | 'DAILY_WAGE'
  | 'HOURLY_SPLIT'
  | 'CUSTOM';

export type PayTypeConfig = {
  mode: PayCalculationMode;
  /** OT hourly rate as % of basic hourly rate (e.g. 125 = 1.25× basic hour rate) */
  otPercent?: number;
  /** @deprecated Legacy OT divisor — migrated to otPercent when reading */
  otDivisor?: number;
  /** Weekdays excluded from working-day count (0=Sun … 6=Sat). Default [0] when unset. */
  excludedWeekdays?: number[];
  /** @deprecated Legacy only — basic hours come from each attendance row */
  defaultBasicHours?: number;
  /** Multi-line formula script; required when mode = CUSTOM */
  formulaScript?: string;
  /** Extra numeric parameters referenced in custom formulas */
  customParams?: Record<string, number>;
};

export type PayLineInput = {
  workDate: string;
  status: string;
  leaveType: string | null;
  /** Pay percent for tiered leave (100 = full, 50 = half, 0 = unpaid). */
  leavePayPercent?: number;
  basicHours: number;
  workedMinutes: number;
  isSunday: boolean;
};

export type PayLineResult = {
  gross: number;
  breakdown: Record<string, number>;
  days: Array<{ date: string; amount: number; detail?: string }>;
};

export type SalaryComponentTotals = {
  fixedEarnings: number;
  fixedDeductions: number;
  attendanceEarningPerDay: number;
  attendanceDeductionPerDay: number;
};

export type CompensationInput = {
  monthlyBasic: number;
  /** Legacy lump-sum allowance — per working day in HOURLY_SPLIT when no typed components */
  monthlyAllowance: number;
  dailyRate: number;
  salaryComponents?: SalaryComponentTotals;
};
