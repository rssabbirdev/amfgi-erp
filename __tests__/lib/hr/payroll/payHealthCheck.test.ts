import { splitBasicOtSalary } from '@/lib/hr/payroll/payDayBreakdown';
import { evaluatePayHealthCheck } from '@/lib/hr/payroll/payHealthCheck';

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
