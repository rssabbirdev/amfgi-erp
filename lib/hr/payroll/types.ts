export type PayCalculationMode =
  | 'MONTHLY_FIXED'
  | 'MONTHLY_CALENDAR_DEDUCT'
  | 'DAILY_WAGE'
  | 'HOURLY_SPLIT'
  | 'CUSTOM';

/** How office calendar-deduct spreads monthly basic when calculating per-day deductions. */
export type DeductDenominator = 'CALENDAR_DAYS' | 'WORKING_DAYS';

export type PayTypeConfig = {
  mode: PayCalculationMode;
  /** Office calendar deduct: divide monthly basic by all month days or working days only. */
  deductDenominator?: DeductDenominator;
  /** OT hourly rate as % of basic hourly rate (e.g. 125 = 1.25× basic hour rate) */
  otPercent?: number;
  /** @deprecated Legacy OT divisor — migrated to otPercent when reading */
  otDivisor?: number;
  /** Weekdays excluded from working-day count (0=Sun … 6=Sat). Default [0] when unset. */
  excludedWeekdays?: number[];
  /** Fixed monthly: when true, work on weekly off-days earns OT pay. Default false. */
  payExcludedWeekdayWorkAtOt?: boolean;
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
  /** Display name from configured leave type (portal / HR setup). */
  leaveTypeLabel?: string | null;
  /** Pay percent for tiered leave (100 = full, 50 = half, 0 = unpaid). */
  leavePayPercent?: number;
  leaveRequestId?: string | null;
  leaveTypeId?: string | null;
  leaveTypeCode?: string | null;
  /** Company public holiday — separate from attendance and leave. */
  isHoliday?: boolean;
  holidayName?: string | null;
  /** When false, holiday is informational only (may still deduct). Default true when isHoliday. */
  holidayPaid?: boolean;
  /** Salary structures configured for this holiday (PayType ids). */
  holidayPayTypeIds?: string[];
  /** Per-structure holiday OT settings from company holiday setup. */
  holidayPayTypeLinks?: Array<{
    payTypeId: string;
    payWorkedHoursAtOt: boolean;
    holidayOtPercent: number | null;
  }>;
  /** Resolved override for the current employee. */
  holidayPayTypeId?: string | null;
  holidayPayTypeConfig?: PayTypeConfig | null;
  /** When true (default), worked hours on paid holiday earn OT on top of holiday pay. */
  holidayPayWorkedHoursAtOt?: boolean;
  /** Optional holiday-specific OT % for worked hours; null uses salary structure default. */
  holidayOtPercent?: number | null;
  basicHours: number;
  workedMinutes: number;
  isSunday: boolean;
};

export type PayDayBreakdown = {
  date: string;
  status: string;
  totalHours: number;
  basicHours: number;
  otHours: number;
  basicHourRate: number;
  basicHourSalary: number;
  otHourRate: number;
  otHourSalary: number;
  /** Net per-day component amount (earnings minus deductions) — used in day totals. */
  allowance: number;
  /** Earning-type salary components for this day (preview display). */
  componentEarning?: number;
  /** Deduction-type salary components for this day (preview display). */
  componentDeduction?: number;
  totalSalary: number;
  /** Same as totalSalary — kept for older preview consumers. */
  amount: number;
  detail?: string;
};

export type PayLineResult = {
  gross: number;
  breakdown: Record<string, number>;
  days: PayDayBreakdown[];
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

/** Per-day compensation override for mid-month salary changes. */
export type LinePayContext = {
  compensation: CompensationInput;
  config: PayTypeConfig;
  packageId?: string;
  /** When multiple packages apply in one month, fraction of working days for fixed monthly components. */
  fixedMonthlyProrationFactor?: number;
};
