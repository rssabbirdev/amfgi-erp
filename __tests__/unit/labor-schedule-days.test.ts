import {
  formatAreaLaborRuleOutputPreview,
  formatLaborScheduleDaysExpressionPreview,
  playgroundInstanceValueKey,
  writePlaygroundInstancesMeta,
  type AreaRule,
  type BuilderState,
} from '@/components/job-costing/formula-builder/shared';
import { evaluateNumericFormulaExpression } from '@/lib/job-costing/expressionEvaluator';

describe('labor schedule days expressions', () => {
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
        materials: [],
        labor: [
          {
            id: 'labor-1',
            expertiseName: 'Lamination',
            quantityExpression: 'areas.walls.sqm',
            crewSizeExpression: '2',
            productivityPerWorkerPerDay: '10',
            scheduleDaysExpression: 'ceil(labor.days)',
          },
        ],
      },
    ],
  } satisfies BuilderState;

  const area = form.areas[0] as AreaRule;
  const rule = area.labor[0];
  const values = { 'area.area-1.sqm': '25' };

  it('evaluates ceil(labor.days) in the runtime engine variables', () => {
    const baseDays = 25 / (2 * 10);
    expect(baseDays).toBe(1.25);
    expect(
      evaluateNumericFormulaExpression('ceil(labor.days)', {
        'labor.quantity': 25,
        'labor.crew': 2,
        'labor.productivity': 10,
        'labor.days': baseDays,
        'labor.baseDays': baseDays,
      })
    ).toBe(2);
  });

  it('previews rounded schedule days separately from base days', () => {
    expect(formatLaborScheduleDaysExpressionPreview(form, values, area, rule, 'ceil(labor.days)')).toBe('2 days');
    expect(formatLaborScheduleDaysExpressionPreview(form, values, area, rule, 'labor.days')).toBe('1.25 days');
  });

  it('includes schedule days in the labor rule preview', () => {
    const preview = formatAreaLaborRuleOutputPreview(form, values, area, rule);
    expect(preview).toContain('Days 2');
  });

  it('applies ceil once on combined base days across multiple rows', () => {
    const dynamicForm = {
      ...form,
      areas: [
        {
          ...form.areas[0],
          dynamic: true,
          labor: [rule],
        },
      ],
    } satisfies BuilderState;
    const dynamicArea = dynamicForm.areas[0] as AreaRule;
    const dynamicValues = writePlaygroundInstancesMeta(
      {
        [playgroundInstanceValueKey('walls', 'row-1', 'sqm')]: '87.5',
        [playgroundInstanceValueKey('walls', 'row-2', 'sqm')]: '87.5',
      },
      dynamicArea.id,
      [
        { id: 'row-1', label: 'Row 1' },
        { id: 'row-2', label: 'Row 2' },
      ]
    );

    expect(formatLaborScheduleDaysExpressionPreview(dynamicForm, dynamicValues, dynamicArea, rule, 'labor.days')).toBe(
      '8.75 days'
    );
    expect(formatLaborScheduleDaysExpressionPreview(dynamicForm, dynamicValues, dynamicArea, rule, 'ceil(labor.days)')).toBe(
      '9 days'
    );
    expect(formatAreaLaborRuleOutputPreview(dynamicForm, dynamicValues, dynamicArea, rule)).toContain('Days 9');
  });
});
