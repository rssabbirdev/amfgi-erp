'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import {
  useAddJobItemMutation,
  useCalculateJobCostEngineMutation,
  useDeleteJobItemMutation,
  useGetFormulaLibrariesQuery,
  useGetJobByIdQuery,
  useGetJobItemsQuery,
  useGetMaterialsQuery,
  useUpdateJobItemMutation,
} from '@/store/hooks';
import type { Material } from '@/store/api/endpoints/materials';
import type { FormulaLibrary, JobCostEngineItem, JobCostEngineResult, JobItem } from '@/store/api/endpoints/jobs';

type PricingMode = 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';

type BudgetField = {
  key: string;
  label: string;
  inputType?: string;
  unit?: string;
  storage?: 'measurement' | 'variable';
  required?: boolean;
};

type BudgetArea = {
  key: string;
  label: string;
  fields: BudgetField[];
};

type BudgetSchema = {
  globalFields: BudgetField[];
  areas: BudgetArea[];
};

type BudgetItemForm = {
  name: string;
  description: string;
  formulaLibraryId: string;
  values: Record<string, string>;
};

function formatMoney(value: number) {
  return `AED ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDays(value: number) {
  return `${formatQty(value)} days`;
}

function pricingModeLabel(mode: PricingMode) {
  switch (mode) {
    case 'FIFO':
      return 'FIFO costing';
    case 'MOVING_AVERAGE':
      return 'Moving average costing';
    case 'CURRENT':
      return 'Current material price';
    case 'CUSTOM':
      return 'Custom price scenario';
    default:
      return mode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBudgetSchema(formula?: FormulaLibrary | null): BudgetSchema {
  const schema = isRecord(formula?.specificationSchema) ? formula.specificationSchema : {};
  const globalFields = Array.isArray(schema.globalFields)
    ? schema.globalFields.flatMap((field): BudgetField[] => {
        if (!isRecord(field) || typeof field.key !== 'string' || typeof field.label !== 'string') return [];
        return [{
          key: field.key,
          label: field.label,
          inputType: typeof field.inputType === 'string' ? field.inputType : 'number',
          unit: typeof field.unit === 'string' ? field.unit : undefined,
          required: typeof field.required === 'boolean' ? field.required : true,
        }];
      })
    : [];
  const areas = Array.isArray(schema.areas)
    ? schema.areas.flatMap((area): BudgetArea[] => {
        if (!isRecord(area) || typeof area.key !== 'string' || typeof area.label !== 'string') return [];
        const fields = Array.isArray(area.fields)
          ? area.fields.flatMap((field): BudgetField[] => {
              if (!isRecord(field) || typeof field.key !== 'string' || typeof field.label !== 'string') return [];
              return [{
                key: field.key,
                label: field.label,
                inputType: typeof field.inputType === 'string' ? field.inputType : 'number',
                unit: typeof field.unit === 'string' ? field.unit : undefined,
                storage: field.storage === 'variable' ? 'variable' : 'measurement',
                required: typeof field.required === 'boolean' ? field.required : true,
              }];
            })
          : [];
        return [{ key: area.key, label: area.label, fields }];
      })
    : [];
  return { globalFields, areas };
}

function numericField(inputType?: string) {
  return ['number', 'percent', 'length', 'area', 'volume', 'count'].includes(inputType ?? 'number');
}

function parseInputValue(value: string, inputType?: string) {
  if (!numericField(inputType)) return value.trim();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSpecifications(schema: BudgetSchema, values: Record<string, string>) {
  const global = Object.fromEntries(
    schema.globalFields.map((field) => [
      field.key,
      parseInputValue(values[`global.${field.key}`] ?? '', field.inputType),
    ])
  );

  const areas = Object.fromEntries(
    schema.areas.map((area) => {
      const measurements: Record<string, number | string> = {};
      const variables: Record<string, number | string> = {};
      for (const field of area.fields) {
        const target = field.storage === 'variable' ? variables : measurements;
        target[field.key] = parseInputValue(values[`area.${area.key}.${field.key}`] ?? '', field.inputType);
      }
      return [
        area.key,
        {
          ...(Object.keys(measurements).length > 0 ? { measurements } : {}),
          ...(Object.keys(variables).length > 0 ? { variables } : {}),
        },
      ];
    })
  );

  return {
    ...(Object.keys(global).length > 0 ? { global } : {}),
    areas,
  };
}

function valueToFormString(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildValuesFromSpecifications(schema: BudgetSchema, specifications: unknown) {
  const specs = isRecord(specifications) ? specifications : {};
  const global = isRecord(specs.global) ? specs.global : {};
  const areas = isRecord(specs.areas) ? specs.areas : {};
  const values: Record<string, string> = {};

  for (const field of schema.globalFields) {
    values[`global.${field.key}`] = valueToFormString(global[field.key]);
  }

  for (const area of schema.areas) {
    const rawAreaSpecs = areas[area.key];
    const areaSpecs: Record<string, unknown> = isRecord(rawAreaSpecs) ? rawAreaSpecs : {};
    const measurements = isRecord(areaSpecs.measurements) ? areaSpecs.measurements : {};
    const variables = isRecord(areaSpecs.variables) ? areaSpecs.variables : {};

    for (const field of area.fields) {
      const source = field.storage === 'variable' ? variables : measurements;
      values[`area.${area.key}.${field.key}`] = valueToFormString(source[field.key]);
    }
  }

  return values;
}

function emptyBudgetForm(): BudgetItemForm {
  return {
    name: '',
    description: '',
    formulaLibraryId: '',
    values: {},
  };
}

export default function JobCostEnginePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const jobId = params.id as string;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = (session?.user?.isSuperAdmin ?? false) || (perms.includes('job.view') && perms.includes('material.view'));
  const canEdit = (session?.user?.isSuperAdmin ?? false) || perms.includes('job.edit');

  const { data: job, isLoading: jobLoading } = useGetJobByIdQuery(jobId, { skip: !jobId });
  const { data: jobItemsData, isLoading: itemsLoading } = useGetJobItemsQuery(jobId, { skip: !jobId || !canView });
  const { data: formulas = [] } = useGetFormulaLibrariesQuery(undefined, { skip: !canView });
  const { data: materials = [] } = useGetMaterialsQuery(undefined, { skip: !canView });
  const [addJobItem, { isLoading: addingItem }] = useAddJobItemMutation();
  const [updateJobItem, { isLoading: updatingItem }] = useUpdateJobItemMutation();
  const [deleteJobItem, { isLoading: deletingItem }] = useDeleteJobItemMutation();
  const [calculate, { isLoading: calculating }] = useCalculateJobCostEngineMutation();

  const [pricingMode, setPricingMode] = useState<PricingMode>('FIFO');
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<JobCostEngineResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showBudgetItemModal, setShowBudgetItemModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetItemForm>(emptyBudgetForm);
  const [editingBudgetItemId, setEditingBudgetItemId] = useState<string | null>(null);
  const [calculationRevision, setCalculationRevision] = useState(0);
  const itemSaving = addingItem || updatingItem;

  const isVariation = Boolean(job?.parentJobId);
  const selectedItemIds = useMemo(
    () => (jobItemsData?.items ?? []).map((item) => item.id),
    [jobItemsData?.items]
  );
  const selectedFormula = useMemo(
    () => formulas.find((formula) => formula.id === budgetForm.formulaLibraryId) ?? null,
    [budgetForm.formulaLibraryId, formulas]
  );
  const selectedSchema = useMemo(() => parseBudgetSchema(selectedFormula), [selectedFormula]);

  useEffect(() => {
    if (!canView || !jobId || !isVariation || selectedItemIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await calculate({
          jobId,
          pricingMode,
          postingDate,
          jobItemIds: selectedItemIds,
        }).unwrap();
        if (!cancelled) {
          setResult(response);
          setErrorMessage(null);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          typeof error === 'object' &&
          error !== null &&
          'data' in error &&
          typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
            ? (error as { data: { error: string } }).data.error
            : 'Failed to calculate job costing';
        setErrorMessage(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [calculate, calculationRevision, canView, isVariation, jobId, postingDate, pricingMode, selectedItemIds]);

  const aggregatedMaterials = useMemo(() => {
    const map = new Map<string, JobCostEngineItem['materials'][number]>();
    for (const item of result?.items ?? []) {
      for (const material of item.materials) {
        const existing = map.get(material.materialId);
        if (!existing) {
          map.set(material.materialId, { ...material });
          continue;
        }
        const estimatedBaseQuantity = existing.estimatedBaseQuantity + material.estimatedBaseQuantity;
        const quotedCost = existing.quotedCost + material.quotedCost;
        const actualIssuedBaseQuantity = existing.actualIssuedBaseQuantity + material.actualIssuedBaseQuantity;
        const actualIssuedCost = existing.actualIssuedCost + material.actualIssuedCost;
        map.set(material.materialId, {
          ...existing,
          estimatedBaseQuantity,
          quotedCost,
          actualIssuedBaseQuantity,
          actualIssuedCost,
          quantityVariance: estimatedBaseQuantity - actualIssuedBaseQuantity,
          costVariance: quotedCost - actualIssuedCost,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [result]);

  const openBudgetItemModal = () => {
    setEditingBudgetItemId(null);
    setBudgetForm(emptyBudgetForm());
    setShowBudgetItemModal(true);
  };

  const openEditBudgetItemModal = (item: JobItem) => {
    const formula = formulas.find((row) => row.id === item.formulaLibraryId) ?? item.formulaLibrary ?? null;
    const schema = parseBudgetSchema(formula);
    setEditingBudgetItemId(item.id);
    setBudgetForm({
      name: item.name,
      description: item.description ?? '',
      formulaLibraryId: item.formulaLibraryId,
      values: buildValuesFromSpecifications(schema, item.specifications),
    });
    setShowBudgetItemModal(true);
  };

  const closeBudgetItemModal = () => {
    if (itemSaving) return;
    setShowBudgetItemModal(false);
    setBudgetForm(emptyBudgetForm());
    setEditingBudgetItemId(null);
  };

  const saveBudgetItem = async () => {
    if (!budgetForm.formulaLibraryId || !selectedFormula) {
      toast.error('Select a formula first');
      return;
    }
    const name = budgetForm.name.trim() || selectedFormula.name;
    try {
      const data = {
        name,
        description: budgetForm.description.trim() || undefined,
        formulaLibraryId: selectedFormula.id,
        specifications: buildSpecifications(selectedSchema, budgetForm.values),
      };

      if (editingBudgetItemId) {
        await updateJobItem({
          jobId,
          itemId: editingBudgetItemId,
          data,
        }).unwrap();
        toast.success('Budget item updated');
      } else {
        await addJobItem({
          jobId,
          data: {
            ...data,
            sortOrder: jobItemsData?.items?.length ?? 0,
          },
        }).unwrap();
        toast.success('Budget item added');
      }
      setCalculationRevision((current) => current + 1);
      closeBudgetItemModal();
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : editingBudgetItemId
            ? 'Failed to update budget item'
            : 'Failed to add budget item';
      toast.error(message);
    }
  };

  const removeBudgetItem = async (itemId: string, name: string) => {
    if (!window.confirm(`Delete budget item "${name}"? This removes it from the estimate, but does not delete stock transactions.`)) return;
    try {
      await deleteJobItem({ jobId, itemId }).unwrap();
      toast.success('Budget item deleted');
      if (selectedItemIds.length <= 1) setResult(null);
      setCalculationRevision((current) => current + 1);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete budget item';
      toast.error(message);
    }
  };

  if (!canView) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500 dark:text-slate-400">You do not have permission to view job costing and material budget.</p>
      </div>
    );
  }

  if (jobLoading || itemsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!job) {
    return <div className="py-12 text-center text-slate-500 dark:text-slate-400">Job not found.</div>;
  }

  if (!isVariation) {
    return (
      <div className="space-y-4">
        <div className="rounded-3xl border border-amber-300 bg-amber-50 px-6 py-5 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          This costing engine works on job variations only. Open a variation job and attach multiple job items there to build the material budget and workforce plan.
        </div>
        <Button variant="secondary" onClick={() => router.back()}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(5,150,105,0.11),_transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] px-5 py-6 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Link href={`/jobs/${jobId}`} className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 hover:text-emerald-800 dark:text-emerald-300/80 dark:hover:text-emerald-200">
                Job Variation Workspace
              </Link>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2.15rem]">
                Costing & material budget
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Build theoretical material budgets from formula-driven job items, price them from material costing methods, compare them against actual FIFO dispatch consumption, and review workforce readiness before site execution.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canEdit ? (
                <Button onClick={openBudgetItemModal}>
                  Add Budget Item
                </Button>
              ) : null}
              <Link href="/stock/job-budget/formulas">
                <Button variant="secondary">Formula Library</Button>
              </Link>
              <Button variant="secondary" onClick={() => router.push(`/jobs/${jobId}`)}>
                Back to Job
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-4">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Variation</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{job.jobNumber}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{job.description || 'No description'}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Job items</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{jobItemsData?.items?.length ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Multiple formula-based scopes inside one variation</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Estimated material cost</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatMoney(result?.summary.totalQuotedMaterialCost ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{pricingModeLabel(pricingMode)}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Estimated completion</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatDays(result?.summary.totalEstimatedCompletionDays ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Sundays skipped by company setting</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
              Posting Date
            </label>
            <input
              type="date"
              value={postingDate}
              onChange={(event) => setPostingDate(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500">
              Pricing Mode
            </label>
            <select
              value={pricingMode}
              onChange={(event) => setPricingMode(event.target.value as PricingMode)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="FIFO">FIFO</option>
              <option value="MOVING_AVERAGE">Moving average</option>
              <option value="CURRENT">Current material price</option>
              <option value="CUSTOM">Custom price scenario</option>
            </select>
          </div>
        </div>

        {calculating ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            <Spinner size="sm" />
            Recalculating material budget and costing...
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Budget Items</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
              Add one item per scope, such as GRP lining, MEP, steel, or finishing.
            </p>
          </div>
          {canEdit ? (
            <Button size="sm" onClick={openBudgetItemModal}>Add Budget Item</Button>
          ) : null}
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {(jobItemsData?.items ?? []).map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                  {item.formulaLibrary?.name ?? 'Formula'} {item.description ? `- ${item.description}` : ''}
                </p>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEditBudgetItemModal(item)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deletingItem}
                    onClick={() => removeBudgetItem(item.id, item.name)}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {(jobItemsData?.items ?? []).length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-500">
              No budget items yet. Add one budget item, choose a formula, then enter the measurements.
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Material Budget</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
            Base-unit normalized estimate vs actual dispatch consumption, ready to compare with issue reconcile activity.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
              <tr>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3 text-right">Estimated</th>
                <th className="px-4 py-3 text-right">Quoted</th>
                <th className="px-4 py-3 text-right">Actual Issue</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedMaterials.map((material) => (
                <tr key={material.materialId} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{material.materialName}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{material.baseUnit}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(material.estimatedBaseQuantity)} {material.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatMoney(material.quotedCost)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(material.actualIssuedBaseQuantity)} {material.baseUnit}
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatMoney(material.actualIssuedCost)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={material.quantityVariance >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
                      {formatQty(material.quantityVariance)} {material.baseUnit}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatMoney(material.costVariance)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-500">{material.pricingSource.replaceAll('_', ' ')}</td>
                </tr>
              ))}
              {aggregatedMaterials.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                    No material budget rows yet. Add formula-based job items first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {(result?.items ?? []).map((item) => (
          <section key={item.itemId} className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{item.itemName}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                    {item.fabricationType} via {item.formulaLibraryName}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right dark:border-slate-700 dark:bg-slate-900/70">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Budget</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{formatMoney(item.totalQuotedMaterialCost)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Quoted</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{formatMoney(item.totalQuotedMaterialCost)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Actual</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{formatMoney(item.totalActualMaterialCost)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Completion</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{formatDays(item.estimatedCompletionDays)}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                    {item.estimatedCompletionDate ? new Date(item.estimatedCompletionDate).toLocaleDateString() : 'No date'}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">Workforce & schedule</h3>
                <div className="mt-3 space-y-2">
                  {item.labor.map((labor) => (
                    <div key={labor.expertiseName} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{labor.expertiseName}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                            {labor.requiredWorkers} worker{labor.requiredWorkers === 1 ? '' : 's'} · {formatDays(labor.estimatedDays)} · productivity {formatQty(labor.productivityPerWorkerPerDay)}/worker/day
                          </p>
                        </div>
                        <div className="text-right text-sm text-slate-500 dark:text-slate-500">
                          {labor.assignedEmployeeNames.length > 0 ? labor.assignedEmployeeNames.join(', ') : 'No assigned team'}
                        </div>
                      </div>
                      {labor.missingExpertises.length > 0 ? (
                        <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                          Missing expertise coverage: {labor.missingExpertises.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {item.labor.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-500">
                      No labor rules configured in this formula yet.
                    </div>
                  ) : null}
                </div>
              </div>

              {item.warnings.length > 0 ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                  {item.warnings.join(' ')}
                </div>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      <Modal
        isOpen={showBudgetItemModal}
        onClose={closeBudgetItemModal}
        title={editingBudgetItemId ? 'Edit Budget Item' : 'Add Budget Item'}
        size="xl"
      >
        <div className="max-h-[76vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
              Formula
              <select
                value={budgetForm.formulaLibraryId}
                onChange={(event) => {
                  const formula = formulas.find((row) => row.id === event.target.value);
                  setBudgetForm({
                    name: formula?.name ?? '',
                    description: '',
                    formulaLibraryId: event.target.value,
                    values: {},
                  });
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="">Select formula</option>
                {formulas.map((formula) => (
                  <option key={formula.id} value={formula.id}>
                    {formula.name} - {formula.fabricationType}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
              Item Name
              <input
                value={budgetForm.name}
                onChange={(event) => setBudgetForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
            Description
            <input
              value={budgetForm.description}
              onChange={(event) => setBudgetForm((current) => ({ ...current, description: event.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </label>

          {selectedFormula ? (
            <div className="space-y-4">
              {selectedSchema.globalFields.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Global Measurements</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {selectedSchema.globalFields.map((field) => (
                      <BudgetInput
                        key={field.key}
                        field={field}
                        materials={materials}
                        value={budgetForm.values[`global.${field.key}`] ?? ''}
                        onChange={(value) =>
                          setBudgetForm((current) => ({
                            ...current,
                            values: { ...current.values, [`global.${field.key}`]: value },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedSchema.areas.map((area) => (
                <div key={area.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{area.label}</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {area.fields.map((field) => (
                      <BudgetInput
                        key={`${area.key}.${field.key}`}
                        field={field}
                        materials={materials}
                        value={budgetForm.values[`area.${area.key}.${field.key}`] ?? ''}
                        onChange={(value) =>
                          setBudgetForm((current) => ({
                            ...current,
                            values: { ...current.values, [`area.${area.key}.${field.key}`]: value },
                          }))
                        }
                      />
                    ))}
                  </div>
                  {area.fields.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-500">
                      This formula area has no input fields yet.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-500">
              Select a formula to load the measurement fields.
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="ghost" fullWidth onClick={closeBudgetItemModal} disabled={itemSaving}>
              Cancel
            </Button>
            <Button type="button" fullWidth onClick={saveBudgetItem} loading={itemSaving}>
              {editingBudgetItemId ? 'Update Budget Item' : 'Save Budget Item'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BudgetInput({
  field,
  materials,
  value,
  onChange,
}: {
  field: BudgetField;
  materials: Material[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.inputType === 'material') {
    return (
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
        {field.label}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="">Select material</option>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name} - {material.unit} - AED {Number(material.unitCost ?? 0).toFixed(2)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
      {field.label}
      <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-300 dark:border-slate-700 dark:bg-slate-950">
        <input
          type={numericField(field.inputType) ? 'number' : 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-900 outline-none dark:text-white"
        />
        {field.unit ? (
          <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {field.unit}
          </span>
        ) : null}
      </div>
    </label>
  );
}
