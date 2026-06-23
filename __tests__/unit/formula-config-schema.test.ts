import { FormulaConfigSchema } from '@/app/api/job-costing/formulas/_lib';

describe('formula config schema', () => {
  it('preserves repeatable area metadata when validating formula config', () => {
    const parsed = FormulaConfigSchema.parse({
      version: 2,
      areas: [
        {
          key: 'panel',
          label: 'Panel',
          dynamic: true,
          variables: {},
          materials: [{ materialId: 'mat-1', quantityExpression: 'area.sqm' }],
          labor: [],
        },
      ],
    });

    expect(parsed.areas[0]?.dynamic).toBe(true);
  });
});
