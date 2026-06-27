import { evaluateNumericFormulaExpression } from '@/lib/job-costing/expressionEvaluator';

describe('formula math functions', () => {
  it('evaluates floor, ceil, and round', () => {
    expect(evaluateNumericFormulaExpression('floor(3.7)', {})).toBe(3);
    expect(evaluateNumericFormulaExpression('ceil(3.2)', {})).toBe(4);
    expect(evaluateNumericFormulaExpression('round(3.5)', {})).toBe(4);
    expect(evaluateNumericFormulaExpression('round(area.sqm * 1.15)', { 'area.sqm': 10.4 })).toBe(12);
  });

  it('does not treat function names as variable tokens when keys share the same name', () => {
    expect(evaluateNumericFormulaExpression('floor(area.sqm)', { 'area.sqm': 10.4, floor: 99 })).toBe(10);
    expect(evaluateNumericFormulaExpression('ceil(area.sqm)', { 'area.sqm': 3.2, ceil: 99 })).toBe(4);
    expect(evaluateNumericFormulaExpression('round(area.sqm)', { 'area.sqm': 10.6, round: 99 })).toBe(11);
  });

  it('supports nested math functions', () => {
    expect(evaluateNumericFormulaExpression('round(floor(area.sqm * 1.15))', { 'area.sqm': 10.4 })).toBe(11);
  });

  it('supports optional decimal places in round', () => {
    expect(evaluateNumericFormulaExpression('round(3.456, 2)', {})).toBe(3.46);
    expect(evaluateNumericFormulaExpression('round(area.sqm, 1)', { 'area.sqm': 10.44 })).toBe(10.4);
  });
});
