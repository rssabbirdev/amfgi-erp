export type FormulaValue = number | string | boolean;
export type FormulaVariableMap = Record<string, FormulaValue>;

const BOOLEAN_TRUE_PATTERN = /^(true|yes|on)$/i;
const BOOLEAN_FALSE_PATTERN = /^(false|no|off)$/i;
const ALLOWED_IDENTIFIERS = new Set([
  'true',
  'false',
  '__if',
  '__min',
  '__max',
  '__round',
  '__ceil',
  '__floor',
  '__abs',
  '__pow',
]);

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeFormulaValue(value: unknown): FormulaValue {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (BOOLEAN_TRUE_PATTERN.test(trimmed)) return true;
    if (BOOLEAN_FALSE_PATTERN.test(trimmed)) return false;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  return 0;
}

function toExpressionLiteral(value: FormulaValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
}

function replaceFormulaTokens(expression: string, values: FormulaVariableMap) {
  let normalized = expression;
  for (const key of Object.keys(values).sort((a, b) => b.length - a.length)) {
    const literal = toExpressionLiteral(normalizeFormulaValue(values[key]));
    normalized = normalized.replace(
      new RegExp(`(?<![A-Za-z0-9_.])${escapeRegex(key)}(?![A-Za-z0-9_.])`, 'g'),
      literal
    );
  }
  return normalized;
}

function canonicalizeExpressionOperators(expression: string) {
  return expression
    .replace(/\bif\s*\(/gi, '__if(')
    .replace(/\bmin\s*\(/gi, '__min(')
    .replace(/\bmax\s*\(/gi, '__max(')
    .replace(/\bround\s*\(/gi, '__round(')
    .replace(/\bceil\s*\(/gi, '__ceil(')
    .replace(/\bfloor\s*\(/gi, '__floor(')
    .replace(/\babs\s*\(/gi, '__abs(')
    .replace(/\bpow\s*\(/gi, '__pow(')
    .replace(/\band\b/gi, '&&')
    .replace(/\bor\b/gi, '||')
    .replace(/\bnot\b/gi, '!')
    .replace(/<>/g, '!=');
}

function validateNormalizedExpression(expression: string) {
  if (/[;`{}\[\]]/.test(expression)) {
    throw new Error('Unsupported tokens in formula expression');
  }
  const scrubbedExpression = expression.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');
  const identifiers = scrubbedExpression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  for (const identifier of identifiers) {
    if (!ALLOWED_IDENTIFIERS.has(identifier)) {
      throw new Error(`Unsupported identifier "${identifier}" in formula expression`);
    }
  }
}

function normalizeFormulaResult(result: unknown): FormulaValue {
  if (typeof result === 'number') {
    return Number.isFinite(result) ? result : 0;
  }
  if (typeof result === 'boolean') {
    return result;
  }
  if (typeof result === 'string') {
    return result;
  }
  return 0;
}

export function coerceFormulaNumber(value: FormulaValue) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (BOOLEAN_TRUE_PATTERN.test(trimmed)) return 1;
  if (BOOLEAN_FALSE_PATTERN.test(trimmed)) return 0;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function evaluateFormulaExpression(expression: string, values: FormulaVariableMap): FormulaValue {
  const trimmed = expression.trim();
  if (!trimmed) return 0;
  const normalized = canonicalizeExpressionOperators(replaceFormulaTokens(trimmed, values));
  validateNormalizedExpression(normalized);

  const result = Function(
    '__if',
    '__min',
    '__max',
    '__round',
    '__ceil',
    '__floor',
    '__abs',
    '__pow',
    `"use strict"; return (${normalized});`
  )(
    (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
    Math.min,
    Math.max,
    Math.round,
    Math.ceil,
    Math.floor,
    Math.abs,
    Math.pow
  );

  return normalizeFormulaResult(result);
}

export function evaluateNumericFormulaExpression(expression: string, values: FormulaVariableMap) {
  return coerceFormulaNumber(evaluateFormulaExpression(expression, values));
}
