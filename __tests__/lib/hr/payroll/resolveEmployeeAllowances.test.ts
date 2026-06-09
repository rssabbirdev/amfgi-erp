import {
  dedupeAllowancesByType,
  resolveMonthlyAllowanceTotal,
  sumAllowanceAmounts,
} from '@/lib/hr/payroll/allowanceTotals';

function item(typeId: string, amount: number, effectiveFrom: string) {
  return {
    allowanceTypeId: typeId,
    allowanceTypeName: typeId,
    amount,
    effectiveFrom,
  };
}

describe('resolveMonthlyAllowanceTotal', () => {
  it('sums typed allowances when any exist', () => {
    expect(
      resolveMonthlyAllowanceTotal(500, [{ amount: 200 }, { amount: 50 }])
    ).toBe(250);
  });

  it('falls back to legacy monthly allowance when no typed rows', () => {
    expect(resolveMonthlyAllowanceTotal(500, [])).toBe(500);
  });

  it('uses zero when typed rows exist but sum to zero', () => {
    expect(resolveMonthlyAllowanceTotal(500, [{ amount: 0 }])).toBe(0);
  });
});

describe('dedupeAllowancesByType', () => {
  it('keeps latest effective row per allowance type', () => {
    const deduped = dedupeAllowancesByType([
      item('housing', 500, '2026-01-01'),
      item('housing', 600, '2026-06-01'),
      item('transport', 200, '2026-01-01'),
    ]);
    expect(sumAllowanceAmounts(deduped)).toBe(800);
    expect(deduped.find((r) => r.allowanceTypeId === 'housing')?.amount).toBe(600);
  });

  it('does not double-count duplicate rows for the same type', () => {
    const deduped = dedupeAllowancesByType([
      item('housing', 500, '2026-01-01'),
      item('housing', 500, '2026-01-01'),
      item('transport', 150, '2026-06-15'),
      item('transport', 200, '2026-06-15'),
    ]);
    expect(sumAllowanceAmounts(deduped)).toBe(700);
  });
});
