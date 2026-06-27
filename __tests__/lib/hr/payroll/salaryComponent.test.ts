import {
  applySalaryComponentsToGross,
  attendanceSalaryComponentNet,
  buildSalaryComponentTotals,
  fixedSalaryComponentNet,
  netSalaryComponentTotal,
  prorateSalaryComponentTotals,
  resolveMonthlyAllowanceCap,
  resolvePerDayAllowance,
  resolvePerDayComponentSplit,
  resolveSalaryComponentCaps,
  resolveSalaryComponentDisplayTotals,
} from '@/lib/hr/payroll/salaryComponent';
import { calculatePayLine } from '@/lib/hr/payroll/calculatePayLine';
import type { CompensationInput } from '@/lib/hr/payroll/types';

describe('prorateSalaryComponentTotals', () => {
  it('scales fixed earnings and deductions by the month fraction', () => {
    const totals = buildSalaryComponentTotals(
      [
        { amount: 300, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
        { amount: 100, componentKind: 'DEDUCTION', applicationMode: 'FIXED_MONTHLY' },
      ],
      '2026-06',
      [0]
    );
    const prorated = prorateSalaryComponentTotals(totals, 12 / 26);
    expect(prorated.fixedEarnings).toBeCloseTo((300 * 12) / 26, 2);
    expect(prorated.fixedDeductions).toBeCloseTo((100 * 12) / 26, 2);
    expect(prorated.attendanceEarningPerDay).toBe(totals.attendanceEarningPerDay);
  });
});

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

describe('resolvePerDayComponentSplit', () => {
  it('splits attendance earnings and deductions per eligible day', () => {
    const compensation: CompensationInput = {
      monthlyBasic: 3000,
      monthlyAllowance: 0,
      dailyRate: 0,
      salaryComponents: buildSalaryComponentTotals(
        [
          { amount: 260, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
          { amount: 52, componentKind: 'DEDUCTION', applicationMode: 'ATTENDANCE_PRESENT' },
        ],
        '2026-06',
        [0]
      ),
    };
    const split = resolvePerDayComponentSplit({
      line: {
        workDate: '2026-06-02',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 540,
        isSunday: false,
      },
      compensation,
      month: '2026-06',
      excludedWeekdays: [0],
    });
    expect(split.earning).toBeCloseTo(260 / 26, 2);
    expect(split.deduction).toBeCloseTo(52 / 26, 2);
    expect(resolvePerDayAllowance({
      line: {
        workDate: '2026-06-02',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 540,
        isSunday: false,
      },
      compensation,
      month: '2026-06',
      excludedWeekdays: [0],
    })).toBeCloseTo(208 / 26, 2);
  });
});

describe('resolveMonthlyAllowanceCap', () => {
  it('uses legacy monthly allowance when salary components are absent', () => {
    expect(
      resolveMonthlyAllowanceCap(
        { monthlyBasic: 3000, monthlyAllowance: 200, dailyRate: 0 },
        '2026-06',
        [0]
      )
    ).toBe(200);
  });

  it('uses full-month net salary component allowance assignment', () => {
    const compensation: CompensationInput = {
      monthlyBasic: 3000,
      monthlyAllowance: 0,
      dailyRate: 0,
      salaryComponents: buildSalaryComponentTotals(
        [
          { amount: 300, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
          { amount: 50, componentKind: 'DEDUCTION', applicationMode: 'FIXED_MONTHLY' },
          { amount: 211.54, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
        ],
        '2026-06',
        [0]
      ),
    };
    expect(resolveMonthlyAllowanceCap(compensation, '2026-06', [0])).toBe(461.54);
  });
});

describe('resolveSalaryComponentCaps', () => {
  it('sums per-day rounded attendance amounts instead of days × unrounded rate', () => {
    const compensation: CompensationInput = {
      monthlyBasic: 3000,
      monthlyAllowance: 0,
      dailyRate: 0,
      salaryComponents: buildSalaryComponentTotals(
        [
          { amount: 250, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
          { amount: 211.54, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
        ],
        '2026-06',
        [0]
      ),
    };
    const lines = Array.from({ length: 26 }, (_, index) => ({
      workDate: `2026-06-${String(index + 1).padStart(2, '0')}`,
      status: 'PRESENT' as const,
      leaveType: null,
      basicHours: 9,
      workedMinutes: 540,
      isSunday: false,
    }));
    const caps = resolveSalaryComponentCaps({
      compensation,
      lines,
      month: '2026-06',
      excludedWeekdays: [0],
    });
    const perDay = resolvePerDayComponentSplit({
      line: lines[0],
      compensation,
      month: '2026-06',
      excludedWeekdays: [0],
    }).earning;
    const legacyCap = 250 + 26 * (211.54 / 26);
    expect(caps.earningsCap).toBeCloseTo(250 + perDay * 26, 2);
    expect(caps.earningsCap).not.toBeCloseTo(legacyCap, 2);
  });
});

describe('resolveSalaryComponentDisplayTotals', () => {
  it('totals fixed and per-day earnings and deductions separately', () => {
    const compensation: CompensationInput = {
      monthlyBasic: 3000,
      monthlyAllowance: 0,
      dailyRate: 0,
      salaryComponents: buildSalaryComponentTotals(
        [
          { amount: 300, componentKind: 'EARNING', applicationMode: 'FIXED_MONTHLY' },
          { amount: 100, componentKind: 'DEDUCTION', applicationMode: 'FIXED_MONTHLY' },
          { amount: 260, componentKind: 'EARNING', applicationMode: 'ATTENDANCE_PRESENT' },
          { amount: 52, componentKind: 'DEDUCTION', applicationMode: 'ATTENDANCE_PRESENT' },
        ],
        '2026-06',
        [0]
      ),
    };
    const totals = resolveSalaryComponentDisplayTotals({
      compensation,
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
      month: '2026-06',
      excludedWeekdays: [0],
      dayRows: [
        {
          allowance: 208 / 26,
          componentEarning: 260 / 26,
          componentDeduction: 52 / 26,
        },
      ],
    });
    expect(totals.earnings).toBeCloseTo(300 + 260 / 26, 2);
    expect(totals.deductions).toBeCloseTo(100 + 52 / 26, 2);
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
