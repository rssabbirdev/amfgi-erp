import { calculatePayLine } from '@/lib/hr/payroll/calculatePayLine';
import {
  buildExcludedWeekdayWorkDayRow,
  excludedWeekdayOtPay,
  shouldPayExcludedWeekdayWorkAtOtOnly,
} from '@/lib/hr/payroll/excludedWeekdayOtPay';

describe('excludedWeekdayOtPay', () => {
  it('pays all worked hours at OT rate on excluded weekdays', () => {
    const line = {
      workDate: '2026-06-07',
      status: 'PRESENT',
      leaveType: null,
      basicHours: 9,
      workedMinutes: 9 * 60,
      isSunday: true,
    };
    expect(
      shouldPayExcludedWeekdayWorkAtOtOnly(line, {
        mode: 'DAILY_WAGE',
        otPercent: 90,
        excludedWeekdays: [0],
      })
    ).toBe(true);

    const { otPay } = excludedWeekdayOtPay(9, 120 / 9, 90);
    expect(otPay).toBe(108);

    const row = buildExcludedWeekdayWorkDayRow(line, 120 / 9, 90);
    expect(row.basicHourSalary).toBe(0);
    expect(row.otHourSalary).toBe(108);
    expect(row.totalSalary).toBe(108);
    expect(row.detail).toContain('OT only');
  });
});

describe('calculatePayLine excluded weekday work', () => {
  it('daily wage pays Sunday work at OT only, not full day rate', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90, excludedWeekdays: [0] },
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
          workDate: '2026-06-07',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: true,
        },
      ],
    });

    expect(result.gross).toBe(228);
    expect(result.days[1]?.otHourSalary).toBe(108);
    expect(result.days[1]?.basicHourSalary).toBe(0);
  });

  it('office calendar deduct does not pay Sunday work unless enabled on salary structure', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: {
        mode: 'MONTHLY_CALENDAR_DEDUCT',
        deductDenominator: 'WORKING_DAYS',
        excludedWeekdays: [0],
        otPercent: 100,
      },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-07',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: true,
        },
      ],
    });

    expect(result.gross).toBe(0);
    expect(result.days[0]?.totalSalary).toBe(0);
    expect(result.days[0]?.status).toBe('Present - Sunday');
  });

  it('office calendar deduct pays Sunday work at OT when enabled on salary structure', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: {
        mode: 'MONTHLY_CALENDAR_DEDUCT',
        deductDenominator: 'WORKING_DAYS',
        excludedWeekdays: [0],
        otPercent: 100,
        payExcludedWeekdayWorkAtOt: true,
      },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-07',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: true,
        },
      ],
    });

    const daily = 3000 / 26;
    expect(result.gross).toBeCloseTo(daily, 2);
    expect(result.days[0]?.basicHourSalary).toBe(0);
    expect(result.days[0]?.otHourSalary).toBeCloseTo(daily, 2);
    expect(result.days[0]?.status).toBe('Present - Sunday');
  });
});
