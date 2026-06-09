import { calculatePayLine } from '@/lib/hr/payroll/calculatePayLine';
import { evaluateCustomFormula } from '@/lib/hr/payroll/evaluateCustomFormula';
import { parseFormulaScript } from '@/lib/hr/payroll/formulaEngine';
import type { CompensationInput, PayLineInput, PayLineResult, PayTypeConfig } from '@/lib/hr/payroll/types';

export type PayConfigPreviewInput = {
  month: string;
  config: PayTypeConfig;
  compensation: CompensationInput;
  lines: PayLineInput[];
};

export type PayConfigPreviewResult = {
  gross: number;
  breakdown: Record<string, number>;
  days: PayLineResult['days'];
  formulaError: string | null;
  engine: 'builtin' | 'custom';
};

export function previewPayConfig(input: PayConfigPreviewInput): PayConfigPreviewResult {
  const { month, config, compensation, lines } = input;

  if (config.mode === 'CUSTOM') {
    try {
      if (config.formulaScript) parseFormulaScript(config.formulaScript);
      const result = evaluateCustomFormula({ month, config, compensation, lines });
      return {
        gross: result.gross,
        breakdown: result.breakdown,
        days: result.days,
        formulaError: null,
        engine: 'custom',
      };
    } catch (error) {
      return {
        gross: 0,
        breakdown: {},
        days: [],
        formulaError: error instanceof Error ? error.message : 'Formula error',
        engine: 'custom',
      };
    }
  }

  const result = calculatePayLine({ month, config, compensation, lines });
  return {
    gross: result.gross,
    breakdown: result.breakdown,
    days: result.days,
    formulaError: null,
    engine: 'builtin',
  };
}
