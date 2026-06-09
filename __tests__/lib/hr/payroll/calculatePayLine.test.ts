import {
  calculatePayLine,
  attendanceLinesForPayroll,
} from '@/lib/hr/payroll/calculatePayLine';
import { daysInMonth, denomDaysExcludingSundays } from '@/lib/hr/payroll/calendar';

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

  it('office deducts unpaid absent days only', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT' },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        { workDate: '2026-06-02', status: 'ABSENT', leaveType: null, basicHours: 9, workedMinutes: 0, isSunday: false },
        { workDate: '2026-06-03', status: 'LEAVE', leaveType: 'SICK', basicHours: 9, workedMinutes: 0, isSunday: false },
      ],
    });
    expect(result.gross).toBeCloseTo(3000 - (3000 / 30) * 1, 2);
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

  it('office applies partial deduction for half-pay sick leave', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT' },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-02',
          status: 'LEAVE',
          leaveType: 'SICK',
          leavePayPercent: 50,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
        },
      ],
    });
    const daily = 3000 / 30;
    expect(result.breakdown.partialLeaveDeductions).toBeCloseTo(daily * 0.5, 2);
    expect(result.gross).toBeCloseTo(3000 - daily * 0.5, 2);
  });
});
