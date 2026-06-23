import { buildJobItemEstimate } from '@/lib/job-costing/formulaEngine';
import type { FormulaConfig, JobItemSpecifications, MaterialPricingSnapshot } from '@/lib/job-costing/types';

function estimateMaterialQuantity(
  formulaConfig: FormulaConfig,
  specifications: JobItemSpecifications,
  specificationSchema?: unknown
) {
  const result = buildJobItemEstimate({
    jobId: 'job-1',
    jobNumber: 'JOB-1',
    postingDate: new Date('2026-01-01T00:00:00.000Z'),
    nonWorkingWeekdays: [],
    pricingMode: 'CURRENT',
    formulaLibrary: {
      id: 'formula-1',
      name: 'Formula',
      fabricationType: 'Test',
      formulaConfig,
      specificationSchema,
    },
    jobItem: {
      id: 'item-1',
      name: 'Budget item',
      specifications,
      assignedEmployeeIds: [],
    },
    materialCatalog: new Map([['mat-1', { id: 'mat-1', name: 'Resin', unit: 'kg' }]]),
    materialPricing: new Map<string, MaterialPricingSnapshot>([
      ['mat-1', { materialId: 'mat-1', materialName: 'Resin', baseUnit: 'kg', baseUnitCost: 1, source: 'CURRENT' }],
    ]),
    materialFactorToBase: () => 1,
    actualConsumption: new Map(),
    teamProfiles: [],
  });

  return result.materials[0]?.estimatedBaseQuantity ?? 0;
}

describe('formula value overrides', () => {
  it('uses global formula overrides before resolving dependent formula values', () => {
    const quantity = estimateMaterialQuantity(
      {
        version: 2,
        variables: { resin_rate: 2, double_resin_rate: 'formula.resin_rate * 2' },
        constants: [
          { key: 'resin_rate', label: 'Resin rate', value: 2 },
          { key: 'double_resin_rate', label: 'Double resin rate', value: 'formula.resin_rate * 2' },
        ],
        areas: [
          {
            key: 'main',
            label: 'Main',
            variables: {},
            materials: [{ materialId: 'mat-1', quantityExpression: 'area.sqm * formula.double_resin_rate' }],
            labor: [],
          },
        ],
      },
      {
        areas: { main: { measurements: { sqm: 10 } } },
        formulaOverrides: { global: { resin_rate: 3 } },
      }
    );

    expect(quantity).toBe(60);
  });

  it('uses area formula overrides before resolving dependent area formula values', () => {
    const quantity = estimateMaterialQuantity(
      {
        version: 2,
        constants: [],
        areas: [
          {
            key: 'main',
            label: 'Main',
            variables: { resin_rate: 2, double_resin_rate: 'area.formula.resin_rate * 2' },
            materials: [{ materialId: 'mat-1', quantityExpression: 'area.sqm * area.formula.double_resin_rate' }],
            labor: [],
          },
        ],
      },
      {
        areas: { main: { measurements: { sqm: 10 } } },
        formulaOverrides: { areas: { main: { resin_rate: 4 } } },
      }
    );

    expect(quantity).toBe(80);
  });
});

describe('dynamic formula areas', () => {
  const dynamicFormula: FormulaConfig = {
    version: 2,
    constants: [{ key: 'resin_rate', label: 'Resin rate', value: 2 }],
    areas: [
      {
        key: 'panel',
        label: 'Panel',
        dynamic: true,
        variables: {},
        materials: [{ materialId: 'mat-1', quantityExpression: 'area.sqm * formula.resin_rate' }],
        labor: [],
      },
    ],
  };

  it('keeps old static area specifications compatible when an area becomes dynamic', () => {
    const quantity = estimateMaterialQuantity(
      dynamicFormula,
      {
        areas: { panel: { measurements: { sqm: 10 } } },
      }
    );

    expect(quantity).toBe(20);
  });

  it('evaluates dynamic area rules once per instance and aggregates totals', () => {
    const quantity = estimateMaterialQuantity(
      dynamicFormula,
      {
        areas: {
          panel: {
            instances: [
              { id: 'panel-1', label: 'Panel 1', measurements: { sqm: 10 } },
              { id: 'panel-2', label: 'Panel 2', measurements: { sqm: 5 } },
            ],
          },
        },
      }
    );

    expect(quantity).toBe(30);
  });

  it('reads repeatable area metadata from specification schema when formula config lost it', () => {
    const quantity = estimateMaterialQuantity(
      {
        ...dynamicFormula,
        areas: dynamicFormula.areas.map((area) => ({ ...area, dynamic: undefined })),
      },
      {
        areas: {
          panel: {
            instances: [
              { id: 'panel-1', label: 'Panel 1', measurements: { sqm: 10 } },
              { id: 'panel-2', label: 'Panel 2', measurements: { sqm: 5 } },
            ],
          },
        },
      },
      {
        areas: [{ key: 'panel', label: 'Panel', dynamic: true, fields: [] }],
      }
    );

    expect(quantity).toBe(30);
  });
});
