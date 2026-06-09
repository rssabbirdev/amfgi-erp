import { lineBasicHours, averageLineBasicHours } from '@/lib/hr/payroll/lineBasicHours';
import type { PayLineInput } from '@/lib/hr/payroll/types';

describe('lineBasicHours', () => {
  const line = (basicHours: number): PayLineInput => ({
    workDate: '2026-06-01',
    status: 'PRESENT',
    leaveType: null,
    basicHours,
    workedMinutes: 540,
    isSunday: false,
  });

  it('reads positive hours from attendance row', () => {
    expect(lineBasicHours(line(9))).toBe(9);
  });

  it('returns null for missing or invalid hours', () => {
    expect(lineBasicHours(line(0))).toBeNull();
    expect(lineBasicHours(line(NaN))).toBeNull();
  });

  it('averages across lines for month-level formulas', () => {
    expect(averageLineBasicHours([line(8), line(10)])).toBe(9);
  });
});
