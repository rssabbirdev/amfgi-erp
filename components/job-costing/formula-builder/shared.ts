import type { Material } from '@/store/api/endpoints/materials';
import {
  coerceFormulaNumber,
  evaluateFormulaExpression,
  evaluateNumericFormulaExpression,
  normalizeFormulaValue,
  resolveMaterialWastePercent,
  tryEvaluateFormulaExpression,
  type FormulaVariableMap,
} from '@/lib/job-costing/expressionEvaluator';

export type FieldType =
  | 'number'
  | 'percent'
  | 'length'
  | 'area'
  | 'volume'
  | 'count'
  | 'boolean'
  | 'select'
  | 'text'
  | 'material'
  | 'stored';
export type FieldScope = 'measurement' | 'variable';

export type DynamicField = {
  id: string;
  key: string;
  label: string;
  inputType: FieldType;
  unit: string;
  defaultMaterialId?: string;
  defaultValue?: string;
  /** Fixed number or formula expression when inputType is `stored`. */
  storedValue?: string;
  required: boolean;
  scope?: FieldScope;
};

export type MaterialRule = {
  id: string;
  materialSource: 'fixed' | 'global';
  materialId: string;
  materialSelectorKey: string;
  quantityExpression: string;
  wastePercent: string;
};

export type LaborRule = {
  id: string;
  expertiseName: string;
  quantityExpression: string;
  crewSizeExpression: string;
  productivityPerWorkerPerDay: string;
  scheduleDaysExpression: string;
};

export type FormulaConstantField = {
  id: string;
  key: string;
  label: string;
  value: string;
  unit: string;
};

export type AreaRule = {
  id: string;
  key: string;
  label: string;
  dynamic: boolean;
  fields: DynamicField[];
  formulaValues: FormulaConstantField[];
  materials: MaterialRule[];
  labor: LaborRule[];
};

export type BuilderState = {
  name: string;
  slug: string;
  fabricationType: string;
  description: string;
  globalFields: DynamicField[];
  formulaConstants: FormulaConstantField[];
  areas: AreaRule[];
};

export type PlaygroundValues = Record<string, string>;

export type PlaygroundAreaInstance = {
  id: string;
  label: string;
};

export function playgroundInstancesMetaKey(areaId: string) {
  return `playgroundInstances.${areaId}`;
}

export function playgroundInstanceValueKey(areaKey: string, instanceId: string, fieldKey: string) {
  return `areaInstance.${areaKey}.${instanceId}.${fieldKey}`;
}

export function parsePlaygroundAreaInstances(area: AreaRule, values: PlaygroundValues): PlaygroundAreaInstance[] {
  if (!area.dynamic) return [];

  const metaRaw = values[playgroundInstancesMetaKey(area.id)];
  if (metaRaw) {
    try {
      const parsed = JSON.parse(metaRaw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const instances = parsed.flatMap((item, index): PlaygroundAreaInstance[] => {
          if (!isRecord(item) || typeof item.id !== 'string') return [];
          const label =
            typeof item.label === 'string' && item.label.trim()
              ? item.label.trim()
              : `${area.label || area.key || 'Area'} ${index + 1}`;
          return [{ id: item.id, label }];
        });
        if (instances.length > 0) return instances;
      }
    } catch {
      // Fall through to key inference.
    }
  }

  const areaKey = area.key.trim();
  if (!areaKey) return [{ id: `${area.id}-instance-1`, label: `${area.label || 'Area'} 1` }];

  const instanceIds = new Set<string>();
  const prefix = `areaInstance.${areaKey}.`;
  for (const key of Object.keys(values)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const instanceId = rest.split('.')[0];
    if (instanceId) instanceIds.add(instanceId);
  }

  if (instanceIds.size > 0) {
    return Array.from(instanceIds).map((id, index) => ({
      id,
      label: `${area.label || area.key || 'Area'} ${index + 1}`,
    }));
  }

  return [{ id: `${area.id}-instance-1`, label: `${area.label || area.key || 'Area'} 1` }];
}

export function writePlaygroundInstancesMeta(
  values: PlaygroundValues,
  areaId: string,
  instances: PlaygroundAreaInstance[],
): PlaygroundValues {
  return {
    ...values,
    [playgroundInstancesMetaKey(areaId)]: JSON.stringify(
      instances.map((instance) => ({ id: instance.id, label: instance.label })),
    ),
  };
}

export function addPlaygroundAreaInstance(
  area: AreaRule,
  values: PlaygroundValues,
): PlaygroundValues {
  const instances = parsePlaygroundAreaInstances(area, values);
  const nextInstance: PlaygroundAreaInstance = {
    id: uid('pg-instance'),
    label: `${area.label || area.key || 'Area'} ${instances.length + 1}`,
  };
  return writePlaygroundInstancesMeta(values, area.id, [...instances, nextInstance]);
}

export function duplicatePlaygroundAreaInstance(
  area: AreaRule,
  values: PlaygroundValues,
  sourceInstanceId: string,
): PlaygroundValues {
  const instances = parsePlaygroundAreaInstances(area, values);
  const source = instances.find((instance) => instance.id === sourceInstanceId);
  if (!source) return values;

  const nextInstance: PlaygroundAreaInstance = {
    id: uid('pg-instance'),
    label: `${source.label || area.label || 'Area'} Copy`,
  };
  const areaKey = area.key.trim();
  const nextValues = writePlaygroundInstancesMeta(values, area.id, [...instances, nextInstance]);
  for (const field of area.fields ?? []) {
    const fieldKey = field.key.trim();
    if (!fieldKey) continue;
    nextValues[playgroundInstanceValueKey(areaKey, nextInstance.id, fieldKey)] =
      values[playgroundInstanceValueKey(areaKey, sourceInstanceId, fieldKey)] ?? '';
  }
  return nextValues;
}

export function removePlaygroundAreaInstance(
  area: AreaRule,
  values: PlaygroundValues,
  instanceId: string,
): PlaygroundValues {
  const instances = parsePlaygroundAreaInstances(area, values);
  if (instances.length <= 1) return values;

  const areaKey = area.key.trim();
  const nextValues = { ...values };
  for (const field of area.fields ?? []) {
    const fieldKey = field.key.trim();
    if (!fieldKey) continue;
    delete nextValues[playgroundInstanceValueKey(areaKey, instanceId, fieldKey)];
  }
  return writePlaygroundInstancesMeta(
    nextValues,
    area.id,
    instances.filter((instance) => instance.id !== instanceId),
  );
}

export function updatePlaygroundAreaInstanceLabel(
  area: AreaRule,
  values: PlaygroundValues,
  instanceId: string,
  label: string,
): PlaygroundValues {
  const instances = parsePlaygroundAreaInstances(area, values).map((instance) =>
    instance.id === instanceId ? { ...instance, label } : instance,
  );
  return writePlaygroundInstancesMeta(values, area.id, instances);
}

export function migrateAreaPlaygroundValuesToDynamic(area: AreaRule, values: PlaygroundValues): PlaygroundValues {
  const areaKey = area.key.trim();
  if (!areaKey) return values;

  const existingInstances = parsePlaygroundAreaInstances(area, values);
  const primaryInstance = existingInstances[0] ?? {
    id: `${area.id}-instance-1`,
    label: `${area.label || area.key || 'Area'} 1`,
  };
  const instances = existingInstances.length > 0 ? existingInstances : [primaryInstance];
  let next = writePlaygroundInstancesMeta(values, area.id, instances);

  for (const field of area.fields ?? []) {
    const fieldKey = field.key.trim();
    if (!fieldKey) continue;
    const staticKey = `area.${area.id}.${field.key}`;
    const instanceKey = playgroundInstanceValueKey(areaKey, primaryInstance.id, fieldKey);
    if (!next[instanceKey]?.trim() && next[staticKey]?.trim()) {
      next = { ...next, [instanceKey]: next[staticKey] };
    } else if (!next[instanceKey]?.trim() && field.defaultValue?.trim()) {
      next = { ...next, [instanceKey]: field.defaultValue };
    }
  }

  return next;
}

export function hydratePlaygroundDynamicAreas(form: BuilderState, values: PlaygroundValues): PlaygroundValues {
  let next = values;
  for (const area of form.areas) {
    if (!area.dynamic) continue;
    next = migrateAreaPlaygroundValuesToDynamic(area, next);
  }
  return next;
}

export function buildAreaScopedPlaygroundValues(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  instanceId?: string
) {
  const resolvedValues = buildPlaygroundBaseValues(form, values);
  const areaKey = area.key.trim();

  if (area.dynamic) {
    const instances = parsePlaygroundAreaInstances(area, values);
    const instance = instanceId
      ? instances.find((item) => item.id === instanceId)
      : instances[0];
    if (!instance || !areaKey) return resolvedValues;
    for (const field of area.fields ?? []) {
      const fieldKey = field.key.trim();
      if (!fieldKey) continue;
      const parsed = parsePlaygroundValue(
        resolveAreaFieldFormValue(
          field,
          values[playgroundInstanceValueKey(areaKey, instance.id, field.key)]
        ),
        field.inputType
      );
      resolvedValues[`areas.${areaKey}.${fieldKey}`] = parsed;
      resolvedValues[`area.${fieldKey}`] = parsed;
    }
  } else {
    addScopedAreaPlaygroundValues(resolvedValues, [area], values);
    for (const field of area.fields ?? []) {
      const fieldKey = field.key.trim();
      if (!fieldKey) continue;
      resolvedValues[`area.${fieldKey}`] = parsePlaygroundValue(
        resolveAreaFieldFormValue(field, values[`area.${area.id}.${field.key}`]),
        field.inputType
      );
    }
  }

  applyResolvedFormulaFields(
    resolvedValues,
    resolveStoredFormulaConstants(form),
    'specs.global.',
    buildGlobalFormulaOverrideMap(resolveStoredFormulaConstants(form), values)
  );
  applyResolvedFormulaFields(
    resolvedValues,
    area.formulaValues ?? [],
    'area.formula.',
    buildAreaFormulaOverrideMap(area.id, area.formulaValues ?? [], values)
  );
  return resolvedValues;
}

export function formatPossibleFormulaOutput(value: unknown) {
  if (typeof value === 'number') return formatPreviewQty(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value || '--';
  return '--';
}

export function formatFormulaPreviewResult(expression: string, values: FormulaVariableMap) {
  const result = tryEvaluateFormulaExpression(expression, values);
  if (!result.ok) return `Error: ${result.error}`;
  return formatPossibleFormulaOutput(result.value);
}

export function forEachAreaPlaygroundInstance(
  area: AreaRule,
  values: PlaygroundValues,
  iterate: (instanceId: string | undefined) => void
) {
  if (!area.dynamic) {
    iterate(undefined);
    return;
  }
  for (const instance of parsePlaygroundAreaInstances(area, values)) {
    iterate(instance.id);
  }
}

export function evaluateAreaExpressionAcrossInstances(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  expression: string
) {
  const results: unknown[] = [];
  forEachAreaPlaygroundInstance(area, values, (instanceId) => {
    const resolved = buildAreaScopedPlaygroundValues(form, values, area, instanceId);
    results.push(evaluatePlaygroundExpression(expression || '0', resolved));
  });
  return results;
}

export function formatAreaExpressionOutputPreview(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  expression: string
) {
  const trimmed = expression.trim();
  if (!trimmed) return '--';

  const previews: string[] = [];
  forEachAreaPlaygroundInstance(area, values, (instanceId) => {
    const resolved = buildAreaScopedPlaygroundValues(form, values, area, instanceId);
    previews.push(formatFormulaPreviewResult(trimmed, resolved));
  });

  if (previews.length === 0) return '--';
  if (previews.length === 1) return previews[0] ?? '--';
  if (previews.every((preview) => preview === previews[0])) return previews[0] ?? '--';
  return `${previews.length} rows`;
}

export function formatAreaMaterialRuleOutputPreview(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  rule: MaterialRule,
  materialUnit?: string
) {
  let quantityTotal = 0;
  let finalQuantityTotal = 0;
  let wastePercentTotal = 0;
  let rowCount = 0;

  let evaluationError: string | null = null;

  forEachAreaPlaygroundInstance(area, values, (instanceId) => {
    if (evaluationError) return;
    rowCount += 1;
    const resolved = buildAreaScopedPlaygroundValues(form, values, area, instanceId);
    const quantityResult = tryEvaluateFormulaExpression(rule.quantityExpression || '0', resolved);
    if (!quantityResult.ok) {
      evaluationError = quantityResult.error;
      return;
    }
    const quantity = Number(quantityResult.value);
    const wastePercent = resolveMaterialWastePercent(rule.wastePercent, resolved);
    quantityTotal += quantity;
    wastePercentTotal += wastePercent;
    finalQuantityTotal += quantity * (1 + wastePercent / 100);
  });

  if (evaluationError) return `Error: ${evaluationError}`;

  const averageWastePercent = rowCount > 0 ? wastePercentTotal / rowCount : 0;
  const unitSuffix = materialUnit?.trim() ? ` ${materialUnit.trim()}` : '';
  const rowNote = area.dynamic && rowCount > 1 ? ` • ${rowCount} rows` : '';
  const parts = [`Qty ${formatPreviewQty(quantityTotal)}${unitSuffix}${rowNote}`];
  if (averageWastePercent) parts.push(`Final ${formatPreviewQty(finalQuantityTotal)}${unitSuffix}`);
  if (averageWastePercent) parts.push(`Waste ${formatPreviewQty(averageWastePercent)}%`);
  return parts.join(' • ');
}

export function formatMaterialWastePercentPreview(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  expression: string
) {
  const trimmed = expression.trim();
  if (!trimmed) return '0%';

  const results: number[] = [];
  let evaluationError: string | null = null;
  forEachAreaPlaygroundInstance(area, values, (instanceId) => {
    if (evaluationError) return;
    const resolved = buildAreaScopedPlaygroundValues(form, values, area, instanceId);
    const result = tryEvaluateFormulaExpression(trimmed, resolved);
    if (!result.ok) {
      evaluationError = result.error;
      return;
    }
    results.push(resolveMaterialWastePercent(trimmed, resolved));
  });

  if (evaluationError) return `Error: ${evaluationError}`;

  if (results.length === 0) return '0%';
  if (results.every((value) => Object.is(value, results[0]))) {
    return `${formatPreviewQty(results[0] ?? 0)}%`;
  }

  const average = results.reduce((sum, value) => sum + value, 0) / results.length;
  return `${formatPreviewQty(average)}% avg (${results.length} rows)`;
}

export function resolveLaborRuleMetrics(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  rule: LaborRule,
  instanceId?: string
) {
  const resolved = buildAreaScopedPlaygroundValues(form, values, area, instanceId);
  const quantityResult = tryEvaluateFormulaExpression(rule.quantityExpression || '0', resolved);
  const quantity = quantityResult.ok ? coerceFormulaNumber(quantityResult.value) : 0;

  const crewExpression = rule.crewSizeExpression.trim() ? rule.crewSizeExpression : '1';
  const crewResult = tryEvaluateFormulaExpression(crewExpression, resolved);
  const crewEvaluated = crewResult.ok ? coerceFormulaNumber(crewResult.value) : 1;
  const crew = Math.max(1, Math.ceil(crewEvaluated));

  const productivityExpression = rule.productivityPerWorkerPerDay.trim()
    ? rule.productivityPerWorkerPerDay
    : '0';
  const productivityResult = tryEvaluateFormulaExpression(productivityExpression, resolved);
  const productivity = productivityResult.ok
    ? Math.max(coerceFormulaNumber(productivityResult.value), 0.0001)
    : 0.0001;

  const baseDays = quantity > 0 ? quantity / (crew * productivity) : 0;

  return { resolved, quantity, crew, productivity, baseDays };
}

export function resolveAggregateLaborRuleMetrics(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  rule: LaborRule
) {
  const instanceIds: Array<string | undefined> = area.dynamic
    ? parsePlaygroundAreaInstances(area, values).map((instance) => instance.id)
    : [undefined];

  if (instanceIds.length === 0) {
    return {
      resolved: buildAreaScopedPlaygroundValues(form, values, area, undefined),
      quantity: 0,
      crew: 1,
      productivity: 0.0001,
      baseDays: 0,
      rowCount: 0,
    };
  }

  let quantityTotal = 0;
  let baseDaysTotal = 0;
  let lastMetrics = resolveLaborRuleMetrics(form, values, area, rule, instanceIds[0]);

  for (const instanceId of instanceIds) {
    const metrics = resolveLaborRuleMetrics(form, values, area, rule, instanceId);
    quantityTotal += metrics.quantity;
    baseDaysTotal += metrics.baseDays;
    lastMetrics = metrics;
  }

  return {
    resolved: lastMetrics.resolved,
    quantity: quantityTotal,
    crew: lastMetrics.crew,
    productivity: lastMetrics.productivity,
    baseDays: baseDaysTotal,
    rowCount: instanceIds.length,
  };
}

export function appendLaborScheduleVariables(
  resolved: FormulaVariableMap,
  metrics: { quantity: number; crew: number; productivity: number; baseDays: number }
) {
  resolved['labor.quantity'] = metrics.quantity;
  resolved['labor.crew'] = metrics.crew;
  resolved['labor.productivity'] = metrics.productivity;
  resolved['labor.baseDays'] = metrics.baseDays;
  resolved['labor.days'] = metrics.baseDays;
}

export function evaluateLaborScheduleDays(
  rule: LaborRule,
  resolved: FormulaVariableMap,
  metrics: { quantity: number; crew: number; productivity: number; baseDays: number }
) {
  const scheduleValues = { ...resolved };
  appendLaborScheduleVariables(scheduleValues, metrics);
  const expression = rule.scheduleDaysExpression.trim();
  if (!expression) return metrics.baseDays;
  const result = tryEvaluateFormulaExpression(expression, scheduleValues);
  if (!result.ok) return null;
  return coerceFormulaNumber(result.value);
}

export function formatLaborScheduleDaysExpressionPreview(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  rule: LaborRule,
  expression: string
) {
  const trimmed = expression.trim();
  const aggregate = resolveAggregateLaborRuleMetrics(form, values, area, rule);
  const ruleWithExpression = { ...rule, scheduleDaysExpression: trimmed };

  if (!trimmed) {
    return `${formatPreviewQty(aggregate.baseDays)} days`;
  }

  const days = evaluateLaborScheduleDays(ruleWithExpression, aggregate.resolved, aggregate);
  if (days === null) {
    const scheduleValues = { ...aggregate.resolved };
    appendLaborScheduleVariables(scheduleValues, aggregate);
    const result = tryEvaluateFormulaExpression(trimmed, scheduleValues);
    return result.ok ? 'Error: Invalid schedule days expression' : `Error: ${result.error}`;
  }

  return `${formatPreviewQty(days)} days`;
}

export function formatAreaLaborRuleOutputPreview(
  form: BuilderState,
  values: PlaygroundValues,
  area: AreaRule,
  rule: LaborRule
) {
  const aggregate = resolveAggregateLaborRuleMetrics(form, values, area, rule);
  const days = evaluateLaborScheduleDays(rule, aggregate.resolved, aggregate);
  if (days === null) {
    const scheduleValues = { ...aggregate.resolved };
    appendLaborScheduleVariables(scheduleValues, aggregate);
    const result = tryEvaluateFormulaExpression(rule.scheduleDaysExpression.trim(), scheduleValues);
    return result.ok ? 'Error: Invalid schedule days expression' : `Error: ${result.error}`;
  }

  const rowNote = area.dynamic && aggregate.rowCount > 1 ? ` • ${aggregate.rowCount} rows` : '';
  const parts = [
    `Qty ${formatPreviewQty(aggregate.quantity)}${rowNote}`,
    `Crew ${formatPreviewQty(aggregate.crew)}`,
    `Prod ${formatPreviewQty(aggregate.productivity)}/day`,
  ];
  if (days > 0) parts.push(`Days ${formatPreviewQty(days)}`);
  return parts.join(' • ');
}

export type FormulaOverrideMap = Record<string, string>;

export type PlaygroundMaterialLine = {
  key: string;
  areaLabel: string;
  materialName: string;
  quantity: number;
  wastePercent: number;
  finalQuantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  source: string;
};

export type FormulaToken = {
  token: string;
  label: string;
  group: 'Job input' | 'Formula value' | 'Stored value' | 'Area input' | 'Function' | 'Labor result';
};

export const FORMULA_MATH_FUNCTION_TOKENS: FormulaToken[] = [
  { token: 'floor(', label: 'floor — round down', group: 'Function' },
  { token: 'ceil(', label: 'ceil — round up', group: 'Function' },
  { token: 'round(', label: 'round — nearest integer or decimals', group: 'Function' },
];

export const LABOR_SCHEDULE_TOKENS: FormulaToken[] = [
  { token: 'labor.quantity', label: 'Evaluated work quantity', group: 'Labor result' },
  { token: 'labor.crew', label: 'Evaluated crew size', group: 'Labor result' },
  { token: 'labor.productivity', label: 'Evaluated productivity per worker per day', group: 'Labor result' },
  { token: 'labor.days', label: 'Base schedule days before rounding', group: 'Labor result' },
  { token: 'labor.baseDays', label: 'Same as labor.days', group: 'Labor result' },
];

export function buildLaborScheduleTokens(): FormulaToken[] {
  return LABOR_SCHEDULE_TOKENS;
}

export function buildFormulaMathFunctionTokens(): FormulaToken[] {
  return FORMULA_MATH_FUNCTION_TOKENS;
}

export function matchesFormulaTokenQuery(item: FormulaToken, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (
    item.token.toLowerCase().includes(normalized) ||
    item.label.toLowerCase().includes(normalized) ||
    item.group.toLowerCase().includes(normalized)
  );
}

const FORMULA_TOKEN_GROUP_PRIORITY: Record<FormulaToken['group'], number> = {
  'Stored value': 0,
  'Job input': 1,
  'Formula value': 2,
  'Area input': 3,
  'Labor result': 4,
  'Function': 5,
};

export function dedupeFormulaTokens(tokens: FormulaToken[]): FormulaToken[] {
  const byToken = new Map<string, FormulaToken>();
  for (const token of tokens) {
    const existing = byToken.get(token.token);
    if (!existing) {
      byToken.set(token.token, token);
      continue;
    }
    const existingPriority = FORMULA_TOKEN_GROUP_PRIORITY[existing.group] ?? 99;
    const nextPriority = FORMULA_TOKEN_GROUP_PRIORITY[token.group] ?? 99;
    if (nextPriority < existingPriority) {
      byToken.set(token.token, token);
    }
  }
  return Array.from(byToken.values());
}

export function migrateGlobalFormulaTokenPrefix(expression: string, globalKeys: string[]) {
  let next = expression;
  for (const key of globalKeys) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    next = replaceExpressionToken(next, `formula.${normalizedKey}`, `specs.global.${normalizedKey}`);
  }
  return next;
}

export function migrateBuilderStateFormulaTokens(state: BuilderState): BuilderState {
  const globalKeys = state.globalFields.map((field) => field.key.trim()).filter(Boolean);
  const migrate = (value: string) => migrateGlobalFormulaTokenPrefix(value, globalKeys);

  return {
    ...state,
    globalFields: state.globalFields.map((field) =>
      isStoredGlobalField(field)
        ? { ...field, storedValue: migrate(field.storedValue ?? '') }
        : field
    ),
    formulaConstants: state.formulaConstants.map((field) => ({
      ...field,
      value: migrate(field.value),
    })),
    areas: state.areas.map((area) => ({
      ...area,
      formulaValues: (area.formulaValues ?? []).map((field) => ({
        ...field,
        value: migrate(field.value),
      })),
      materials: (area.materials ?? []).map((rule) => ({
        ...rule,
        quantityExpression: migrate(rule.quantityExpression),
      })),
      labor: (area.labor ?? []).map((rule) => ({
        ...rule,
        quantityExpression: migrate(rule.quantityExpression),
        crewSizeExpression: migrate(rule.crewSizeExpression),
        productivityPerWorkerPerDay: migrate(rule.productivityPerWorkerPerDay),
        scheduleDaysExpression: migrate(rule.scheduleDaysExpression),
      })),
    })),
  };
}

export const FIELD_TYPES: FieldType[] = [
  'number',
  'percent',
  'length',
  'area',
  'volume',
  'count',
  'boolean',
  'select',
  'text',
  'material',
  'stored',
];

export function isStoredGlobalField(field: { inputType?: string }) {
  return field.inputType === 'stored';
}

export function formulaConstantToGlobalField(constant: FormulaConstantField): DynamicField {
  return {
    id: constant.id,
    key: constant.key,
    label: constant.label,
    inputType: 'stored',
    unit: constant.unit,
    storedValue: constant.value,
    defaultMaterialId: '',
    defaultValue: '',
    required: false,
  };
}

export function getStoredFormulaConstants(fields: DynamicField[]): FormulaConstantField[] {
  return fields.filter(isStoredGlobalField).map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    value: field.storedValue ?? '',
    unit: field.unit,
  }));
}

export function resolveStoredFormulaConstants(form: BuilderState): FormulaConstantField[] {
  const fromGlobals = getStoredFormulaConstants(form.globalFields);
  return fromGlobals.length > 0 ? fromGlobals : (form.formulaConstants ?? []);
}

export function mergeGlobalFieldsWithFormulaConstants(
  globalFields: DynamicField[],
  formulaConstants: FormulaConstantField[]
): DynamicField[] {
  const storedByKey = new Map<string, DynamicField>();
  const userFields = globalFields.filter((field) => {
    if (isStoredGlobalField(field)) {
      const key = field.key.trim();
      if (key) storedByKey.set(key, field);
      return false;
    }
    return true;
  });

  for (const constant of formulaConstants) {
    const key = constant.key.trim();
    if (!key || storedByKey.has(key)) continue;
    const userIndex = userFields.findIndex((field) => field.key.trim() === key);
    if (userIndex >= 0) {
      userFields.splice(userIndex, 1);
    }
    storedByKey.set(key, formulaConstantToGlobalField(constant));
  }

  return [...userFields, ...Array.from(storedByKey.values())];
}

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function describeFieldType(inputType: FieldType) {
  switch (inputType) {
    case 'material':
      return 'Material choice';
    case 'percent':
      return 'Percentage';
    case 'length':
      return 'Length';
    case 'area':
      return 'Area';
    case 'volume':
      return 'Volume';
    case 'count':
      return 'Count';
    case 'boolean':
      return 'Yes/No';
    case 'select':
      return 'Select option';
    case 'text':
      return 'Text';
    case 'stored':
      return 'Stored value';
    default:
      return 'Number';
  }
}

export function describeMaterialRule(rule: MaterialRule) {
  const source = rule.materialSource === 'global' ? 'selected material' : 'fixed material';
  return `Use ${source} with quantity from ${rule.quantityExpression || 'formula'}`;
}

export function describeLaborRule(rule: LaborRule) {
  const expertise = rule.expertiseName || 'labor team';
  const quantity = rule.quantityExpression || '1';
  const productivity = rule.productivityPerWorkerPerDay || 'productivity';
  return `${expertise} works on ${quantity} with ${productivity} per worker/day`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

export function normalizeSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

export function normalizeFormulaKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceExpressionToken(value: string, previousToken: string, nextToken: string) {
  if (!previousToken || previousToken === nextToken) return value;
  return value.replace(
    new RegExp(`(?<![A-Za-z0-9_.])${escapeRegex(previousToken)}(?![A-Za-z0-9_.])`, 'g'),
    nextToken
  );
}

export function renameFormulaReferences(state: BuilderState, previousKey: string, nextKey: string): BuilderState {
  const fromGlobalToken = previousKey ? `specs.global.${previousKey}` : '';
  const toGlobalToken = nextKey ? `specs.global.${nextKey}` : '';
  const fromFormulaToken = previousKey ? `formula.${previousKey}` : '';
  const toFormulaToken = nextKey ? `formula.${nextKey}` : '';
  if (!fromGlobalToken || !toGlobalToken || fromGlobalToken === toGlobalToken) return state;

  const migrateStoredExpression = (value: string) => {
    let next = replaceExpressionToken(value, fromGlobalToken, toGlobalToken);
    if (fromFormulaToken && toGlobalToken) {
      next = replaceExpressionToken(next, fromFormulaToken, toGlobalToken);
    }
    return next;
  };

  return {
    ...state,
    globalFields: state.globalFields.map((field) =>
      isStoredGlobalField(field)
        ? {
            ...field,
            storedValue: migrateStoredExpression(field.storedValue ?? ''),
          }
        : field
    ),
    formulaConstants: state.formulaConstants.map((field) => ({
      ...field,
      value: migrateStoredExpression(field.value),
    })),
    areas: state.areas.map((area) => ({
      ...area,
      formulaValues: (area.formulaValues ?? []).map((field) => ({
        ...field,
        value: migrateStoredExpression(field.value),
      })),
      materials: (area.materials ?? []).map((rule) => ({
        ...rule,
        quantityExpression: migrateStoredExpression(rule.quantityExpression),
      })),
      labor: (area.labor ?? []).map((rule) => ({
        ...rule,
        quantityExpression: migrateStoredExpression(rule.quantityExpression),
        crewSizeExpression: migrateStoredExpression(rule.crewSizeExpression),
        productivityPerWorkerPerDay: migrateStoredExpression(rule.productivityPerWorkerPerDay),
        scheduleDaysExpression: migrateStoredExpression(rule.scheduleDaysExpression),
      })),
    })),
  };
}

export function getTokenChipClasses(group: FormulaToken['group']) {
  switch (group) {
    case 'Job input':
      return 'border-sky-200 bg-sky-100/80 text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-100';
    case 'Formula value':
      return 'border-cyan-200 bg-cyan-100/80 text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-500/15 dark:text-cyan-100';
    case 'Stored value':
      return 'border-teal-200 bg-teal-100/80 text-teal-900 dark:border-teal-500/20 dark:bg-teal-500/15 dark:text-teal-100';
    case 'Area input':
      return 'border-emerald-200 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100';
    case 'Function':
      return 'border-violet-200 bg-violet-100/80 text-violet-900 dark:border-violet-500/20 dark:bg-violet-500/15 dark:text-violet-100';
    case 'Labor result':
      return 'border-amber-200 bg-amber-100/80 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-100';
    default:
      return 'border-slate-200 bg-slate-100/80 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  }
}

export function getCompactTokenLabel(token: FormulaToken) {
  const source = (token.label || token.token).trim();
  if (source.length <= 18) return source;
  const condensed = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  if (condensed && condensed.length <= 18) return condensed;
  return `${source.slice(0, 15)}...`;
}

export function tokenizeExpressionDisplay(value: string, tokens: FormulaToken[]) {
  const uniqueTokens = Array.from(new Map(tokens.map((token) => [token.token, token])).values())
    .filter((token) => token.token.trim())
    .sort((a, b) => b.token.length - a.token.length);

  if (!value || uniqueTokens.length === 0) {
    return [{ type: 'text' as const, text: value }];
  }

  const pattern = new RegExp(uniqueTokens.map((token) => escapeRegex(token.token)).join('|'), 'g');
  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'token'; text: string; token: FormulaToken }
  > = [];

  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    const matchedText = match[0] ?? '';
    if (index > lastIndex) {
      parts.push({ type: 'text', text: value.slice(lastIndex, index) });
    }
    const token = uniqueTokens.find((item) => item.token === matchedText);
    if (token) {
      parts.push({ type: 'token', text: matchedText, token });
    } else {
      parts.push({ type: 'text', text: matchedText });
    }
    lastIndex = index + matchedText.length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: 'text', text: value.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text' as const, text: value }];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function reorderItemsById<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
  const from = items.findIndex((item) => item.id === sourceId);
  const to = items.findIndex((item) => item.id === targetId);
  return moveArrayItem(items, from, to);
}

export function newField(scope?: FieldScope): DynamicField {
  return {
    id: uid('field'),
    key: '',
    label: '',
    inputType: 'number',
    unit: '',
    defaultMaterialId: '',
    defaultValue: '',
    required: true,
    scope,
  };
}

export function coerceFieldDefaultValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

export function resolveGlobalFieldFormValue(
  field: { inputType?: FieldType | string; defaultMaterialId?: string; defaultValue?: string },
  rawValue?: string
) {
  if (field.inputType === 'material') {
    return (rawValue ?? '').trim() || field.defaultMaterialId || '';
  }
  return (rawValue ?? '').trim() || field.defaultValue || '';
}

export const resolveAreaFieldFormValue = resolveGlobalFieldFormValue;

export function newMaterialRule(): MaterialRule {
  return {
    id: uid('material'),
    materialSource: 'fixed',
    materialId: '',
    materialSelectorKey: '',
    quantityExpression: '',
    wastePercent: '0',
  };
}

export function newLaborRule(): LaborRule {
  return {
    id: uid('labor'),
    expertiseName: '',
    quantityExpression: '',
    crewSizeExpression: '',
    productivityPerWorkerPerDay: '',
    scheduleDaysExpression: '',
  };
}

export function newArea(): AreaRule {
  return {
    id: uid('area'),
    key: '',
    label: '',
    dynamic: false,
    fields: [],
    formulaValues: [],
    materials: [],
    labor: [],
  };
}

export function newFormulaConstant(): FormulaConstantField {
  return {
    id: uid('const'),
    key: '',
    label: '',
    value: '',
    unit: '',
  };
}

export function parseFormulaConstantValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : trimmed;
}

export function getGlobalFormulaOverrideKey(key: string) {
  return `formulaOverride.global.${key}`;
}

export function getAreaFormulaOverrideKey(areaIdOrKey: string, key: string) {
  return `formulaOverride.area.${areaIdOrKey}.${key}`;
}

export function buildGlobalFormulaOverrideMap(
  fields: FormulaConstantField[],
  values: PlaygroundValues
): FormulaOverrideMap {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const key = field.key.trim();
      if (!key) return [];
      const value = values[getGlobalFormulaOverrideKey(key)]?.trim();
      return value ? [[key, value]] : [];
    })
  );
}

export function buildAreaFormulaOverrideMap(
  areaIdOrKey: string,
  fields: FormulaConstantField[],
  values: PlaygroundValues
): FormulaOverrideMap {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const key = field.key.trim();
      if (!key) return [];
      const value = values[getAreaFormulaOverrideKey(areaIdOrKey, key)]?.trim();
      return value ? [[key, value]] : [];
    })
  );
}

export function formatPreviewMoney(value: number) {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatPreviewQty(value: number) {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '0';
}

export function parsePlaygroundValue(value: string, inputType?: FieldType) {
  if (inputType === 'boolean') {
    return normalizeFormulaValue(value);
  }
  if (['number', 'percent', 'length', 'area', 'volume', 'count'].includes(inputType ?? 'number')) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return normalizeFormulaValue(value);
}

export function evaluatePlaygroundExpression(expression: string, values: FormulaVariableMap) {
  const result = tryEvaluateFormulaExpression(expression, values);
  if (!result.ok) return 0;
  return result.value;
}

export function applyResolvedFormulaFields(
  values: FormulaVariableMap,
  fields: Array<{ key: string; value: string }>,
  tokenPrefix: 'formula.' | 'area.formula.' | 'specs.global.',
  overrides: FormulaOverrideMap = {}
) {
  const fieldMap = new Map<string, string>();
  for (const field of fields) {
    const key = field.key.trim();
    if (!key) continue;
    fieldMap.set(key, field.value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    const normalizedKey = key.trim();
    if (!normalizedKey || !value.trim()) continue;
    fieldMap.set(normalizedKey, value);
  }
  const activeFields = Array.from(fieldMap.entries()).map(([key, value]) => ({ key, value }));
  const maxPasses = Math.max(activeFields.length, 1);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

    if (tokenPrefix === 'specs.global.') {
      for (const field of activeFields) {
        const key = field.key.trim();
        if (!key) continue;
        values[`formula.${key}`] = values[`specs.global.${key}`];
      }
    }

    for (const field of activeFields) {
      const token = `${tokenPrefix}${field.key.trim()}`;
      const nextValue = evaluatePlaygroundExpression(field.value || '0', values);
      if (!Object.is(values[token], nextValue)) {
        values[token] = nextValue;
        changed = true;
      }
    }

    if (!changed) break;
  }

  if (tokenPrefix === 'area.formula.') {
    for (const field of activeFields) {
      const key = field.key.trim();
      if (!key) continue;
      values[`rule.${key}`] = values[`area.formula.${key}`];
    }
  }

  if (tokenPrefix === 'specs.global.') {
    for (const field of activeFields) {
      const key = field.key.trim();
      if (!key) continue;
      values[`formula.${key}`] = values[`specs.global.${key}`];
    }
  }
}

export function buildPlaygroundBaseValues(form: BuilderState, values: PlaygroundValues) {
  const resolvedValues: FormulaVariableMap = {};
  for (const field of form.globalFields) {
    if (isStoredGlobalField(field)) continue;
    if (field.inputType === 'material') {
      const selectedMaterialId = resolveGlobalFieldFormValue(field, values[`global.${field.key}`]);
      resolvedValues[`specs.global.${field.key}`] = selectedMaterialId;
      continue;
    }
    const key = field.key.trim();
    if (!key) continue;
    resolvedValues[`specs.global.${key}`] = parsePlaygroundValue(
      resolveGlobalFieldFormValue(field, values[`global.${field.key}`]),
      field.inputType
    );
  }
  return resolvedValues;
}

export function addScopedAreaPlaygroundValues(
  resolvedValues: FormulaVariableMap,
  areas: AreaRule[],
  values: PlaygroundValues
) {
  for (const area of areas) {
    const areaKey = area.key.trim();
    if (!areaKey) continue;
    const fields = area.fields ?? [];
    if (area.dynamic) {
      const primaryInstance = parsePlaygroundAreaInstances(area, values)[0];
      if (!primaryInstance) continue;
      for (const field of fields) {
        const fieldKey = field.key.trim();
        if (!fieldKey) continue;
        const sourceKey = playgroundInstanceValueKey(areaKey, primaryInstance.id, field.key);
        resolvedValues[`areas.${areaKey}.${fieldKey}`] = parsePlaygroundValue(
          resolveAreaFieldFormValue(field, values[sourceKey]),
          field.inputType
        );
      }
      continue;
    }
    for (const field of fields) {
      const fieldKey = field.key.trim();
      if (!fieldKey) continue;
      const sourceKey = `area.${area.id}.${field.key}`;
      const target = `areas.${areaKey}.${fieldKey}`;
      const parsed = parsePlaygroundValue(
        resolveAreaFieldFormValue(field, values[sourceKey]),
        field.inputType
      );
      resolvedValues[target] = parsed;
      resolvedValues[`area.${fieldKey}`] = parsed;
    }
  }
}

export function buildPlaygroundNumericValues(form: BuilderState, values: PlaygroundValues) {
  const resolvedValues = buildPlaygroundBaseValues(form, values);
  addScopedAreaPlaygroundValues(resolvedValues, form.areas, values);
  applyResolvedFormulaFields(
    resolvedValues,
    resolveStoredFormulaConstants(form),
    'specs.global.',
    buildGlobalFormulaOverrideMap(resolveStoredFormulaConstants(form), values)
  );
  return resolvedValues;
}

export function buildPlaygroundPreview(form: BuilderState, values: PlaygroundValues, materials: Material[]) {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const lines: PlaygroundMaterialLine[] = [];
  const warnings: string[] = [];

  for (const area of form.areas) {
    const areaKey = area.key.trim();
    const instances = area.dynamic
      ? parsePlaygroundAreaInstances(area, values)
      : [{ id: 'static', label: area.label || area.key || 'Area' }];

    for (const instance of instances) {
      const resolvedValues = buildAreaScopedPlaygroundValues(form, values, area, area.dynamic ? instance.id : undefined);

      for (const rule of area.materials ?? []) {
        const materialId = rule.materialSource === 'global'
          ? resolveGlobalFieldFormValue(
              form.globalFields.find((field) => field.key === rule.materialSelectorKey) ?? {
                inputType: 'material',
                defaultMaterialId: '',
              },
              values[`global.${rule.materialSelectorKey}`]
            )
          : rule.materialId;
        const material = materialId ? materialMap.get(materialId) : null;
        if (!material) {
          warnings.push(
            rule.materialSource === 'global'
              ? `Select material for ${rule.materialSelectorKey || 'job dropdown'} in playground.`
              : 'Select a fixed material in material rules.'
          );
          continue;
        }

        const quantity = evaluateNumericFormulaExpression(rule.quantityExpression || '0', resolvedValues);
        const wastePercent = resolveMaterialWastePercent(rule.wastePercent, resolvedValues);
        const finalQuantity = quantity * (1 + wastePercent / 100);
        const unitCost = Number(material.unitCost ?? 0);
        lines.push({
          key: `${area.id}-${instance.id}-${rule.id}`,
          areaLabel: area.dynamic ? `${area.label || area.key || 'Area'} - ${instance.label}` : area.label || area.key || 'Area',
          materialName: material.name,
          quantity,
          wastePercent,
          finalQuantity,
          unit: material.unit,
          unitCost,
          totalCost: finalQuantity * unitCost,
          source: rule.materialSource === 'global' ? `Job input: ${rule.materialSelectorKey}` : 'Fixed material',
        });
      }
    }
  }

  return {
    lines,
    warnings: Array.from(new Set(warnings)),
    totalCost: lines.reduce((sum, line) => sum + line.totalCost, 0),
  };
}

export function buildFormulaConstantTokens(
  globalFields: DynamicField[],
  formulaConstants: FormulaConstantField[],
  areas: AreaRule[],
  currentId?: string
): FormulaToken[] {
  const safeGlobalFields = Array.isArray(globalFields) ? globalFields : [];
  const safeFormulaConstants = Array.isArray(formulaConstants) ? formulaConstants : [];
  const safeAreas = Array.isArray(areas) ? areas : [];

  const globalTokens: FormulaToken[] = safeGlobalFields
    .filter((field) => field.id !== currentId && field.key.trim() && field.inputType !== 'material')
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: isStoredGlobalField(field) ? 'Stored value' : 'Job input',
    }));

  const mergedStoredKeys = new Set(
    safeGlobalFields.filter(isStoredGlobalField).map((field) => field.key.trim()).filter(Boolean)
  );

  const formulaTokens: FormulaToken[] = safeFormulaConstants
    .filter((field) => field.id !== currentId && field.key.trim() && !mergedStoredKeys.has(field.key.trim()))
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Stored value',
    }));

  const areaTokens: FormulaToken[] = safeAreas.flatMap((area) =>
    (area.fields ?? [])
      .filter((field) => field.key.trim() && area.key.trim())
      .map((field) => ({
        token: `areas.${area.key.trim()}.${field.key.trim()}`,
        label: `${area.label.trim() || area.key.trim() || 'Area'} - ${field.label.trim() || field.key.trim()}`,
        group: 'Area input',
      }))
  );

  return dedupeFormulaTokens([...globalTokens, ...formulaTokens, ...areaTokens]);
}

export function buildAreaFormulaValueTokens(
  globalFields: DynamicField[],
  formulaConstants: FormulaConstantField[],
  area: AreaRule,
  currentId?: string
): FormulaToken[] {
  return buildFormulaTokens(globalFields, formulaConstants, {
    ...area,
    formulaValues: (area.formulaValues ?? []).filter((field) => field.id !== currentId),
  });
}

export function buildFormulaTokens(
  globalFields: DynamicField[],
  formulaConstants: FormulaConstantField[],
  area: AreaRule,
  currentId?: string
): FormulaToken[] {
  const safeGlobalFields = Array.isArray(globalFields) ? globalFields : [];
  const safeFormulaConstants = Array.isArray(formulaConstants) ? formulaConstants : [];
  const safeArea = area && typeof area === 'object' ? area : ({} as AreaRule);

  const globalTokens: FormulaToken[] = safeGlobalFields
    .filter((field) => field.id !== currentId && field.key.trim() && field.inputType !== 'material')
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: isStoredGlobalField(field) ? 'Stored value' : 'Job input',
    }));

  const mergedStoredKeys = new Set(
    safeGlobalFields.filter(isStoredGlobalField).map((field) => field.key.trim()).filter(Boolean)
  );

  const formulaTokens: FormulaToken[] = safeFormulaConstants
    .filter((field) => field.key.trim() && !mergedStoredKeys.has(field.key.trim()))
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Stored value',
    }));

  const areaTokens: FormulaToken[] = (safeArea.fields ?? [])
    .filter((field) => field.key.trim())
    .map((field) => {
      const key = field.key.trim();
      return {
        token: `area.${key}`,
        label: field.label.trim() || key,
        group: 'Area input',
      };
    });

  const areaFormulaTokens: FormulaToken[] = (safeArea.formulaValues ?? [])
    .filter((field) => field.key.trim())
    .map((field) => ({
      token: `area.formula.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Area input',
      }));

  return dedupeFormulaTokens([...globalTokens, ...formulaTokens, ...areaTokens, ...areaFormulaTokens]);
}

export function getExpressionTokenQuery(value: string, cursorPosition?: number) {
  const safeCursor = typeof cursorPosition === 'number' ? Math.max(0, Math.min(cursorPosition, value.length)) : value.length;
  const beforeCursor = value.slice(0, safeCursor);
  const match = beforeCursor.match(/([A-Za-z0-9_.-]+)$/);
  return match?.[1] ?? '';
}

export function getExpressionInsertRange(value: string, cursorPosition?: number) {
  const safeCursor = typeof cursorPosition === 'number' ? Math.max(0, Math.min(cursorPosition, value.length)) : value.length;
  const beforeCursor = value.slice(0, safeCursor);

  if (/\(\s*$/.test(beforeCursor)) {
    return { start: safeCursor, end: safeCursor, prefix: '' };
  }

  const match = beforeCursor.match(/([A-Za-z0-9_.-]+)$/);
  if (!match || match.index === undefined) {
    return {
      start: safeCursor,
      end: safeCursor,
      prefix: beforeCursor && !/[\s(,]$/.test(beforeCursor) ? ' ' : '',
    };
  }

  return { start: match.index, end: safeCursor, prefix: '' };
}

export function insertExpressionToken(value: string, token: string, cursorPosition?: number) {
  const { start, end, prefix } = getExpressionInsertRange(value, cursorPosition);
  return `${value.slice(0, start)}${prefix}${token}${value.slice(end)}`;
}
