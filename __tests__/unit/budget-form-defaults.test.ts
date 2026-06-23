import { coerceFieldDefaultValue, resolveAreaFieldFormValue } from '@/components/job-costing/formula-builder/shared';

describe('budget form default values', () => {
  it('coerces numeric and boolean schema defaults to strings', () => {
    expect(coerceFieldDefaultValue(12)).toBe('12');
    expect(coerceFieldDefaultValue(true)).toBe('true');
    expect(coerceFieldDefaultValue(false)).toBe('false');
    expect(coerceFieldDefaultValue(' 8 ')).toBe('8');
    expect(coerceFieldDefaultValue('')).toBeUndefined();
    expect(coerceFieldDefaultValue('   ')).toBeUndefined();
  });

  it('resolves area defaults when the form value is blank', () => {
    expect(
      resolveAreaFieldFormValue(
        { inputType: 'number', defaultValue: '42' },
        ''
      )
    ).toBe('42');
    expect(
      resolveAreaFieldFormValue(
        { inputType: 'boolean', defaultValue: 'false' },
        ''
      )
    ).toBe('false');
  });
});
