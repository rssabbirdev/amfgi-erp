export type FormulaScope = Record<string, number>;

export type FormulaDayContext = FormulaScope & {
  work_date_index: number;
};

export type SumDaysTrace = Array<{ date: string; amount: number; detail?: string }>;

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'assign' }
  | { type: 'eof' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }
    if (ch === '=') {
      tokens.push({ type: 'assign' });
      i += 1;
      continue;
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if ('>=<'.includes(ch)) {
      if (ch === '>' || ch === '<') {
        if (source[i + 1] === '=') {
          tokens.push({ type: 'op', value: ch + '=' });
          i += 2;
          continue;
        }
        tokens.push({ type: 'op', value: ch });
        i += 1;
        continue;
      }
    }
    if (ch === '!' && source[i + 1] === '=') {
      tokens.push({ type: 'op', value: '!=' });
      i += 2;
      continue;
    }
    if (ch === '=' && source[i + 1] === '=') {
      tokens.push({ type: 'op', value: '==' });
      i += 2;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j += 1;
      const raw = source.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${raw}`);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j += 1;
      tokens.push({ type: 'ident', value: source.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character "${ch}" at position ${i}`);
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

type EvalHooks = {
  sumDays?: (exprSource: string, scope: FormulaScope) => { value: number; trace: SumDaysTrace };
};

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private scope: FormulaScope,
    private hooks: EvalHooks
  ) {}

  private peek() {
    return this.tokens[this.pos] ?? { type: 'eof' as const };
  }

  private consume() {
    const t = this.peek();
    this.pos += 1;
    return t;
  }

  private expectAssign() {
    const t = this.consume();
    if (t.type !== 'assign') throw new Error('Expected "=" in assignment');
  }

  parseExpression(): number {
    return this.parseCompare();
  }

  private parseCompare(): number {
    let left = this.parseAddSub();
    while (true) {
      const t = this.peek();
      if (t.type !== 'op' || !['>=', '<=', '>', '<', '==', '!='].includes(t.value)) break;
      this.consume();
      const right = this.parseAddSub();
      switch (t.value) {
        case '>=':
          left = left >= right ? 1 : 0;
          break;
        case '<=':
          left = left <= right ? 1 : 0;
          break;
        case '>':
          left = left > right ? 1 : 0;
          break;
        case '<':
          left = left < right ? 1 : 0;
          break;
        case '==':
          left = left === right ? 1 : 0;
          break;
        case '!=':
          left = left !== right ? 1 : 0;
          break;
        default:
          break;
      }
    }
    return left;
  }

  private parseAddSub(): number {
    let left = this.parseMulDiv();
    while (true) {
      const t = this.peek();
      if (t.type !== 'op' || (t.value !== '+' && t.value !== '-')) break;
      this.consume();
      const right = this.parseMulDiv();
      left = t.value === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseMulDiv(): number {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type !== 'op' || (t.value !== '*' && t.value !== '/')) break;
      this.consume();
      const right = this.parseUnary();
      if (t.value === '/' && right === 0) throw new Error('Division by zero');
      left = t.value === '*' ? left * right : left / right;
    }
    return left;
  }

  private parseUnary(): number {
    const t = this.peek();
    if (t.type === 'op' && t.value === '-') {
      this.consume();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.consume();
    if (t.type === 'num') return t.value;
    if (t.type === 'ident') {
      if (this.peek().type === 'lparen') return this.parseCall(t.value);
      const v = this.scope[t.value];
      if (v === undefined) throw new Error(`Unknown variable: ${t.value}`);
      return v;
    }
    if (t.type === 'lparen') {
      const v = this.parseExpression();
      if (this.consume().type !== 'rparen') throw new Error('Expected ")"');
      return v;
    }
    throw new Error('Invalid expression');
  }

  private parseCall(name: string): number {
    this.consume(); // (
    const args: number[] = [];
    if (this.peek().type !== 'rparen') {
      args.push(this.parseExpression());
      while (this.peek().type === 'comma') {
        this.consume();
        args.push(this.parseExpression());
      }
    }
    if (this.consume().type !== 'rparen') throw new Error('Expected ")" after function call');

    if (name === 'if') {
      if (args.length !== 3) throw new Error('if(cond, then, else) requires 3 arguments');
      return args[0] !== 0 ? args[1] : args[2];
    }
    if (name === 'min') {
      if (args.length < 2) throw new Error('min requires at least 2 arguments');
      return Math.min(...args);
    }
    if (name === 'max') {
      if (args.length < 2) throw new Error('max requires at least 2 arguments');
      return Math.max(...args);
    }
    if (name === 'round') {
      if (args.length !== 1) throw new Error('round(x) requires 1 argument');
      return Math.round(args[0] * 100) / 100;
    }
    if (name === 'abs') {
      if (args.length !== 1) throw new Error('abs(x) requires 1 argument');
      return Math.abs(args[0]);
    }
    throw new Error(`Unknown function: ${name}`);
  }

  parseAssignmentTarget(): string {
    const t = this.consume();
    if (t.type !== 'ident') throw new Error('Assignment target must be a variable name');
    this.expectAssign();
    return t.value;
  }

  parseExpressionFromTokens(): number {
    const value = this.parseExpression();
    if (this.peek().type !== 'eof') throw new Error('Unexpected tokens after expression');
    return value;
  }
}

export function parseFormulaScript(script: string): Array<{ target: string; expr: string }> {
  const lines = script.split('\n');
  const assignments: Array<{ target: string; expr: string }> = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) throw new Error(`Invalid formula line: ${line}`);
    const target = line.slice(0, eq).trim();
    const expr = line.slice(eq + 1).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(target)) {
      throw new Error(`Invalid variable name: ${target}`);
    }
    if (!expr) throw new Error(`Missing expression for ${target}`);
    assignments.push({ target, expr });
  }
  if (!assignments.some((a) => a.target === 'gross')) {
    throw new Error('Formula must assign gross = ...');
  }
  return assignments;
}

export function evaluateExpression(expr: string, scope: FormulaScope, hooks: EvalHooks = {}): number {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens, scope, hooks);
  return parser.parseExpressionFromTokens();
}

export type FormulaScriptResult = {
  gross: number;
  variables: FormulaScope;
  dayTrace: SumDaysTrace;
};

export function evaluateFormulaScript(
  script: string,
  scope: FormulaScope,
  sumDaysEvaluator: (expr: string, baseScope: FormulaScope) => SumDaysTrace
): FormulaScriptResult {
  const assignments = parseFormulaScript(script);
  const vars: FormulaScope = { ...scope };
  let dayTrace: SumDaysTrace = [];

  for (const { target, expr } of assignments) {
    const hooks: EvalHooks = {
      sumDays: (innerExpr, innerScope) => {
        const trace = sumDaysEvaluator(innerExpr, innerScope);
        const value = trace.reduce((sum, row) => sum + row.amount, 0);
        dayTrace = trace;
        return { value, trace };
      },
    };

    if (expr.includes('sum_days(')) {
      const value = evaluateExpressionWithSumDays(expr, vars, hooks);
      vars[target] = value;
      if (target === 'gross') break;
      continue;
    }

    const value = evaluateExpression(expr, vars, hooks);
    vars[target] = Math.round(value * 100) / 100;
    if (target === 'gross') break;
  }

  if (vars.gross === undefined) throw new Error('Formula did not produce gross');
  return { gross: vars.gross, variables: vars, dayTrace };
}

function evaluateExpressionWithSumDays(expr: string, scope: FormulaScope, hooks: EvalHooks): number {
  const re = /sum_days\s*\(/g;
  let match = re.exec(expr);
  if (!match) return evaluateExpression(expr, scope, hooks);

  let resultExpr = '';
  let lastIndex = 0;
  const mutableScope = { ...scope };

  while (match) {
    resultExpr += expr.slice(lastIndex, match.index);
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < expr.length && depth > 0) {
      if (expr[i] === '(') depth += 1;
      if (expr[i] === ')') depth -= 1;
      i += 1;
    }
    if (depth !== 0) throw new Error('Unclosed sum_days(');
    const innerExpr = expr.slice(start, i - 1);
    const hook = hooks.sumDays;
    if (!hook) throw new Error('sum_days is not available in this context');
    const { value } = hook(innerExpr, mutableScope);
    const placeholder = `__sum_${match.index}`;
    mutableScope[placeholder] = value;
    resultExpr += placeholder;
    lastIndex = i;
    match = re.exec(expr);
  }
  resultExpr += expr.slice(lastIndex);
  return evaluateExpression(resultExpr, mutableScope, hooks);
}

export const FORMULA_VARIABLE_GROUPS = [
  {
    label: 'Compensation',
    vars: ['monthly_basic', 'monthly_allowance', 'daily_rate'],
  },
  {
    label: 'Calendar',
    vars: ['days_in_month', 'sundays_in_month', 'denom_days'],
  },
  {
    label: 'Attendance totals',
    vars: [
      'absent_days',
      'leave_days',
      'paid_leave_days',
      'present_days',
      'worked_hours_total',
    ],
  },
  {
    label: 'Config',
    vars: ['ot_percent', 'ot_divisor', 'basic_hours'],
  },
  {
    label: 'Per day (inside sum_days)',
    vars: [
      'worked_hours',
      'worked_minutes',
      'basic_hours',
      'is_absent',
      'is_leave',
      'is_paid_leave',
      'is_present',
      'is_sunday',
      'is_excluded_day',
    ],
  },
] as const;

export const FORMULA_FUNCTIONS = [
  'if(cond, then, else)',
  'min(a, b, ...)',
  'max(a, b, ...)',
  'round(x)',
  'abs(x)',
  'sum_days(expr)',
] as const;
