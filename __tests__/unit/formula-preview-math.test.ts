import {
  formatAreaMaterialRuleOutputPreview,
  formatFormulaPreviewResult,
  type AreaRule,
  type BuilderState,
} from '@/components/job-costing/formula-builder/shared';

describe('formula preview math functions', () => {
  const form = {
    name: 'Test',
    slug: 'test',
    fabricationType: 'grp',
    globalFields: [],
    areas: [
      {
        id: 'area-1',
        key: 'walls',
        label: 'Walls',
        dynamic: false,
        fields: [{ id: 'f1', key: 'sqm', label: 'SQM', inputType: 'area', unit: 'sqm', defaultValue: '', required: true }],
        formulaValues: [],
        materials: [
          {
            id: 'mat-rule-1',
            materialSource: 'fixed' as const,
            materialId: 'm1',
            materialSelectorKey: '',
            quantityExpression: 'round(areas.walls.sqm * 1.15)',
            wastePercent: '0',
          },
        ],
        labor: [],
      },
    ],
  } satisfies BuilderState;

  const area = form.areas[0] as AreaRule;
  const values = { 'area.area-1.sqm': '10.4' };

  it('formats round() differently from raw multiplication in preview', () => {
    const rounded = formatAreaMaterialRuleOutputPreview(form, values, area, area.materials[0]);
    expect(rounded).toContain('Qty 12');

    const raw = formatAreaMaterialRuleOutputPreview(form, values, area, {
      ...area.materials[0],
      quantityExpression: 'areas.walls.sqm * 1.15',
    });
    expect(raw).toContain('Qty 11.96');
    expect(rounded).not.toBe(raw);
  });

  it('surfaces evaluation errors instead of silent zero', () => {
    const result = formatFormulaPreviewResult('round(areas.walls.sqm', { 'areas.walls.sqm': 10 });
    expect(result).toMatch(/^Error:/);
  });
});
