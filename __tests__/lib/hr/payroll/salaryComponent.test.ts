import {
  applySalaryComponentsToGross,
  attendanceSalaryComponentNet,
  buildSalaryComponentTotals,
  fixedSalaryComponentNet,
  netSalaryComponentTotal,
} from '@/lib/hr/payroll/salaryComponent';
import { calculatePayLine } from '@/lib/hr/payroll/calculatePayLine';
import type { CompensationInput } from '@/lib/hr/payroll/types';

describe('buildSalaryComponentTotals', () => {
  it('splits fixed and attendance-based earnings and deductions', () => {
    const totals = buildSalaryComponentTotals(
      [
        { amount: 300, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
        { amount: 100, componentKind: 'DEDUCTION', applicationMode: 'FIXED_MONTHLY' },
        { amount: 260, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
      ],
      '2026-06',
      [0]
    );
    expect(totals.fixedEarnings).toBe(300);
    expect(totals.fixedDeductions).toBe(100);
    expect(fixedSalaryComponentNet(totals)).toBe(200);
    expect(totals.attendanceEarningPerDay).toBeCloseTo(260 / 26, 5);
  });
});

describe('netSalaryComponentTotal', () => {
  it('subtracts deductions from earnings', () => {
    expect(
      netSalaryComponentTotal([
        { amount: 500, componentKind: 'EARNING' },
        { amount: 100, componentKind: 'DEDUCTION' },
      ])
    ).toBe(400);
  });
});

describe('applySalaryComponentsToGross', () => {
  it('adds fixed and present-day components for monthly fixed pay', () => {
    const compensation: CompensationInput = {
      monthlyBasic: 3000,
      monthlyAllowance: 0,
      dailyRate: 0,
      salaryComponents: buildSalaryComponentTotals(
        [
          { amount: 200, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
          { amount: 260, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
        ],
        '2026-06',
        [0]
      ),
    };
    const breakdown: Record<string, number> = {};
    const gross = applySalaryComponentsToGross({
      gross: 3000,
      compensation,
      lines: [
        {
          workDate: '2026-06-01',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
        {
          workDate: '2026-06-02',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 540,
          isSunday: false,
        },
      ],
      breakdown,
    });
    const attendanceNet = attendanceSalaryComponentNet(compensation.salaryComponents!, 2);
    expect(gross).toBeCloseTo(3000 + 200 + attendanceNet, 2);
    expect(breakdown.salaryComponentsFixed).toBe(200);
    expect(breakdown.salaryComponentsAttendance).toBeCloseTo(attendanceNet, 2);
  });
});

describe('calculatePayLine salary components', () => {
  it('applies fixed monthly components on top of monthly fixed basic', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_FIXED' },
      compensation: {
        monthlyBasic: 3000,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 500,
          fixedDeductions: 100,
          attendanceEarningPerDay: 0,
          attendanceDeductionPerDay: 0,
        },
      },
      lines: [],
    });
    expect(result.gross).toBe(3400);
    expect(result.breakdown.salaryComponentsFixed).toBe(400);
  });

  it('hourly split adds fixed once and attendance per present day', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'HOURLY_SPLIT', excludedWeekdays: [0] },
      compensation: {
        monthlyBasic: 900,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 300,
          fixedDeductions: 0,
          attendanceEarningPerDay: 260 / 26,
          attendanceDeductionPerDay: 0,
        },
      },
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
    const basicPay = 900 / 26;
    const attendanceDay = 260 / 26;
    expect(result.gross).toBeCloseTo(basicPay + attendanceDay + 300, 2);
  });
});
