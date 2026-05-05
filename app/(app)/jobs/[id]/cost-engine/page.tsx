'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import Spinner from '@/components/ui/Spinner';
import {
  useAddJobItemMutation,
  useAddJobItemProgressEntryMutation,
  useApproveJobCostingSnapshotMutation,
  useCalculateJobCostEngineMutation,
  useCreateJobCostingSnapshotMutation,
  useDeleteJobItemMutation,
  useDeleteJobItemProgressEntryMutation,
  useGetFormulaLibrariesQuery,
  useGetJobCostingSnapshotByIdQuery,
  useGetJobCostingSnapshotsQuery,
  useGetJobByIdQuery,
  useGetJobItemsQuery,
  useGetJobProgressEntriesForJobQuery,
  useGetMaterialsQuery,
  useUpdateJobItemMutation,
  useUpdateJobMutation,
} from '@/store/hooks';
import type { Material } from '@/store/api/endpoints/materials';
import type {
  FormulaLibrary,
  Job,
  JobCostEngineItem,
  JobCostEngineResult,
  JobItem,
  JobItemProgressEntry,
  JobProgressEntryListRow,
  JobCostingSnapshotMeta,
} from '@/store/api/endpoints/jobs';

type PricingMode = 'FIFO' | 'MOVING_AVERAGE' | 'CURRENT' | 'CUSTOM';

type BudgetField = {
  key: string;
  label: string;
  inputType?: string;
  unit?: string;
  storage?: 'measurement' | 'variable';
  required?: boolean;
  defaultMaterialId?: string;
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
  trackingItems: Array<{
    id: string;
    sourceKey: string;
    label: string;
    unit: string;
    targetValue: string;
  }>;
};

type ProgressForm = {
  progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  progressPercent: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate: string;
  actualEndDate: string;
  progressNote: string;
};

type ProgressEntryForm = {
  trackerId: string;
  entryDate: string;
  quantity: string;
  note: string;
};

type TrackableSourceOption = {
  key: string;
  label: string;
  unit?: string;
};

type BudgetPageTab = 'overview' | 'consumption' | 'progress' | 'entries' | 'snapshots';

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatMoney(value: unknown) {
  return `AED ${normalizeNumber(value).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQty(value: unknown) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(normalizeNumber(value));
}

function formatDays(value: unknown) {
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

function progressStatusLabel(status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD') {
  switch (status) {
    case 'IN_PROGRESS':
      return 'In progress';
    case 'COMPLETED':
      return 'Completed';
    case 'ON_HOLD':
      return 'On hold';
    case 'NOT_STARTED':
    default:
      return 'Not started';
  }
}

function scheduleStatusLabel(status?: 'NOT_DUE' | 'ON_TRACK' | 'AT_RISK' | 'DELAYED' | 'COMPLETED' | 'ON_HOLD') {
  switch (status) {
    case 'NOT_DUE':
      return 'Not due';
    case 'AT_RISK':
      return 'At risk';
    case 'DELAYED':
      return 'Delayed';
    case 'COMPLETED':
      return 'Completed';
    case 'ON_HOLD':
      return 'On hold';
    case 'ON_TRACK':
    default:
      return 'On track';
  }
}

function issuePaceLabel(status?: 'NOT_DUE' | 'ON_PLAN' | 'UNDER_ISSUED' | 'OVER_ISSUED') {
  switch (status) {
    case 'UNDER_ISSUED':
      return 'Behind issue plan';
    case 'OVER_ISSUED':
      return 'Ahead of issue plan';
    case 'NOT_DUE':
      return 'Not due';
    case 'ON_PLAN':
    default:
      return 'On plan';
  }
}

function emptyProgressForm(): ProgressForm {
  return {
    progressStatus: 'NOT_STARTED',
    progressPercent: '0',
    plannedStartDate: '',
    plannedEndDate: '',
    actualStartDate: '',
    actualEndDate: '',
    progressNote: '',
  };
}

function isoDateInput(value: string | Date | null | undefined) {
  if (value == null || value === '') return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function jobToScheduleForm(job: Job | undefined): ProgressForm {
  if (!job) return emptyProgressForm();
  return {
    progressStatus: job.executionProgressStatus ?? 'NOT_STARTED',
    progressPercent: String(
      job.executionProgressPercent !== undefined && job.executionProgressPercent !== null
        ? job.executionProgressPercent
        : 0
    ),
    plannedStartDate: isoDateInput(job.executionPlannedStartDate),
    plannedEndDate: isoDateInput(job.executionPlannedEndDate),
    actualStartDate: isoDateInput(job.executionActualStartDate),
    actualEndDate: isoDateInput(job.executionActualEndDate),
    progressNote: job.executionProgressNote ?? '',
  };
}

function JobExecutionScheduleEditor({
  job,
  canEdit,
  hasAnyTrackedBudgetLine,
  saving,
  onPersist,
}: {
  job: Job | undefined;
  canEdit: boolean;
  hasAnyTrackedBudgetLine: boolean;
  saving: boolean;
  onPersist: (form: ProgressForm) => Promise<void>;
}) {
  const [form, setForm] = useState(() => jobToScheduleForm(job));

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Progress & schedule</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            One set of fields for this variation job. The cost engine uses these dates and manual status for every budget line; trackables still drive line-level % from the quantity log.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => void onPersist(form)} loading={saving}>
            Save schedule
          </Button>
        ) : null}
      </div>
      {hasAnyTrackedBudgetLine ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
          This job has trackables on one or more budget lines. Line-level % comes from dated entries; manual progress % is disabled while trackables exist.
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
          Status
          <select
            value={form.progressStatus}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                progressStatus: event.target.value as ProgressForm['progressStatus'],
                progressPercent: event.target.value === 'COMPLETED' ? '100' : current.progressPercent,
              }))
            }
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
          >
            <option value="NOT_STARTED">Not started</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="ON_HOLD">On hold</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
          Progress percent
          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-300 dark:border-slate-700 dark:bg-slate-950">
            <input
              type="number"
              inputMode="decimal"
              value={form.progressPercent}
              onChange={(event) => setForm((current) => ({ ...current, progressPercent: event.target.value }))}
              onWheel={(event) => event.currentTarget.blur()}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
              }}
              disabled={!canEdit || hasAnyTrackedBudgetLine}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:bg-slate-100 dark:text-white dark:disabled:bg-slate-900"
            />
            <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
              %
            </span>
          </div>
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
          Planned start
          <input
            type="date"
            value={form.plannedStartDate}
            onChange={(event) => setForm((current) => ({ ...current, plannedStartDate: event.target.value }))}
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
          Planned end
          <input
            type="date"
            value={form.plannedEndDate}
            onChange={(event) => setForm((current) => ({ ...current, plannedEndDate: event.target.value }))}
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
          Actual start
          <input
            type="date"
            value={form.actualStartDate}
            onChange={(event) => setForm((current) => ({ ...current, actualStartDate: event.target.value }))}
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
          Actual end
          <input
            type="date"
            value={form.actualEndDate}
            onChange={(event) => setForm((current) => ({ ...current, actualEndDate: event.target.value }))}
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
        Note
        <textarea
          value={form.progressNote}
          onChange={(event) => setForm((current) => ({ ...current, progressNote: event.target.value }))}
          rows={3}
          disabled={!canEdit}
          className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900"
        />
      </label>
    </div>
  );
}

function emptyProgressEntryForm(): ProgressEntryForm {
  return {
    trackerId: '',
    entryDate: new Date().toISOString().slice(0, 10),
    quantity: '',
    note: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBudgetSchema(formula?: FormulaLibrary | null): BudgetSchema {
  const schema = isRecord(formula?.specificationSchema) ? formula.specificationSchema : {};
  const config = isRecord(formula?.formulaConfig) ? formula.formulaConfig : {};
  const defaultMaterialSelections = isRecord(config.defaultMaterialSelections) ? config.defaultMaterialSelections : {};
  const globalFields = Array.isArray(schema.globalFields)
    ? schema.globalFields.flatMap((field): BudgetField[] => {
        if (!isRecord(field) || typeof field.key !== 'string' || typeof field.label !== 'string') return [];
        return [{
          key: field.key,
          label: field.label,
          inputType: typeof field.inputType === 'string' ? field.inputType : 'number',
          unit: typeof field.unit === 'string' ? field.unit : undefined,
          required: typeof field.required === 'boolean' ? field.required : true,
          defaultMaterialId:
            typeof field.defaultMaterialId === 'string'
              ? field.defaultMaterialId
              : (typeof defaultMaterialSelections[field.key] === 'string' ? String(defaultMaterialSelections[field.key]) : undefined),
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

function buildInitialBudgetValues(schema: BudgetSchema) {
  const values: Record<string, string> = {};
  for (const field of schema.globalFields) {
    values[`global.${field.key}`] = field.inputType === 'material' ? (field.defaultMaterialId ?? '') : '';
  }
  for (const area of schema.areas) {
    for (const field of area.fields) {
      values[`area.${area.key}.${field.key}`] = '';
    }
  }
  return values;
}

function numericField(inputType?: string) {
  return ['number', 'percent', 'length', 'area', 'volume', 'count'].includes(inputType ?? 'number');
}

function buildTrackableSourceOptions(schema: BudgetSchema): TrackableSourceOption[] {
  const globalOptions = schema.globalFields
    .filter((field) => numericField(field.inputType))
    .map((field) => ({
      key: `global.${field.key}`,
      label: field.label,
      unit: field.unit,
    }));
  const areaOptions = schema.areas.flatMap((area) =>
    area.fields
      .filter((field) => numericField(field.inputType))
      .map((field) => ({
        key: `area.${area.key}.${field.key}`,
        label: `${area.label} - ${field.label}`,
        unit: field.unit,
      }))
  );
  return [...globalOptions, ...areaOptions];
}

function resolveTrackableSourceValue(
  sourceKey: string,
  values: Record<string, string>,
  options: TrackableSourceOption[]
) {
  const option = options.find((entry) => entry.key === sourceKey) ?? null;
  const rawValue = values[sourceKey] ?? '';
  const parsed = Number(rawValue);
  return {
    option,
    targetValue: Number.isFinite(parsed) ? parsed : 0,
  };
}

function createTrackableRow() {
  return {
    id: crypto.randomUUID(),
    sourceKey: '',
    label: '',
    unit: '',
    targetValue: '',
  };
}

function parseInputValue(value: string, inputType?: string) {
  if (inputType === 'boolean') {
    return value === 'true';
  }
  if (!numericField(inputType)) return value.trim();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSpecifications(schema: BudgetSchema, values: Record<string, string>) {
  const global = Object.fromEntries(
    schema.globalFields.map((field) => [
      field.key,
      parseInputValue(
        field.inputType === 'material'
          ? (values[`global.${field.key}`] ?? field.defaultMaterialId ?? '')
          : (values[`global.${field.key}`] ?? ''),
        field.inputType
      ),
    ])
  );

  const areas = Object.fromEntries(
    schema.areas.map((area) => {
      const measurements: Record<string, unknown> = {};
      const variables: Record<string, unknown> = {};
      for (const field of area.fields) {
        const target: Record<string, unknown> = field.storage === 'variable' ? variables : measurements;
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
    const raw = valueToFormString(global[field.key]);
    values[`global.${field.key}`] = field.inputType === 'material' ? (raw || field.defaultMaterialId || '') : raw;
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
    trackingItems: [],
  };
}

function isEmptyBudgetValue(field: BudgetField, value: string | undefined) {
  if (field.inputType === 'boolean') return false;
  if (numericField(field.inputType)) return false;
  if (field.inputType === 'material') return !(value ?? field.defaultMaterialId ?? '').trim();
  return !(value ?? '').trim();
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
  const { data: costingSnapshots = [] } = useGetJobCostingSnapshotsQuery(jobId, { skip: !jobId || !canView });
  const [addJobItem, { isLoading: addingItem }] = useAddJobItemMutation();
  const [updateJobItem, { isLoading: updatingItem }] = useUpdateJobItemMutation();
  const [deleteJobItem, { isLoading: deletingItem }] = useDeleteJobItemMutation();
  const [addProgressEntry, { isLoading: addingProgressEntry }] = useAddJobItemProgressEntryMutation();
  const [deleteProgressEntry, { isLoading: deletingProgressEntry }] = useDeleteJobItemProgressEntryMutation();
  const [calculate, { isLoading: calculating }] = useCalculateJobCostEngineMutation();
  const [createCostingSnapshot, { isLoading: savingSnapshot }] = useCreateJobCostingSnapshotMutation();
  const [approveSnapshot, { isLoading: approvingSnapshot }] = useApproveJobCostingSnapshotMutation();
  const [updateJob, { isLoading: updatingJob }] = useUpdateJobMutation();

  const [pricingMode, setPricingMode] = useState<PricingMode>('FIFO');
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<JobCostEngineResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customUnitCosts, setCustomUnitCosts] = useState<Record<string, string>>({});
  const [debouncedCustomUnitCosts, setDebouncedCustomUnitCosts] = useState<Record<string, number>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BudgetPageTab>('overview');
  const [showBudgetItemModal, setShowBudgetItemModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState<BudgetItemForm>(emptyBudgetForm);
  const [editingBudgetItemId, setEditingBudgetItemId] = useState<string | null>(null);
  const [progressEntryForm, setProgressEntryForm] = useState<ProgressEntryForm>(emptyProgressEntryForm);
  const [calculationRevision, setCalculationRevision] = useState(0);
  const itemSaving = addingItem || updatingItem;

  const isChildJob = Boolean(job?.parentJobId);
  const selectedItemIds = useMemo(
    () => (jobItemsData?.items ?? []).map((item) => item.id),
    [jobItemsData?.items]
  );
  const selectedFormula = useMemo(
    () => formulas.find((formula) => formula.id === budgetForm.formulaLibraryId) ?? null,
    [budgetForm.formulaLibraryId, formulas]
  );
  const approvedBaseline = useMemo(
    () => costingSnapshots.find((snapshot) => snapshot.status === 'APPROVED') ?? null,
    [costingSnapshots]
  );
  const { data: selectedSnapshotData } = useGetJobCostingSnapshotByIdQuery(
    { jobId, snapshotId: selectedSnapshotId ?? '' },
    { skip: !jobId || !selectedSnapshotId || !canView }
  );
  const { data: approvedBaselineData } = useGetJobCostingSnapshotByIdQuery(
    { jobId, snapshotId: approvedBaseline?.id ?? '' },
    { skip: !jobId || !approvedBaseline?.id || approvedBaseline.id === selectedSnapshotId || !canView }
  );
  const selectedSchema = useMemo(() => parseBudgetSchema(selectedFormula), [selectedFormula]);
  const trackableSourceOptions = useMemo(() => buildTrackableSourceOptions(selectedSchema), [selectedSchema]);
  const hasAnyTrackedBudgetLine = useMemo(
    () => (jobItemsData?.items ?? []).some((item) => (item.trackingItems?.length ?? 0) > 0),
    [jobItemsData?.items]
  );
  const executionFormSyncKey = useMemo(() => {
    if (!job?.id) return '';
    return JSON.stringify({
      id: job.id,
      executionProgressStatus: job.executionProgressStatus,
      executionProgressPercent: job.executionProgressPercent,
      executionPlannedStartDate: job.executionPlannedStartDate,
      executionPlannedEndDate: job.executionPlannedEndDate,
      executionActualStartDate: job.executionActualStartDate,
      executionActualEndDate: job.executionActualEndDate,
      executionProgressNote: job.executionProgressNote,
    });
  }, [job]);
  const [entryFormJobItemId, setEntryFormJobItemId] = useState('');
  const { data: jobProgressEntries = [], isLoading: jobProgressEntriesLoading } = useGetJobProgressEntriesForJobQuery(
    jobId,
    { skip: !jobId || activeTab !== 'entries' || !canView }
  );
  const searchableFormulaItems = useMemo(
    () =>
      formulas.map((formula) => ({
        id: formula.id,
        label: formula.name,
        searchText: `${formula.name} ${formula.slug} ${formula.fabricationType}`,
        description: formula.fabricationType,
      })),
    [formulas]
  );
  const displayResult = selectedSnapshotData?.result ?? result;
  const livePricingSnapshots = result?.pricingSnapshots ?? [];
  const activePricingMode = selectedSnapshotData?.snapshot.pricingMode ?? pricingMode;
  const activePostingDate = selectedSnapshotData?.snapshot.postingDate ?? postingDate;
  const comparisonBaseline = selectedSnapshotData?.snapshot.status === 'APPROVED'
    ? selectedSnapshotData
    : approvedBaselineData;
  const tabItems: Array<{ id: BudgetPageTab; label: string; description: string }> = [
    { id: 'overview', label: 'Overview', description: 'Budget setup and live costing' },
    { id: 'consumption', label: 'Consumption', description: 'Material budget and stock gap' },
    { id: 'progress', label: 'Progress', description: 'Job-wide roll-up and pace' },
    { id: 'entries', label: 'Quantity log', description: 'All trackables and dated entries for this job' },
    { id: 'snapshots', label: 'Snapshots', description: 'Saved versions and baseline drift' },
  ];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (pricingMode !== 'CUSTOM') {
        setDebouncedCustomUnitCosts({});
        return;
      }
      const next = Object.fromEntries(
        Object.entries(customUnitCosts).flatMap(([materialId, rawValue]) => {
          const parsed = Number(rawValue);
          return Number.isFinite(parsed) ? [[materialId, parsed]] : [];
        })
      );
      setDebouncedCustomUnitCosts(next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customUnitCosts, pricingMode]);

  useEffect(() => {
    if (pricingMode !== 'CUSTOM') return;
    if (Object.keys(customUnitCosts).length > 0) return;
    const sourceRows = livePricingSnapshots;
    if (sourceRows.length === 0) return;
    setCustomUnitCosts(Object.fromEntries(sourceRows.map((row) => [row.materialId, String(row.baseUnitCost)])));
  }, [customUnitCosts, livePricingSnapshots, pricingMode]);

  useEffect(() => {
    if (!canView || !jobId || selectedItemIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await calculate({
          jobId,
          pricingMode,
          postingDate,
          jobItemIds: selectedItemIds,
          customUnitCosts: pricingMode === 'CUSTOM' ? debouncedCustomUnitCosts : undefined,
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
  }, [calculate, calculationRevision, canView, debouncedCustomUnitCosts, jobId, postingDate, pricingMode, selectedItemIds]);

  const aggregatedMaterials = useMemo(() => {
    const map = new Map<string, JobCostEngineItem['materials'][number]>();
    for (const item of displayResult?.items ?? []) {
      for (const material of item.materials) {
        const existing = map.get(material.materialId);
        if (!existing) {
          map.set(material.materialId, { ...material });
          continue;
        }
        const estimatedBaseQuantity = existing.estimatedBaseQuantity + material.estimatedBaseQuantity;
        const expectedIssuedBaseQuantity = (existing.expectedIssuedBaseQuantity ?? 0) + material.expectedIssuedBaseQuantity;
        const quotedCost = existing.quotedCost + material.quotedCost;
        const expectedIssuedCost = (existing.expectedIssuedCost ?? 0) + material.expectedIssuedCost;
        // Same material on multiple budget lines carries full job actual each time — do not sum.
        const actualIssuedBaseQuantity = Math.max(existing.actualIssuedBaseQuantity, material.actualIssuedBaseQuantity);
        const actualIssuedCost = Math.max(existing.actualIssuedCost, material.actualIssuedCost);
        const issuePaceVariance = actualIssuedBaseQuantity - expectedIssuedBaseQuantity;
        map.set(material.materialId, {
          ...existing,
          estimatedBaseQuantity,
          expectedIssuedBaseQuantity,
          quotedCost,
          expectedIssuedCost,
          actualIssuedBaseQuantity,
          actualIssuedCost,
          quantityVariance: estimatedBaseQuantity - actualIssuedBaseQuantity,
          costVariance: quotedCost - actualIssuedCost,
          issuePaceVariance,
          issuePaceStatus:
            expectedIssuedBaseQuantity <= 0
              ? 'NOT_DUE'
              : issuePaceVariance > Math.max(expectedIssuedBaseQuantity * 0.05, 0.001)
                ? 'OVER_ISSUED'
                : issuePaceVariance < -Math.max(expectedIssuedBaseQuantity * 0.05, 0.001)
                  ? 'UNDER_ISSUED'
                  : 'ON_PLAN',
        });
      }
    }
    return Array.from(map.values())
      .map((material) => {
        const materialMeta = materials.find((row) => row.id === material.materialId);
        const currentStock = Number(materialMeta?.currentStock ?? 0);
        const remainingRequiredQuantity = Math.max(material.estimatedBaseQuantity - material.actualIssuedBaseQuantity, 0);
        const stockGapQuantity = remainingRequiredQuantity - currentStock;
        const coverageStatus =
          remainingRequiredQuantity <= 0
            ? 'COVERED'
            : stockGapQuantity <= 0
              ? 'COVERED'
              : currentStock > 0
                ? 'SHORT'
                : 'NONE';
        return {
          ...material,
          currentStock,
          remainingRequiredQuantity,
          stockGapQuantity,
          coverageStatus,
        };
      })
      .sort((a, b) => a.materialName.localeCompare(b.materialName));
  }, [displayResult, materials]);
  const overallProgress = useMemo(() => {
    const items = displayResult?.items ?? [];
    if (items.length === 0) return 0;
    const totalQuoted = items.reduce((sum, item) => sum + item.totalQuotedMaterialCost, 0);
    if (totalQuoted <= 0) {
      return items.reduce((sum, item) => sum + (item.progress?.percentComplete ?? 0), 0) / items.length;
    }
    const weighted = items.reduce(
      (sum, item) => sum + ((item.totalQuotedMaterialCost / totalQuoted) * (item.progress?.percentComplete ?? 0)),
      0
    );
    return weighted;
  }, [displayResult]);
  const combinedProgressStats = useMemo(() => {
    const items = displayResult?.items ?? [];
    const jwa = displayResult?.summary?.jobWideAttendance;
    let linesWithTracking = 0;
    let sumTrackedComplete = 0;
    let totalQuotedMaterialCost = 0;
    let linesAwaitingAttendance = 0;
    for (const item of items) {
      totalQuotedMaterialCost += item.totalQuotedMaterialCost;
      const t = item.progress?.tracking;
      if (t?.enabled && t.attendance) {
        linesWithTracking += 1;
      }
      if (t?.enabled) {
        sumTrackedComplete += t.totalCompletedValue ?? 0;
        if (t.awaitingAttendanceForPace) linesAwaitingAttendance += 1;
      }
    }
    const summary = displayResult?.summary;
    const internalMaterialBudget = summary?.totalQuotedMaterialCost ?? totalQuotedMaterialCost;
    const totalActualMaterialCost = summary?.totalActualMaterialCost ?? 0;
    const lpoRaw = job?.lpoValue;
    const lpoValue =
      lpoRaw === null || lpoRaw === undefined || (typeof lpoRaw === 'number' && Number.isNaN(lpoRaw))
        ? null
        : Number(lpoRaw);
    const hasLpo = lpoValue !== null && Number.isFinite(lpoValue);
    const lpoRemainingAfterConsumption = hasLpo ? lpoValue! - totalActualMaterialCost : null;
    const internalVsLpoRemaining =
      hasLpo && lpoRemainingAfterConsumption !== null
        ? internalMaterialBudget - lpoRemainingAfterConsumption
        : null;
    /** Internal plan total less deduped actual issued cost (not progress % × quoted per line). */
    const remainingInternalBudget = internalMaterialBudget - totalActualMaterialCost;

    return {
      lineCount: items.length,
      linesWithTracking,
      sumWorkedDays: jwa?.workedDayCount ?? 0,
      sumHours: jwa?.totalWorkedHours ?? 0,
      /** Distinct workers with attendance on this job (not summed per budget line). */
      maxWorkers: jwa?.uniqueWorkerCount ?? 0,
      avgWorkersPerDay: jwa?.averageWorkersPerDay ?? 0,
      sumTrackedComplete,
      weightedPercent: items.length > 0 ? overallProgress : 0,
      /** Internal material budget from formulas (same roll-up as summary). */
      totalQuotedMaterialCost,
      internalMaterialBudget,
      totalActualMaterialCost,
      lpoValue: hasLpo ? lpoValue : null,
      lpoRemainingAfterConsumption,
      internalBudgetVsLpoRemaining: internalVsLpoRemaining,
      remainingInternalBudget,
      linesAwaitingAttendance,
      hasJobWideAttendance: Boolean(jwa),
    };
  }, [displayResult, overallProgress, job?.lpoValue]);

  /** Schedule status is computed the same for every line once job-level dates apply. */
  const jobScheduleRollupStatus = useMemo(() => {
    const items = displayResult?.items ?? [];
    if (items.length === 0) return undefined;
    return items[0]?.progress?.scheduleStatus;
  }, [displayResult?.items]);

  const flatTrackableRows = useMemo(() => {
    const out: Array<{
      jobItemId: string;
      jobItemName: string;
      trackerId: string;
      label: string;
      unit: string | null;
      targetValue: number;
      completedValue: number;
      percentComplete: number;
      entryCount: number;
    }> = [];
    for (const item of jobItemsData?.items ?? []) {
      const trackers = item.trackingItems ?? [];
      if (trackers.length === 0) continue;
      const est = displayResult?.items.find((row) => row.itemId === item.id);
      for (const tr of trackers) {
        const ti = est?.progress?.tracking?.items?.find((t) => t.id === tr.id);
        out.push({
          jobItemId: item.id,
          jobItemName: item.name,
          trackerId: tr.id,
          label: tr.label,
          unit: tr.unit ?? null,
          targetValue: tr.targetValue,
          completedValue: ti?.completedValue ?? 0,
          percentComplete: ti?.percentComplete ?? 0,
          entryCount: ti?.entryCount ?? 0,
        });
      }
    }
    return out;
  }, [jobItemsData?.items, displayResult?.items]);

  const entryFormTrackers = useMemo(() => {
    if (!entryFormJobItemId) return [];
    return (jobItemsData?.items ?? []).find((item) => item.id === entryFormJobItemId)?.trackingItems ?? [];
  }, [entryFormJobItemId, jobItemsData?.items]);
  const procurementRows = useMemo(
    () =>
      aggregatedMaterials
        .filter((material) => material.stockGapQuantity > 0)
        .map((material) => ({
          materialId: material.materialId,
          materialName: material.materialName,
          baseUnit: material.baseUnit,
          remainingRequiredQuantity: material.remainingRequiredQuantity,
          currentStock: material.currentStock,
          toProcureQuantity: material.stockGapQuantity,
          estimatedProcurementCost: material.stockGapQuantity * material.quotedUnitCost,
        }))
        .sort((a, b) => b.estimatedProcurementCost - a.estimatedProcurementCost),
    [aggregatedMaterials]
  );
  const procurementSummary = useMemo(() => ({
    shortageCount: procurementRows.length,
    totalToProcureCost: procurementRows.reduce((sum, row) => sum + row.estimatedProcurementCost, 0),
    totalToProcureQuantity: procurementRows.reduce((sum, row) => sum + row.toProcureQuantity, 0),
  }), [procurementRows]);

  const openBudgetItemModal = () => {
    setEditingBudgetItemId(null);
    setBudgetForm(emptyBudgetForm());
    setProgressEntryForm(emptyProgressEntryForm());
    setEntryFormJobItemId('');
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
      trackingItems:
        item.trackingItems?.map((tracker) => ({
          id: tracker.id,
          sourceKey: tracker.sourceKey ?? '',
          label: tracker.label,
          unit: tracker.unit ?? '',
          targetValue: String(tracker.targetValue),
        })) ??
        (item.trackingEnabled && item.trackingLabel
          ? [{
              id: crypto.randomUUID(),
              sourceKey: item.trackingSourceKey ?? '',
              label: item.trackingLabel,
              unit: item.trackingUnit ?? '',
              targetValue:
                item.trackingTargetValue === null || item.trackingTargetValue === undefined
                  ? ''
                  : String(item.trackingTargetValue),
            }]
          : []),
    });
    setShowBudgetItemModal(true);
    setProgressEntryForm({
      ...emptyProgressEntryForm(),
      trackerId: item.trackingItems?.[0]?.id ?? '',
    });
  };

  const closeBudgetItemModal = () => {
    if (itemSaving) return;
    setShowBudgetItemModal(false);
    setBudgetForm(emptyBudgetForm());
    setEditingBudgetItemId(null);
    setProgressEntryForm(emptyProgressEntryForm());
    setEntryFormJobItemId('');
  };

  const saveBudgetItem = async () => {
    if (!budgetForm.formulaLibraryId || !selectedFormula) {
      toast.error('Select a formula first');
      return;
    }
    const missingGlobal = selectedSchema.globalFields.find(
      (field) => field.required !== false && isEmptyBudgetValue(field, budgetForm.values[`global.${field.key}`])
    );
    if (missingGlobal) {
      toast.error(`${missingGlobal.label} is required`);
      return;
    }
    for (const area of selectedSchema.areas) {
      const missingAreaField = area.fields.find(
        (field) => field.required !== false && isEmptyBudgetValue(field, budgetForm.values[`area.${area.key}.${field.key}`])
      );
      if (missingAreaField) {
        toast.error(`${area.label}: ${missingAreaField.label} is required`);
        return;
      }
    }
    const trackingItems = budgetForm.trackingItems.flatMap((tracker) => {
      const source = resolveTrackableSourceValue(tracker.sourceKey, budgetForm.values, trackableSourceOptions);
      const targetValue = tracker.sourceKey ? source.targetValue : Number(tracker.targetValue || '0');
      const label = tracker.sourceKey ? (source.option?.label ?? '') : tracker.label.trim();
      const unit = tracker.sourceKey ? (source.option?.unit ?? '') : tracker.unit.trim();
      if (!label || !Number.isFinite(targetValue) || targetValue <= 0) return [];
      return [{
        id: tracker.id,
        label,
        unit: unit || null,
        targetValue,
        sourceKey: tracker.sourceKey || null,
      }];
    });

    if (budgetForm.trackingItems.some((tracker) => {
      const source = resolveTrackableSourceValue(tracker.sourceKey, budgetForm.values, trackableSourceOptions);
      const targetValue = tracker.sourceKey ? source.targetValue : Number(tracker.targetValue || '0');
      const label = tracker.sourceKey ? (source.option?.label ?? '') : tracker.label.trim();
      return !label || !Number.isFinite(targetValue) || targetValue <= 0;
    })) {
      toast.error('Each trackable item needs a label and target greater than zero');
      return;
    }
    const name = budgetForm.name.trim() || selectedFormula.name;
    try {
      const data = {
        name,
        description: budgetForm.description.trim() || undefined,
        formulaLibraryId: selectedFormula.id,
        specifications: buildSpecifications(selectedSchema, budgetForm.values),
        trackingItems,
        trackingEnabled: trackingItems.length > 0,
        trackingLabel: trackingItems[0]?.label ?? null,
        trackingUnit: trackingItems[0]?.unit ?? null,
        trackingTargetValue: trackingItems[0]?.targetValue ?? null,
        trackingSourceKey: trackingItems[0]?.sourceKey ?? null,
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

  const persistJobSchedule = async (form: ProgressForm) => {
    if (!canEdit) return;
    const progressPercent = Number(form.progressPercent || '0');
    if (!hasAnyTrackedBudgetLine && form.progressStatus === 'COMPLETED' && progressPercent < 100) {
      toast.error('Completed jobs should be at 100% progress when there are no trackables.');
      return;
    }
    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      toast.error('Progress percent must be between 0 and 100');
      return;
    }
    try {
      await updateJob({
        id: jobId,
        data: {
          executionProgressStatus: form.progressStatus,
          executionProgressPercent:
            !hasAnyTrackedBudgetLine && form.progressStatus === 'COMPLETED' ? 100 : progressPercent,
          executionPlannedStartDate: form.plannedStartDate || null,
          executionPlannedEndDate: form.plannedEndDate || null,
          executionActualStartDate: form.actualStartDate || null,
          executionActualEndDate: form.actualEndDate || null,
          executionProgressNote: form.progressNote.trim() || null,
        },
      }).unwrap();
      toast.success('Job schedule updated');
      setCalculationRevision((current) => current + 1);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to update job schedule';
      toast.error(message);
    }
  };

  const saveProgressEntry = async () => {
    const itemId = entryFormJobItemId;
    if (!itemId) {
      toast.error('Select a budget line');
      return;
    }
    const quantity = Number(progressEntryForm.quantity || '0');
    if (!progressEntryForm.trackerId) {
      toast.error('Select a tracked item');
      return;
    }
    if (!progressEntryForm.entryDate) {
      toast.error('Entry date is required');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Tracked quantity must be greater than zero');
      return;
    }
    try {
      await addProgressEntry({
        jobId,
        itemId,
        data: {
          trackerId: progressEntryForm.trackerId,
          entryDate: progressEntryForm.entryDate,
          quantity,
          note: progressEntryForm.note.trim() || null,
        },
      }).unwrap();
      toast.success('Progress entry added');
      const refreshed = jobItemsData?.items?.find((row) => row.id === itemId);
      setProgressEntryForm({
        ...emptyProgressEntryForm(),
        trackerId: refreshed?.trackingItems?.[0]?.id ?? '',
      });
      setCalculationRevision((current) => current + 1);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to add progress entry';
      toast.error(message);
    }
  };

  const removeProgressEntry = async (entry: JobProgressEntryListRow | JobItemProgressEntry) => {
    if (!window.confirm(`Delete tracked progress entry from ${new Date(entry.entryDate).toLocaleDateString()}?`)) return;
    try {
      await deleteProgressEntry({
        jobId,
        itemId: entry.jobItemId,
        entryId: entry.id,
      }).unwrap();
      toast.success('Progress entry deleted');
      setCalculationRevision((current) => current + 1);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete progress entry';
      toast.error(message);
    }
  };

  const handlePricingModeChange = (nextMode: PricingMode) => {
    if (nextMode === 'CUSTOM' && Object.keys(customUnitCosts).length === 0) {
      const sourceRows = livePricingSnapshots;
      if (sourceRows.length > 0) {
        setCustomUnitCosts(Object.fromEntries(sourceRows.map((row) => [row.materialId, String(row.baseUnitCost)])));
      }
    }
    setSelectedSnapshotId(null);
    setPricingMode(nextMode);
  };

  const saveCostVersion = async () => {
    try {
      const response = await createCostingSnapshot({
        jobId,
        pricingMode,
        postingDate,
        jobItemIds: selectedItemIds,
        customUnitCosts: pricingMode === 'CUSTOM' ? debouncedCustomUnitCosts : undefined,
      }).unwrap();
      setSelectedSnapshotId(response.snapshot.id);
      toast.success(`Saved cost version ${response.snapshot.versionNumber}`);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to save cost version';
      toast.error(message);
    }
  };

  const approveAsBaseline = async (snapshotId: string) => {
    try {
      const response = await approveSnapshot({ jobId, snapshotId }).unwrap();
      toast.success(`Version ${response.snapshot.versionNumber} approved as execution baseline`);
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to approve cost version';
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

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(5,150,105,0.11),_transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] px-5 py-6 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.15),_transparent_36%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              {isChildJob && job.parentJobId ? (
                <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100">
                  Budget lines and saved cost snapshots belong to the parent contract. Material dispatch on this variation (and siblings) rolls into consumption against that budget.
                  <Link
                    href={`/jobs/${job.parentJobId}/cost-engine`}
                    className="mt-2 block text-xs font-semibold uppercase tracking-wide text-sky-800 underline hover:text-sky-950 dark:text-sky-200"
                  >
                    Open parent contract costing
                  </Link>
                </div>
              ) : null}
              <Link href={`/jobs/${jobId}`} className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 hover:text-emerald-800 dark:text-emerald-300/80 dark:hover:text-emerald-200">
                {isChildJob ? 'Variation workspace' : 'Contract job'}
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{isChildJob ? 'This variation' : 'Contract job'}</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{job.jobNumber}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{job.description || 'No description'}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Job items</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{jobItemsData?.items?.length ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatQty(overallProgress)}% weighted progress</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Estimated material cost</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatMoney(displayResult?.summary.totalQuotedMaterialCost ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{pricingModeLabel(activePricingMode)}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Estimated completion</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatDays(displayResult?.summary.totalEstimatedCompletionDays ?? 0)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">Sundays skipped by company setting</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {tabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl border px-4 py-3 text-left transition ${
                activeTab === tab.id
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-900/60'
              }`}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className="mt-1 text-xs text-current/70">{tab.description}</div>
            </button>
          ))}
        </div>
      </section>

      {calculating ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          <Spinner size="sm" />
          Recalculating material budget and costing...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
          {errorMessage}
        </div>
      ) : null}

      {(activeTab === 'overview' || activeTab === 'snapshots') ? (
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
              onChange={(event) => handlePricingModeChange(event.target.value as PricingMode)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              <option value="FIFO">FIFO</option>
              <option value="MOVING_AVERAGE">Moving average</option>
              <option value="CURRENT">Current material price</option>
              <option value="CUSTOM">Custom price scenario</option>
            </select>
          </div>
        </div>

        {activeTab === 'overview' && selectedSnapshotData ? (
          <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100">
            Viewing saved cost version {selectedSnapshotData.snapshot.versionNumber} from{' '}
            {new Date(selectedSnapshotData.snapshot.createdAt).toLocaleString()} using posting date{' '}
            {new Date(selectedSnapshotData.snapshot.postingDate).toLocaleDateString()}.
            <button
              type="button"
              onClick={() => setSelectedSnapshotId(null)}
              className="ml-3 font-semibold underline underline-offset-2"
            >
              Return to live calculation
            </button>
          </div>
        ) : null}

        {activeTab === 'overview' && !selectedSnapshotData ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
            Live calculation is using posting date {new Date(activePostingDate).toLocaleDateString()}. Save a cost version when you want to freeze this price basis and compare it later against current prices.
          </div>
        ) : null}

        {activeTab === 'snapshots' && comparisonBaseline && displayResult ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  Execution baseline: version {comparisonBaseline.snapshot.versionNumber}
                </p>
                <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200">
                  Approved baseline posting date {new Date(comparisonBaseline.snapshot.postingDate).toLocaleDateString()}.
                  Use this to compare what was approved for execution vs what the live costing says now.
                </p>
              </div>
              <div className="text-xs text-emerald-900 dark:text-emerald-100">
                <div>Baseline quoted: {formatMoney(comparisonBaseline.result.summary.totalQuotedMaterialCost)}</div>
                <div>Live quoted: {formatMoney(displayResult.summary.totalQuotedMaterialCost)}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-950/40">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">Material drift</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {formatMoney(displayResult.summary.totalQuotedMaterialCost - comparisonBaseline.result.summary.totalQuotedMaterialCost)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-950/40">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">Timeline drift</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {formatDays(displayResult.summary.totalEstimatedCompletionDays - comparisonBaseline.result.summary.totalEstimatedCompletionDays)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-slate-950/40">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">Baseline mode</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                  {pricingModeLabel(comparisonBaseline.snapshot.pricingMode)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'overview' && pricingMode === 'CUSTOM' && !selectedSnapshotData ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Custom material prices</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Override the unit cost used in this costing run. Saved cost versions keep these prices fixed until you recalculate again.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setCustomUnitCosts(Object.fromEntries(livePricingSnapshots.map((row) => [row.materialId, String(row.baseUnitCost)])))}
              >
                Reset from current prices
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {livePricingSnapshots.map((snapshot) => (
                <label key={snapshot.materialId} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
                  {snapshot.materialName}
                  <div className="mt-1 text-[11px] normal-case tracking-normal text-slate-500 dark:text-slate-400">
                    {snapshot.baseUnit} · posting-date base {formatMoney(snapshot.baseUnitCost)}
                  </div>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-300 dark:border-slate-700 dark:bg-slate-950">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={customUnitCosts[snapshot.materialId] ?? ''}
                      placeholder={String(snapshot.baseUnitCost)}
                      onChange={(event) =>
                        setCustomUnitCosts((current) => ({
                          ...current,
                          [snapshot.materialId]: event.target.value,
                        }))
                      }
                      onWheel={(event) => event.currentTarget.blur()}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
                      }}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
                    />
                    <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      AED
                    </span>
                  </div>
                </label>
              ))}
              {livePricingSnapshots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No material price rows yet. Add budget items first so the costing engine knows which materials to price.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'snapshots' ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Saved cost versions</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Save a frozen price snapshot so later material price changes do not overwrite what was calculated today.
              </p>
            </div>
            <Button size="sm" onClick={saveCostVersion} loading={savingSnapshot} disabled={selectedItemIds.length === 0}>
              Save Cost Version
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {costingSnapshots.map((snapshot: JobCostingSnapshotMeta) => (
              <div key={snapshot.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    Version {snapshot.versionNumber} · {pricingModeLabel(snapshot.pricingMode)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Posting date {new Date(snapshot.postingDate).toLocaleDateString()} · saved {new Date(snapshot.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      snapshot.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                        : snapshot.status === 'SUPERSEDED'
                          ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
                    }`}>
                      {snapshot.status === 'APPROVED' ? 'Execution baseline' : snapshot.status}
                    </span>
                    {snapshot.approvedAt ? (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        approved {new Date(snapshot.approvedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                    <div>{formatMoney(snapshot.totalQuotedMaterialCost)}</div>
                    <div>{formatDays(snapshot.totalEstimatedCompletionDays)}</div>
                  </div>
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={approvingSnapshot || snapshot.status === 'APPROVED'}
                      onClick={() => approveAsBaseline(snapshot.id)}
                    >
                      {snapshot.status === 'APPROVED' ? 'Approved' : 'Approve'}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={selectedSnapshotId === snapshot.id ? 'secondary' : 'ghost'}
                    onClick={() => setSelectedSnapshotId(snapshot.id)}
                  >
                    View
                  </Button>
                </div>
              </div>
            ))}
            {costingSnapshots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-500">
                No saved cost versions yet.
              </div>
            ) : null}
          </div>
        </div>
        ) : null}
      </section>
      ) : null}

      {activeTab === 'overview' ? (
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
        {job ? (
          <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Job progress & schedule</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {progressStatusLabel(job.executionProgressStatus)}
                  </span>
                  {!job.executionActualEndDate ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                      {scheduleStatusLabel(jobScheduleRollupStatus)}
                    </span>
                  ) : null}
                  <span className="text-slate-500 dark:text-slate-400">
                    Manual / roll-up {formatQty(Number(job.executionProgressPercent ?? 0))}%
                    {hasAnyTrackedBudgetLine ? ' · line % from trackables' : ''}
                  </span>
                </div>
              </div>
              {canEdit ? (
                <Button size="sm" variant="secondary" onClick={() => setActiveTab('progress')}>
                  Edit on Progress tab
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {(jobItemsData?.items ?? []).map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{item.name}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
                  {item.formulaLibrary?.name ?? 'Formula'} {item.description ? `- ${item.description}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {(item.trackingItems?.length ?? 0) > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                      {item.trackingItems?.length} trackable item{item.trackingItems?.length === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">No trackables</span>
                  )}
                </div>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setActiveTab('progress')}
                    >
                      Progress
                    </Button>
                  <Button
                    size="sm"
                    variant="ghost"
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
      ) : null}

      {activeTab === 'consumption' ? (
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
                <th className="px-4 py-3 text-right">Expected by progress</th>
                <th className="px-4 py-3 text-right">Quoted</th>
                <th className="px-4 py-3 text-right">Actual Issue</th>
                <th className="px-4 py-3 text-right">Issue pacing</th>
                <th className="px-4 py-3 text-right">Remaining need</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">Coverage</th>
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
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(material.expectedIssuedBaseQuantity)} {material.baseUnit}
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatMoney(material.expectedIssuedCost)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{formatMoney(material.quotedCost)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(material.actualIssuedBaseQuantity)} {material.baseUnit}
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{formatMoney(material.actualIssuedCost)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={
                      material.issuePaceStatus === 'OVER_ISSUED'
                        ? 'text-amber-600 dark:text-amber-300'
                        : material.issuePaceStatus === 'UNDER_ISSUED'
                          ? 'text-sky-600 dark:text-sky-300'
                          : 'text-slate-700 dark:text-slate-300'
                    }>
                      {issuePaceLabel(material.issuePaceStatus)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      {formatQty(material.issuePaceVariance)} {material.baseUnit}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(material.remainingRequiredQuantity)} {material.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(material.currentStock)} {material.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={
                      material.coverageStatus === 'COVERED'
                        ? 'text-emerald-600 dark:text-emerald-300'
                        : material.coverageStatus === 'SHORT'
                          ? 'text-amber-600 dark:text-amber-300'
                          : 'text-rose-600 dark:text-rose-300'
                    }>
                      {material.coverageStatus === 'COVERED'
                        ? 'Covered'
                        : material.coverageStatus === 'SHORT'
                          ? 'Partial short'
                          : 'No stock'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      {material.stockGapQuantity > 0
                        ? `${formatQty(material.stockGapQuantity)} ${material.baseUnit} gap`
                        : '0 gap'}
                    </div>
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
                  <td colSpan={11} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                    No material budget rows yet. Add formula-based job items first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === 'consumption' ? (
      <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-300">Procurement Need</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
            Materials still required to complete the current budget, after considering what is already on hand.
          </p>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Short materials</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{procurementSummary.shortageCount}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">To procure qty</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatQty(procurementSummary.totalToProcureQuantity)}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Procurement exposure</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatMoney(procurementSummary.totalToProcureCost)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900/90 dark:text-slate-500">
              <tr>
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3 text-right">Remaining need</th>
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">To procure</th>
                <th className="px-4 py-3 text-right">Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {procurementRows.map((row) => (
                <tr key={row.materialId} className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{row.materialName}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{row.baseUnit}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(row.remainingRequiredQuantity)} {row.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatQty(row.currentStock)} {row.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-300">
                    {formatQty(row.toProcureQuantity)} {row.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                    {formatMoney(row.estimatedProcurementCost)}
                  </td>
                </tr>
              ))}
              {procurementRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                    No procurement gap right now. Current stock covers the remaining planned need.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {activeTab === 'progress' ? (
      <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">Progress</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Roll-up across every budget line from the current costing result. Weighted % follows internal material budget by line.
            Internal budget is from the cost engine; LPO / contract value comes from the job record. Pace uses HR attendance once for the whole job. Status, dates, and notes below apply to the entire job. Dated quantities are on the{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">Quantity log</span> tab.
          </p>
        </div>
        <div className="space-y-5 p-4 sm:p-6">
          <JobExecutionScheduleEditor
            key={executionFormSyncKey || 'job-schedule-pending'}
            job={job}
            canEdit={canEdit}
            hasAnyTrackedBudgetLine={hasAnyTrackedBudgetLine}
            saving={updatingJob}
            onPersist={persistJobSchedule}
          />
          {(displayResult?.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Run costing (or open a snapshot) to see progress after budget lines exist in the result.
            </p>
          ) : (
            <>
              {combinedProgressStats.linesAwaitingAttendance > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
                  <p className="font-semibold">Pace is waiting on attendance</p>
                  <p className="mt-1 text-xs leading-relaxed opacity-90">
                    On {combinedProgressStats.linesAwaitingAttendance} tracked line(s), quantity is logged but there are not enough attendance work days yet to pace the remainder.
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Budget lines</p>
                <div className="mt-2 flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1">
                  {(displayResult?.items ?? []).map((row) => (
                    <div
                      key={row.itemId}
                      className="inline-flex min-w-[10.5rem] shrink-0 flex-col gap-0.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50"
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{row.itemName}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatQty(row.progress?.percentComplete ?? 0)}% · {progressStatusLabel(row.progress?.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Combined summary</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Weighted progress</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.weightedPercent)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Budget lines</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.lineCount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Internal material budget</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(combinedProgressStats.internalMaterialBudget)}
                    </p>
                    {combinedProgressStats.lpoRemainingAfterConsumption !== null ? (
                      <div className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
                        <p>
                          <span className="text-slate-500 dark:text-slate-400">LPO − consumption: </span>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                            {formatMoney(combinedProgressStats.lpoRemainingAfterConsumption)}
                          </span>
                        </p>
                        {combinedProgressStats.internalBudgetVsLpoRemaining !== null ? (
                          <p>
                            <span className="text-slate-500 dark:text-slate-400">Internal − (LPO − consumption): </span>
                            <span
                              className={`font-semibold tabular-nums ${
                                combinedProgressStats.internalBudgetVsLpoRemaining > 0
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : combinedProgressStats.internalBudgetVsLpoRemaining < 0
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {formatMoney(combinedProgressStats.internalBudgetVsLpoRemaining)}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Set LPO value on the job to compare with contract headroom after consumption.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">LPO / contract value</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {combinedProgressStats.lpoValue !== null ? formatMoney(combinedProgressStats.lpoValue) : '—'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">From job LPO</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Actual consumption</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatMoney(combinedProgressStats.totalActualMaterialCost)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      All job issues and returns (budgeted materials plus extras from dispatch / delivery notes, each material once)
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Remaining internal budget</p>
                    <p
                      className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                        combinedProgressStats.remainingInternalBudget < 0
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {formatMoney(combinedProgressStats.remainingInternalBudget)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      Internal plan total minus actual consumption (quoted plan vs issued cost)
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Attendance work days (job)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.sumWorkedDays)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      {combinedProgressStats.hasJobWideAttendance
                        ? `${combinedProgressStats.linesWithTracking} line(s) with tracking`
                        : 'Recalculate cost to refresh job-wide attendance'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Worked hours (job)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.sumHours)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Workers (distinct)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.maxWorkers)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      Avg {formatQty(combinedProgressStats.avgWorkersPerDay)} per attendance day
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Tracked quantity (sum)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.sumTrackedComplete)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Lines awaiting pace</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatQty(combinedProgressStats.linesAwaitingAttendance)}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
      ) : null}

      {activeTab === 'entries' ? (
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-6">
            <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">Quantity log</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              One job-wide view: every trackable target and every dated quantity entry, across all budget lines.
            </p>
          </div>
          <div className="space-y-8 p-4 sm:p-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Trackable targets</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Progress % and completed qty come from the latest costing result when available.</p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2.5">Budget line</th>
                      <th className="px-3 py-2.5">Trackable</th>
                      <th className="px-3 py-2.5 text-right">Target</th>
                      <th className="px-3 py-2.5 text-right">Completed</th>
                      <th className="px-3 py-2.5 text-right">Remaining</th>
                      <th className="px-3 py-2.5 text-right">%</th>
                      <th className="px-3 py-2.5">Unit</th>
                      <th className="px-3 py-2.5 text-right">Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatTrackableRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-500">
                          No trackable items on this job yet. Enable tracking on a budget line in Edit.
                        </td>
                      </tr>
                    ) : (
                      flatTrackableRows.map((row) => (
                        <tr key={`${row.jobItemId}-${row.trackerId}`} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{row.jobItemName}</td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.label}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(row.targetValue)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(row.completedValue)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(Math.max(row.targetValue - row.completedValue, 0))}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(row.percentComplete)}</td>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{row.unit ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(row.entryCount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {canEdit ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add quantity entry</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_minmax(0,1fr)_120px]">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                    Budget line
                    <select
                      value={entryFormJobItemId}
                      onChange={(event) => {
                        const id = event.target.value;
                        setEntryFormJobItemId(id);
                        const trackers = (jobItemsData?.items ?? []).find((item) => item.id === id)?.trackingItems ?? [];
                        setProgressEntryForm((current) => ({
                          ...current,
                          trackerId: trackers[0]?.id ?? '',
                        }));
                      }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="">Select budget line</option>
                      {(jobItemsData?.items ?? [])
                        .filter((item) => (item.trackingItems?.length ?? 0) > 0)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                    Trackable
                    <select
                      value={progressEntryForm.trackerId}
                      onChange={(event) => setProgressEntryForm((current) => ({ ...current, trackerId: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="">Select trackable</option>
                      {entryFormTrackers.map((tracker) => (
                        <option key={tracker.id} value={tracker.id}>
                          {tracker.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                    Entry date
                    <input
                      type="date"
                      value={progressEntryForm.entryDate}
                      onChange={(event) => setProgressEntryForm((current) => ({ ...current, entryDate: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                    Note
                    <input
                      value={progressEntryForm.note}
                      onChange={(event) => setProgressEntryForm((current) => ({ ...current, note: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                    Quantity
                    <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-300 dark:border-slate-700 dark:bg-slate-950">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={progressEntryForm.quantity}
                        onChange={(event) => setProgressEntryForm((current) => ({ ...current, quantity: event.target.value }))}
                        onWheel={(event) => event.currentTarget.blur()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
                        }}
                        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
                      />
                      {entryFormTrackers.find((t) => t.id === progressEntryForm.trackerId)?.unit ? (
                        <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          {entryFormTrackers.find((t) => t.id === progressEntryForm.trackerId)?.unit}
                        </span>
                      ) : null}
                    </div>
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button type="button" size="sm" onClick={saveProgressEntry} loading={addingProgressEntry}>
                    Add entry
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">All dated entries</h3>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                {jobProgressEntriesLoading ? (
                  <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                    <Spinner size="sm" /> Loading entries…
                  </div>
                ) : (
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/80 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Budget line</th>
                        <th className="px-3 py-2.5">Trackable</th>
                        <th className="px-3 py-2.5 text-right">Qty</th>
                        <th className="px-3 py-2.5">Unit</th>
                        <th className="px-3 py-2.5">Note</th>
                        {canEdit ? <th className="px-3 py-2.5 text-right"> </th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {jobProgressEntries.map((entry) => (
                        <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-800">
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{new Date(entry.entryDate).toLocaleDateString()}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">{entry.jobItemName}</td>
                          <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{entry.trackerLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-white">{formatQty(entry.quantity)}</td>
                          <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{entry.trackerUnit ?? '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{entry.note || '—'}</td>
                          {canEdit ? (
                            <td className="px-3 py-2.5 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => removeProgressEntry(entry)}
                                disabled={deletingProgressEntry}
                              >
                                Delete
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!jobProgressEntriesLoading && jobProgressEntries.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-500">No quantity entries yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
              <div className="mt-1.5">
                <SearchSelect
                  items={searchableFormulaItems}
                  value={budgetForm.formulaLibraryId}
                  onChange={(id) => {
                    const formula = formulas.find((row) => row.id === id);
                    const schema = parseBudgetSchema(formula);
                    setBudgetForm({
                      name: formula?.name ?? '',
                      description: '',
                      formulaLibraryId: id,
                      values: buildInitialBudgetValues(schema),
                      trackingItems: [],
                    });
                  }}
                  placeholder="Select formula"
                  openOnFocus
                  dropdownInPortal
                  clearOnEmptyInput
                />
              </div>
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

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Track work progress</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Add one or more trackable targets so daily progress entries can calculate average output and pace forecast.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  setBudgetForm((current) => ({
                    ...current,
                    trackingItems: [...current.trackingItems, createTrackableRow()],
                  }))
                }
              >
                Add Trackable Item
              </Button>
            </div>

            {budgetForm.trackingItems.length > 0 ? (
              <div className="mt-4 space-y-3">
                {budgetForm.trackingItems.map((tracker, index) => {
                  const source = resolveTrackableSourceValue(tracker.sourceKey, budgetForm.values, trackableSourceOptions);
                  const resolvedLabel = tracker.sourceKey ? (source.option?.label ?? '') : tracker.label;
                  const resolvedUnit = tracker.sourceKey ? (source.option?.unit ?? '') : tracker.unit;
                  const resolvedTarget = tracker.sourceKey ? String(source.targetValue) : tracker.targetValue;
                  return (
                    <div key={tracker.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/70">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Trackable item {index + 1}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setBudgetForm((current) => ({
                              ...current,
                              trackingItems: current.trackingItems.filter((entry) => entry.id !== tracker.id),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                          Track from formula input
                          <select
                            value={tracker.sourceKey}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                trackingItems: current.trackingItems.map((entry) =>
                                  entry.id === tracker.id ? { ...entry, sourceKey: event.target.value } : entry
                                ),
                              }))
                            }
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                          >
                            <option value="">Custom trackable target</option>
                            {trackableSourceOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                          Tracking label
                          <input
                            value={resolvedLabel ?? ''}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                trackingItems: current.trackingItems.map((entry) =>
                                  entry.id === tracker.id ? { ...entry, label: event.target.value } : entry
                                ),
                              }))
                            }
                            disabled={Boolean(tracker.sourceKey)}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                          />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                          Tracking unit
                          <input
                            value={resolvedUnit ?? ''}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                trackingItems: current.trackingItems.map((entry) =>
                                  entry.id === tracker.id ? { ...entry, unit: event.target.value } : entry
                                ),
                              }))
                            }
                            disabled={Boolean(tracker.sourceKey)}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none focus:border-emerald-300 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                          />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
                          Tracking target
                          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-emerald-300 dark:border-slate-700 dark:bg-slate-950">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={resolvedTarget ?? ''}
                              onChange={(event) =>
                                setBudgetForm((current) => ({
                                  ...current,
                                  trackingItems: current.trackingItems.map((entry) =>
                                    entry.id === tracker.id ? { ...entry, targetValue: event.target.value } : entry
                                  ),
                                }))
                              }
                              disabled={Boolean(tracker.sourceKey)}
                              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-900 outline-none [appearance:textfield] disabled:bg-slate-100 disabled:text-slate-500 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white dark:disabled:bg-slate-900 dark:disabled:text-slate-500"
                            />
                            {(resolvedUnit ?? '') ? (
                              <span className="border-l border-slate-200 px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-500 dark:border-slate-700 dark:text-slate-400">
                                {resolvedUnit}
                              </span>
                            ) : null}
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-500">
                No trackable items yet.
              </div>
            )}
          </div>

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
  if (field.inputType === 'boolean') {
    const enabled = value === 'true';
    return (
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
        {field.label}
        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
          <div>
            <p className="text-sm font-medium normal-case tracking-normal text-slate-900 dark:text-white">
              {enabled ? 'Yes' : 'No'}
            </p>
            <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">
              Boolean input
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(enabled ? 'false' : 'true')}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </label>
    );
  }

  if (field.inputType === 'material') {
    const searchableMaterials = materials.map((material) => ({
      id: material.id,
      label: material.name,
      searchText: `${material.name} ${material.unit} ${Number(material.unitCost ?? 0).toFixed(2)}`,
      description: `${material.unit} - AED ${Number(material.unitCost ?? 0).toFixed(2)}`,
    }));
    return (
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
        {field.label}
        <div className="mt-1.5">
          <SearchSelect
            items={searchableMaterials}
            value={value || field.defaultMaterialId || ''}
            onChange={onChange}
            placeholder="Select material"
            openOnFocus
            dropdownInPortal
            clearOnEmptyInput
          />
        </div>
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
          inputMode={numericField(field.inputType) ? 'decimal' : undefined}
          placeholder={numericField(field.inputType) ? '0' : undefined}
          onWheel={numericField(field.inputType) ? (event) => event.currentTarget.blur() : undefined}
          onKeyDown={
            numericField(field.inputType)
              ? (event) => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                  }
                }
              : undefined
          }
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
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
