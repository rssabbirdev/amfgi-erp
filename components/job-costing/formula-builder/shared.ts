import type { Material } from '@/store/api/endpoints/materials';
import {
  coerceFormulaNumber,
  evaluateFormulaExpression,
  evaluateNumericFormulaExpression,
  normalizeFormulaValue,
  type FormulaVariableMap,
} from '@/lib/job-costing/expressionEvaluator';

export type FieldType = 'number' | 'percent' | 'length' | 'area' | 'volume' | 'count' | 'boolean' | 'select' | 'text' | 'material';
export type FieldScope = 'measurement' | 'variable';

export type DynamicField = {
  id: string;
  key: string;
  label: string;
  inputType: FieldType;
  unit: string;
  defaultMaterialId?: string;
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
  group: 'Job input' | 'Formula value' | 'Area input';
};

export const FIELD_TYPES: FieldType[] = ['number', 'percent', 'length', 'area', 'volume', 'count', 'boolean', 'select', 'text', 'material'];
export const FORMULA_DRAFT_STORAGE_PREFIX = 'formula-builder-draft';

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getFormulaDraftStorageKey(formulaId?: string) {
  return `${FORMULA_DRAFT_STORAGE_PREFIX}:${formulaId ?? 'new'}`;
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

export function formatAutoSaveLabel(state: 'idle' | 'draft' | 'saving' | 'saved' | 'error', lastSavedAt: string | null) {
  const timeLabel = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
    : null;

  switch (state) {
    case 'draft':
      return 'Draft saved locally';
    case 'saving':
      return 'Auto-saving...';
    case 'saved':
      return timeLabel ? `Saved ${timeLabel}` : 'Saved';
    case 'error':
      return 'Autosave failed';
    default:
      return 'No unsaved changes';
  }
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
  const fromToken = previousKey ? `formula.${previousKey}` : '';
  const toToken = nextKey ? `formula.${nextKey}` : '';
  if (!fromToken || !toToken || fromToken === toToken) return state;

  return {
    ...state,
    formulaConstants: state.formulaConstants.map((field) => ({
      ...field,
      value: replaceExpressionToken(field.value, fromToken, toToken),
    })),
    areas: state.areas.map((area) => ({
      ...area,
      formulaValues: (area.formulaValues ?? []).map((field) => ({
        ...field,
        value: replaceExpressionToken(field.value, fromToken, toToken),
      })),
      materials: (area.materials ?? []).map((rule) => ({
        ...rule,
        quantityExpression: replaceExpressionToken(rule.quantityExpression, fromToken, toToken),
      })),
      labor: (area.labor ?? []).map((rule) => ({
        ...rule,
        quantityExpression: replaceExpressionToken(rule.quantityExpression, fromToken, toToken),
        crewSizeExpression: replaceExpressionToken(rule.crewSizeExpression, fromToken, toToken),
        productivityPerWorkerPerDay: replaceExpressionToken(rule.productivityPerWorkerPerDay, fromToken, toToken),
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
    case 'Area input':
      return 'border-emerald-200 bg-emerald-100/80 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-100';
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
    required: true,
    scope,
  };
}

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
  };
}

export function newArea(): AreaRule {
  return {
    id: uid('area'),
    key: '',
    label: '',
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
  try {
    return evaluateFormulaExpression(expression, values);
  } catch {
    return 0;
  }
}

export function applyResolvedFormulaFields(
  values: FormulaVariableMap,
  fields: Array<{ key: string; value: string }>,
  tokenPrefix: 'formula.' | 'area.formula.'
) {
  const activeFields = fields.filter((field) => field.key.trim());
  const maxPasses = Math.max(activeFields.length, 1);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = false;

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
}

export function buildPlaygroundBaseValues(form: BuilderState, values: PlaygroundValues) {
  const resolvedValues: FormulaVariableMap = {};
  for (const field of form.globalFields) {
    if (field.inputType === 'material') {
      const selectedMaterialId = values[`global.${field.key}`] ?? field.defaultMaterialId ?? '';
      resolvedValues[`specs.global.${field.key}`] = selectedMaterialId;
      continue;
    }
    const key = field.key.trim();
    if (!key) continue;
    resolvedValues[`specs.global.${key}`] = parsePlaygroundValue(values[`global.${field.key}`] ?? '', field.inputType);
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
    for (const field of area.fields ?? []) {
      const fieldKey = field.key.trim();
      if (!fieldKey) continue;
      const sourceKey = `area.${area.id}.${field.key}`;
      const target = `areas.${areaKey}.${fieldKey}`;
      resolvedValues[target] = parsePlaygroundValue(values[sourceKey] ?? '', field.inputType);
    }
  }
}

export function buildPlaygroundNumericValues(form: BuilderState, values: PlaygroundValues) {
  const resolvedValues = buildPlaygroundBaseValues(form, values);
  addScopedAreaPlaygroundValues(resolvedValues, form.areas, values);
  applyResolvedFormulaFields(resolvedValues, form.formulaConstants, 'formula.');
  return resolvedValues;
}

export function buildPlaygroundPreview(form: BuilderState, values: PlaygroundValues, materials: Material[]) {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const lines: PlaygroundMaterialLine[] = [];
  const warnings: string[] = [];

  for (const area of form.areas) {
    const resolvedValues = buildPlaygroundBaseValues(form, values);
    addScopedAreaPlaygroundValues(resolvedValues, form.areas, values);
    for (const field of area.fields ?? []) {
      const fieldKey = field.key.trim();
      if (!fieldKey) continue;
      const target = `area.${fieldKey}`;
      resolvedValues[target] = parsePlaygroundValue(values[`area.${area.id}.${field.key}`] ?? '', field.inputType);
    }
    applyResolvedFormulaFields(resolvedValues, form.formulaConstants, 'formula.');
    applyResolvedFormulaFields(resolvedValues, area.formulaValues ?? [], 'area.formula.');

    for (const rule of area.materials ?? []) {
      const materialId = rule.materialSource === 'global'
        ? values[`global.${rule.materialSelectorKey}`] ??
          form.globalFields.find((field) => field.key === rule.materialSelectorKey)?.defaultMaterialId ??
          ''
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
      const wastePercent = coerceFormulaNumber(parsePlaygroundValue(rule.wastePercent, 'percent'));
      const finalQuantity = quantity * (1 + wastePercent / 100);
      const unitCost = Number(material.unitCost ?? 0);
      lines.push({
        key: `${area.id}-${rule.id}`,
        areaLabel: area.label || area.key || 'Area',
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
    .filter((field) => field.key.trim() && field.inputType !== 'material')
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Job input',
    }));

  const formulaTokens: FormulaToken[] = safeFormulaConstants
    .filter((field) => field.id !== currentId && field.key.trim())
    .map((field) => ({
      token: `formula.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Formula value',
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

  return [...globalTokens, ...formulaTokens, ...areaTokens];
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

export function buildFormulaTokens(globalFields: DynamicField[], formulaConstants: FormulaConstantField[], area: AreaRule): FormulaToken[] {
  const safeGlobalFields = Array.isArray(globalFields) ? globalFields : [];
  const safeFormulaConstants = Array.isArray(formulaConstants) ? formulaConstants : [];
  const safeArea = area && typeof area === 'object' ? area : ({} as AreaRule);

  const globalTokens: FormulaToken[] = safeGlobalFields
    .filter((field) => field.key.trim() && field.inputType !== 'material')
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Job input',
    }));

  const formulaTokens: FormulaToken[] = safeFormulaConstants
    .filter((field) => field.key.trim())
    .map((field) => ({
      token: `formula.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Formula value',
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

  return [...globalTokens, ...formulaTokens, ...areaTokens, ...areaFormulaTokens];
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
