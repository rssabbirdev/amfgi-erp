import { splitBasicOtSalary } from '@/lib/hr/payroll/payDayBreakdown';
import { evaluatePayHealthCheck } from '@/lib/hr/payroll/payHealthCheck';
import { buildSalaryComponentTotals } from '@/lib/hr/payroll/salaryComponent';

describe('splitBasicOtSalary', () => {
  it('puts full amount in basic when OT hours are zero', () => {
    expect(
      splitBasicOtSalary({
        totalSalary: 120,
        basicHours: 9,
        otHours: 0,
        basicHourRate: 13.33,
        otHourRate: 12,
      })
    ).toEqual({ basicHourSalary: 120, otHourSalary: 0 });
  });
});

describe('evaluatePayHealthCheck', () => {
  it('passes when basic and allowance stay within caps', () => {
    const result = evaluatePayHealthCheck({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-02',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      result: {
        gross: 3000 / 26,
        breakdown: { monthlyBasic: 3000, dailyRate: 3000 / 26, earnedDays: 1 },
        days: [
          {
            date: '2026-06-02',
            status: 'Present',
            totalHours: 9,
            basicHours: 9,
            otHours: 0,
            basicHourRate: 3000 / 26,
            basicHourSalary: 3000 / 26,
            otHourRate: 0,
            otHourSalary: 0,
            allowance: 0,
            totalSalary: 3000 / 26,
            amount: 3000 / 26,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.basicPaid).toBeCloseTo(3000 / 26, 2);
    expect(result.basicCap).toBe(3000);
    expect(result.componentEarningsPaid).toBe(0);
    expect(result.componentDeductionsPaid).toBe(0);
  });

  it('excludes day allowances from basic paid for monthly calendar deduct', () => {
    const basicDay = 3000 / 26;
    const allowanceDay = 200 / 26;
    const fixedNet = 250;
    const result = evaluatePayHealthCheck({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: {
        monthlyBasic: 3000,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 300,
          fixedDeductions: 50,
          attendanceEarningPerDay: 200 / 26,
          attendanceDeductionPerDay: 0,
        },
      },
      lines: [
        {
          workDate: '2026-06-02',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      result: {
        gross: basicDay + allowanceDay + fixedNet,
        breakdown: { monthlyBasic: 3000, earnedDays: 1, salaryComponentsFixed: fixedNet },
        days: [
          {
            date: '2026-06-02',
            status: 'Present',
            totalHours: 9,
            basicHours: 9,
            otHours: 0,
            basicHourRate: basicDay / 9,
            basicHourSalary: basicDay,
            otHourRate: 0,
            otHourSalary: 0,
            allowance: allowanceDay,
            componentEarning: allowanceDay,
            componentDeduction: 0,
            totalSalary: basicDay + allowanceDay,
            amount: basicDay + allowanceDay,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.allowanceCap).toBe(450);
    expect(result.basicPaid).toBe(115.39);
    expect(result.allowancePaid).toBeCloseTo(allowanceDay + fixedNet, 2);
  });

  it('tracks earnings and deductions separately for salary components', () => {
    const result = evaluatePayHealthCheck({
      month: '2026-06',
      config: { mode: 'HOURLY_SPLIT', excludedWeekdays: [0] },
      compensation: {
        monthlyBasic: 900,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 300,
          fixedDeductions: 50,
          attendanceEarningPerDay: 260 / 26,
          attendanceDeductionPerDay: 52 / 26,
        },
      },
      lines: [
        {
          workDate: '2026-06-02',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      result: {
        gross: 900 / 26 + 300 + 208 / 26,
        breakdown: { hourlyTotal: 900 / 26 + 300 + 208 / 26, salaryComponentsFixed: 250 },
        days: [
          {
            date: '2026-06-02',
            status: 'Present',
            totalHours: 9,
            basicHours: 9,
            otHours: 0,
            basicHourRate: 900 / 26 / 9,
            basicHourSalary: 900 / 26,
            otHourRate: 0,
            otHourSalary: 0,
            allowance: 208 / 26,
            componentEarning: 260 / 26,
            componentDeduction: 52 / 26,
            totalSalary: 900 / 26 + 208 / 26,
            amount: 900 / 26 + 208 / 26,
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.componentEarningsPaid).toBeCloseTo(300 + 260 / 26, 2);
    expect(result.componentEarningsCap).toBeCloseTo(300 + 260 / 26, 2);
    expect(result.componentDeductionsPaid).toBeCloseTo(50 + 52 / 26, 2);
    expect(result.componentDeductionsCap).toBeCloseTo(50 + 52 / 26, 2);
  });

  it('does not flag earnings when cap uses the same per-day rounding as pay', () => {
    const salaryComponents = buildSalaryComponentTotals(
      [
        { amount: 250, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
        { amount: 211.54, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
      ],
      '2026-06',
      [0]
    );
    const lines = Array.from({ length: 26 }, (_, index) => ({
      workDate: `2026-06-${String(index + 1).padStart(2, '0')}`,
      status: 'PRESENT' as const,
      leaveType: null,
      basicHours: 9,
      workedMinutes: 540,
      isSunday: false,
    }));
    const dayEarning = salaryComponents.attendanceEarningPerDay;
    const roundedDayEarning = Math.round(dayEarning * 100) / 100;
    const result = evaluatePayHealthCheck({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: {
        monthlyBasic: 3000,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents,
      },
      lines,
      result: {
        gross: 3000,
        breakdown: { monthlyBasic: 3000, salaryComponentsFixed: 250 },
        days: lines.map((line) => ({
          date: line.workDate,
          status: 'Present',
          totalHours: 9,
          basicHours: 9,
          otHours: 0,
          basicHourRate: 0,
          basicHourSalary: 0,
          otHourRate: 0,
          otHourSalary: 0,
          allowance: roundedDayEarning,
          componentEarning: roundedDayEarning,
          componentDeduction: 0,
          totalSalary: roundedDayEarning,
          amount: roundedDayEarning,
        })),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.componentEarningsPaid).toBe(result.componentEarningsCap);
  });

  it('flags OT salary when OT hours are zero', () => {
    const result = evaluatePayHealthCheck({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-01',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      result: {
        gross: 120,
        breakdown: { dailyWageTotal: 120 },
        days: [
          {
            date: '2026-06-01',
            status: 'Present',
            totalHours: 9,
            basicHours: 9,
            otHours: 0,
            basicHourRate: 13.33,
            basicHourSalary: 119.98,
            otHourRate: 12,
            otHourSalary: -0.02,
            allowance: 0,
            totalSalary: 120,
            amount: 120,
          },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.includes('OT salary'))).toBe(true);
  });
});
