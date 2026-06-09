import {
  PAY_MODE_FORMULA_DEFINITIONS,
  describePayTypeRow,
  substituteConfigInFormulaLines,
} from '@/lib/hr/payroll/payTypeFormulas';

describe('payTypeFormulas', () => {
  it('defines all pay modes including custom', () => {
    expect(PAY_MODE_FORMULA_DEFINITIONS).toHaveLength(5);
  });

  it('substitutes parameters in daily wage formulas', () => {
    const lines = substituteConfigInFormulaLines('DAILY_WAGE', {
      mode: 'DAILY_WAGE',
      otPercent: 125,
    });
    expect(lines.some((l) => l.includes('125'))).toBe(true);
  });

  it('describes a pay type row', () => {
    const d = describePayTypeRow({ mode: 'MONTHLY_FIXED' });
    expect(d.summary).toContain('monthly_basic');
  });
});
