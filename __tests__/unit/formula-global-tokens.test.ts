import {
  buildFormulaConstantTokens,
  dedupeFormulaTokens,
  migrateGlobalFormulaTokenPrefix,
  type FormulaToken,
} from '@/components/job-costing/formula-builder/shared';

describe('global formula tokens', () => {
  it('dedupes tokens that share the same path', () => {
    const tokens: FormulaToken[] = [
      { token: 'specs.global.fiber_450_use_rate', label: 'Fiber rate', group: 'Job input' },
      { token: 'specs.global.fiber_450_use_rate', label: 'Fiber rate', group: 'Stored value' },
    ];

    expect(dedupeFormulaTokens(tokens)).toEqual([
      { token: 'specs.global.fiber_450_use_rate', label: 'Fiber rate', group: 'Stored value' },
    ]);
  });

  it('builds one specs.global token per stored key', () => {
    const tokens = buildFormulaConstantTokens(
      [
        {
          id: 'stored-1',
          key: 'fiber_450_use_rate',
          label: 'Fiber 450 use rate',
          inputType: 'stored',
          storedValue: '0.12',
          defaultMaterialId: '',
          defaultValue: '',
          required: false,
        },
      ],
      [
        {
          id: 'legacy-1',
          key: 'fiber_450_use_rate',
          label: 'Fiber 450 use rate',
          value: '0.12',
        },
      ],
      []
    );

    expect(tokens.filter((item) => item.token === 'specs.global.fiber_450_use_rate')).toHaveLength(1);
    expect(tokens.some((item) => item.token.startsWith('formula.'))).toBe(false);
  });

  it('migrates legacy formula.* references to specs.global.*', () => {
    expect(
      migrateGlobalFormulaTokenPrefix('area.sqm * formula.fiber_450_use_rate', ['fiber_450_use_rate'])
    ).toBe('area.sqm * specs.global.fiber_450_use_rate');
  });
});
