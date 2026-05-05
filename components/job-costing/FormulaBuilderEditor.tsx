'use client';

import { type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import Spinner from '@/components/ui/Spinner';
import {
  useCreateFormulaLibraryMutation,
  useGetFormulaLibrariesQuery,
  useGetFormulaLibraryByIdQuery,
  useGetFormulaLibraryVersionsQuery,
  useGetMaterialsQuery,
  useRestoreFormulaLibraryVersionMutation,
  useUpdateFormulaLibraryMutation,
} from '@/store/hooks';
import type { FormulaLibrary, FormulaLibraryVersion } from '@/store/api/endpoints/jobs';
import {
  ExpressionInput,
  FormulaPlayground,
  RuleRows,
  type FormulaEditorRequest,
} from '@/components/job-costing/formula-builder/sections';
import {
  FIELD_TYPES,
  type AreaRule,
  type BuilderState,
  type DynamicField,
  type FieldType,
  type FormulaConstantField,
  type FormulaToken,
  type PlaygroundValues,
  buildFormulaConstantTokens,
  buildAreaFormulaValueTokens,
  buildPlaygroundBaseValues,
  buildPlaygroundNumericValues,
  buildPlaygroundPreview,
  addScopedAreaPlaygroundValues,
  applyResolvedFormulaFields,
  evaluatePlaygroundExpression,
  formatAutoSaveLabel,
  formatPreviewQty,
  getFormulaDraftStorageKey,
  parsePlaygroundValue,
  getExpressionInsertRange,
  getExpressionTokenQuery,
  insertExpressionToken,
  isRecord,
  newArea,
  newField,
  newFormulaConstant,
  normalizeFormulaKey,
  normalizeSlugInput,
  renameFormulaReferences,
  reorderItemsById,
  slugify,
  uid,
} from '@/components/job-costing/formula-builder/shared';

type FormulaHelpExample = {
  label: string;
  expression: string;
  note: string;
  sample: string;
};

type GlobalFieldEditorState = {
  mode: 'create' | 'edit';
  draft: DynamicField;
  initialDraft: DynamicField;
};

type FormulaConstantEditorState = {
  mode: 'create' | 'edit';
  draft: FormulaConstantField;
  initialDraft: FormulaConstantField;
};

type AreaFieldEditorState = {
  areaId: string;
  areaLabel: string;
  mode: 'create' | 'edit';
  draft: DynamicField;
  initialDraft: DynamicField;
};

type AreaFormulaValueEditorState = {
  areaId: string;
  areaLabel: string;
  mode: 'create' | 'edit';
  draft: FormulaConstantField;
  initialDraft: FormulaConstantField;
};

function parseField(value: unknown): DynamicField | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : uid('field'),
    key: typeof value.key === 'string' ? value.key : '',
    label: typeof value.label === 'string' ? value.label : '',
    inputType: FIELD_TYPES.includes(value.inputType as FieldType) ? (value.inputType as FieldType) : 'number',
    unit: typeof value.unit === 'string' ? value.unit : '',
    defaultMaterialId: typeof value.defaultMaterialId === 'string' ? value.defaultMaterialId : '',
    required: typeof value.required === 'boolean' ? value.required : true,
    scope: undefined,
  };
}

function parseFormula(row?: FormulaLibrary | null): BuilderState {
  const schema = isRecord(row?.specificationSchema) ? row.specificationSchema : {};
  const config = isRecord(row?.formulaConfig) ? row.formulaConfig : {};
  const defaultMaterialSelections = isRecord(config.defaultMaterialSelections) ? config.defaultMaterialSelections : {};
  const schemaAreas = Array.isArray(schema.areas) ? schema.areas : [];
  const configAreas = Array.isArray(config.areas) ? config.areas : [];
  const areaMap = new Map<string, AreaRule>();
  const areaFormulaValueMetadata = new Map<string, Array<{ id: string; key: string; label: string; unit: string }>>();
  const areaIdentityMetadata = new Map<string, { id: string }>();

  for (const rawArea of schemaAreas) {
    if (!isRecord(rawArea)) continue;
    const key = typeof rawArea.key === 'string' ? rawArea.key : '';
    if (!key) continue;
    areaIdentityMetadata.set(key, {
      id: typeof rawArea.id === 'string' && rawArea.id.trim() ? rawArea.id : uid('area'),
    });
    const formulaValues = Array.isArray(rawArea.formulaValues)
      ? rawArea.formulaValues.flatMap((field) => {
          if (!isRecord(field)) return [];
          const fieldKey = typeof field.key === 'string' ? field.key : '';
          if (!fieldKey) return [];
          return [{
            id: typeof field.id === 'string' && field.id.trim() ? field.id : uid('area-formula'),
            key: fieldKey,
            label: typeof field.label === 'string' ? field.label : fieldKey,
            unit: typeof field.unit === 'string' ? field.unit : '',
          }];
        })
      : [];
    areaFormulaValueMetadata.set(key, formulaValues);
  }

  for (const rawArea of configAreas) {
    if (!isRecord(rawArea)) continue;
    const key = typeof rawArea.key === 'string' ? rawArea.key : '';
    const valueMetadata = areaFormulaValueMetadata.get(key) ?? [];
    const areaIdentity = areaIdentityMetadata.get(key);
    const materials = Array.isArray(rawArea.materials)
      ? rawArea.materials.flatMap((rule) => {
          if (!isRecord(rule)) return [];
          return [{
            id: uid('material'),
            materialSource: (typeof rule.materialSelectorKey === 'string' ? 'global' : 'fixed') as 'fixed' | 'global',
            materialId: typeof rule.materialId === 'string' ? rule.materialId : '',
            materialSelectorKey: typeof rule.materialSelectorKey === 'string' ? rule.materialSelectorKey : '',
            quantityExpression: typeof rule.quantityExpression === 'string' ? rule.quantityExpression : '',
            wastePercent: typeof rule.wastePercent === 'number' ? String(rule.wastePercent) : '',
          }];
        })
      : [];
    const labor = Array.isArray(rawArea.labor)
      ? rawArea.labor.flatMap((rule) => {
          if (!isRecord(rule)) return [];
          return [{
            id: uid('labor'),
            expertiseName: typeof rule.expertiseName === 'string' ? rule.expertiseName : '',
            quantityExpression: typeof rule.quantityExpression === 'string' ? rule.quantityExpression : '',
            crewSizeExpression: typeof rule.crewSizeExpression === 'string' ? rule.crewSizeExpression : '',
            productivityPerWorkerPerDay:
              typeof rule.productivityPerWorkerPerDay === 'string' ? rule.productivityPerWorkerPerDay : '',
          }];
        })
      : [];
    areaMap.set(key || uid('area-key'), {
      id: areaIdentity?.id ?? uid('area'),
      key,
      label: typeof rawArea.label === 'string' ? rawArea.label : key,
      fields: [],
      formulaValues: isRecord(rawArea.variables)
        ? (() => {
            const variableRecord = rawArea.variables;
            const consumedKeys = new Set<string>();

            const ordered = valueMetadata.flatMap((metadata) => {
              const variableValue = variableRecord[metadata.key];
              if (typeof variableValue !== 'number' && typeof variableValue !== 'string') return [];
              consumedKeys.add(metadata.key);
              return [{
                id: metadata.id,
                key: metadata.key,
                label: metadata.label,
                value: String(variableValue),
                unit: metadata.unit,
              }];
            });

            const extras = Object.entries(variableRecord).flatMap(([variableKey, variableValue]) => {
              if (consumedKeys.has(variableKey)) return [];
              if (typeof variableValue !== 'number' && typeof variableValue !== 'string') return [];
              return [{
                id: uid('area-formula'),
                key: variableKey,
                label: variableKey,
                value: String(variableValue),
                unit: '',
              }];
            });

            return [...ordered, ...extras];
          })()
        : [],
      materials,
      labor,
    });
  }

  for (const rawArea of schemaAreas) {
    if (!isRecord(rawArea)) continue;
    const key = typeof rawArea.key === 'string' ? rawArea.key : '';
    const existing = areaMap.get(key) ?? newArea();
    const fields = Array.isArray(rawArea.fields)
      ? rawArea.fields.flatMap((field) => {
          const parsed = parseField(field);
          return parsed ? [parsed] : [];
        })
      : [];
    areaMap.set(key || existing.id, {
      ...existing,
      key,
      label: typeof rawArea.label === 'string' ? rawArea.label : existing.label,
      fields,
    });
  }

  const globalFields = Array.isArray(schema.globalFields)
    ? schema.globalFields.flatMap((field) => {
        const parsed = parseField(field);
        if (parsed?.inputType === 'material') {
          parsed.defaultMaterialId =
            typeof defaultMaterialSelections[parsed.key] === 'string' ? String(defaultMaterialSelections[parsed.key]) : parsed.defaultMaterialId ?? '';
        }
        return parsed ? [{ ...parsed, scope: undefined }] : [];
      })
    : [];

  const formulaConstants = Array.isArray(config.constants)
    ? config.constants.flatMap((constant) => {
        if (!isRecord(constant)) return [];
        return [{
          id: typeof constant.id === 'string' && constant.id.trim() ? constant.id : uid('constant'),
          key: typeof constant.key === 'string' ? constant.key : '',
          label: typeof constant.label === 'string' ? constant.label : (typeof constant.key === 'string' ? constant.key : ''),
          value:
            typeof constant.value === 'number'
              ? String(constant.value)
              : typeof constant.value === 'string'
                ? constant.value
                : '',
          unit: typeof constant.unit === 'string' ? constant.unit : '',
        }];
      })
      : isRecord(config.variables)
      ? Object.entries(config.variables).flatMap(([key, value]) => {
          if (typeof value !== 'number' && typeof value !== 'string') return [];
          return [{
            id: uid('constant'),
            key,
            label: key,
            value: String(value),
            unit: '',
          }];
        })
      : [];

  const areas = Array.from(areaMap.values());

  return {
    name: row?.name ?? '',
    slug: row?.slug ?? '',
    fabricationType: row?.fabricationType ?? '',
    description: row?.description ?? '',
    globalFields,
    formulaConstants,
    areas: areas.length > 0 ? areas : [newArea()],
  };
}

function parsePlaygroundValues(row?: FormulaLibrary | null): PlaygroundValues {
  const schema = isRecord(row?.specificationSchema) ? row.specificationSchema : {};
  if (!isRecord(schema.playgroundValues)) return {};
  return Object.fromEntries(
    Object.entries(schema.playgroundValues).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : []
    )
  );
}

function parseFormulaConstantValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function suggestDuplicateAreaKey(areas: AreaRule[], sourceArea: AreaRule) {
  const baseKey = normalizeFormulaKey(sourceArea.key || sourceArea.label || 'area') || 'area';
  const existing = new Set(areas.map((area) => area.key.trim()).filter(Boolean));
  let attempt = `${baseKey}_copy`;
  let index = 2;
  while (existing.has(attempt)) {
    attempt = `${baseKey}_copy_${index}`;
    index += 1;
  }
  return attempt;
}

function duplicateAreaDefinition(areas: AreaRule[], sourceArea: AreaRule): AreaRule {
  const duplicatedKey = suggestDuplicateAreaKey(areas, sourceArea);
  return {
    ...sourceArea,
    id: uid('area'),
    key: duplicatedKey,
    label: sourceArea.label?.trim() ? `${sourceArea.label} Copy` : 'Area Copy',
    fields: sourceArea.fields.map((field) => ({ ...field, id: uid('field') })),
    formulaValues: sourceArea.formulaValues.map((field) => ({ ...field, id: uid('area-formula') })),
    materials: sourceArea.materials.map((rule) => ({ ...rule, id: uid('material') })),
    labor: sourceArea.labor.map((rule) => ({ ...rule, id: uid('labor') })),
  };
}

function buildPayload(form: BuilderState, playgroundValues: PlaygroundValues) {
  const constants = form.formulaConstants
    .filter((field) => field.key.trim() && field.label.trim() && field.value.trim())
    .map((field) => ({
      key: field.key.trim(),
      label: field.label.trim(),
      value: parseFormulaConstantValue(field.value),
      unit: field.unit.trim() || undefined,
    }));

  const specificationSchema = {
    version: 1,
    playgroundValues,
    globalFields: form.globalFields
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field) => ({
        id: field.id,
        key: field.key.trim(),
        label: field.label.trim(),
        inputType: field.inputType,
        unit: field.unit.trim() || undefined,
        defaultMaterialId: field.inputType === 'material' && field.defaultMaterialId?.trim() ? field.defaultMaterialId.trim() : undefined,
        required: field.required,
      })),
    areas: form.areas
      .filter((area) => area.key.trim() && area.label.trim())
      .map((area) => ({
        id: area.id,
        key: area.key.trim(),
        label: area.label.trim(),
        fields: area.fields
          .filter((field) => field.key.trim() && field.label.trim())
          .map((field) => ({
            id: field.id,
            key: field.key.trim(),
            label: field.label.trim(),
            inputType: field.inputType,
            unit: field.unit.trim() || undefined,
            required: field.required,
          })),
        formulaValues: area.formulaValues
          .filter((field) => field.key.trim() && field.label.trim())
          .map((field) => ({
            id: field.id,
            key: field.key.trim(),
            label: field.label.trim(),
            unit: field.unit.trim() || undefined,
          })),
      })),
  };

  const formulaConfig = {
    version: 2,
    unitSystem: 'METRIC' as const,
    variables: Object.fromEntries(constants.map((field) => [field.key, field.value])),
    constants,
    defaultMaterialSelections: Object.fromEntries(
      form.globalFields
        .filter((field) => field.inputType === 'material' && field.key.trim() && field.defaultMaterialId?.trim())
        .map((field) => [field.key.trim(), field.defaultMaterialId!.trim()])
    ),
    areas: form.areas
      .filter((area) => area.key.trim() && area.label.trim())
      .map((area) => ({
        key: area.key.trim(),
        label: area.label.trim(),
        variables: Object.fromEntries(
          area.formulaValues
            .filter((field) => field.key.trim() && field.label.trim() && field.value.trim())
            .map((field) => [field.key.trim(), parseFormulaConstantValue(field.value)])
        ),
        materials: area.materials
          .filter((rule) => (rule.materialId || rule.materialSelectorKey) && rule.quantityExpression.trim())
          .map((rule) => ({
            ...(rule.materialSelectorKey ? { materialSelectorKey: rule.materialSelectorKey } : { materialId: rule.materialId }),
            quantityExpression: rule.quantityExpression.trim(),
            wastePercent: rule.wastePercent.trim() ? Number(rule.wastePercent) : undefined,
          })),
        labor: area.labor
          .filter((rule) => rule.expertiseName.trim() && rule.productivityPerWorkerPerDay.trim())
          .map((rule) => ({
            expertiseName: rule.expertiseName.trim(),
            quantityExpression: rule.quantityExpression.trim() || undefined,
            crewSizeExpression: rule.crewSizeExpression.trim() || undefined,
            productivityPerWorkerPerDay: rule.productivityPerWorkerPerDay.trim(),
          })),
      })),
  };

  return { specificationSchema, formulaConfig };
}

function validate(form: BuilderState) {
  if (!form.name.trim()) return 'Formula name is required';
  if (!form.slug.trim()) return 'Formula slug is required';
  if (!form.fabricationType.trim()) return 'Fabrication type is required';
  if (!form.areas.some((area) => area.key.trim() && area.label.trim())) return 'At least one area is required';

  const areaKeys = new Set<string>();
  for (const area of form.areas) {
    const areaLabel = area.label.trim();
    const areaKey = area.key.trim();
    if (!areaLabel) return 'Every area must have a display name before saving';
    if (!areaKey) return 'Every area must have an area token key before saving';
    const duplicateKey = areaKey.toLowerCase();
    if (areaKeys.has(duplicateKey)) return `Area key "${areaKey}" already exists`;
    areaKeys.add(duplicateKey);
  }

  return null;
}

function suggestUniqueSlug(baseSlug: string, existingSlugs: Set<string>) {
  const base = slugify(baseSlug) || 'formula';
  if (!existingSlugs.has(base)) return base;
  let counter = 1;
  let next = `${base}-${counter}`;
  while (existingSlugs.has(next)) {
    counter += 1;
    next = `${base}-${counter}`;
  }
  return next;
}

function cloneBuilderState(value: BuilderState) {
  return JSON.parse(JSON.stringify(value)) as BuilderState;
}

function sameBuilderState(left: BuilderState, right: BuilderState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createGlobalFieldDraft(inputType: FieldType): DynamicField {
  return {
    ...newField(),
    inputType,
    unit: inputType === 'material' ? '' : '',
    defaultMaterialId: '',
  };
}

function insertFormulaSnippet(value: string, snippet: string) {
  const trimmed = value.trim();
  if (!trimmed) return snippet;
  const needsLineBreak = !trimmed.endsWith('\n');
  return `${value}${needsLineBreak ? '\n' : ''}${snippet}`;
}

function formatPossibleFormulaOutput(value: unknown) {
  if (typeof value === 'number') return formatPreviewQty(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value || '--';
  return '--';
}

function createFormulaConstantDraft(): FormulaConstantField {
  return {
    ...newFormulaConstant(),
    label: '',
    key: '',
    value: '',
    unit: '',
  };
}

function createUniqueFormulaKey(existingKeys: string[], baseKey: string) {
  const normalizedBase = normalizeFormulaKey(baseKey) || 'key';
  const existing = new Set(existingKeys.map((key) => key.trim().toLowerCase()).filter(Boolean));
  if (!existing.has(normalizedBase)) return normalizedBase;
  let index = 2;
  let next = `${normalizedBase}_${index}`;
  while (existing.has(next)) {
    index += 1;
    next = `${normalizedBase}_${index}`;
  }
  return next;
}

function isDrawerDraftDirty<T>(draft: T, initialDraft: T) {
  return JSON.stringify(draft) !== JSON.stringify(initialDraft);
}

function animateDrawerClose(
  backdropEl: HTMLElement | null,
  panelEl: HTMLElement | null,
  onClosed: () => void
) {
  if (!backdropEl || !panelEl) {
    onClosed();
    return;
  }
  backdropEl.classList.remove('drawer-backdrop-enter');
  panelEl.classList.remove('drawer-panel-enter');
  backdropEl.classList.add('drawer-backdrop-leave');
  panelEl.classList.add('drawer-panel-leave');
  window.setTimeout(onClosed, 180);
}

export function FormulaBuilderEditor({ formulaId }: { formulaId?: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = (session?.user?.isSuperAdmin ?? false) || perms.includes('settings.manage');
  const canView = (session?.user?.isSuperAdmin ?? false) || (perms.includes('job.view') && perms.includes('material.view'));
  const [activeFormulaId, setActiveFormulaId] = useState(formulaId);

  const { data: formula, isLoading: formulaLoading } = useGetFormulaLibraryByIdQuery(activeFormulaId ?? '', {
    skip: !activeFormulaId || !canView,
  });
  const { data: formulaVersions = [] } = useGetFormulaLibraryVersionsQuery(activeFormulaId ?? '', {
    skip: !activeFormulaId || !canView,
  });
  const { data: formulaLibrary = [] } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const { data: materials = [] } = useGetMaterialsQuery(undefined, { skip: !canView });
  const [createFormula, { isLoading: creating }] = useCreateFormulaLibraryMutation();
  const [updateFormula, { isLoading: updating }] = useUpdateFormulaLibraryMutation();
  const [restoreFormulaVersion, { isLoading: restoringVersion }] = useRestoreFormulaLibraryVersionMutation();
  const searchableMaterials = useMemo(
    () =>
      materials.map((material) => ({
        id: material.id,
        label: material.name,
        searchText: `${material.name} ${material.unit} ${Number(material.unitCost ?? 0)}`,
      })),
    [materials]
  );

  const initialForm = useMemo(() => parseFormula(formula), [formula]);
  const initialPlaygroundValues = useMemo(() => parsePlaygroundValues(formula), [formula]);
  const [draft, setDraft] = useState<BuilderState | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [playgroundValues, setPlaygroundValues] = useState<PlaygroundValues>({});
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<Record<string, boolean>>({});
  const [foundationCollapsed, setFoundationCollapsed] = useState(false);
  const [formulaConstantsCollapsed, setFormulaConstantsCollapsed] = useState(false);
  const [jobInputsCollapsed, setJobInputsCollapsed] = useState(false);
  const [draggingAreaId, setDraggingAreaId] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'draft' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [formulaEditor, setFormulaEditor] = useState<FormulaEditorRequest | null>(null);
  const [formulaEditorSearch, setFormulaEditorSearch] = useState('');
  const [formulaEditorCursor, setFormulaEditorCursor] = useState(0);
  const formulaEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [globalFieldSearch, setGlobalFieldSearch] = useState('');
  const [formulaConstantSearch, setFormulaConstantSearch] = useState('');
  const [globalFieldEditor, setGlobalFieldEditor] = useState<GlobalFieldEditorState | null>(null);
  const [formulaConstantEditor, setFormulaConstantEditor] = useState<FormulaConstantEditorState | null>(null);
  const [areaFieldEditor, setAreaFieldEditor] = useState<AreaFieldEditorState | null>(null);
  const [areaFormulaValueEditor, setAreaFormulaValueEditor] = useState<AreaFormulaValueEditorState | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [undoStack, setUndoStack] = useState<BuilderState[]>([]);
  const [redoStack, setRedoStack] = useState<BuilderState[]>([]);
  const form = draft ?? initialForm;
  const hydratedDraftKeyRef = useRef<string | null>(null);
  const hydratedPlaygroundFormulaIdRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const historyLimitRef = useRef(80);
  const formulaConstantBackdropRef = useRef<HTMLButtonElement | null>(null);
  const formulaConstantPanelRef = useRef<HTMLDivElement | null>(null);
  const areaFieldBackdropRef = useRef<HTMLButtonElement | null>(null);
  const areaFieldPanelRef = useRef<HTMLDivElement | null>(null);
  const areaFormulaValueBackdropRef = useRef<HTMLButtonElement | null>(null);
  const areaFormulaValuePanelRef = useRef<HTMLDivElement | null>(null);
  const globalFieldBackdropRef = useRef<HTMLButtonElement | null>(null);
  const globalFieldPanelRef = useRef<HTMLDivElement | null>(null);

  const setFormState = (
    updater: SetStateAction<BuilderState>,
    options?: { trackHistory?: boolean; clearRedo?: boolean }
  ) => {
    setDraft((current) => {
      const base = current ?? initialForm;
      const next = typeof updater === 'function' ? updater(base) : updater;
      if (sameBuilderState(base, next)) return base;
      if (options?.trackHistory !== false) {
        const previous = cloneBuilderState(base);
        setUndoStack((stack) => [...stack.slice(-(historyLimitRef.current - 1)), previous]);
        if (options?.clearRedo !== false) setRedoStack([]);
      }
      return next;
    });
  };

  const saving = creating || updating;
  const storageKey = useMemo(() => getFormulaDraftStorageKey(activeFormulaId), [activeFormulaId]);
  const payload = useMemo(() => buildPayload(form, playgroundValues), [form, playgroundValues]);
  const playgroundPreview = useMemo(
    () => buildPlaygroundPreview(form, playgroundValues, materials),
    [form, materials, playgroundValues]
  );
  const resolvedPlaygroundValues = useMemo(() => buildPlaygroundNumericValues(form, playgroundValues), [form, playgroundValues]);
  const formulaEditorGroups = useMemo(() => {
    if (!formulaEditor) return [];
    const query = formulaEditorSearch.trim().toLowerCase();
    const filtered = formulaEditor.tokens.filter((item) => {
      if (!query) return true;
      return (
        item.token.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query) ||
        item.group.toLowerCase().includes(query)
      );
    });
    const order: FormulaToken['group'][] = ['Job input', 'Formula value', 'Area input'];
    return order
      .map((group) => ({
        group,
        items: filtered.filter((item) => item.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [formulaEditor, formulaEditorSearch]);
  const formulaEditorFormulaTokens = useMemo(() => {
    if (!formulaEditor) return [];
    const query = formulaEditorSearch.trim().toLowerCase();
    return formulaEditor.tokens.filter((item) => {
      if (item.group !== 'Formula value') return false;
      if (!query) return true;
      return item.token.toLowerCase().includes(query) || item.label.toLowerCase().includes(query);
    });
  }, [formulaEditor, formulaEditorSearch]);
  const formulaEditorSuggestions = useMemo(() => {
    if (!formulaEditor) return [];
    const rawValue = formulaEditor.value;
    const beforeCursor = rawValue.slice(0, formulaEditorCursor);
    const query = getExpressionTokenQuery(rawValue, formulaEditorCursor).trim().toLowerCase();
    const shouldOfferGeneralSuggestions =
      /(^|[\s(,?:+\-*/!<>=&|])$/.test(beforeCursor) ||
      /\(\s*$/.test(beforeCursor);
    if (!query && !shouldOfferGeneralSuggestions) return [];
    return formulaEditor.tokens
      .filter((item) => (
        !query ||
        item.token.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query)
      ))
      .slice(0, 8);
  }, [formulaEditor, formulaEditorCursor]);
  const inlineFormulaSuggestion = formulaEditorSuggestions[0] ?? null;
  const formulaEditorBeforeCursor = formulaEditor ? formulaEditor.value.slice(0, formulaEditorCursor) : '';
  const formulaEditorAfterCursor = formulaEditor ? formulaEditor.value.slice(formulaEditorCursor) : '';
  const formulaEditorPossibleOutput = useMemo(() => {
    if (!formulaEditor?.resolvePreview) return null;
    return formulaEditor.resolvePreview(formulaEditor.value);
  }, [formulaEditor]);
  const formulaHelpExamples = useMemo<FormulaHelpExample[]>(() => {
    if (!formulaEditor) return [];
    const areaToken =
      formulaEditor.tokens.find((item) => item.token.startsWith('area.') || item.token.startsWith('areas.'))?.token ??
      'area.total_sqm';
    const formulaToken =
      formulaEditor.tokens.find((item) => item.token.startsWith('formula.'))?.token ??
      'formula.resin_rate';
    const jobToken =
      formulaEditor.tokens.find((item) => item.token.startsWith('specs.global.'))?.token ??
      'specs.global.layers';

    return [
      {
        label: 'If / else',
        expression: `if(${jobToken} > 2, ${areaToken} * ${formulaToken}, ${areaToken})`,
        note: 'Use one value when the condition is true and another when false.',
        sample: 'Sample: layers=3, area=12, rate=1.5 => 18',
      },
      {
        label: 'Ternary',
        expression: `${jobToken} > 2 ? ${areaToken} : 0`,
        note: 'Short form for conditional quantity or rate switching.',
        sample: 'Sample: layers=3, area=12 => 12',
      },
      {
        label: 'Text match',
        expression: `if(specs.global.finish_type == "premium", ${formulaToken}, 0)`,
        note: 'Works with text/select values using == or !=.',
        sample: 'Sample: finish_type="premium", rate=1.5 => 1.5',
      },
      {
        label: 'Boolean flag',
        expression: `if(specs.global.include_topcoat, ${areaToken} * ${formulaToken}, 0)`,
        note: 'Booleans can be used directly as the condition.',
        sample: 'Sample: include_topcoat=true, area=12, rate=1.5 => 18',
      },
      {
        label: 'Combined rules',
        expression: `if(${jobToken} >= 2 && ${areaToken} > 0, ${formulaToken}, 0)`,
        note: 'Combine conditions with &&, ||, and not / !.',
        sample: 'Sample: layers=3, area=12, rate=1.5 => 1.5',
      },
    ];
  }, [formulaEditor]);
  const filteredGlobalFields = useMemo(() => {
    const query = globalFieldSearch.trim().toLowerCase();
    if (!query) return form.globalFields;
    return form.globalFields.filter((field) =>
      field.label.toLowerCase().includes(query) ||
      field.key.toLowerCase().includes(query) ||
      field.inputType.toLowerCase().includes(query) ||
      field.unit.toLowerCase().includes(query)
    );
  }, [form.globalFields, globalFieldSearch]);
  const filteredFormulaConstants = useMemo(() => {
    const query = formulaConstantSearch.trim().toLowerCase();
    if (!query) return form.formulaConstants;
    return form.formulaConstants.filter((field) =>
      field.label.toLowerCase().includes(query) ||
      field.key.toLowerCase().includes(query) ||
      field.value.toLowerCase().includes(query) ||
      field.unit.toLowerCase().includes(query)
    );
  }, [form.formulaConstants, formulaConstantSearch]);

  const existingSlugSet = useMemo(
    () => new Set(formulaLibrary.filter((item) => item.id !== activeFormulaId).map((item) => item.slug)),
    [activeFormulaId, formulaLibrary]
  );
  const slugExists = form.slug.trim() ? existingSlugSet.has(slugify(form.slug)) : false;
  const suggestedSlug = useMemo(() => suggestUniqueSlug(form.slug || form.name, existingSlugSet), [existingSlugSet, form.name, form.slug]);
  const validationIssue = useMemo(() => validate(form) ?? (slugExists ? 'Formula slug already exists' : null), [form, slugExists]);
  const saveBody = useMemo(
    () => ({
      name: form.name.trim(),
      slug: slugify(form.slug),
      fabricationType: form.fabricationType.trim(),
      description: form.description.trim() || undefined,
      specificationSchema: payload.specificationSchema,
      formulaConfig: payload.formulaConfig,
    }),
    [form, payload]
  );

  const updateArea = (areaId: string, patch: Partial<AreaRule>) => {
    setFormState((current) => ({
      ...current,
      areas: current.areas.map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
    }));
  };

  const toggleAreaCollapse = (areaId: string) => {
    setCollapsedAreaIds((current) => ({ ...current, [areaId]: !current[areaId] }));
  };

  const applyFormulaEditorValue = (nextValue: string, nextCursorPosition?: number) => {
    if (!formulaEditor) return;
    formulaEditor.onChange(nextValue);
    setFormulaEditor((current) => (current ? { ...current, value: nextValue } : current));
    const resolvedCursor = typeof nextCursorPosition === 'number' ? nextCursorPosition : nextValue.length;
    setFormulaEditorCursor(resolvedCursor);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const textarea = formulaEditorTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(resolvedCursor, resolvedCursor);
      });
    }
  };

  const insertFormulaEditorToken = (token: string) => {
    const textarea = formulaEditorTextareaRef.current;
    if (!formulaEditor || !textarea) {
      const nextValue = insertExpressionToken(formulaEditor?.value ?? '', token, formulaEditorCursor);
      const nextCursor = nextValue.length - (formulaEditor?.value ?? '').slice(formulaEditorCursor).length;
      applyFormulaEditorValue(nextValue, nextCursor);
      return;
    }

    const { start, end, prefix } = getExpressionInsertRange(formulaEditor.value, formulaEditorCursor);
    const insertedText = `${prefix}${token}`;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    textarea.setRangeText(insertedText, start, end, 'end');
    const nextCursor = start + insertedText.length;
    applyFormulaEditorValue(textarea.value, nextCursor);
  };

  const openFormulaEditor = (request: FormulaEditorRequest) => {
    setFormulaEditor(request);
    setFormulaEditorSearch('');
    setFormulaEditorCursor(request.value.length);
  };

  const copyFormulaSnippet = async (snippet: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      toast.error('Clipboard is not available here');
      return;
    }
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success('Formula example copied');
    } catch {
      toast.error('Failed to copy formula example');
    }
  };

  const resolveGlobalFormulaOutputPreview = (expression: string) => {
    try {
      return formatPossibleFormulaOutput(evaluatePlaygroundExpression(expression || '0', resolvedPlaygroundValues));
    } catch {
      return 'Unable to resolve with current playground values';
    }
  };

  const buildAreaResolvedPreviewValues = (areaId: string) => {
    const resolvedValues = buildPlaygroundBaseValues(form, playgroundValues);
    addScopedAreaPlaygroundValues(resolvedValues, form.areas, playgroundValues);
    const area = form.areas.find((item) => item.id === areaId);
    if (!area) return null;
    for (const field of area.fields ?? []) {
      const fieldKey = field.key.trim();
      if (!fieldKey) continue;
      const rawValue = playgroundValues[`area.${area.id}.${field.key}`] ?? '';
      resolvedValues[`area.${fieldKey}`] = parsePlaygroundValue(rawValue, field.inputType);
    }
    applyResolvedFormulaFields(resolvedValues, form.formulaConstants, 'formula.');
    applyResolvedFormulaFields(resolvedValues, area.formulaValues ?? [], 'area.formula.');
    return { area, resolvedValues };
  };

  const resolveAreaFormulaOutputPreview = (areaId: string, expression: string) => {
    try {
      const previewState = buildAreaResolvedPreviewValues(areaId);
      if (!previewState) return '--';
      return formatPossibleFormulaOutput(evaluatePlaygroundExpression(expression || '0', previewState.resolvedValues));
    } catch {
      return 'Unable to resolve with current playground values';
    }
  };

  const resolveAreaMaterialRuleOutputPreview = (areaId: string, rule: AreaRule['materials'][number]) => {
    try {
      const previewState = buildAreaResolvedPreviewValues(areaId);
      if (!previewState) return '--';
      const { resolvedValues } = previewState;
      const quantity = Number(evaluatePlaygroundExpression(rule.quantityExpression || '0', resolvedValues));
      const wastePercent = Number(parsePlaygroundValue(rule.wastePercent || '0', 'percent'));
      const finalQuantity = quantity * (1 + wastePercent / 100);
      const selectedMaterialId =
        rule.materialSource === 'global'
          ? playgroundValues[`global.${rule.materialSelectorKey}`] ||
            form.globalFields.find((field) => field.key === rule.materialSelectorKey)?.defaultMaterialId ||
            ''
          : rule.materialId;
      const selectedMaterial = selectedMaterialId
        ? materials.find((material) => material.id === selectedMaterialId)
        : null;
      const unitSuffix = selectedMaterial?.unit?.trim() ? ` ${selectedMaterial.unit.trim()}` : '';
      const parts = [`Qty ${formatPreviewQty(quantity)}${unitSuffix}`];
      if (wastePercent) parts.push(`Final ${formatPreviewQty(finalQuantity)}${unitSuffix}`);
      if (wastePercent) parts.push(`Waste ${formatPreviewQty(wastePercent)}%`);
      return parts.join(' • ');
    } catch {
      return 'Unable to resolve with current playground values';
    }
  };

  const resolveAreaLaborRuleOutputPreview = (areaId: string, rule: AreaRule['labor'][number]) => {
    try {
      const previewState = buildAreaResolvedPreviewValues(areaId);
      if (!previewState) return '--';
      const { resolvedValues } = previewState;
      const quantity = Number(evaluatePlaygroundExpression(rule.quantityExpression || '0', resolvedValues));
      const crew = Number(
        evaluatePlaygroundExpression(rule.crewSizeExpression.trim() ? rule.crewSizeExpression : '1', resolvedValues)
      );
      const productivity = Number(
        evaluatePlaygroundExpression(rule.productivityPerWorkerPerDay.trim() ? rule.productivityPerWorkerPerDay : '0', resolvedValues)
      );
      const parts = [`Qty ${formatPreviewQty(quantity)}`, `Crew ${formatPreviewQty(crew)}`, `Prod ${formatPreviewQty(productivity)}/day`];
      if (crew > 0 && productivity > 0) {
        parts.push(`Days ${formatPreviewQty(quantity / (crew * productivity))}`);
      }
      return parts.join(' • ');
    } catch {
      return 'Unable to resolve with current playground values';
    }
  };

  const openGlobalFieldCreate = (inputType: FieldType) => {
    const initialDraft = createGlobalFieldDraft(inputType);
    setGlobalFieldEditor({
      mode: 'create',
      draft: initialDraft,
      initialDraft,
    });
  };

  const openGlobalFieldEdit = (field: DynamicField) => {
    const initialDraft = { ...field };
    setGlobalFieldEditor({
      mode: 'edit',
      draft: { ...field },
      initialDraft,
    });
  };

  const duplicateGlobalField = (field: DynamicField) => {
    setFormState((current) => {
      const nextKey = createUniqueFormulaKey(current.globalFields.map((item) => item.key), field.key || field.label || 'field');
      const duplicate = {
        ...field,
        id: uid('field'),
        key: nextKey,
        label: field.label?.trim() ? `${field.label} Copy` : 'Input Copy',
      };
      const index = current.globalFields.findIndex((item) => item.id === field.id);
      return {
        ...current,
        globalFields: [
          ...current.globalFields.slice(0, index + 1),
          duplicate,
          ...current.globalFields.slice(index + 1),
        ],
      };
    });
  };

  const openFormulaConstantCreate = () => {
    const initialDraft = createFormulaConstantDraft();
    setFormulaConstantEditor({
      mode: 'create',
      draft: initialDraft,
      initialDraft,
    });
  };

  const openFormulaConstantEdit = (field: FormulaConstantField) => {
    const initialDraft = { ...field };
    setFormulaConstantEditor({
      mode: 'edit',
      draft: { ...field },
      initialDraft,
    });
  };

  const duplicateFormulaConstant = (field: FormulaConstantField) => {
    setFormState((current) => {
      const nextKey = createUniqueFormulaKey(current.formulaConstants.map((item) => item.key), field.key || field.label || 'value');
      const duplicate = {
        ...field,
        id: uid('constant'),
        key: nextKey,
        label: field.label?.trim() ? `${field.label} Copy` : 'Value Copy',
      };
      const index = current.formulaConstants.findIndex((item) => item.id === field.id);
      return {
        ...current,
        formulaConstants: [
          ...current.formulaConstants.slice(0, index + 1),
          duplicate,
          ...current.formulaConstants.slice(index + 1),
        ],
      };
    });
  };

  const openAreaFieldCreate = (area: AreaRule) => {
    const initialDraft = newField();
    setAreaFieldEditor({
      areaId: area.id,
      areaLabel: area.label || area.key || 'Area',
      mode: 'create',
      draft: initialDraft,
      initialDraft,
    });
  };

  const openAreaFieldEdit = (area: AreaRule, field: DynamicField) => {
    const initialDraft = { ...field };
    setAreaFieldEditor({
      areaId: area.id,
      areaLabel: area.label || area.key || 'Area',
      mode: 'edit',
      draft: { ...field },
      initialDraft,
    });
  };

  const duplicateAreaField = (area: AreaRule, field: DynamicField) => {
    setFormState((current) => ({
      ...current,
      areas: current.areas.map((item) => {
        if (item.id !== area.id) return item;
        const nextKey = createUniqueFormulaKey(item.fields.map((entry) => entry.key), field.key || field.label || 'field');
        const duplicate = {
          ...field,
          id: uid('field'),
          key: nextKey,
          label: field.label?.trim() ? `${field.label} Copy` : 'Area Input Copy',
        };
        const index = item.fields.findIndex((entry) => entry.id === field.id);
        return {
          ...item,
          fields: [...item.fields.slice(0, index + 1), duplicate, ...item.fields.slice(index + 1)],
        };
      }),
    }));
  };

  const openAreaFormulaValueCreate = (area: AreaRule) => {
    const initialDraft = createFormulaConstantDraft();
    setAreaFormulaValueEditor({
      areaId: area.id,
      areaLabel: area.label || area.key || 'Area',
      mode: 'create',
      draft: initialDraft,
      initialDraft,
    });
  };

  const openAreaFormulaValueEdit = (area: AreaRule, field: FormulaConstantField) => {
    const initialDraft = { ...field };
    setAreaFormulaValueEditor({
      areaId: area.id,
      areaLabel: area.label || area.key || 'Area',
      mode: 'edit',
      draft: { ...field },
      initialDraft,
    });
  };

  const duplicateAreaFormulaValue = (area: AreaRule, field: FormulaConstantField) => {
    setFormState((current) => ({
      ...current,
      areas: current.areas.map((item) => {
        if (item.id !== area.id) return item;
        const nextKey = createUniqueFormulaKey(item.formulaValues.map((entry) => entry.key), field.key || field.label || 'value');
        const duplicate = {
          ...field,
          id: uid('area-formula'),
          key: nextKey,
          label: field.label?.trim() ? `${field.label} Copy` : 'Area Value Copy',
        };
        const index = item.formulaValues.findIndex((entry) => entry.id === field.id);
        return {
          ...item,
          formulaValues: [...item.formulaValues.slice(0, index + 1), duplicate, ...item.formulaValues.slice(index + 1)],
        };
      }),
    }));
  };

  const saveGlobalFieldEditor = () => {
    if (!globalFieldEditor) return;
    const draftField = {
      ...globalFieldEditor.draft,
      key: normalizeFormulaKey(globalFieldEditor.draft.key),
      label: globalFieldEditor.draft.label.trim(),
      unit: globalFieldEditor.draft.unit.trim(),
      defaultMaterialId: globalFieldEditor.draft.inputType === 'material' ? (globalFieldEditor.draft.defaultMaterialId ?? '').trim() : '',
    };
    if (!draftField.label) {
      toast.error('Input label is required');
      return;
    }
    if (!draftField.key) {
      toast.error('Input key is required');
      return;
    }

    const duplicate = form.globalFields.some(
      (field) => field.id !== draftField.id && field.key.trim().toLowerCase() === draftField.key.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error('Input key already exists');
      return;
    }

    if (globalFieldEditor.mode === 'create') {
      setFormState((current) => ({
        ...current,
        globalFields: [...current.globalFields, draftField],
      }));
      toast.success('Job input added');
    } else {
      const previousKey = globalFieldEditor.initialDraft.key.trim();
      setFormState((current) => ({
        ...current,
        globalFields: current.globalFields.map((field) => (field.id === draftField.id ? draftField : field)),
      }));
      if (previousKey && previousKey !== draftField.key) {
        setPlaygroundValues((current) => {
          const previousValue = current[`global.${previousKey}`];
          if (previousValue === undefined) return current;
          const next = { ...current };
          delete next[`global.${previousKey}`];
          next[`global.${draftField.key}`] = previousValue;
          return next;
        });
      }
      toast.success('Job input updated');
    }
    closeGlobalFieldEditor();
  };

  const saveFormulaConstantEditor = () => {
    if (!formulaConstantEditor) return;
    const draftField = {
      ...formulaConstantEditor.draft,
      label: formulaConstantEditor.draft.label.trim(),
      key: normalizeFormulaKey(formulaConstantEditor.draft.key),
      value: formulaConstantEditor.draft.value.trim(),
      unit: formulaConstantEditor.draft.unit.trim(),
    };
    if (!draftField.label) {
      toast.error('Value label is required');
      return;
    }
    if (!draftField.key) {
      toast.error('Value key is required');
      return;
    }
    if (!draftField.value) {
      toast.error('Formula or fixed value is required');
      return;
    }

    const duplicate = form.formulaConstants.some(
      (field) => field.id !== draftField.id && field.key.trim().toLowerCase() === draftField.key.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error('Formula key already exists');
      return;
    }

    if (formulaConstantEditor.mode === 'create') {
      setFormState((current) => ({
        ...current,
        formulaConstants: [...current.formulaConstants, draftField],
      }));
      toast.success('Stored value added');
    } else {
      setFormState((current) => {
        const previousKey = current.formulaConstants.find((field) => field.id === draftField.id)?.key ?? '';
        const renamed = renameFormulaReferences(current, previousKey, draftField.key);
        return {
          ...renamed,
          formulaConstants: renamed.formulaConstants.map((field) => (field.id === draftField.id ? draftField : field)),
        };
      });
      toast.success('Stored value updated');
    }
    closeFormulaConstantEditor();
  };

  const saveAreaFieldEditor = () => {
    if (!areaFieldEditor) return;
    const draftField = {
      ...areaFieldEditor.draft,
      label: areaFieldEditor.draft.label.trim(),
      key: normalizeFormulaKey(areaFieldEditor.draft.key),
      unit: areaFieldEditor.draft.unit.trim(),
    };
    if (!draftField.label) {
      toast.error('Area input label is required');
      return;
    }
    if (!draftField.key) {
      toast.error('Area input key is required');
      return;
    }

    const area = form.areas.find((item) => item.id === areaFieldEditor.areaId);
    if (!area) {
      toast.error('Area not found');
      return;
    }
    const duplicate = area.fields.some(
      (field) => field.id !== draftField.id && field.key.trim().toLowerCase() === draftField.key.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error('Area input key already exists in this area');
      return;
    }

    setFormState((current) => ({
      ...current,
      areas: current.areas.map((item) => {
        if (item.id !== areaFieldEditor.areaId) return item;
        return {
          ...item,
          fields:
            areaFieldEditor.mode === 'create'
              ? [...item.fields, draftField]
              : item.fields.map((field) => (field.id === draftField.id ? draftField : field)),
        };
      }),
    }));
    if (areaFieldEditor.mode === 'edit') {
      const previousKey = areaFieldEditor.initialDraft.key.trim();
      if (previousKey && previousKey !== draftField.key) {
        setPlaygroundValues((current) => {
          const previousValue = current[`area.${areaFieldEditor.areaId}.${previousKey}`];
          if (previousValue === undefined) return current;
          const next = { ...current };
          delete next[`area.${areaFieldEditor.areaId}.${previousKey}`];
          next[`area.${areaFieldEditor.areaId}.${draftField.key}`] = previousValue;
          return next;
        });
      }
    }
    toast.success(areaFieldEditor.mode === 'create' ? 'Area input added' : 'Area input updated');
    closeAreaFieldEditor();
  };

  const saveAreaFormulaValueEditor = () => {
    if (!areaFormulaValueEditor) return;
    const draftField = {
      ...areaFormulaValueEditor.draft,
      label: areaFormulaValueEditor.draft.label.trim(),
      key: normalizeFormulaKey(areaFormulaValueEditor.draft.key),
      value: areaFormulaValueEditor.draft.value.trim(),
      unit: areaFormulaValueEditor.draft.unit.trim(),
    };
    if (!draftField.label) {
      toast.error('Area value label is required');
      return;
    }
    if (!draftField.key) {
      toast.error('Area value key is required');
      return;
    }
    if (!draftField.value) {
      toast.error('Area formula or fixed value is required');
      return;
    }

    const area = form.areas.find((item) => item.id === areaFormulaValueEditor.areaId);
    if (!area) {
      toast.error('Area not found');
      return;
    }
    const duplicate = area.formulaValues.some(
      (field) => field.id !== draftField.id && field.key.trim().toLowerCase() === draftField.key.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error('Area value key already exists in this area');
      return;
    }

    setFormState((current) => ({
      ...current,
      areas: current.areas.map((item) => {
        if (item.id !== areaFormulaValueEditor.areaId) return item;
        return {
          ...item,
          formulaValues:
            areaFormulaValueEditor.mode === 'create'
              ? [...item.formulaValues, draftField]
              : item.formulaValues.map((field) => (field.id === draftField.id ? draftField : field)),
        };
      }),
    }));
    toast.success(areaFormulaValueEditor.mode === 'create' ? 'Area value added' : 'Area value updated');
    closeAreaFormulaValueEditor();
  };

  const acceptInlineFormulaSuggestion = () => {
    if (!formulaEditor || !inlineFormulaSuggestion) return;
    insertFormulaEditorToken(inlineFormulaSuggestion.token);
  };

  const closeGlobalFieldEditor = () =>
    animateDrawerClose(globalFieldBackdropRef.current, globalFieldPanelRef.current, () => setGlobalFieldEditor(null));

  const closeFormulaConstantEditor = () =>
    animateDrawerClose(formulaConstantBackdropRef.current, formulaConstantPanelRef.current, () => setFormulaConstantEditor(null));

  const closeAreaFieldEditor = () =>
    animateDrawerClose(areaFieldBackdropRef.current, areaFieldPanelRef.current, () => setAreaFieldEditor(null));

  const closeAreaFormulaValueEditor = () =>
    animateDrawerClose(areaFormulaValueBackdropRef.current, areaFormulaValuePanelRef.current, () => setAreaFormulaValueEditor(null));

  const attemptCloseGlobalFieldEditor = () => {
    if (!globalFieldEditor) return;
    if (isDrawerDraftDirty(globalFieldEditor.draft, globalFieldEditor.initialDraft)) {
      toast.error('Unsaved changes detected. Save or use Cancel to discard them.');
      return;
    }
    closeGlobalFieldEditor();
  };

  const attemptCloseFormulaConstantEditor = () => {
    if (!formulaConstantEditor) return;
    if (isDrawerDraftDirty(formulaConstantEditor.draft, formulaConstantEditor.initialDraft)) {
      toast.error('Unsaved changes detected. Save or use Cancel to discard them.');
      return;
    }
    closeFormulaConstantEditor();
  };

  const attemptCloseAreaFieldEditor = () => {
    if (!areaFieldEditor) return;
    if (isDrawerDraftDirty(areaFieldEditor.draft, areaFieldEditor.initialDraft)) {
      toast.error('Unsaved changes detected. Save or use Cancel to discard them.');
      return;
    }
    closeAreaFieldEditor();
  };

  const attemptCloseAreaFormulaValueEditor = () => {
    if (!areaFormulaValueEditor) return;
    if (isDrawerDraftDirty(areaFormulaValueEditor.draft, areaFormulaValueEditor.initialDraft)) {
      toast.error('Unsaved changes detected. Save or use Cancel to discard them.');
      return;
    }
    closeAreaFormulaValueEditor();
  };

  const applyRestoredFormState = (nextState: BuilderState) => {
    setDraft(nextState);
    setUndoStack([]);
    setRedoStack([]);
  };

  const undoFormState = () => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = cloneBuilderState(stack[stack.length - 1]);
      setRedoStack((current) => [...current.slice(-(historyLimitRef.current - 1)), cloneBuilderState(form)]);
      setDraft(previous);
      return stack.slice(0, -1);
    });
  };

  const redoFormState = () => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = cloneBuilderState(stack[stack.length - 1]);
      setUndoStack((current) => [...current.slice(-(historyLimitRef.current - 1)), cloneBuilderState(form)]);
      setDraft(next);
      return stack.slice(0, -1);
    });
  };

  const handleRestoreVersion = async (version: FormulaLibraryVersion) => {
    if (!activeFormulaId) return;
    try {
      const restored = await restoreFormulaVersion({ id: activeFormulaId, versionId: version.id }).unwrap();
      const nextDraft = parseFormula(restored);
      const nextPayload = buildPayload(nextDraft, parsePlaygroundValues(restored));
      applyRestoredFormState(nextDraft);
      if (typeof window !== 'undefined') {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(
          getFormulaDraftStorageKey(activeFormulaId),
          JSON.stringify({ form: nextDraft, slugEdited: true, savedAt })
        );
      }
      setVersionHistoryOpen(false);
      setAutoSaveState('saved');
      setLastSavedAt(new Date().toISOString());
      toast.success(`Restored version ${version.versionNumber}`);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to restore version';
      toast.error(message);
    }
  };

  useEffect(() => {
    setActiveFormulaId(formulaId);
    setUndoStack([]);
    setRedoStack([]);
    if (!formulaId) {
      hydratedPlaygroundFormulaIdRef.current = null;
      setPlaygroundValues({});
    }
  }, [formulaId]);

  useEffect(() => {
    if (!formula || formula.id !== activeFormulaId) return;
    if (hydratedPlaygroundFormulaIdRef.current === formula.id) return;
    setPlaygroundValues(initialPlaygroundValues);
    hydratedPlaygroundFormulaIdRef.current = formula.id;
  }, [activeFormulaId, formula, initialPlaygroundValues]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedDraftKeyRef.current === storageKey) return;

    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { form?: BuilderState; slugEdited?: boolean; savedAt?: string };
        if (parsed.form) {
          setDraft(parsed.form);
          setUndoStack([]);
          setRedoStack([]);
        }
        if (typeof parsed.slugEdited === 'boolean') setSlugEdited(parsed.slugEdited);
        if (typeof parsed.savedAt === 'string') setLastSavedAt(parsed.savedAt);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    } else if (draft == null) {
      setDraft(null);
      setSlugEdited(false);
      setLastSavedAt(null);
      setUndoStack([]);
      setRedoStack([]);
    }

    hydratedDraftKeyRef.current = storageKey;
  }, [draft, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedDraftKeyRef.current !== storageKey) return;

    const savedAt = new Date().toISOString();
    window.localStorage.setItem(storageKey, JSON.stringify({ form, slugEdited, savedAt }));
    setLastSavedAt(savedAt);
    setAutoSaveState((current) => (current === 'saving' ? current : 'draft'));
  }, [form, slugEdited, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMeta = event.ctrlKey || event.metaKey;
      if (!hasMeta) return;
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoFormState();
        return;
      }
      if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redoFormState();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redoStack.length, undoStack.length, form]);

  const saveFormula = async ({ mode }: { mode: 'manual' | 'auto' }) => {
    const issue = validate(form);
    if (issue) {
      if (mode === 'manual') toast.error(issue);
      return;
    }
    if (slugExists) {
      if (mode === 'manual') toast.error(`Formula slug already exists. Try ${suggestedSlug}.`);
      return;
    }
    if (saveInFlightRef.current) return;

    try {
      saveInFlightRef.current = true;
      setAutoSaveState('saving');
      if (activeFormulaId) {
        const updated = await updateFormula({ id: activeFormulaId, data: { ...saveBody, saveMode: mode } }).unwrap();
        const nextDraft = parseFormula(updated);
        setDraft(nextDraft);
        if (typeof window !== 'undefined') {
          const savedAt = new Date().toISOString();
          window.localStorage.setItem(
            getFormulaDraftStorageKey(activeFormulaId),
            JSON.stringify({ form: nextDraft, slugEdited: true, savedAt })
          );
        }
        if (mode === 'manual') toast.success('Formula saved');
      } else {
        const created = await createFormula({ ...saveBody, saveMode: mode }).unwrap();
        const nextDraft = parseFormula(created);
        const nextStorageKey = getFormulaDraftStorageKey(created.id);
        if (typeof window !== 'undefined') {
          const savedAt = new Date().toISOString();
          window.localStorage.setItem(nextStorageKey, JSON.stringify({ form: nextDraft, slugEdited: true, savedAt }));
          window.localStorage.removeItem(getFormulaDraftStorageKey(undefined));
        }
        hydratedDraftKeyRef.current = nextStorageKey;
        setActiveFormulaId(created.id);
        setDraft(nextDraft);
        setSlugEdited(true);
        router.replace(`/stock/job-budget/formulas/${created.id}/edit`);
        if (mode === 'manual') toast.success('Formula created');
      }
      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      setAutoSaveState('saved');
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to save formula';
      setAutoSaveState('error');
      if (mode === 'manual') toast.error(message);
    } finally {
      saveInFlightRef.current = false;
    }
  };

  if (!canView || !canManage) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">You do not have permission to manage formula library entries.</div>;
  }

  if (formulaLoading && !formula && !draft) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  return (
    <div
      onContextMenuCapture={(event) => event.stopPropagation()}
      className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f0fdfa_45%,#f8fafc_100%)] px-4 py-4 text-select dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_52%,#020617_100%)] sm:-mx-5 sm:-my-5 sm:px-5 sm:py-5 lg:-mx-8 lg:-my-6 lg:px-8 lg:py-6 [&_*]:selection:bg-cyan-200/70 [&_*]:selection:text-slate-950 [&_input]:select-text [&_input]:context-menu [&_p]:select-text [&_pre]:select-text [&_span]:select-text [&_textarea]:select-text"
    >
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.12),transparent_38%),linear-gradient(135deg,#ffffff,#f8fafc)] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_38%),linear-gradient(135deg,#0f172a,#020617)] lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <Link href="/stock/job-budget/formulas" className="text-[11px] font-semibold uppercase tracking-[0.26em] text-emerald-700 dark:text-emerald-300">
              Stock / Job Budget / Formula Library
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {formulaId ? 'Edit costing formula' : 'Create costing formula'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
              Build reusable job costing logic. Keep consumption math in the formula, then let each job choose its own resin, gelcoat, fiber, catalyst, and other brand materials.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/stock/job-budget/formulas">
              <Button variant="secondary">Back to formulas</Button>
            </Link>
            <Button variant="secondary" onClick={undoFormState} disabled={undoStack.length === 0}>
              Undo
            </Button>
            <Button variant="secondary" onClick={redoFormState} disabled={redoStack.length === 0}>
              Redo
            </Button>
            <Button variant="secondary" onClick={() => setVersionHistoryOpen(true)} disabled={!activeFormulaId}>
              Version history
            </Button>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                autoSaveState === 'error'
                  ? 'bg-rose-500'
                  : autoSaveState === 'saving'
                    ? 'bg-amber-500'
                    : autoSaveState === 'saved'
                      ? 'bg-emerald-500'
                      : 'bg-slate-300 dark:bg-slate-600'
              }`} />
              <span>{formatAutoSaveLabel(autoSaveState, lastSavedAt)}</span>
            </div>
            <Button onClick={() => void saveFormula({ mode: 'manual' })} loading={saving}>Save formula</Button>
          </div>
        </div>
      </section>

      <section className="mt-5 space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Inputs</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{form.globalFields.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Areas</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{form.areas.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Material rules</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{form.areas.reduce((sum, area) => sum + area.materials.length, 0)}</p>
          </div>
          <div className={`rounded-2xl border px-4 py-3 shadow-sm ${
            validationIssue
              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
          }`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Save readiness</p>
            <p className="mt-1 text-sm font-semibold">{validationIssue ?? 'Ready to save'}</p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3">
          <div className="rounded-3xl border border-sky-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-sky-500/20 dark:bg-slate-950 dark:text-slate-400">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">Advanced mode</p>
            <p className="mt-2">This mode exposes raw keys, tokens, and formula-oriented editing controls for power users.</p>
          </div>
          <div className="rounded-3xl border border-emerald-200 bg-white p-4 text-slate-700 shadow-sm dark:border-emerald-400/20 dark:bg-slate-950 dark:text-slate-300">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Recommended flow</p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="font-semibold text-slate-950 dark:text-white">1. Name the formula</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Use the fabrication type for grouping, like GRP Lining or Steel Fabrication.</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="font-semibold text-slate-950 dark:text-white">2. Add job inputs</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Use material dropdown fields for brand choices and number fields for kg/sqm rates.</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="font-semibold text-slate-950 dark:text-white">3. Add area rules</p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">Each area can calculate material, labor, and waste separately.</p>
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 md:col-span-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Formula key rules</p>
                <p className="mt-1 text-xs text-slate-500">Keys support letters, numbers, hyphen, and underscore. Spaces are converted to underscore.</p>
              </div>
              <div className="grid gap-2 font-mono text-[11px] sm:grid-cols-3">
                <p className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">area.area_sqm</p>
                <p className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">specs.global.resin_kg_per_sqm</p>
                <p className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">formula.resin_use_rate</p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Foundation</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Formula details</h2>
                </div>
                <div className="flex items-center gap-2">
                  <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">These details help users find the right formula when issuing a budget for a job variation.</p>
                  <Button size="sm" variant="secondary" onClick={() => setFoundationCollapsed((current) => !current)}>
                    {foundationCollapsed ? 'Expand' : 'Collapse'}
                  </Button>
                </div>
              </div>
              {!foundationCollapsed ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Formula name
                  <input
                    value={form.name}
                    placeholder="GRP Lining - Walls and Floor"
                    onChange={(event) =>
                      setFormState((current) => ({
                        ...current,
                        name: event.target.value,
                        slug: slugEdited ? current.slug : slugify(event.target.value),
                      }))
                    }
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  URL key / slug
                  <input
                    value={form.slug}
                    placeholder="grp-lining-wall-floor"
                    onChange={(event) => {
                      setSlugEdited(true);
                      setFormState((current) => ({ ...current, slug: normalizeSlugInput(event.target.value) }));
                    }}
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                  <div className={`mt-2 rounded-xl border px-3 py-2 text-xs normal-case tracking-normal ${
                    !form.slug.trim()
                      ? 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'
                      : slugExists
                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
                  }`}>
                    {!form.slug.trim()
                      ? 'Enter a slug or type formula name to generate one.'
                      : slugExists
                        ? `Duplicate slug. Suggested: ${suggestedSlug}`
                        : 'Slug is available.'}
                    {slugExists ? (
                      <button
                        type="button"
                        className="ml-2 font-semibold underline"
                        onClick={() => {
                          setSlugEdited(true);
                          setFormState((current) => ({ ...current, slug: suggestedSlug }));
                        }}
                      >
                        Use suggestion
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Fabrication group
                  <input
                    value={form.fabricationType}
                    placeholder="GRP Lining"
                    onChange={(event) => setFormState((current) => ({ ...current, fabricationType: event.target.value }))}
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Internal note
                  <input
                    value={form.description}
                    placeholder="Explains where this formula should be used"
                    onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>
              </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-cyan-200 bg-white/95 p-5 shadow-sm dark:border-cyan-500/20 dark:bg-slate-950/80">
              <div className="flex flex-col gap-2 border-b border-cyan-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700 dark:text-cyan-300">Global keys and formulas</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Stored formula values</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Save fixed rates here once and reuse them inside expressions as <span className="font-mono">formula.key</span>.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">Keep shared keys compact, then expand when you need to add or edit reusable formula-side values.</p>
                  <Button size="sm" variant="secondary" onClick={() => setFormulaConstantsCollapsed((current) => !current)}>
                    {formulaConstantsCollapsed ? 'Expand' : 'Collapse'}
                  </Button>
                </div>
              </div>
              {!formulaConstantsCollapsed ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 dark:border-cyan-500/20 dark:bg-cyan-500/10">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Stored values</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{form.formulaConstants.length}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={formulaConstantSearch}
                    onChange={(event) => setFormulaConstantSearch(event.target.value)}
                    placeholder="Search values"
                    className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-300 dark:border-cyan-500/20 dark:bg-slate-950 dark:text-white sm:w-52"
                  />
                  <Button size="sm" variant="secondary" onClick={openFormulaConstantCreate}>
                    Add value
                  </Button>
                </div>
              </div>
              ) : null}

              {!formulaConstantsCollapsed ? (
              <div className="mt-4 space-y-3">
                {form.formulaConstants.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/70 px-4 py-5 text-sm text-slate-500 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-slate-400">
                    Add resin use rate, fiber use rate, catalyst factor, overlap factor, or any other fixed formula-side value here.
                  </div>
                ) : filteredFormulaConstants.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/70 px-4 py-5 text-sm text-slate-500 dark:border-cyan-500/20 dark:bg-cyan-500/5 dark:text-slate-400">
                    No stored values match this search.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {filteredFormulaConstants.map((field) => {
                      const index = form.formulaConstants.findIndex((item) => item.id === field.id);
                      return (
                        <div
                          key={field.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{field.label || 'Untitled value'}</p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Possible output: {resolveGlobalFormulaOutputPreview(field.value || '0')}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                              {field.unit || 'no unit'}
                            </span>
                          </div>
                          <div className="mt-4 space-y-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Key</p>
                              <p className="mt-1 truncate font-mono text-xs text-cyan-700 dark:text-cyan-300">{field.key ? `formula.${field.key}` : 'formula.key'}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Formula / Value</p>
                              <p className="mt-1 line-clamp-3 break-all font-mono text-xs text-slate-600 dark:text-slate-300">{field.value || '--'}</p>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button size="sm" variant="secondary" onClick={() => openFormulaConstantEdit(field)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => duplicateFormulaConstant(field)}>
                              Duplicate
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={index === 0}
                              onClick={() =>
                                setFormState((current) => ({
                                  ...current,
                                  formulaConstants: reorderItemsById(current.formulaConstants, field.id, current.formulaConstants[index - 1]?.id ?? field.id),
                                }))
                              }
                            >
                              Up
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={index === form.formulaConstants.length - 1}
                              onClick={() =>
                                setFormState((current) => ({
                                  ...current,
                                  formulaConstants: reorderItemsById(current.formulaConstants, field.id, current.formulaConstants[index + 1]?.id ?? field.id),
                                }))
                              }
                            >
                              Down
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setFormState((current) => ({
                                  ...current,
                                  formulaConstants: current.formulaConstants.filter((item) => item.id !== field.id),
                                }))
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-teal-200 bg-white/95 p-5 shadow-sm dark:border-teal-500/20 dark:bg-slate-950/80">
              <div className="flex flex-col gap-2 border-b border-teal-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-300">Job-level inputs</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Material choices and consumption rates</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    Add material dropdowns for brand-sensitive items, then add numeric inputs for rates such as kg per sqm.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">Keep job-level inputs compact, then expand only when you need to add or edit material selectors and rate fields.</p>
                  <Button size="sm" variant="secondary" onClick={() => setJobInputsCollapsed((current) => !current)}>
                    {jobInputsCollapsed ? 'Expand' : 'Collapse'}
                  </Button>
                </div>
              </div>
              {!jobInputsCollapsed ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <input
                    value={globalFieldSearch}
                    onChange={(event) => setGlobalFieldSearch(event.target.value)}
                    placeholder="Search inputs"
                    className="w-full rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-300 dark:border-teal-500/20 dark:bg-slate-950 dark:text-white sm:w-52"
                  />
                  <Button size="sm" variant="secondary" onClick={() => openGlobalFieldCreate('material')}>
                    Add material dropdown
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openGlobalFieldCreate('number')}>
                    Add rate/input
                  </Button>
                </div>
                ) : null}
              {!jobInputsCollapsed ? (
                <div className="mt-4">
                  {form.globalFields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/70 px-4 py-6 text-sm text-slate-500 dark:border-teal-500/20 dark:bg-teal-500/5 dark:text-slate-400">
                      No job-level inputs yet. Add material dropdowns for brand choices or rate/input fields for numeric job data.
                    </div>
                  ) : filteredGlobalFields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/70 px-4 py-6 text-sm text-slate-500 dark:border-teal-500/20 dark:bg-teal-500/5 dark:text-slate-400">
                      No job-level inputs match this search.
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {filteredGlobalFields.map((field) => {
                        const index = form.globalFields.findIndex((item) => item.id === field.id);
                        return (
                          <div
                            key={field.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{field.label || 'Untitled input'}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {field.inputType === 'material' ? 'Stores selected material for job costing' : 'Used in formulas as a job-level input'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                                {field.inputType === 'material' ? 'material' : field.inputType}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Key</p>
                                <p className="mt-1 truncate font-mono text-xs text-sky-700 dark:text-sky-300">{field.key ? `specs.global.${field.key}` : 'specs.global.key'}</p>
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Unit</p>
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{field.unit || '--'}</p>
                              </div>
                              {field.inputType === 'material' ? (
                                <div className="min-w-0 sm:col-span-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Default material</p>
                                  <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-300">
                                    {materials.find((material) => material.id === field.defaultMaterialId)?.name || 'No default material'}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" onClick={() => openGlobalFieldEdit(field)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => duplicateGlobalField(field)}>
                                Duplicate
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === 0}
                                onClick={() =>
                                  setFormState((current) => ({
                                    ...current,
                                    globalFields: reorderItemsById(current.globalFields, field.id, current.globalFields[index - 1]?.id ?? field.id),
                                  }))
                                }
                              >
                                Up
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === form.globalFields.length - 1}
                                onClick={() =>
                                  setFormState((current) => ({
                                    ...current,
                                    globalFields: reorderItemsById(current.globalFields, field.id, current.globalFields[index + 1]?.id ?? field.id),
                                  }))
                                }
                              >
                                Down
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setFormState((current) => ({
                                    ...current,
                                    globalFields: current.globalFields.filter((item) => item.id !== field.id),
                                  }))
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                ) : null}
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600 dark:text-slate-400">Area engine</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Area-wise formulas</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    Split a single job item into walls, floors, sections, or systems. Each area can have its own measurements, material usage, and labor productivity.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setFormState((current) => ({ ...current, areas: [...current.areas, newArea()] }))}>
                  Add area section
                </Button>
              </div>

              <div className="mt-5 space-y-5">
                {form.areas.map((area, areaIndex) => {
                  const collapsed = Boolean(collapsedAreaIds[area.id]);
                  const areaTitle = `${areaIndex + 1}.${area.label.trim() || area.key.trim() || 'Area'} - ${area.key.trim() || 'new-area'}`;

                  return (
                    <div
                      key={area.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!draggingAreaId || draggingAreaId === area.id) return;
                        setFormState((current) => ({
                          ...current,
                          areas: reorderItemsById(current.areas, draggingAreaId, area.id),
                        }));
                        setDraggingAreaId(null);
                      }}
                      className={`overflow-visible rounded-[1.5rem] border bg-slate-50 shadow-sm transition ${
                        draggingAreaId === area.id
                          ? 'border-emerald-300 ring-2 ring-emerald-500/20 dark:border-emerald-500/40'
                          : 'border-slate-200 dark:border-slate-700'
                      } dark:bg-slate-900/45`}
                    >
                      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className={`${collapsed ? '' : 'mb-3'} rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900`}>
                            <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">{areaTitle}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                              {area.fields.length} inputs, {area.materials.length} material rules, {area.labor.length} labor rules
                            </span>
                          </div>

                          {!collapsed ? (
                            <div className="flex gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200">
                                {areaIndex + 1}
                              </div>
                              <div className="grid flex-1 gap-3 md:grid-cols-2">
                                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Area display name
                                  <input
                                    value={area.label}
                                    placeholder="Walls"
                                    onChange={(event) => updateArea(area.id, { label: event.target.value })}
                                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                                  />
                                </label>
                                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                  Area token key
                                  <input
                                    value={area.key}
                                    placeholder="walls"
                                    onChange={(event) => updateArea(area.id, { key: normalizeFormulaKey(event.target.value) })}
                                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => toggleAreaCollapse(area.id)}>
                            {collapsed ? 'Expand' : 'Collapse'}
                          </Button>
                          {!collapsed ? (
                          <>
                            <button
                              type="button"
                              draggable
                              onDragStart={() => setDraggingAreaId(area.id)}
                              onDragEnd={() => setDraggingAreaId(null)}
                              className="inline-flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                            >
                              <span className="text-sm leading-none">::</span>
                              <span>Move</span>
                            </button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setFormState((current) => ({
                                  ...current,
                                  areas: [
                                    ...current.areas.slice(0, areaIndex + 1),
                                    duplicateAreaDefinition(current.areas, area),
                                    ...current.areas.slice(areaIndex + 1),
                                  ],
                                }))
                              }
                            >
                              Duplicate area
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setFormState((current) => ({ ...current, areas: current.areas.filter((item) => item.id !== area.id) }))}
                            >
                              Remove area
                            </Button>
                          </>
                          ) : null}
                        </div>
                      </div>

                      {!collapsed ? (
                        <div className="space-y-5 p-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Area inputs</p>
                                <p className="mt-1 text-xs text-slate-500">Inside this area, every input is available through a single token pattern like area.total_sqm.</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" onClick={() => openAreaFieldCreate(area)}>
                                  Add area input
                                </Button>
                              </div>
                            </div>
                            {area.fields.length === 0 ? (
                              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/45">
                                No area inputs yet. Add any area-specific numeric inputs here.
                              </div>
                            ) : (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {area.fields.map((field, fieldIndex) => {
                                  const token = `area.${field.key || 'field_key'}`;
                                  return (
                                    <div
                                      key={field.id}
                                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
                                    >
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{field.label || 'Untitled area input'}</p>
                                          <p className="mt-1 truncate font-mono text-xs text-sky-700 dark:text-sky-300">{token}</p>
                                        </div>
                                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                          {field.inputType}
                                        </span>
                                      </div>
                                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Key</p>
                                          <p className="mt-1 truncate font-mono text-xs text-slate-600 dark:text-slate-300">{field.key || '--'}</p>
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Unit</p>
                                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{field.unit || '--'}</p>
                                        </div>
                                      </div>
                                      <div className="mt-4 flex flex-wrap gap-2">
                                        <Button size="sm" variant="secondary" onClick={() => openAreaFieldEdit(area, field)}>
                                          Edit
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => duplicateAreaField(area, field)}>
                                          Duplicate
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={fieldIndex === 0}
                                          onClick={() =>
                                            updateArea(area.id, {
                                              fields: reorderItemsById(area.fields, field.id, area.fields[fieldIndex - 1]?.id ?? field.id),
                                            })
                                          }
                                        >
                                          Up
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={fieldIndex === area.fields.length - 1}
                                          onClick={() =>
                                            updateArea(area.id, {
                                              fields: reorderItemsById(area.fields, field.id, area.fields[fieldIndex + 1]?.id ?? field.id),
                                            })
                                          }
                                        >
                                          Down
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => updateArea(area.id, { fields: area.fields.filter((item) => item.id !== field.id) })}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl border border-cyan-200 bg-white p-4 dark:border-cyan-500/20 dark:bg-slate-950/70">
                            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Area scoped rates and values</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Store formula-only rates for this area. These can only be used inside this area as <span className="font-mono">area.formula.key</span>.
                                </p>
                              </div>
                              <Button size="sm" variant="secondary" onClick={() => openAreaFormulaValueCreate(area)}>
                                Add area value
                              </Button>
                            </div>
                            {area.formulaValues.length === 0 ? (
                              <div className="mt-4 rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/60 px-4 py-6 text-sm text-slate-500 dark:border-cyan-500/20 dark:bg-cyan-500/5">
                                No area-only values yet. Add resin rate, overlap factor, coverage rate, or other stored expressions that belong only to this area.
                              </div>
                            ) : (
                              <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {area.formulaValues.map((field, fieldIndex) => (
                                  <div
                                    key={field.id}
                                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{field.label || 'Untitled area value'}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                          Possible output: {resolveAreaFormulaOutputPreview(area.id, field.value || '0')}
                                        </p>
                                      </div>
                                      <span className="shrink-0 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                                        {field.unit || 'no unit'}
                                      </span>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Key</p>
                                        <p className="mt-1 truncate font-mono text-xs text-cyan-700 dark:text-cyan-300">{field.key ? `area.formula.${field.key}` : 'area.formula.key'}</p>
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Formula / Value</p>
                                        <p className="mt-1 line-clamp-3 break-all font-mono text-xs text-slate-600 dark:text-slate-300">{field.value || '--'}</p>
                                      </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      <Button size="sm" variant="secondary" onClick={() => openAreaFormulaValueEdit(area, field)}>
                                        Edit
                                      </Button>
                                      <Button size="sm" variant="ghost" onClick={() => duplicateAreaFormulaValue(area, field)}>
                                        Duplicate
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={fieldIndex === 0}
                                        onClick={() =>
                                          updateArea(area.id, {
                                            formulaValues: reorderItemsById(area.formulaValues, field.id, area.formulaValues[fieldIndex - 1]?.id ?? field.id),
                                          })
                                        }
                                      >
                                        Up
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={fieldIndex === area.formulaValues.length - 1}
                                        onClick={() =>
                                          updateArea(area.id, {
                                            formulaValues: reorderItemsById(area.formulaValues, field.id, area.formulaValues[fieldIndex + 1]?.id ?? field.id),
                                          })
                                        }
                                      >
                                        Down
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          updateArea(area.id, { formulaValues: area.formulaValues.filter((item) => item.id !== field.id) })
                                        }
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <RuleRows
                            area={area}
                            materials={materials}
                            globalFields={form.globalFields}
                            formulaConstants={form.formulaConstants}
                            globalMaterialFields={form.globalFields.filter((field) => field.inputType === 'material')}
                            onMaterialsChange={(materialsNext) => updateArea(area.id, { materials: materialsNext })}
                            onLaborChange={(laborNext) => updateArea(area.id, { labor: laborNext })}
                            resolveMaterialPreview={(rule) => resolveAreaMaterialRuleOutputPreview(area.id, rule)}
                            resolveLaborPreview={(rule) => resolveAreaLaborRuleOutputPreview(area.id, rule)}
                            onRequestFormulaEditor={openFormulaEditor}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
        </div>
      </section>

      <div className="fixed bottom-5 right-5 z-30 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setPlaygroundOpen(true)}
          className="rounded-2xl border border-sky-300 bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-950/20 transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 dark:border-sky-400/30 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300"
        >
          Test playground-
        </button>
        <button
          type="button"
          onClick={() => setJsonPreviewOpen(true)}
          className="rounded-2xl border border-emerald-300 bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-950/20 transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 dark:border-emerald-400/30 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          View live JSON
        </button>
      </div>

      <Modal isOpen={playgroundOpen} onClose={() => setPlaygroundOpen(false)} title="Formula test playground" size="xl">
        <FormulaPlayground form={form} materials={materials} values={playgroundValues} onChange={setPlaygroundValues} preview={playgroundPreview} />
      </Modal>

      <Modal isOpen={jsonPreviewOpen} onClose={() => setJsonPreviewOpen(false)} title="Live formula JSON" size="xl">
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This is the generated formula configuration that will be saved for costing calculations.
          </p>
          <pre className="max-h-[68vh] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
            {JSON.stringify(payload.formulaConfig, null, 2)}
          </pre>
        </div>
      </Modal>

      {formulaConstantEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button
            ref={formulaConstantBackdropRef}
            type="button"
            aria-label="Close stored value editor"
            onClick={attemptCloseFormulaConstantEditor}
            className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem]">
            <div ref={formulaConstantPanelRef} className="drawer-panel-enter ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white/98 shadow-2xl shadow-slate-950/25 backdrop-blur-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/98">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Stored value editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                      {formulaConstantEditor.mode === 'create' ? 'Add stored formula value' : 'Edit stored formula value'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Keep the page compact. Edit the full key, formula, and unit here, then return to the summary list.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={attemptCloseFormulaConstantEditor}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Value label
                  <input
                    value={formulaConstantEditor.draft.label}
                    onChange={(event) =>
                      setFormulaConstantEditor((current) => {
                        if (!current) return current;
                        const previousLabel = current.draft.label;
                        const nextLabel = event.target.value;
                        const shouldSyncKey =
                          !current.draft.key.trim() || normalizeFormulaKey(current.draft.key) === normalizeFormulaKey(previousLabel);
                        return {
                          ...current,
                          draft: {
                            ...current.draft,
                            label: nextLabel,
                            key: shouldSyncKey ? normalizeFormulaKey(nextLabel) : current.draft.key,
                          },
                        };
                      })
                    }
                    placeholder="Resin use rate"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Value key
                  <input
                    value={formulaConstantEditor.draft.key}
                    onChange={(event) =>
                      setFormulaConstantEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                key: normalizeFormulaKey(event.target.value),
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="resin_use_rate"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Used in formulas as <span className="font-mono text-cyan-700 dark:text-cyan-300">formula.{formulaConstantEditor.draft.key || 'key'}</span>
                  </p>
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Formula or fixed value</p>
                  <ExpressionInput
                    value={formulaConstantEditor.draft.value}
                    onChange={(value) =>
                      setFormulaConstantEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                value,
                              },
                            }
                          : current
                      ))
                    }
                    tokens={buildFormulaConstantTokens(form.globalFields, form.formulaConstants, form.areas, formulaConstantEditor.draft.id)}
                    placeholder="0.85 or specs.global.base_rate * 1.08"
                    className="focus:border-cyan-300 dark:focus:border-cyan-400"
                    title={`${formulaConstantEditor.draft.label || formulaConstantEditor.draft.key || 'Stored value'} formula`}
                    description="Stored formula values are reusable everywhere in the budget formula as formula.key."
                    resolvePreview={resolveGlobalFormulaOutputPreview}
                    previewLabel="Possible output with current playground"
                    onRequestEditor={openFormulaEditor}
                  />
                </div>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Unit
                  <input
                    value={formulaConstantEditor.draft.unit}
                    onChange={(event) =>
                      setFormulaConstantEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                unit: event.target.value,
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="kg/sqm"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/70 px-4 py-4 text-sm text-slate-600 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Preview</p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Label</p>
                      <p className="mt-1 font-semibold">{formulaConstantEditor.draft.label || 'Untitled value'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Unit</p>
                      <p className="mt-1">{formulaConstantEditor.draft.unit || '--'}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Resolved use value</p>
                      <p className="mt-1 font-mono text-cyan-700 dark:text-cyan-300">
                        {formulaConstantEditor.draft.key ? String(resolvedPlaygroundValues[`formula.${formulaConstantEditor.draft.key}`] ?? 0) : '0'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={closeFormulaConstantEditor}>
                    Cancel
                  </Button>
                  <Button onClick={saveFormulaConstantEditor}>
                    {formulaConstantEditor.mode === 'create' ? 'Add value' : 'Save value'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {areaFieldEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button
            ref={areaFieldBackdropRef}
            type="button"
            aria-label="Close area input editor"
            onClick={attemptCloseAreaFieldEditor}
            className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[34rem]">
            <div ref={areaFieldPanelRef} className="drawer-panel-enter ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white/98 shadow-2xl shadow-slate-950/25 backdrop-blur-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/98">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">Area input editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                      {areaFieldEditor.mode === 'create' ? 'Add area input' : 'Edit area input'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Editing <span className="font-semibold text-slate-700 dark:text-slate-200">{areaFieldEditor.areaLabel}</span>. Keep the area card compact and edit the full input here.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={attemptCloseAreaFieldEditor}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Input label
                  <input
                    value={areaFieldEditor.draft.label}
                    onChange={(event) =>
                      setAreaFieldEditor((current) => {
                        if (!current) return current;
                        const previousLabel = current.draft.label;
                        const nextLabel = event.target.value;
                        const shouldSyncKey =
                          !current.draft.key.trim() || normalizeFormulaKey(current.draft.key) === normalizeFormulaKey(previousLabel);
                        return {
                          ...current,
                          draft: {
                            ...current.draft,
                            label: nextLabel,
                            key: shouldSyncKey ? normalizeFormulaKey(nextLabel) : current.draft.key,
                          },
                        };
                      })
                    }
                    placeholder="Total sqm"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Input key
                  <input
                    value={areaFieldEditor.draft.key}
                    onChange={(event) =>
                      setAreaFieldEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                key: normalizeFormulaKey(event.target.value),
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="total_sqm"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Type
                  <select
                    value={areaFieldEditor.draft.inputType}
                    onChange={(event) =>
                      setAreaFieldEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                inputType: event.target.value as FieldType,
                                defaultMaterialId: event.target.value === 'material' ? current.draft.defaultMaterialId : '',
                              },
                            }
                          : current
                      ))
                    }
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  >
                    {FIELD_TYPES.filter((type) => type !== 'material').map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Unit
                  <input
                    value={areaFieldEditor.draft.unit}
                    onChange={(event) =>
                      setAreaFieldEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                unit: event.target.value,
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="sqm"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Preview token</p>
                  <p className="mt-2 font-mono text-sky-700 dark:text-sky-300">area.{areaFieldEditor.draft.key || 'field_key'}</p>
                </div>
              </div>

              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={closeAreaFieldEditor}>
                    Cancel
                  </Button>
                  <Button onClick={saveAreaFieldEditor}>
                    {areaFieldEditor.mode === 'create' ? 'Add input' : 'Save input'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {areaFormulaValueEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button
            ref={areaFormulaValueBackdropRef}
            type="button"
            aria-label="Close area value editor"
            onClick={attemptCloseAreaFormulaValueEditor}
            className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem]">
            <div ref={areaFormulaValuePanelRef} className="drawer-panel-enter ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white/98 shadow-2xl shadow-slate-950/25 backdrop-blur-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/98">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">Area value editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                      {areaFormulaValueEditor.mode === 'create' ? 'Add area scoped value' : 'Edit area scoped value'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Editing <span className="font-semibold text-slate-700 dark:text-slate-200">{areaFormulaValueEditor.areaLabel}</span>. These values are only used inside this area as <span className="font-mono">area.formula.key</span>.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={attemptCloseAreaFormulaValueEditor}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Value label
                  <input
                    value={areaFormulaValueEditor.draft.label}
                    onChange={(event) =>
                      setAreaFormulaValueEditor((current) => {
                        if (!current) return current;
                        const previousLabel = current.draft.label;
                        const nextLabel = event.target.value;
                        const shouldSyncKey =
                          !current.draft.key.trim() || normalizeFormulaKey(current.draft.key) === normalizeFormulaKey(previousLabel);
                        return {
                          ...current,
                          draft: {
                            ...current.draft,
                            label: nextLabel,
                            key: shouldSyncKey ? normalizeFormulaKey(nextLabel) : current.draft.key,
                          },
                        };
                      })
                    }
                    placeholder="Overlap factor"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Value key
                  <input
                    value={areaFormulaValueEditor.draft.key}
                    onChange={(event) =>
                      setAreaFormulaValueEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                key: normalizeFormulaKey(event.target.value),
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="overlap_factor"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Used inside this area as <span className="font-mono text-cyan-700 dark:text-cyan-300">area.formula.{areaFormulaValueEditor.draft.key || 'key'}</span>
                  </p>
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Formula or fixed value</p>
                  <ExpressionInput
                    value={areaFormulaValueEditor.draft.value}
                    onChange={(value) =>
                      setAreaFormulaValueEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                value,
                              },
                            }
                          : current
                      ))
                    }
                    tokens={
                      form.areas.find((item) => item.id === areaFormulaValueEditor.areaId)
                        ? buildAreaFormulaValueTokens(
                            form.globalFields,
                            form.formulaConstants,
                            form.areas.find((item) => item.id === areaFormulaValueEditor.areaId)!,
                            areaFormulaValueEditor.draft.id
                          )
                        : buildFormulaConstantTokens(form.globalFields, form.formulaConstants, form.areas)
                    }
                    placeholder="0.05 or area.total_sqm * 0.02"
                    className="focus:border-cyan-300 dark:focus:border-cyan-400"
                    title={`${areaFormulaValueEditor.draft.label || areaFormulaValueEditor.draft.key || 'Area value'} formula`}
                    description="Area scoped values can be reused inside this area as area.formula.key."
                    resolvePreview={(value) => resolveAreaFormulaOutputPreview(areaFormulaValueEditor.areaId, value)}
                    previewLabel="Possible output with current playground"
                    onRequestEditor={openFormulaEditor}
                  />
                </div>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Unit
                  <input
                    value={areaFormulaValueEditor.draft.unit}
                    onChange={(event) =>
                      setAreaFormulaValueEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                unit: event.target.value,
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="kg/sqm"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white focus:ring-2 focus:ring-cyan-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>
              </div>

              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={closeAreaFormulaValueEditor}>
                    Cancel
                  </Button>
                  <Button onClick={saveAreaFormulaValueEditor}>
                    {areaFormulaValueEditor.mode === 'create' ? 'Add value' : 'Save value'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {globalFieldEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button
            ref={globalFieldBackdropRef}
            type="button"
            aria-label="Close job input editor"
            onClick={attemptCloseGlobalFieldEditor}
            className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[34rem]">
            <div ref={globalFieldPanelRef} className="drawer-panel-enter ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white/98 shadow-2xl shadow-slate-950/25 backdrop-blur-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/98">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Job input editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
                      {globalFieldEditor.mode === 'create' ? 'Add job-level input' : 'Edit job-level input'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Keep the main page compact. Edit the full input definition here, then return to the summary grid.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={attemptCloseGlobalFieldEditor}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Input label
                  <input
                    value={globalFieldEditor.draft.label}
                    onChange={(event) =>
                      setGlobalFieldEditor((current) => {
                        if (!current) return current;
                        const previousLabel = current.draft.label;
                        const nextLabel = event.target.value;
                        const shouldSyncKey =
                          !current.draft.key.trim() || normalizeFormulaKey(current.draft.key) === normalizeFormulaKey(previousLabel);
                        return {
                          ...current,
                          draft: {
                            ...current.draft,
                            label: nextLabel,
                            key: shouldSyncKey ? normalizeFormulaKey(nextLabel) : current.draft.key,
                          },
                        };
                      })
                    }
                    placeholder="Resin brand"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Input key
                  <input
                    value={globalFieldEditor.draft.key}
                    onChange={(event) =>
                      setGlobalFieldEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                key: normalizeFormulaKey(event.target.value),
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="resin_brand"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Used in formulas as <span className="font-mono text-sky-700 dark:text-sky-300">specs.global.{globalFieldEditor.draft.key || 'key'}</span>
                  </p>
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Input type
                  <select
                    value={globalFieldEditor.draft.inputType}
                    onChange={(event) =>
                      setGlobalFieldEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                inputType: event.target.value as FieldType,
                              },
                            }
                          : current
                      ))
                    }
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === 'material' ? 'material dropdown' : type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Unit
                  <input
                    value={globalFieldEditor.draft.unit}
                    onChange={(event) =>
                      setGlobalFieldEditor((current) => (
                        current
                          ? {
                              ...current,
                              draft: {
                                ...current.draft,
                                unit: event.target.value,
                              },
                            }
                          : current
                      ))
                    }
                    placeholder="kg/sqm"
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  />
                </label>

                {globalFieldEditor.draft.inputType === 'material' ? (
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Default material
                    <div className="mt-1.5">
                      <SearchSelect
                        items={searchableMaterials}
                        value={globalFieldEditor.draft.defaultMaterialId ?? ''}
                        onChange={(id) =>
                          setGlobalFieldEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  draft: {
                                    ...current.draft,
                                    defaultMaterialId: id,
                                  },
                                }
                              : current
                          )
                        }
                        placeholder="Select common default material"
                        openOnFocus
                        dropdownInPortal
                        clearOnEmptyInput
                        inputProps={{
                          className:
                            'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950',
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Used automatically when the job leaves this material dropdown blank.
                    </p>
                  </label>
                ) : null}

                <div className="rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-4 text-sm text-slate-600 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-slate-300">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Preview</p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Label</p>
                      <p className="mt-1 font-semibold">{globalFieldEditor.draft.label || 'Untitled input'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Type</p>
                      <p className="mt-1">{globalFieldEditor.draft.inputType === 'material' ? 'material dropdown' : globalFieldEditor.draft.inputType}</p>
                    </div>
                    {globalFieldEditor.draft.inputType === 'material' ? (
                      <div className="sm:col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Default material</p>
                        <p className="mt-1">
                          {materials.find((material) => material.id === globalFieldEditor.draft.defaultMaterialId)?.name || 'No default material'}
                        </p>
                      </div>
                    ) : null}
                    <div className="sm:col-span-2">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Formula token</p>
                      <p className="mt-1 font-mono text-sky-700 dark:text-sky-300">specs.global.{globalFieldEditor.draft.key || 'key'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={closeGlobalFieldEditor}>
                    Cancel
                  </Button>
                  <Button onClick={saveGlobalFieldEditor}>
                    {globalFieldEditor.mode === 'create' ? 'Add input' : 'Save input'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal isOpen={versionHistoryOpen} onClose={() => setVersionHistoryOpen(false)} title="Formula version history" size="xl">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            Versions are created on the initial save, each manual save, and every restore. Autosave updates the working copy only.
          </div>
          {!activeFormulaId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              Save this formula once to start version history.
            </div>
          ) : formulaVersions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
              No saved versions yet.
            </div>
          ) : (
            <div className="space-y-3">
              {formulaVersions.map((version) => (
                <div
                  key={version.id}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                          v{version.versionNumber}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {version.createdAt ? new Date(version.createdAt).toLocaleString() : 'Unknown time'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{version.name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">{version.slug}</p>
                      {version.changeNote ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{version.changeNote}</p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void handleRestoreVersion(version)}
                      loading={restoringVersion}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {formulaEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button
            type="button"
            aria-label="Close formula editor"
            onClick={() => setFormulaEditor(null)}
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
          />
          <div className="pointer-events-none absolute inset-y-0 right-[min(42rem,100vw)] hidden w-72 pr-4 xl:flex xl:items-start xl:justify-end">
            <div className="pointer-events-auto mt-5 w-full overflow-hidden rounded-2xl border border-emerald-200 bg-white/98 shadow-2xl shadow-slate-950/20 backdrop-blur-sm dark:border-emerald-500/20 dark:bg-slate-950/98">
              <div className="border-b border-emerald-100 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/10 dark:text-emerald-300">
                Suggestions
              </div>
              <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-2">
                {formulaEditorSuggestions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    Type a token name or use `Tab` after starting a formula segment.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {formulaEditorSuggestions.map((item, index) => (
                      <button
                        key={`side-${item.token}`}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => insertFormulaEditorToken(item.token)}
                        className={`w-full rounded-xl px-3 py-2 text-left transition ${
                          index === 0
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                      >
                        <p className="truncate font-mono text-[11px] font-semibold">{item.token}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{item.label}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem]">
            <div className="ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/25 dark:border-slate-800 dark:bg-slate-950">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Formula editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{formulaEditor.title}</h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {formulaEditor.description ?? 'Use full paths and click tokens to insert them into the current formula.'}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setFormulaEditor(null)}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                  <div className="min-w-0">
                    <textarea
                      ref={formulaEditorTextareaRef}
                      value={formulaEditor.value}
                      onChange={(event) => applyFormulaEditorValue(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                      onSelect={(event) => setFormulaEditorCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                      onClick={(event) => setFormulaEditorCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                      onKeyUp={(event) => setFormulaEditorCursor(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
                      onKeyDown={(event) => {
                        if (!inlineFormulaSuggestion) return;
                        if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
                          event.preventDefault();
                          acceptInlineFormulaSuggestion();
                        }
                      }}
                      autoFocus
                      rows={6}
                      placeholder={formulaEditor.placeholder}
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="off"
                      className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-sm text-slate-900 outline-none transition focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="truncate">
                      {inlineFormulaSuggestion ? (
                        <>
                          Suggestion: <span className="font-mono text-emerald-700 dark:text-emerald-300">{inlineFormulaSuggestion.token}</span>
                          <span className="ml-2 rounded-full border border-emerald-200 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300">Tab or Enter</span>
                        </>
                      ) : (
                        <>Use full paths like <span className="font-mono">areas.walls.total_sqm</span>.</>
                      )}
                    </span>
                    <span className="shrink-0 font-mono">{formulaEditor.tokens.length} tokens</span>
                  </div>
                  {formulaEditorPossibleOutput ? (
                    <div className="mt-2 rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 text-[11px] text-slate-600 dark:border-emerald-500/20 dark:bg-slate-950/80 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {formulaEditor.previewLabel ?? 'Possible output'}
                      </span>
                      <span className="mx-2 text-slate-400">:</span>
                      <span className="font-mono text-emerald-700 dark:text-emerald-300">{formulaEditorPossibleOutput}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-400">Available formulas and tokens</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Browse saved formula values first, then conditions, then the full token list.</p>
                      </div>
                      <input
                        value={formulaEditorSearch}
                        onChange={(event) => setFormulaEditorSearch(event.target.value)}
                        placeholder="Search token"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:max-w-[14rem]"
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Available formulas</p>
                          <span className="text-[10px] font-mono text-slate-400">{formulaEditorFormulaTokens.length}</span>
                        </div>
                        {formulaEditorFormulaTokens.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                            No matching formula values yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {formulaEditorFormulaTokens.map((item) => (
                              <button
                                key={`formula-${item.token}`}
                                type="button"
                                onClick={() => insertFormulaEditorToken(item.token)}
                                className="w-full rounded-2xl border border-cyan-200 bg-white px-3 py-3 text-left transition hover:border-cyan-300 hover:bg-cyan-50/60 dark:border-cyan-500/20 dark:bg-slate-950 dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/10"
                              >
                                <p className="truncate font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">{item.token}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {formulaEditorGroups.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                          No matching tokens. Add more inputs or clear the search.
                        </div>
                      ) : (
                        <div className="space-y-4">
                        {formulaEditorGroups.map((section) => (
                          <div key={section.group} className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{section.group === 'Formula value' ? 'Available tokens' : section.group}</p>
                              <span className="text-[10px] font-mono text-slate-400">{section.items.length}</span>
                            </div>
                            <div className="space-y-2">
                              {section.items.map((item) => (
                                <button
                                  key={`${section.group}-${item.token}`}
                                  type="button"
                                  onClick={() => insertFormulaEditorToken(item.token)}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
                                >
                                  <p className="truncate font-mono text-[11px] font-semibold text-slate-900 dark:text-slate-100">{item.token}</p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Conditional patterns</p>
                          <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                            <span className="rounded-full border border-sky-200 px-2 py-1 font-mono dark:border-sky-500/20">if(...)</span>
                            <span className="rounded-full border border-sky-200 px-2 py-1 font-mono dark:border-sky-500/20">== !=</span>
                            <span className="rounded-full border border-sky-200 px-2 py-1 font-mono dark:border-sky-500/20">&gt; &lt;=</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {formulaHelpExamples.map((example) => (
                            <div key={example.label} className="rounded-2xl border border-sky-200/80 bg-white/90 px-3 py-3 dark:border-sky-500/20 dark:bg-slate-950/80">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{example.label}</p>
                                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{example.note}</p>
                                </div>
                                <div className="flex shrink-0 gap-1.5">
                                  <Button size="sm" variant="secondary" onClick={() => void copyFormulaSnippet(example.expression)}>
                                    Copy
                                  </Button>
                                  <Button size="sm" variant="secondary" onClick={() => applyFormulaEditorValue(insertFormulaSnippet(formulaEditor.value, example.expression))}>
                                    Insert
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-2 overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 text-[11px] text-sky-100 whitespace-nowrap">
                                <span className="font-semibold text-sky-300">{example.expression}</span>
                                <span className="mx-2 text-slate-500">|</span>
                                <span className="text-slate-300">{example.sample}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
