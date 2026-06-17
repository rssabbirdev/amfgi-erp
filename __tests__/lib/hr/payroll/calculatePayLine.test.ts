import {
  calculatePayLine,
  attendanceLinesForPayroll,
} from '@/lib/hr/payroll/calculatePayLine';
import { daysInMonth, denomDaysExcludingSundays, roundMoney, weekdayIndexYmd } from '@/lib/hr/payroll/calendar';

describe('payroll calendar', () => {
  it('uses actual days in month', () => {
    expect(daysInMonth('2026-06')).toBe(30);
    expect(daysInMonth('2026-01')).toBe(31);
    expect(daysInMonth('2024-02')).toBe(29);
  });

  it('computes denom days minus sundays for June 2026', () => {
    expect(denomDaysExcludingSundays('2026-06')).toBe(26);
  });
});

describe('calculatePayLine', () => {
  it('fixed monthly returns full basic', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_FIXED' },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [],
    });
    expect(result.gross).toBe(3000);
  });

  it('office pays only for present attendance rows (partial month)', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'CALENDAR_DAYS' },
      compensation: { monthlyBasic: 1500, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        { workDate: '2026-06-01', status: 'PRESENT', leaveType: null, basicHours: 8, workedMinutes: 480, isSunday: false },
        { workDate: '2026-06-02', status: 'PRESENT', leaveType: null, basicHours: 8, workedMinutes: 480, isSunday: false },
        { workDate: '2026-06-03', status: 'PRESENT', leaveType: null, basicHours: 8, workedMinutes: 480, isSunday: false },
        { workDate: '2026-06-04', status: 'PRESENT', leaveType: null, basicHours: 8, workedMinutes: 480, isSunday: false },
        { workDate: '2026-06-05', status: 'PRESENT', leaveType: null, basicHours: 8, workedMinutes: 480, isSunday: false },
        { workDate: '2026-06-06', status: 'ABSENT', leaveType: null, basicHours: 8, workedMinutes: 0, isSunday: false },
      ],
    });
    expect(result.gross).toBe(250);
    expect(result.breakdown.earnedDays).toBe(5);
    expect(result.breakdown.dailyRate).toBe(50);
  });

  it('office present day total salary includes per-day attendance allowance', () => {
    const daily = 3000 / 26;
    const allowancePerDay = 260 / 26;
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: {
        monthlyBasic: 3000,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 0,
          fixedDeductions: 0,
          attendanceEarningPerDay: allowancePerDay,
          attendanceDeductionPerDay: 0,
        },
      },
      lines: [
        {
          workDate: '2026-06-04',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: false,
        },
      ],
    });
    const day = result.days[0];
    expect(day?.allowance).toBeCloseTo(allowancePerDay, 2);
    expect(day?.totalSalary).toBeCloseTo(daily + allowancePerDay, 2);
    expect(day?.totalSalary).toBeCloseTo(
      (day?.basicHourSalary ?? 0) + (day?.otHourSalary ?? 0) + (day?.allowance ?? 0),
      2
    );
  });

  it('office accrues paid sick leave and skips unpaid absent rows', () => {
    const daily = 3000 / 26;
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        { workDate: '2026-06-02', status: 'ABSENT', leaveType: null, basicHours: 9, workedMinutes: 0, isSunday: false },
        { workDate: '2026-06-03', status: 'LEAVE', leaveType: 'SICK', basicHours: 9, workedMinutes: 0, isSunday: false },
      ],
    });
    expect(result.gross).toBeCloseTo(daily, 2);
    expect(result.breakdown.earnedDays).toBe(1);
  });

  it('office full month attendance matches monthly basic minus one absent day', () => {
    const daily = 3000 / 26;
    const presentLines = Array.from({ length: daysInMonth('2026-06') }, (_, index) => {
      const day = index + 1;
      const workDate = `2026-06-${String(day).padStart(2, '0')}`;
      return {
        workDate,
        status: 'PRESENT' as const,
        leaveType: null,
        basicHours: 9,
        workedMinutes: 540,
        isSunday: weekdayIndexYmd(workDate) === 0,
      };
    }).filter((line) => weekdayIndexYmd(line.workDate) !== 0);
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        ...presentLines.slice(0, 25),
        { workDate: '2026-06-26', status: 'ABSENT', leaveType: null, basicHours: 9, workedMinutes: 0, isSunday: false },
      ],
    });
    expect(result.gross).toBeCloseTo(25 * (Math.round(daily * 100) / 100), 2);
    expect(result.breakdown.earnedDays).toBe(25);
  });

  it('office does not pay absences on weekly off-days when using working days', () => {
    const daily = 3000 / 26;
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-07',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 8,
          workedMinutes: 0,
          isSunday: true,
        },
        {
          workDate: '2026-06-08',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 8,
          workedMinutes: 0,
          isSunday: false,
        },
      ],
    });

    expect(result.gross).toBe(0);
    expect(result.breakdown.unpaidAbsentDays).toBe(1);
    expect(result.breakdown.dailyRate).toBeCloseTo(daily, 2);
  });

  it('daily wage: 9h = 120, 10h adds OT at 90% of basic hour', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-01',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: false,
        },
        {
          workDate: '2026-06-02',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 10 * 60,
          isSunday: false,
        },
      ],
    });
    expect(result.gross).toBe(120 + 120 + 12);
    expect(result.days[0]?.otHours).toBe(0);
    expect(result.days[0]?.otHourSalary).toBe(0);
    expect(result.days[0]?.basicHourSalary).toBe(120);
  });

  it('hourly split uses configurable excluded weekdays', () => {
    const denomAllDays = 30;
    const resultAllDays = calculatePayLine({
      month: '2026-06',
      config: { mode: 'HOURLY_SPLIT', excludedWeekdays: [] },
      compensation: { monthlyBasic: 900, monthlyAllowance: 200, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-01',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: false,
        },
      ],
    });
    const allowanceAll = 200 / denomAllDays;
    const basicAll = 900 / denomAllDays;
    expect(resultAllDays.gross).toBeCloseTo(basicAll + allowanceAll, 2);

    const denom = denomDaysExcludingSundays('2026-06');
    expect(denom).toBe(26);
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'HOURLY_SPLIT', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 900, monthlyAllowance: 200, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-01',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: false,
        },
      ],
    });
    const allowancePerDay = 200 / 26;
    const basicPay = 900 / 26;
    expect(result.gross).toBeCloseTo(basicPay + allowancePerDay, 2);
  });
});

describe('attendanceLinesForPayroll', () => {
  it('filters to month', () => {
    const lines = attendanceLinesForPayroll(
      [
        {
          workDate: new Date('2026-06-15'),
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          checkInAt: null,
          checkOutAt: null,
          breakStartAt: null,
          breakEndAt: null,
        },
        {
          workDate: new Date('2026-07-01'),
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          checkInAt: null,
          checkOutAt: null,
          breakStartAt: null,
          breakEndAt: null,
        },
      ],
      '2026-06'
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].workDate).toBe('2026-06-15');
  });

  it('office applies partial pay for half-pay sick leave', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-02',
          status: 'ABSENT',
          leaveType: 'SICK',
          leaveTypeId: 'lt-sick',
          leaveRequestId: 'lr-1',
          leavePayPercent: 50,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
        },
      ],
    });
    const daily = 3000 / 26;
    expect(result.gross).toBeCloseTo(daily * 0.5, 2);
    expect(result.breakdown.earnedDays).toBe(1);
  });

  it('applies different monthly basics before and after a mid-month effective date', () => {
    const early = {
      packageId: 'pkg-1500',
      compensation: { monthlyBasic: 1500, monthlyAllowance: 0, dailyRate: 0 },
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT' as const, excludedWeekdays: [0] },
    };
    const late = {
      packageId: 'pkg-2000',
      compensation: { monthlyBasic: 2000, monthlyAllowance: 0, dailyRate: 0 },
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT' as const, excludedWeekdays: [0] },
    };

    const result = calculatePayLine({
      month: '2026-06',
      config: early.config,
      compensation: early.compensation,
      lines: [
        {
          workDate: '2026-06-10',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
        {
          workDate: '2026-06-20',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      resolveLineContext: (line) => (line.workDate < '2026-06-15' ? early : late),
    });

    const earlyDay = result.days.find((day) => day.date === '2026-06-10');
    const lateDay = result.days.find((day) => day.date === '2026-06-20');
    expect(earlyDay?.basicHourSalary).toBeCloseTo(1500 / 26, 2);
    expect(lateDay?.basicHourSalary).toBeCloseTo(2000 / 26, 2);
    expect(result.breakdown.compensationPackageCount).toBe(2);
  });

  it('prorates fixed monthly deductions across mid-month compensation packages', () => {
    const early = {
      packageId: 'pkg-early',
      compensation: {
        monthlyBasic: 1500,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 0,
          fixedDeductions: 20,
          attendanceEarningPerDay: 0,
          attendanceDeductionPerDay: 0,
        },
      },
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT' as const, excludedWeekdays: [0] },
      fixedMonthlyProrationFactor: 12 / 26,
    };
    const late = {
      packageId: 'pkg-late',
      compensation: {
        monthlyBasic: 2000,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 0,
          fixedDeductions: 30,
          attendanceEarningPerDay: 0,
          attendanceDeductionPerDay: 0,
        },
      },
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT' as const, excludedWeekdays: [0] },
      fixedMonthlyProrationFactor: 14 / 26,
    };

    const result = calculatePayLine({
      month: '2026-06',
      config: early.config,
      compensation: early.compensation,
      lines: [
        {
          workDate: '2026-06-10',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
        {
          workDate: '2026-06-20',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      resolveLineContext: (line) => (line.workDate < '2026-06-15' ? early : late),
    });

    const expectedDeduction = roundMoney((20 * 12) / 26 + (30 * 14) / 26);
    expect(result.breakdown.salaryComponentsFixed).toBeCloseTo(-expectedDeduction, 2);
    expect(expectedDeduction).toBeCloseTo(25.38, 2);
    expect(expectedDeduction).toBeLessThan(50);
  });
});
