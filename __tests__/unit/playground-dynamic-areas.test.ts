import {
  buildPlaygroundPreview,
  formatAreaMaterialRuleOutputPreview,
  migrateAreaPlaygroundValuesToDynamic,
  playgroundInstanceValueKey,
} from '@/components/job-costing/formula-builder/shared';
import type { BuilderState } from '@/components/job-costing/formula-builder/shared';
import type { Material } from '@/store/api/endpoints/materials';

function buildDynamicForm(): BuilderState {
  return {
    name: 'Dynamic test',
    slug: 'dynamic-test',
    fabricationType: 'Test',
    description: '',
    globalFields: [],
    formulaConstants: [{ id: 'c1', key: 'resin_rate', label: 'Resin rate', value: '2', unit: '' }],
    areas: [
      {
        id: 'area-1',
        key: 'panel',
        label: 'Panel',
        dynamic: true,
        fields: [{ id: 'f1', key: 'sqm', label: 'Sqm', inputType: 'number', unit: 'sqm', required: true }],
        formulaValues: [],
        materials: [
          {
            id: 'm1',
            materialSource: 'fixed',
            materialId: 'mat-1',
            materialSelectorKey: '',
            quantityExpression: 'area.sqm * formula.resin_rate',
            wastePercent: '0',
          },
        ],
        labor: [],
      },
    ],
  };
}

const materials: Material[] = [
  {
    id: 'mat-1',
    name: 'Resin',
    unit: 'kg',
    unitCost: 5,
    companyId: 'co-1',
    warehouseId: null,
    createdAt: '',
    updatedAt: '',
  } as Material,
];

describe('playground dynamic areas', () => {
  it('calculates material totals for a single repeatable instance', () => {
    const form = buildDynamicForm();
    const values = {
      [playgroundInstanceValueKey('panel', 'area-1-instance-1', 'sqm')]: '10',
    };

    const preview = buildPlaygroundPreview(form, values, materials);

    expect(preview.warnings).toEqual([]);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]?.quantity).toBe(20);
    expect(preview.totalCost).toBe(100);
  });

  it('aggregates totals across multiple repeatable instances', () => {
    const form = buildDynamicForm();
    const values = {
      [playgroundInstanceValueKey('panel', 'panel-1', 'sqm')]: '10',
      [playgroundInstanceValueKey('panel', 'panel-2', 'sqm')]: '5',
    };

    const preview = buildPlaygroundPreview(form, values, materials);

    expect(preview.lines).toHaveLength(2);
    expect(preview.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(30);
    expect(preview.totalCost).toBe(150);
  });

  it('migrates static playground values when an area becomes repeatable', () => {
    const form = buildDynamicForm();
    const staticValues = {
      [`area.${form.areas[0]!.id}.sqm`]: '12',
    };

    const migrated = migrateAreaPlaygroundValuesToDynamic(form.areas[0]!, staticValues);
    const preview = buildPlaygroundPreview(form, migrated, materials);

    expect(preview.lines[0]?.quantity).toBe(24);
    expect(preview.totalCost).toBe(120);
  });

  it('aggregates possible output across repeatable rows', () => {
    const form = buildDynamicForm();
    const values = {
      [playgroundInstanceValueKey('panel', 'panel-1', 'sqm')]: '10',
      [playgroundInstanceValueKey('panel', 'panel-2', 'sqm')]: '5',
    };
    const rule = form.areas[0]!.materials[0]!;

    const previewText = formatAreaMaterialRuleOutputPreview(form, values, form.areas[0]!, rule, 'kg');

    expect(previewText).toContain('Qty 30');
    expect(previewText).toContain('2 rows');
  });

  it('uses area input defaults when playground instance values are blank', () => {
    const form = buildDynamicForm();
    form.areas[0]!.fields[0]!.defaultValue = '8';
    const values = {};

    const preview = buildPlaygroundPreview(form, values, materials);

    expect(preview.lines[0]?.quantity).toBe(16);
  });
});
