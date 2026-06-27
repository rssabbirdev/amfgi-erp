import {
  formatPayMonthLabel,
  formatPayMoney,
  payrollBreakdownLabel,
} from '@/lib/hr/payroll/payslipFormatting';

describe('payslipFormatting', () => {
  it('formats month label', () => {
    expect(formatPayMonthLabel('2026-06')).toMatch(/June.*2026/);
  });

  it('formats money', () => {
    expect(formatPayMoney(3000)).toBe('3,000.00');
    expect(formatPayMoney(null)).toBe('0.00');
    expect(formatPayMoney(undefined)).toBe('0.00');
  });

  it('labels breakdown keys', () => {
    expect(payrollBreakdownLabel('monthlyBasic')).toBe('Monthly basic');
  });
});
