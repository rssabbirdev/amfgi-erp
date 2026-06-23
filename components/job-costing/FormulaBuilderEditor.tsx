'use client';

import { type ChangeEvent, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Separator } from '@/components/ui/shadcn/separator';
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
import { cn } from '@/lib/utils';
import type { FormulaLibrary, FormulaLibraryVersion } from '@/store/api/endpoints/jobs';
import {
  ExpressionInput,
  FormulaPlayground,
  RuleRows,
  type FormulaEditorRequest,
} from '@/components/job-costing/formula-builder/sections';
import { AreaEngineTable } from '@/components/job-costing/AreaEngineTable';
import { GlobalFormulaValuesTable } from '@/components/job-costing/GlobalFormulaValuesTable';
import { JobLevelInputsTable } from '@/components/job-costing/JobLevelInputsTable';
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
  buildPlaygroundNumericValues,
  buildPlaygroundPreview,
  hydratePlaygroundDynamicAreas,
  migrateAreaPlaygroundValuesToDynamic,
  formatAreaExpressionOutputPreview,
  formatAreaMaterialRuleOutputPreview,
  formatAreaLaborRuleOutputPreview,
  formatPossibleFormulaOutput,
  evaluatePlaygroundExpression,
  formatPreviewQty,
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
  getStoredFormulaConstants,
  mergeGlobalFieldsWithFormulaConstants,
  isStoredGlobalField,
  renameFormulaReferences,
  reorderItemsById,
  resolveGlobalFieldFormValue,
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

type ImportedFormulaJson = {
  formula?: unknown;
  data?: unknown;
  name?: unknown;
  slug?: unknown;
  fabricationType?: unknown;
  description?: unknown;
  specificationSchema?: unknown;
  formulaConfig?: unknown;
};

function BuilderMetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardDescription className="text-[11px] font-medium uppercase tracking-wide">{label}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </CardContent>
    </Card>
  );
}

function parseField(value: unknown): DynamicField | null {
  if (!isRecord(value)) return null;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : uid('field'),
    key: typeof value.key === 'string' ? value.key : '',
    label: typeof value.label === 'string' ? value.label : '',
    inputType: FIELD_TYPES.includes(value.inputType as FieldType) ? (value.inputType as FieldType) : 'number',
    unit: typeof value.unit === 'string' ? value.unit : '',
    defaultMaterialId: typeof value.defaultMaterialId === 'string' ? value.defaultMaterialId : '',
    defaultValue:
      typeof value.defaultValue === 'string'
        ? value.defaultValue
        : typeof value.defaultValue === 'number'
          ? String(value.defaultValue)
          : typeof value.defaultValue === 'boolean'
            ? String(value.defaultValue)
            : '',
    storedValue:
      typeof value.storedValue === 'string'
        ? value.storedValue
        : typeof value.value === 'string'
          ? value.value
          : typeof value.value === 'number'
            ? String(value.value)
            : '',
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
  const areaIdentityMetadata = new Map<string, { id: string; dynamic: boolean }>();

  for (const rawArea of schemaAreas) {
    if (!isRecord(rawArea)) continue;
    const key = typeof rawArea.key === 'string' ? rawArea.key : '';
    if (!key) continue;
    areaIdentityMetadata.set(key, {
      id: typeof rawArea.id === 'string' && rawArea.id.trim() ? rawArea.id : uid('area'),
      dynamic: rawArea.dynamic === true,
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
      dynamic: areaIdentity?.dynamic ?? rawArea.dynamic === true,
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
      dynamic: rawArea.dynamic === true || existing.dynamic,
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
    globalFields: mergeGlobalFieldsWithFormulaConstants(globalFields, formulaConstants),
    formulaConstants: [],
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

function buildFormulaJsonFileName(form: BuilderState) {
  const slug = slugify(form.slug || form.name) || 'costing-formula';
  return `${slug}.formula.json`;
}

function normalizeImportedFormulaJson(value: unknown): FormulaLibrary {
  if (!isRecord(value)) throw new Error('Formula JSON must be an object.');
  const payload = value as ImportedFormulaJson;
  const source = isRecord(payload.formula)
    ? payload.formula
    : isRecord(payload.data)
      ? payload.data
      : payload;
  if (!isRecord(source)) throw new Error('Formula JSON file is missing formula data.');

  const specificationSchema = source.specificationSchema;
  const formulaConfig = source.formulaConfig;
  if (!isRecord(specificationSchema) || !isRecord(formulaConfig)) {
    throw new Error('Formula JSON must include specificationSchema and formulaConfig objects.');
  }

  const name = typeof source.name === 'string' && source.name.trim() ? source.name.trim() : 'Imported formula';
  const slug = typeof source.slug === 'string' && source.slug.trim() ? source.slug.trim() : slugify(name);

  return {
    id: 'imported-formula',
    companyId: '',
    name,
    slug,
    fabricationType:
      typeof source.fabricationType === 'string' && source.fabricationType.trim()
        ? source.fabricationType.trim()
        : 'Imported',
    description: typeof source.description === 'string' ? source.description : null,
    specificationSchema,
    formulaConfig,
    isActive: true,
    createdBy: '',
  };
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
  const constants = getStoredFormulaConstants(form.globalFields)
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
        defaultValue: field.inputType !== 'material' && !isStoredGlobalField(field) && field.defaultValue?.trim() ? field.defaultValue.trim() : undefined,
        storedValue: isStoredGlobalField(field) && field.storedValue?.trim() ? field.storedValue.trim() : undefined,
        required: field.required,
      })),
    areas: form.areas
      .filter((area) => area.key.trim() && area.label.trim())
      .map((area) => ({
        id: area.id,
        key: area.key.trim(),
        label: area.label.trim(),
        dynamic: area.dynamic || undefined,
        fields: area.fields
          .filter((field) => field.key.trim() && field.label.trim())
          .map((field) => ({
            id: field.id,
            key: field.key.trim(),
            label: field.label.trim(),
            inputType: field.inputType,
            unit: field.unit.trim() || undefined,
            defaultMaterialId: field.inputType === 'material' && field.defaultMaterialId?.trim() ? field.defaultMaterialId.trim() : undefined,
            defaultValue: field.inputType !== 'material' && field.defaultValue?.trim() ? field.defaultValue.trim() : undefined,
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
        dynamic: area.dynamic || undefined,
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
    unit: '',
    defaultMaterialId: '',
    defaultValue: '',
    storedValue: inputType === 'stored' ? '' : undefined,
    required: inputType !== 'stored',
  };
}

function insertFormulaSnippet(value: string, snippet: string) {
  const trimmed = value.trim();
  if (!trimmed) return snippet;
  const needsLineBreak = !trimmed.endsWith('\n');
  return `${value}${needsLineBreak ? '\n' : ''}${snippet}`;
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
  const canManage =
    (session?.user?.isSuperAdmin ?? false) ||
    perms.includes('stock.formula.edit') ||
    perms.includes('settings.manage');
  const canView =
    (session?.user?.isSuperAdmin ?? false) ||
    perms.includes('stock.formula.view') ||
    (perms.includes('job.view') && perms.includes('material.view'));
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
  const storedFormulaConstants = useMemo(() => getStoredFormulaConstants(form.globalFields), [form.globalFields]);
  const hydratedPlaygroundFormulaIdRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const formulaJsonFileInputRef = useRef<HTMLInputElement | null>(null);
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

  const resolveAreaFormulaOutputPreview = (areaId: string, expression: string) => {
    try {
      const area = form.areas.find((item) => item.id === areaId);
      if (!area) return '--';
      return formatAreaExpressionOutputPreview(form, playgroundValues, area, expression);
    } catch {
      return 'Unable to resolve with current playground values';
    }
  };

  const resolveAreaMaterialRuleOutputPreview = (areaId: string, rule: AreaRule['materials'][number]) => {
    try {
      const area = form.areas.find((item) => item.id === areaId);
      if (!area) return '--';
      const selectedMaterialId =
        rule.materialSource === 'global'
          ? resolveGlobalFieldFormValue(
              form.globalFields.find((field) => field.key === rule.materialSelectorKey) ?? {
                inputType: 'material',
                defaultMaterialId: '',
              },
              playgroundValues[`global.${rule.materialSelectorKey}`]
            )
          : rule.materialId;
      const selectedMaterial = selectedMaterialId
        ? materials.find((material) => material.id === selectedMaterialId)
        : null;
      return formatAreaMaterialRuleOutputPreview(
        form,
        playgroundValues,
        area,
        rule,
        selectedMaterial?.unit
      );
    } catch {
      return 'Unable to resolve with current playground values';
    }
  };

  const resolveAreaLaborRuleOutputPreview = (areaId: string, rule: AreaRule['labor'][number]) => {
    try {
      const area = form.areas.find((item) => item.id === areaId);
      if (!area) return '--';
      return formatAreaLaborRuleOutputPreview(form, playgroundValues, area, rule);
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
    const isStored = isStoredGlobalField(globalFieldEditor.draft);
    const draftField = {
      ...globalFieldEditor.draft,
      key: normalizeFormulaKey(globalFieldEditor.draft.key),
      label: globalFieldEditor.draft.label.trim(),
      unit: globalFieldEditor.draft.unit.trim(),
      defaultMaterialId: globalFieldEditor.draft.inputType === 'material' ? (globalFieldEditor.draft.defaultMaterialId ?? '').trim() : '',
      defaultValue:
        !isStored && globalFieldEditor.draft.inputType !== 'material'
          ? (globalFieldEditor.draft.defaultValue ?? '').trim()
          : '',
      storedValue: isStored ? (globalFieldEditor.draft.storedValue ?? '').trim() : undefined,
      required: isStored ? false : globalFieldEditor.draft.required,
    };
    if (!draftField.label) {
      toast.error('Input label is required');
      return;
    }
    if (!draftField.key) {
      toast.error('Input key is required');
      return;
    }
    if (isStored && !draftField.storedValue) {
      toast.error('Formula or fixed value is required');
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
      toast.success(isStored ? 'Stored value added' : 'Job input added');
    } else {
      const previousKey = globalFieldEditor.initialDraft.key.trim();
      setFormState((current) => {
        const renamed =
          isStored && previousKey && previousKey !== draftField.key
            ? renameFormulaReferences(current, previousKey, draftField.key)
            : current;
        return {
          ...renamed,
          globalFields: renamed.globalFields.map((field) => (field.id === draftField.id ? draftField : field)),
        };
      });
      if (!isStored && previousKey && previousKey !== draftField.key) {
        setPlaygroundValues((current) => {
          const previousValue = current[`global.${previousKey}`];
          if (previousValue === undefined) return current;
          const next = { ...current };
          delete next[`global.${previousKey}`];
          next[`global.${draftField.key}`] = previousValue;
          return next;
        });
      }
      toast.success(isStored ? 'Stored value updated' : 'Job input updated');
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
      defaultMaterialId: areaFieldEditor.draft.inputType === 'material' ? (areaFieldEditor.draft.defaultMaterialId ?? '').trim() : '',
      defaultValue: areaFieldEditor.draft.inputType !== 'material' ? (areaFieldEditor.draft.defaultValue ?? '').trim() : '',
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

  const undoFormState = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = cloneBuilderState(stack[stack.length - 1]);
      setRedoStack((current) => [...current.slice(-(historyLimitRef.current - 1)), cloneBuilderState(form)]);
      setDraft(previous);
      return stack.slice(0, -1);
    });
  }, [form]);

  const redoFormState = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = cloneBuilderState(stack[stack.length - 1]);
      setUndoStack((current) => [...current.slice(-(historyLimitRef.current - 1)), cloneBuilderState(form)]);
      setDraft(next);
      return stack.slice(0, -1);
    });
  }, [form]);

  const exportFormulaJson = () => {
    if (typeof window === 'undefined') return;

    const filePayload = {
      kind: 'AMFGI_JOB_COSTING_FORMULA',
      version: 1,
      exportedAt: new Date().toISOString(),
      formula: saveBody,
    };
    const blob = new Blob([JSON.stringify(filePayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildFormulaJsonFileName(form);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success('Formula JSON exported');
  };

  const importFormulaJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const importedFormula = normalizeImportedFormulaJson(parsed);
      const nextDraft = parseFormula(importedFormula);
      setUndoStack((current) => [...current.slice(-(historyLimitRef.current - 1)), cloneBuilderState(form)]);
      setRedoStack([]);
      setDraft(nextDraft);
      setPlaygroundValues(parsePlaygroundValues(importedFormula));
      setSlugEdited(true);
      toast.success('Formula JSON imported. Review and save to apply it.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import formula JSON');
    }
  };

  const handleRestoreVersion = async (version: FormulaLibraryVersion) => {
    if (!activeFormulaId) return;
    try {
      const restored = await restoreFormulaVersion({ id: activeFormulaId, versionId: version.id }).unwrap();
      const nextDraft = parseFormula(restored);
      applyRestoredFormState(nextDraft);
      setVersionHistoryOpen(false);
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
    setDraft(null);
    setSlugEdited(false);
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
  }, [redoFormState, undoFormState]);

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
      if (activeFormulaId) {
        const updated = await updateFormula({ id: activeFormulaId, data: { ...saveBody, saveMode: mode } }).unwrap();
        const nextDraft = parseFormula(updated);
        setDraft(nextDraft);
        if (mode === 'manual') toast.success('Formula saved');
      } else {
        const created = await createFormula({ ...saveBody, saveMode: mode }).unwrap();
        const nextDraft = parseFormula(created);
        setActiveFormulaId(created.id);
        setDraft(nextDraft);
        setSlugEdited(true);
        router.replace(`/stock/job-budget/formulas/${created.id}/edit`);
        if (mode === 'manual') toast.success('Formula created');
      }
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to save formula';
      if (mode === 'manual') toast.error(message);
    } finally {
      saveInFlightRef.current = false;
    }
  };

  if (!canView || !canManage) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>You do not have permission to manage formula library entries.</AlertDescription>
      </Alert>
    );
  }

  if (formulaLoading && !formula && !draft) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      onContextMenuCapture={(event) => event.stopPropagation()}
      className="flex w-full min-w-0 flex-col gap-5 overflow-x-hidden text-select [&_input]:select-text [&_input]:context-menu [&_p]:select-text [&_pre]:select-text [&_span]:select-text [&_textarea]:select-text"
    >
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/stock/job-budget/formulas"
            className={cn(
              buttonVariants({ variant: 'link', size: 'sm' }),
              'h-auto p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground',
            )}
          >
            Stock / Job Budget / Formula Library
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            {formulaId ? 'Edit costing formula' : 'Create costing formula'}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Build reusable job costing logic. Keep consumption math in the formula, then let each job choose its own
            resin, gelcoat, fiber, catalyst, and other brand materials.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <input
            ref={formulaJsonFileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void importFormulaJson(event)}
          />
          <Link href="/stock/job-budget/formulas" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
            Back to formulas
          </Link>
          <Button size="sm" variant="outline" onClick={undoFormState} disabled={undoStack.length === 0}>
            Undo
          </Button>
          <Button size="sm" variant="outline" onClick={redoFormState} disabled={redoStack.length === 0}>
            Redo
          </Button>
          <Button size="sm" variant="outline" onClick={() => setVersionHistoryOpen(true)} disabled={!activeFormulaId}>
            Version history
          </Button>
          <Button size="sm" variant="outline" onClick={exportFormulaJson}>
            Export JSON
          </Button>
          <Button size="sm" variant="outline" onClick={() => formulaJsonFileInputRef.current?.click()}>
            Import JSON
          </Button>
          <Button size="sm" onClick={() => void saveFormula({ mode: 'manual' })} disabled={saving}>
            {saving ? 'Saving…' : 'Save formula'}
          </Button>
        </div>
      </header>

      <section className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-4">
          <BuilderMetricCard label="Inputs" value={form.globalFields.length} description="Job-level fields" />
          <BuilderMetricCard label="Areas" value={form.areas.length} description="Budget calculation scopes" />
          <BuilderMetricCard
            label="Material rules"
            value={form.areas.reduce((sum, area) => sum + area.materials.length, 0)}
            description="Linked stock consumption"
          />
          <Card className={cn(validationIssue ? 'border-destructive/30' : 'border-primary/30')}>
            <CardHeader className="p-4 pb-2">
              <CardDescription className="text-[11px] font-medium uppercase tracking-wide">Save readiness</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <p className="text-sm font-semibold text-foreground">{validationIssue ?? 'Ready to save'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {validationIssue ? 'Fix this before saving.' : 'Required formula details are complete.'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
          <Alert>
            <AlertTitle>Advanced mode</AlertTitle>
            <AlertDescription>
              This mode exposes raw keys, tokens, and formula-oriented editing controls for power users.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="p-4 pb-3">
              <CardTitle className="text-base">Recommended flow</CardTitle>
              <CardDescription>Create the formula in small, testable steps.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 pb-4 pt-0 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-medium text-foreground">1. Name the formula</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use the fabrication type for grouping, like GRP Lining or Steel Fabrication.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-medium text-foreground">2. Add job inputs</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use material dropdown fields for brand choices and number fields for kg/sqm rates.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="font-medium text-foreground">3. Add area rules</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Each area can calculate material, labor, and waste separately.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-medium text-foreground">Formula key rules</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Keys support letters, numbers, hyphen, and underscore. Spaces are converted to underscore.
                </p>
              </div>
              <div className="grid gap-2 font-mono text-[11px] sm:grid-cols-3">
                <Badge variant="outline" className="justify-center rounded-md px-3 py-1.5 font-mono">
                  area.area_sqm
                </Badge>
                <Badge variant="outline" className="justify-center rounded-md px-3 py-1.5 font-mono">
                  specs.global.resin_kg_per_sqm
                </Badge>
                <Badge variant="outline" className="justify-center rounded-md px-3 py-1.5 font-mono">
                  formula.resin_use_rate
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardDescription className="text-[11px] font-medium uppercase tracking-wide">Foundation</CardDescription>
                  <CardTitle className="mt-1 text-lg">Formula details</CardTitle>
                  <CardDescription className="mt-1 max-w-2xl">
                    These details help users find the right formula when issuing a budget for a job variation.
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => setFoundationCollapsed((current) => !current)}>
                  {foundationCollapsed ? 'Expand' : 'Collapse'}
                </Button>
              </CardHeader>
              {!foundationCollapsed ? (
                <>
                  <Separator />
                  <CardContent className="grid gap-4 pt-6 lg:grid-cols-2">
                    <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Formula name
                      <Input
                        value={form.name}
                        placeholder="GRP Lining - Walls and Floor"
                        onChange={(event) =>
                          setFormState((current) => ({
                            ...current,
                            name: event.target.value,
                            slug: slugEdited ? current.slug : slugify(event.target.value),
                          }))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      URL key / slug
                      <Input
                        value={form.slug}
                        placeholder="grp-lining-wall-floor"
                        onChange={(event) => {
                          setSlugEdited(true);
                          setFormState((current) => ({ ...current, slug: normalizeSlugInput(event.target.value) }));
                        }}
                        className="font-mono"
                      />
                      <Alert variant={slugExists ? 'destructive' : 'default'} className="mt-1 py-2">
                        <AlertDescription className="text-xs">
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
                        </AlertDescription>
                      </Alert>
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Fabrication group
                      <Input
                        value={form.fabricationType}
                        placeholder="GRP Lining"
                        onChange={(event) => setFormState((current) => ({ ...current, fabricationType: event.target.value }))}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Internal note
                      <Input
                        value={form.description}
                        placeholder="Explains where this formula should be used"
                        onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                      />
                    </label>
                  </CardContent>
                </>
              ) : null}
            </Card>

            <div className="rounded-[1.75rem] border border-teal-200 bg-white/95 p-5 shadow-sm dark:border-teal-500/20 dark:bg-slate-950/80">
              <div className="flex flex-col gap-2 border-b border-teal-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-300">Job-level inputs</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Measurements, materials, and stored values</h2>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    Add user inputs for job data, or stored formula values (fixed numbers or expressions) referenced as <span className="font-mono">formula.key</span>.
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
                  <Button size="sm" variant="secondary" onClick={() => openGlobalFieldCreate('stored')}>
                    Add stored value
                  </Button>
                </div>
                ) : null}
              {!jobInputsCollapsed ? (
                <div className="mt-4">
                  {form.globalFields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/70 px-4 py-6 text-sm text-slate-500 dark:border-teal-500/20 dark:bg-teal-500/5 dark:text-slate-400">
                      No job-level inputs yet. Add material dropdowns, numeric inputs, or stored formula values.
                    </div>
                  ) : filteredGlobalFields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/70 px-4 py-6 text-sm text-slate-500 dark:border-teal-500/20 dark:bg-teal-500/5 dark:text-slate-400">
                      No job-level inputs match this search.
                    </div>
                  ) : (
                    <JobLevelInputsTable
                      tone="teal"
                      mode="builder"
                      fields={filteredGlobalFields.map((field) => ({
                        id: field.id,
                        label: field.label || 'Untitled input',
                        key: field.key,
                        inputType: field.inputType,
                        unit: field.unit,
                        defaultMaterialId: field.defaultMaterialId,
                        defaultMaterialName: materials.find((material) => material.id === field.defaultMaterialId)?.name,
                        defaultValue: field.defaultValue,
                        storedValue: field.storedValue,
                      }))}
                      builderActions={{
                        onEdit: (id) => {
                          const field = form.globalFields.find((item) => item.id === id);
                          if (field) openGlobalFieldEdit(field);
                        },
                        onDuplicate: (id) => {
                          const field = form.globalFields.find((item) => item.id === id);
                          if (field) duplicateGlobalField(field);
                        },
                        onMoveUp: (id) =>
                          setFormState((current) => {
                            const index = current.globalFields.findIndex((item) => item.id === id);
                            return {
                              ...current,
                              globalFields: reorderItemsById(
                                current.globalFields,
                                id,
                                current.globalFields[index - 1]?.id ?? id,
                              ),
                            };
                          }),
                        onMoveDown: (id) =>
                          setFormState((current) => {
                            const index = current.globalFields.findIndex((item) => item.id === id);
                            return {
                              ...current,
                              globalFields: reorderItemsById(
                                current.globalFields,
                                id,
                                current.globalFields[index + 1]?.id ?? id,
                              ),
                            };
                          }),
                        onRemove: (id) =>
                          setFormState((current) => ({
                            ...current,
                            globalFields: current.globalFields.filter((item) => item.id !== id),
                          })),
                        canMoveUp: (id) => form.globalFields.findIndex((item) => item.id === id) > 0,
                        canMoveDown: (id) => {
                          const index = form.globalFields.findIndex((item) => item.id === id);
                          return index >= 0 && index < form.globalFields.length - 1;
                        },
                      }}
                    />
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

              <div className="mt-5">
                <AreaEngineTable
                  areas={form.areas.map((area) => ({
                    id: area.id,
                    label: area.label,
                    key: area.key,
                    dynamic: area.dynamic,
                    fieldCount: area.fields.length,
                    materialCount: area.materials.length,
                    laborCount: area.labor.length,
                  }))}
                  collapsedAreaIds={collapsedAreaIds}
                  onToggleCollapsed={toggleAreaCollapse}
                  onLabelChange={(id, label) => updateArea(id, { label })}
                  onKeyChange={(id, key) => updateArea(id, { key: normalizeFormulaKey(key) })}
                  onDynamicChange={(id, dynamic) => {
                    const area = form.areas.find((item) => item.id === id);
                    if (!area) return;
                    updateArea(id, { dynamic });
                    if (dynamic) {
                      setPlaygroundValues((current) =>
                        migrateAreaPlaygroundValuesToDynamic({ ...area, dynamic: true }, current)
                      );
                    }
                  }}
                  rowActions={{
                    onDuplicate: (id) => {
                      const areaIndex = form.areas.findIndex((item) => item.id === id);
                      const area = form.areas[areaIndex];
                      if (!area || areaIndex < 0) return;
                      setFormState((current) => ({
                        ...current,
                        areas: [
                          ...current.areas.slice(0, areaIndex + 1),
                          duplicateAreaDefinition(current.areas, area),
                          ...current.areas.slice(areaIndex + 1),
                        ],
                      }));
                    },
                    onMoveUp: (id) =>
                      setFormState((current) => ({
                        ...current,
                        areas: reorderItemsById(
                          current.areas,
                          id,
                          current.areas[current.areas.findIndex((item) => item.id === id) - 1]?.id ?? id,
                        ),
                      })),
                    onMoveDown: (id) =>
                      setFormState((current) => ({
                        ...current,
                        areas: reorderItemsById(
                          current.areas,
                          id,
                          current.areas[current.areas.findIndex((item) => item.id === id) + 1]?.id ?? id,
                        ),
                      })),
                    onRemove: (id) =>
                      setFormState((current) => ({
                        ...current,
                        areas: current.areas.filter((item) => item.id !== id),
                      })),
                    canMoveUp: (id) => form.areas.findIndex((item) => item.id === id) > 0,
                    canMoveDown: (id) => {
                      const index = form.areas.findIndex((item) => item.id === id);
                      return index >= 0 && index < form.areas.length - 1;
                    },
                  }}
                  renderAreaDetail={(areaId) => {
                    const area = form.areas.find((item) => item.id === areaId);
                    if (!area) return null;
                    return (
                      <div className="space-y-5">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Area inputs</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Inside this area, every input is available through tokens like area.total_sqm.
                              </p>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAreaFieldCreate(area)}>
                              Add area input
                            </Button>
                          </div>
                          {area.fields.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/45">
                              No area inputs yet. Add any area-specific numeric inputs here.
                            </div>
                          ) : (
                            <JobLevelInputsTable
                              tone="default"
                              mode="builder"
                              formatKeyToken={(key) => (key ? `area.${key}` : 'area.field_key')}
                              fields={area.fields.map((field) => ({
                                id: field.id,
                                label: field.label || 'Untitled area input',
                                key: field.key,
                                inputType: field.inputType,
                                unit: field.unit,
                                defaultValue: field.defaultValue,
                              }))}
                              builderActions={{
                                onEdit: (fieldId) => {
                                  const field = area.fields.find((item) => item.id === fieldId);
                                  if (field) openAreaFieldEdit(area, field);
                                },
                                onDuplicate: (fieldId) => {
                                  const field = area.fields.find((item) => item.id === fieldId);
                                  if (field) duplicateAreaField(area, field);
                                },
                                onMoveUp: (fieldId) => {
                                  const index = area.fields.findIndex((item) => item.id === fieldId);
                                  updateArea(area.id, {
                                    fields: reorderItemsById(area.fields, fieldId, area.fields[index - 1]?.id ?? fieldId),
                                  });
                                },
                                onMoveDown: (fieldId) => {
                                  const index = area.fields.findIndex((item) => item.id === fieldId);
                                  updateArea(area.id, {
                                    fields: reorderItemsById(area.fields, fieldId, area.fields[index + 1]?.id ?? fieldId),
                                  });
                                },
                                onRemove: (fieldId) =>
                                  updateArea(area.id, { fields: area.fields.filter((item) => item.id !== fieldId) }),
                                canMoveUp: (fieldId) => area.fields.findIndex((item) => item.id === fieldId) > 0,
                                canMoveDown: (fieldId) => {
                                  const index = area.fields.findIndex((item) => item.id === fieldId);
                                  return index >= 0 && index < area.fields.length - 1;
                                },
                              }}
                            />
                          )}
                        </div>

                        <div className="rounded-2xl border border-cyan-200 bg-white p-4 dark:border-cyan-500/20 dark:bg-slate-950/70">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                                Area scoped rates and values
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Store formula-only rates for this area as <span className="font-mono">area.formula.key</span>.
                              </p>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => openAreaFormulaValueCreate(area)}>
                              Add area value
                            </Button>
                          </div>
                          {area.formulaValues.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/60 px-4 py-6 text-sm text-slate-500 dark:border-cyan-500/20 dark:bg-cyan-500/5">
                              No area-only values yet. Add resin rate, overlap factor, or other stored expressions for this area.
                            </div>
                          ) : (
                            <GlobalFormulaValuesTable
                              tone="builder"
                              mode="builder"
                              formatKeyToken={(key) => (key ? `area.formula.${key}` : 'area.formula.key')}
                              rows={area.formulaValues.map((field) => ({
                                id: field.id,
                                label: field.label || 'Untitled area value',
                                key: field.key,
                                value: field.value || '0',
                                unit: field.unit,
                                preview: resolveAreaFormulaOutputPreview(area.id, field.value || '0'),
                              }))}
                              builderActions={{
                                onEdit: (fieldId) => {
                                  const field = area.formulaValues.find((item) => item.id === fieldId);
                                  if (field) openAreaFormulaValueEdit(area, field);
                                },
                                onDuplicate: (fieldId) => {
                                  const field = area.formulaValues.find((item) => item.id === fieldId);
                                  if (field) duplicateAreaFormulaValue(area, field);
                                },
                                onMoveUp: (fieldId) => {
                                  const index = area.formulaValues.findIndex((item) => item.id === fieldId);
                                  updateArea(area.id, {
                                    formulaValues: reorderItemsById(
                                      area.formulaValues,
                                      fieldId,
                                      area.formulaValues[index - 1]?.id ?? fieldId,
                                    ),
                                  });
                                },
                                onMoveDown: (fieldId) => {
                                  const index = area.formulaValues.findIndex((item) => item.id === fieldId);
                                  updateArea(area.id, {
                                    formulaValues: reorderItemsById(
                                      area.formulaValues,
                                      fieldId,
                                      area.formulaValues[index + 1]?.id ?? fieldId,
                                    ),
                                  });
                                },
                                onRemove: (fieldId) =>
                                  updateArea(area.id, {
                                    formulaValues: area.formulaValues.filter((item) => item.id !== fieldId),
                                  }),
                                canMoveUp: (fieldId) => area.formulaValues.findIndex((item) => item.id === fieldId) > 0,
                                canMoveDown: (fieldId) => {
                                  const index = area.formulaValues.findIndex((item) => item.id === fieldId);
                                  return index >= 0 && index < area.formulaValues.length - 1;
                                },
                              }}
                            />
                          )}
                        </div>

                        <RuleRows
                          area={area}
                          materials={materials}
                          globalFields={form.globalFields}
                          formulaConstants={storedFormulaConstants}
                          globalMaterialFields={form.globalFields.filter((field) => field.inputType === 'material')}
                          onMaterialsChange={(materialsNext) => updateArea(area.id, { materials: materialsNext })}
                          onLaborChange={(laborNext) => updateArea(area.id, { labor: laborNext })}
                          resolveMaterialPreview={(rule) => resolveAreaMaterialRuleOutputPreview(area.id, rule)}
                          resolveLaborPreview={(rule) => resolveAreaLaborRuleOutputPreview(area.id, rule)}
                          onRequestFormulaEditor={openFormulaEditor}
                        />
                      </div>
                    );
                  }}
                />
              </div>
            </div>
        </div>
      </section>

      <div className="fixed bottom-5 right-5 z-30 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setPlaygroundValues((current) => hydratePlaygroundDynamicAreas(form, current));
            setPlaygroundOpen(true);
          }}
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

      {areaFieldEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button
            ref={areaFieldBackdropRef}
            type="button"
            aria-label="Close area input editor"
            onClick={attemptCloseAreaFieldEditor}
            className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-136">
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
                                defaultValue: event.target.value === 'material' ? '' : current.draft.defaultValue,
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

                {areaFieldEditor.draft.inputType === 'boolean' ? (
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={areaFieldEditor.draft.defaultValue === 'true'}
                      onChange={(event) =>
                        setAreaFieldEditor((current) =>
                          current
                            ? {
                                ...current,
                                draft: {
                                  ...current.draft,
                                  defaultValue: event.target.checked ? 'true' : 'false',
                                },
                              }
                            : current
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-500/20"
                    />
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Default value</span>
                      <span className="mt-1 block text-sm">Checked by default on new budget lines</span>
                    </span>
                  </label>
                ) : (
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Default value
                    <input
                      type={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(areaFieldEditor.draft.inputType) ? 'number' : 'text'}
                      inputMode={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(areaFieldEditor.draft.inputType) ? 'decimal' : undefined}
                      value={areaFieldEditor.draft.defaultValue ?? ''}
                      onChange={(event) =>
                        setAreaFieldEditor((current) =>
                          current
                            ? {
                                ...current,
                                draft: {
                                  ...current.draft,
                                  defaultValue: event.target.value,
                                },
                              }
                            : current
                        )
                      }
                      placeholder={areaFieldEditor.draft.inputType === 'percent' ? '10' : '0'}
                      className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                    />
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Used automatically when the job leaves this area input blank.
                    </p>
                  </label>
                )}

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
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl">
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
                            storedFormulaConstants,
                            form.areas.find((item) => item.id === areaFormulaValueEditor.areaId)!,
                            areaFormulaValueEditor.draft.id
                          )
                        : buildFormulaConstantTokens(form.globalFields, storedFormulaConstants, form.areas)
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
          <div className="absolute inset-y-0 right-0 flex w-full max-w-136">
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
                    Used in formulas as{' '}
                    <span className="font-mono text-sky-700 dark:text-sky-300">
                      {isStoredGlobalField(globalFieldEditor.draft)
                        ? `formula.${globalFieldEditor.draft.key || 'key'}`
                        : `specs.global.${globalFieldEditor.draft.key || 'key'}`}
                    </span>
                  </p>
                </label>

                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Input type
                  <select
                    value={globalFieldEditor.draft.inputType}
                    onChange={(event) =>
                      setGlobalFieldEditor((current) => {
                        if (!current) return current;
                        const nextType = event.target.value as FieldType;
                        const isStored = nextType === 'stored';
                        return {
                          ...current,
                          draft: {
                            ...current.draft,
                            inputType: nextType,
                            defaultMaterialId: nextType === 'material' ? current.draft.defaultMaterialId : '',
                            defaultValue: nextType === 'material' || isStored ? '' : current.draft.defaultValue,
                            storedValue: isStored ? (current.draft.storedValue ?? '') : undefined,
                            required: isStored ? false : current.draft.required,
                          },
                        };
                      })
                    }
                    className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === 'material'
                          ? 'material dropdown'
                          : type === 'stored'
                            ? 'stored value (formula / fixed)'
                            : type}
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

                {isStoredGlobalField(globalFieldEditor.draft) ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Formula or fixed value</p>
                    <ExpressionInput
                      value={globalFieldEditor.draft.storedValue ?? ''}
                      onChange={(value) =>
                        setGlobalFieldEditor((current) =>
                          current
                            ? {
                                ...current,
                                draft: {
                                  ...current.draft,
                                  storedValue: value,
                                },
                              }
                            : current
                        )
                      }
                      tokens={buildFormulaConstantTokens(
                        form.globalFields,
                        storedFormulaConstants,
                        form.areas,
                        globalFieldEditor.draft.id
                      )}
                      placeholder="0.85 or specs.global.base_rate * 1.08"
                      className="focus:border-teal-300 dark:focus:border-teal-400"
                      title={`${globalFieldEditor.draft.label || globalFieldEditor.draft.key || 'Stored value'} formula`}
                      description="Stored values are reusable in expressions as formula.key. Budget lines use them by default."
                      resolvePreview={resolveGlobalFormulaOutputPreview}
                      previewLabel="Possible output with current playground"
                      onRequestEditor={openFormulaEditor}
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Budget lines use this value by default. Users can override per job when needed.
                    </p>
                  </div>
                ) : globalFieldEditor.draft.inputType !== 'material' ? (
                  globalFieldEditor.draft.inputType === 'boolean' ? (
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={globalFieldEditor.draft.defaultValue === 'true'}
                        onChange={(event) =>
                          setGlobalFieldEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  draft: {
                                    ...current.draft,
                                    defaultValue: event.target.checked ? 'true' : 'false',
                                  },
                                }
                              : current
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
                      />
                      <span>
                        <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Default value</span>
                        <span className="mt-1 block text-sm">Checked by default on new budget lines</span>
                      </span>
                    </label>
                  ) : (
                    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Default value
                      <input
                        type={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(globalFieldEditor.draft.inputType) ? 'number' : 'text'}
                        inputMode={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(globalFieldEditor.draft.inputType) ? 'decimal' : undefined}
                        value={globalFieldEditor.draft.defaultValue ?? ''}
                        onChange={(event) =>
                          setGlobalFieldEditor((current) =>
                            current
                              ? {
                                  ...current,
                                  draft: {
                                    ...current.draft,
                                    defaultValue: event.target.value,
                                  },
                                }
                              : current
                          )
                        }
                        placeholder={globalFieldEditor.draft.inputType === 'percent' ? '10' : '0'}
                        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                      />
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        Used automatically when the job leaves this input blank.
                      </p>
                    </label>
                  )
                ) : null}

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
                    ) : globalFieldEditor.draft.defaultValue?.trim() ? (
                      <div className="sm:col-span-2">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Default value</p>
                        <p className="mt-1">{globalFieldEditor.draft.defaultValue}</p>
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
                      disabled={restoringVersion}
                    >
                      {restoringVersion ? 'Restoring…' : 'Restore'}
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
          <div className="absolute inset-y-0 right-0 flex w-full max-w-2xl">
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white sm:max-w-56"
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
