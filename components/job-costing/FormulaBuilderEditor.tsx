'use client';

import { type SetStateAction, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import {
  useCreateFormulaLibraryMutation,
  useGetFormulaLibrariesQuery,
  useGetFormulaLibraryByIdQuery,
  useGetMaterialsQuery,
  useUpdateFormulaLibraryMutation,
} from '@/store/hooks';
import type { FormulaLibrary } from '@/store/api/endpoints/jobs';
import type { Material } from '@/store/api/endpoints/materials';

type FieldType = 'number' | 'percent' | 'length' | 'area' | 'volume' | 'count' | 'boolean' | 'select' | 'text' | 'material';
type FieldScope = 'measurement' | 'variable';

type DynamicField = {
  id: string;
  key: string;
  label: string;
  inputType: FieldType;
  unit: string;
  required: boolean;
  scope?: FieldScope;
};

type MaterialRule = {
  id: string;
  materialSource: 'fixed' | 'global';
  materialId: string;
  materialSelectorKey: string;
  quantityExpression: string;
  wastePercent: string;
};

type LaborRule = {
  id: string;
  expertiseName: string;
  quantityExpression: string;
  crewSizeExpression: string;
  productivityPerWorkerPerDay: string;
};

type AreaRule = {
  id: string;
  key: string;
  label: string;
  fields: DynamicField[];
  materials: MaterialRule[];
  labor: LaborRule[];
};

type BuilderState = {
  name: string;
  slug: string;
  fabricationType: string;
  description: string;
  globalFields: DynamicField[];
  areas: AreaRule[];
};

type PlaygroundValues = Record<string, string>;

type PlaygroundMaterialLine = {
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

type FormulaToken = {
  token: string;
  label: string;
  group: 'Job input' | 'Area measurement' | 'Area variable';
};

const FIELD_TYPES: FieldType[] = ['number', 'percent', 'length', 'area', 'volume', 'count', 'boolean', 'select', 'text', 'material'];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeSlugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeFormulaKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function newField(scope?: FieldScope): DynamicField {
  return {
    id: uid('field'),
    key: '',
    label: '',
    inputType: 'number',
    unit: '',
    required: true,
    scope,
  };
}

function newMaterialRule(): MaterialRule {
  return {
    id: uid('material'),
    materialSource: 'fixed',
    materialId: '',
    materialSelectorKey: '',
    quantityExpression: '',
    wastePercent: '',
  };
}

function newLaborRule(): LaborRule {
  return {
    id: uid('labor'),
    expertiseName: '',
    quantityExpression: '',
    crewSizeExpression: '',
    productivityPerWorkerPerDay: '',
  };
}

function newArea(): AreaRule {
  return {
    id: uid('area'),
    key: '',
    label: '',
    fields: [],
    materials: [],
    labor: [],
  };
}

function parseField(value: unknown, scope?: FieldScope): DynamicField | null {
  if (!isRecord(value)) return null;
  return {
    id: uid('field'),
    key: typeof value.key === 'string' ? value.key : '',
    label: typeof value.label === 'string' ? value.label : '',
    inputType: FIELD_TYPES.includes(value.inputType as FieldType) ? (value.inputType as FieldType) : 'number',
    unit: typeof value.unit === 'string' ? value.unit : '',
    required: typeof value.required === 'boolean' ? value.required : true,
    scope: value.storage === 'variable' || scope === 'variable' ? 'variable' : 'measurement',
  };
}

function parseFormula(row?: FormulaLibrary | null): BuilderState {
  const schema = isRecord(row?.specificationSchema) ? row?.specificationSchema : {};
  const config = isRecord(row?.formulaConfig) ? row?.formulaConfig : {};
  const schemaAreas = Array.isArray(schema.areas) ? schema.areas : [];
  const configAreas = Array.isArray(config.areas) ? config.areas : [];
  const areaMap = new Map<string, AreaRule>();

  for (const rawArea of configAreas) {
    if (!isRecord(rawArea)) continue;
    const key = typeof rawArea.key === 'string' ? rawArea.key : '';
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
      id: uid('area'),
      key,
      label: typeof rawArea.label === 'string' ? rawArea.label : key,
      fields: [],
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
        return parsed ? [{ ...parsed, scope: undefined }] : [];
      })
    : [];

  const areas = Array.from(areaMap.values());

  return {
    name: row?.name ?? '',
    slug: row?.slug ?? '',
    fabricationType: row?.fabricationType ?? '',
    description: row?.description ?? '',
    globalFields,
    areas: areas.length > 0 ? areas : [newArea()],
  };
}

function buildPayload(form: BuilderState) {
  const specificationSchema = {
    version: 1,
    globalFields: form.globalFields
      .filter((field) => field.key.trim() && field.label.trim())
      .map((field) => ({
        key: field.key.trim(),
        label: field.label.trim(),
        inputType: field.inputType,
        unit: field.unit.trim() || undefined,
        required: field.required,
      })),
    areas: form.areas
      .filter((area) => area.key.trim() && area.label.trim())
      .map((area) => ({
        key: area.key.trim(),
        label: area.label.trim(),
        fields: area.fields
          .filter((field) => field.key.trim() && field.label.trim())
          .map((field) => ({
            key: field.key.trim(),
            label: field.label.trim(),
            inputType: field.inputType,
            storage: field.scope ?? 'measurement',
            unit: field.unit.trim() || undefined,
            required: field.required,
          })),
      })),
  };

  const formulaConfig = {
    version: 2,
    unitSystem: 'METRIC' as const,
    areas: form.areas
      .filter((area) => area.key.trim() && area.label.trim())
      .map((area) => ({
        key: area.key.trim(),
        label: area.label.trim(),
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

function formatPreviewMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPreviewQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function parsePlaygroundNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function evaluatePlaygroundExpression(expression: string, values: Record<string, number>) {
  let normalized = expression.trim();
  if (!normalized) return 0;
  for (const key of Object.keys(values).sort((a, b) => b.length - a.length)) {
    normalized = normalized.replace(new RegExp(escapeRegExp(key), 'g'), String(values[key]));
  }
  if (!/^[0-9+\-*/().,\s]*$/.test(normalized)) return 0;
  if (/[+\-*/(.,]\s*$/.test(normalized)) return 0;
  try {
    const result = Function(`"use strict"; return (${normalized});`)() as number;
    return Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function buildPlaygroundNumericValues(form: BuilderState, values: PlaygroundValues) {
  const numericValues: Record<string, number> = {};
  for (const field of form.globalFields) {
    if (field.inputType === 'material') continue;
    numericValues[`specs.global.${field.key}`] = parsePlaygroundNumber(values[`global.${field.key}`] ?? '');
  }
  return numericValues;
}

function buildPlaygroundPreview(form: BuilderState, values: PlaygroundValues, materials: Material[]) {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const lines: PlaygroundMaterialLine[] = [];
  const warnings: string[] = [];

  for (const area of form.areas) {
    const numericValues = buildPlaygroundNumericValues(form, values);
    for (const field of area.fields) {
      const target = field.scope === 'variable' ? `area.variables.${field.key}` : `area.${field.key}`;
      numericValues[target] = parsePlaygroundNumber(values[`area.${area.id}.${field.key}`] ?? '');
    }

    for (const rule of area.materials) {
      const materialId = rule.materialSource === 'global'
        ? values[`global.${rule.materialSelectorKey}`]
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

      const quantity = evaluatePlaygroundExpression(rule.quantityExpression || '0', numericValues);
      const wastePercent = parsePlaygroundNumber(rule.wastePercent);
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

function buildFormulaTokens(globalFields: DynamicField[], area: AreaRule): FormulaToken[] {
  const globalTokens: FormulaToken[] = globalFields
    .filter((field) => field.key.trim() && field.inputType !== 'material')
    .map((field) => ({
      token: `specs.global.${field.key.trim()}`,
      label: field.label.trim() || field.key.trim(),
      group: 'Job input',
    }));

  const areaTokens: FormulaToken[] = area.fields
    .filter((field) => field.key.trim())
    .map((field) => {
      const key = field.key.trim();
      const isVariable = field.scope === 'variable';
      return {
        token: isVariable ? `area.variables.${key}` : `area.${key}`,
        label: field.label.trim() || key,
        group: isVariable ? 'Area variable' : 'Area measurement',
      };
    });

  return [...globalTokens, ...areaTokens];
}

function getExpressionTokenQuery(value: string) {
  const match = value.match(/([A-Za-z0-9_.-]+)$/);
  return match?.[1] ?? '';
}

function insertExpressionToken(value: string, token: string) {
  const match = value.match(/([A-Za-z0-9_.-]+)$/);
  if (!match || match.index === undefined) {
    return `${value}${value && !/\s$/.test(value) ? ' ' : ''}${token}`;
  }
  return `${value.slice(0, match.index)}${token}`;
}

export function FormulaBuilderEditor({ formulaId }: { formulaId?: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = (session?.user?.isSuperAdmin ?? false) || perms.includes('settings.manage');
  const canView = (session?.user?.isSuperAdmin ?? false) || (perms.includes('job.view') && perms.includes('material.view'));

  const { data: formula, isLoading: formulaLoading } = useGetFormulaLibraryByIdQuery(formulaId ?? '', {
    skip: !formulaId || !canView,
  });
  const { data: formulaLibrary = [] } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const { data: materials = [] } = useGetMaterialsQuery(undefined, { skip: !canView });
  const [createFormula, { isLoading: creating }] = useCreateFormulaLibraryMutation();
  const [updateFormula, { isLoading: updating }] = useUpdateFormulaLibraryMutation();

  const initialForm = useMemo(() => parseFormula(formula), [formula]);
  const [draft, setDraft] = useState<BuilderState | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [playgroundValues, setPlaygroundValues] = useState<PlaygroundValues>({});
  const [collapsedAreaIds, setCollapsedAreaIds] = useState<Record<string, boolean>>({});
  const form = draft ?? initialForm;
  const setForm = (updater: SetStateAction<BuilderState>) => {
    setDraft((current) => {
      const base = current ?? initialForm;
      return typeof updater === 'function' ? updater(base) : updater;
    });
  };
  const saving = creating || updating;

  const payload = useMemo(() => buildPayload(form), [form]);
  const playgroundPreview = useMemo(
    () => buildPlaygroundPreview(form, playgroundValues, materials),
    [form, materials, playgroundValues]
  );
  const existingSlugSet = useMemo(
    () =>
      new Set(
        formulaLibrary
          .filter((item) => item.id !== formulaId)
          .map((item) => item.slug)
      ),
    [formulaId, formulaLibrary]
  );
  const slugExists = form.slug.trim() ? existingSlugSet.has(slugify(form.slug)) : false;
  const suggestedSlug = useMemo(
    () => suggestUniqueSlug(form.slug || form.name, existingSlugSet),
    [existingSlugSet, form.name, form.slug]
  );
  const validationIssue = useMemo(() => validate(form) ?? (slugExists ? 'Formula slug already exists' : null), [form, slugExists]);

  const updateArea = (areaId: string, patch: Partial<AreaRule>) => {
    setForm((current) => ({
      ...current,
      areas: current.areas.map((area) => (area.id === areaId ? { ...area, ...patch } : area)),
    }));
  };

  const toggleAreaCollapse = (areaId: string) => {
    setCollapsedAreaIds((current) => ({ ...current, [areaId]: !current[areaId] }));
  };

  const save = async () => {
    const issue = validate(form);
    if (issue) {
      toast.error(issue);
      return;
    }
    if (slugExists) {
      toast.error(`Formula slug already exists. Try ${suggestedSlug}.`);
      return;
    }

    const body = {
      name: form.name.trim(),
      slug: slugify(form.slug),
      fabricationType: form.fabricationType.trim(),
      description: form.description.trim() || undefined,
      specificationSchema: payload.specificationSchema,
      formulaConfig: payload.formulaConfig,
    };

    try {
      if (formulaId) {
        await updateFormula({ id: formulaId, data: body }).unwrap();
        toast.success('Formula updated');
      } else {
        await createFormula(body).unwrap();
        toast.success('Formula created');
      }
      router.push('/stock/job-budget/formulas');
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to save formula';
      toast.error(message);
    }
  };

  if (!canView || !canManage) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        You do not have permission to manage formula library entries.
      </div>
    );
  }

  if (formulaLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-4 min-h-[calc(100dvh-4rem)] overflow-x-hidden bg-[linear-gradient(180deg,#f8fafc_0%,#f0fdfa_45%,#f8fafc_100%)] px-4 py-4 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_52%,#020617_100%)] sm:-mx-5 sm:-my-5 sm:px-5 sm:py-5 lg:-mx-8 lg:-my-6 lg:px-8 lg:py-6">
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
            <Button onClick={save} loading={saving}>Save formula</Button>
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
                <p className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-900">specs.global.resin-brand_a</p>
              </div>
            </div>
          </div>
        </div>

        <main className="min-w-0 space-y-5">
          <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">Foundation</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Formula details</h2>
              </div>
              <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">These details help users find the right formula when issuing a budget for a job variation.</p>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Formula name
                <input
                  value={form.name}
                  placeholder="GRP Lining - Walls and Floor"
                  onChange={(event) =>
                    setForm((current) => ({
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
                    setForm((current) => ({ ...current, slug: normalizeSlugInput(event.target.value) }));
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
                        setForm((current) => ({ ...current, slug: suggestedSlug }));
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
                  onChange={(event) => setForm((current) => ({ ...current, fabricationType: event.target.value }))}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Internal note
                <input
                  value={form.description}
                  placeholder="Explains where this formula should be used"
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-teal-200 bg-white/95 p-5 shadow-sm dark:border-teal-500/20 dark:bg-slate-950/80">
            <div className="flex flex-col gap-3 border-b border-teal-100 pb-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-300">Job-level inputs</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">Material choices and consumption rates</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                  Add material dropdowns for brand-sensitive items, then add numeric inputs for rates such as kg per sqm.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setForm((current) => ({ ...current, globalFields: [...current.globalFields, { ...newField(), inputType: 'material', unit: '' }] }))}>
                  Add material dropdown
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setForm((current) => ({ ...current, globalFields: [...current.globalFields, newField()] }))}>
                  Add rate/input
                </Button>
              </div>
            </div>
            <FieldRows
              fields={form.globalFields}
              onChange={(fields) => setForm((current) => ({ ...current, globalFields: fields }))}
              tokenPrefix="specs.global"
            />
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
              <Button size="sm" variant="secondary" onClick={() => setForm((current) => ({ ...current, areas: [...current.areas, newArea()] }))}>
                Add area section
              </Button>
            </div>

            <div className="mt-5 space-y-5">
              {form.areas.map((area, areaIndex) => {
                const collapsed = Boolean(collapsedAreaIds[area.id]);
                const areaTitle = `${areaIndex + 1}.${area.label.trim() || area.key.trim() || 'Area'} - ${area.key.trim() || 'new-area'}`;

                return (
                  <div key={area.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-900/45">
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950/70 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleAreaCollapse(area.id)}
                          aria-expanded={!collapsed}
                          className={`${collapsed ? '' : 'mb-3'} flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-emerald-200 hover:bg-emerald-50/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-950 dark:text-white">{areaTitle}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                              {area.fields.length} inputs, {area.materials.length} material rules, {area.labor.length} labor rules
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                            {collapsed ? 'Expand' : 'Collapse'}
                          </span>
                        </button>

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
                      {!collapsed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setForm((current) => ({ ...current, areas: current.areas.filter((item) => item.id !== area.id) }))}
                        >
                          Remove area
                        </Button>
                      ) : null}
                    </div>

                    {!collapsed ? (
                      <div className="space-y-5 p-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Area measurements and variables</p>
                              <p className="mt-1 text-xs text-slate-500">Measurements become area.width, area.area_sqm, etc. Variables become area.variables.key.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="secondary" onClick={() => updateArea(area.id, { fields: [...area.fields, newField('measurement')] })}>
                                Add measurement
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => updateArea(area.id, { fields: [...area.fields, newField('variable')] })}>
                                Add variable
                              </Button>
                            </div>
                          </div>
                          <FieldRows
                            fields={area.fields}
                            onChange={(fields) => updateArea(area.id, { fields })}
                            tokenPrefix="area"
                            showScope
                          />
                        </div>

                        <RuleRows
                          area={area}
                          materials={materials}
                          globalFields={form.globalFields}
                          globalMaterialFields={form.globalFields.filter((field) => field.inputType === 'material')}
                          onMaterialsChange={(materialsNext) => updateArea(area.id, { materials: materialsNext })}
                          onLaborChange={(laborNext) => updateArea(area.id, { labor: laborNext })}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </main>

      </section>

      <div className="fixed bottom-5 right-5 z-30 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setPlaygroundOpen(true)}
          className="rounded-2xl border border-sky-300 bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-950/20 transition hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 dark:border-sky-400/30 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300"
        >
          Test playground
        </button>
        <button
          type="button"
          onClick={() => setJsonPreviewOpen(true)}
          className="rounded-2xl border border-emerald-300 bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-emerald-950/20 transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 dark:border-emerald-400/30 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
        >
          View live JSON
        </button>
      </div>

      <Modal
        isOpen={playgroundOpen}
        onClose={() => setPlaygroundOpen(false)}
        title="Formula test playground"
        size="xl"
      >
        <FormulaPlayground
          form={form}
          materials={materials}
          values={playgroundValues}
          onChange={setPlaygroundValues}
          preview={playgroundPreview}
        />
      </Modal>

      <Modal
        isOpen={jsonPreviewOpen}
        onClose={() => setJsonPreviewOpen(false)}
        title="Live formula JSON"
        size="xl"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This is the generated formula configuration that will be saved for costing calculations.
          </p>
          <pre className="max-h-[68vh] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
            {JSON.stringify(payload.formulaConfig, null, 2)}
          </pre>
        </div>
      </Modal>
    </div>
  );
}

function FieldRows({
  fields,
  onChange,
  tokenPrefix,
  showScope = false,
}: {
  fields: DynamicField[];
  onChange: (fields: DynamicField[]) => void;
  tokenPrefix: string;
  showScope?: boolean;
}) {
  if (fields.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/45">
        No inputs yet. Add a material dropdown for brand selection or a rate/input field for measurements and consumption values.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {fields.map((field) => {
        const token = showScope && field.scope === 'variable'
          ? `${tokenPrefix}.variables.${field.key || 'field_key'}`
          : `${tokenPrefix}.${field.key || 'field_key'}`;
        return (
          <div key={field.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(12rem,1.15fr)_minmax(10rem,1fr)_minmax(9rem,0.55fr)_minmax(6.5rem,0.35fr)_5.5rem]">
            <input
              value={field.label}
              onChange={(event) => onChange(fields.map((item) => (item.id === field.id ? { ...item, label: event.target.value } : item)))}
              placeholder="Input label, e.g. Resin Brand"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              value={field.key}
              onChange={(event) =>
                onChange(fields.map((item) => (item.id === field.id ? { ...item, key: normalizeFormulaKey(event.target.value) } : item)))
              }
              placeholder="formula_key"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <select
              value={field.inputType}
              onChange={(event) => onChange(fields.map((item) => (item.id === field.id ? { ...item, inputType: event.target.value as FieldType } : item)))}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>{type === 'material' ? 'material dropdown' : type}</option>
              ))}
            </select>
            <input
              value={field.unit}
              onChange={(event) => onChange(fields.map((item) => (item.id === field.id ? { ...item, unit: event.target.value } : item)))}
              placeholder="unit"
              disabled={field.inputType === 'material'}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <Button size="sm" variant="ghost" onClick={() => onChange(fields.filter((item) => item.id !== field.id))}>
              Remove
            </Button>
            </div>
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{field.inputType === 'material' ? 'Stores selected material ID for this job' : 'Use this token inside quantity expressions'}</span>
              <span className="font-mono text-sky-700 dark:text-sky-300">{token}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormulaPlayground({
  form,
  materials,
  values,
  onChange,
  preview,
}: {
  form: BuilderState;
  materials: Material[];
  values: PlaygroundValues;
  onChange: (values: PlaygroundValues) => void;
  preview: ReturnType<typeof buildPlaygroundPreview>;
}) {
  const setValue = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="max-h-[76vh] space-y-5 overflow-y-auto pr-1">
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">Job-level test inputs</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Fill this like a real job budget. Material dropdowns use current material unit cost for this preview.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-right dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Preview total</p>
            <p className="mt-1 text-lg font-semibold text-emerald-900 dark:text-emerald-100">{formatPreviewMoney(preview.totalCost)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {form.globalFields.map((field) => (
            <label key={field.id} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {field.label || field.key || 'Job input'}
              {field.inputType === 'material' ? (
                <select
                  value={values[`global.${field.key}`] ?? ''}
                  onChange={(event) => setValue(`global.${field.key}`, event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">Select material</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.name} - {material.unit} - {formatPreviewMoney(Number(material.unitCost ?? 0))}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-sky-300 dark:border-slate-700 dark:bg-slate-950">
                  <input
                    type={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(field.inputType) ? 'number' : 'text'}
                    value={values[`global.${field.key}`] ?? ''}
                    onChange={(event) => setValue(`global.${field.key}`, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none dark:text-white"
                  />
                  {field.unit ? (
                    <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      {field.unit}
                    </span>
                  ) : null}
                </div>
              )}
            </label>
          ))}
          {form.globalFields.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700">
              No job-level inputs configured yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        {form.areas.map((area) => (
          <div key={area.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">{area.label || area.key || 'Area'}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {area.fields.map((field) => (
                <label key={field.id} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {field.label || field.key || 'Area input'}
                  <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:border-sky-300 dark:border-slate-700 dark:bg-slate-900">
                    <input
                      type={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(field.inputType) ? 'number' : 'text'}
                      value={values[`area.${area.id}.${field.key}`] ?? ''}
                      onChange={(event) => setValue(`area.${area.id}.${field.key}`, event.target.value)}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none dark:text-white"
                    />
                    {field.unit ? (
                      <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        {field.unit}
                      </span>
                    ) : null}
                  </div>
                </label>
              ))}
              {area.fields.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No area inputs configured for this section.</p>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">Actual output preview</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This preview uses formula quantities, waste percentage, selected material, and current material unit cost.
          </p>
        </div>
        {preview.warnings.length > 0 ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            {preview.warnings.join(' ')}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Waste</th>
                <th className="px-4 py-3 text-right">Final Qty</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.key} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{line.areaLabel}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-950 dark:text-white">{line.materialName}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{line.source}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatPreviewQty(line.quantity)} {line.unit}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatPreviewQty(line.wastePercent)}%</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800 dark:text-slate-100">{formatPreviewQty(line.finalQuantity)} {line.unit}</td>
                  <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatPreviewMoney(line.unitCost)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-950 dark:text-white">{formatPreviewMoney(line.totalCost)}</td>
                </tr>
              ))}
              {preview.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    No material output yet. Add material rules and fill playground inputs.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ExpressionInput({
  value,
  onChange,
  tokens,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: FormulaToken[];
  placeholder: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const query = getExpressionTokenQuery(value).toLowerCase();
  const suggestions = tokens
    .filter((item) => {
      if (!query) return true;
      return item.token.toLowerCase().includes(query) || item.label.toLowerCase().includes(query) || item.group.toLowerCase().includes(query);
    })
    .slice(0, 8);

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white ${className}`}
      />
      {showSuggestions ? (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-500/20 dark:bg-slate-950">
          <div className="border-b border-slate-100 bg-emerald-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-slate-800 dark:bg-emerald-500/10 dark:text-emerald-200">
            Suggested formula keys
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {suggestions.map((item) => (
              <button
                key={item.token}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onChange(insertExpressionToken(value, item.token))}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-900 dark:focus:bg-slate-900"
              >
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{item.token}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{item.label}</span>
                </span>
                <span className="shrink-0 rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {item.group}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : focused && tokens.length === 0 ? (
        <p className="mt-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Add job inputs or area fields to get formula key suggestions.
        </p>
      ) : null}
    </div>
  );
}

function RuleRows({
  area,
  materials,
  globalFields,
  globalMaterialFields,
  onMaterialsChange,
  onLaborChange,
}: {
  area: AreaRule;
  materials: Array<{ id: string; name: string }>;
  globalFields: DynamicField[];
  globalMaterialFields: DynamicField[];
  onMaterialsChange: (rules: MaterialRule[]) => void;
  onLaborChange: (rules: LaborRule[]) => void;
}) {
  const formulaTokens = buildFormulaTokens(globalFields, area);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 dark:border-teal-500/15 dark:bg-teal-500/5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Material costing rules</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose fixed stock items or use job-level material dropdowns for brand-sensitive costing.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onMaterialsChange([...area.materials, newMaterialRule()])}>
            Add rule
          </Button>
        </div>
        <div className="space-y-3">
          {area.materials.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-teal-300 bg-white/70 px-4 py-5 text-sm text-slate-500 dark:border-teal-500/30 dark:bg-slate-950/50">No material rules yet. Add resin, gelcoat, fiber, catalyst, solvent, or other consumable rules here.</p>
          ) : (
            area.materials.map((rule) => (
              <div key={rule.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(8rem,0.4fr)_minmax(12rem,1fr)]">
                  <select
                    value={rule.materialSource}
                    onChange={(event) =>
                      onMaterialsChange(
                        area.materials.map((item) =>
                          item.id === rule.id
                            ? {
                                ...item,
                                materialSource: event.target.value as 'fixed' | 'global',
                                materialId: event.target.value === 'fixed' ? item.materialId : '',
                                materialSelectorKey: event.target.value === 'global' ? item.materialSelectorKey : '',
                              }
                            : item
                        )
                      )
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="fixed">Fixed stock item</option>
                    <option value="global">Brand selected on job</option>
                  </select>
                  {rule.materialSource === 'global' ? (
                    <select
                      value={rule.materialSelectorKey}
                      onChange={(event) =>
                        onMaterialsChange(
                          area.materials.map((item) =>
                            item.id === rule.id ? { ...item, materialSelectorKey: event.target.value, materialId: '' } : item
                          )
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">Select job material dropdown</option>
                      {globalMaterialFields.map((field) => (
                        <option key={field.id} value={field.key}>{field.label || field.key}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={rule.materialId}
                      onChange={(event) =>
                        onMaterialsChange(
                          area.materials.map((item) =>
                            item.id === rule.id ? { ...item, materialId: event.target.value, materialSelectorKey: '' } : item
                          )
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="">Select fixed material</option>
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>{material.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                {globalMaterialFields.length === 0 && rule.materialSource === 'global' ? (
                  <p className="text-xs text-amber-600 dark:text-amber-300">
                    Add a global input with type material first.
                  </p>
                ) : null}
                <ExpressionInput
                  value={rule.quantityExpression}
                  onChange={(value) =>
                    onMaterialsChange(area.materials.map((item) => (item.id === rule.id ? { ...item, quantityExpression: value } : item)))
                  }
                  tokens={formulaTokens}
                  placeholder="Quantity formula, e.g. area.area_sqm * specs.global.resin_kg_per_sqm"
                />
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
                  <input
                    value={rule.wastePercent}
                    onChange={(event) =>
                      onMaterialsChange(area.materials.map((item) => (item.id === rule.id ? { ...item, wastePercent: event.target.value } : item)))
                    }
                    placeholder="Waste %"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <Button size="sm" variant="ghost" onClick={() => onMaterialsChange(area.materials.filter((item) => item.id !== rule.id))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 dark:border-amber-500/15 dark:bg-amber-500/5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Labor and schedule rules</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Define expertise, crew size, and productivity so the budget can estimate manpower days.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => onLaborChange([...area.labor, newLaborRule()])}>
            Add labor
          </Button>
        </div>
        <div className="space-y-3">
          {area.labor.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-amber-300 bg-white/70 px-4 py-5 text-sm text-slate-500 dark:border-amber-500/30 dark:bg-slate-950/50">No labor rules yet. Add lamination, gelcoat, finishing, welding, or MEP expertise here.</p>
          ) : (
            area.labor.map((rule) => (
              <div key={rule.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                <input
                  value={rule.expertiseName}
                  onChange={(event) => onLaborChange(area.labor.map((item) => (item.id === rule.id ? { ...item, expertiseName: event.target.value } : item)))}
                  placeholder="Required expertise, e.g. Lamination"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <ExpressionInput
                  value={rule.quantityExpression}
                  onChange={(value) => onLaborChange(area.labor.map((item) => (item.id === rule.id ? { ...item, quantityExpression: value } : item)))}
                  tokens={formulaTokens}
                  placeholder="Work quantity, e.g. area.area_sqm"
                />
                <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem]">
                  <ExpressionInput
                    value={rule.crewSizeExpression}
                    onChange={(value) => onLaborChange(area.labor.map((item) => (item.id === rule.id ? { ...item, crewSizeExpression: value } : item)))}
                    tokens={formulaTokens}
                    placeholder="Crew size"
                  />
                  <ExpressionInput
                    value={rule.productivityPerWorkerPerDay}
                    onChange={(value) =>
                      onLaborChange(area.labor.map((item) => (item.id === rule.id ? { ...item, productivityPerWorkerPerDay: value } : item)))
                    }
                    tokens={formulaTokens}
                    placeholder="Qty / worker / day"
                  />
                  <Button size="sm" variant="ghost" onClick={() => onLaborChange(area.labor.filter((item) => item.id !== rule.id))}>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
