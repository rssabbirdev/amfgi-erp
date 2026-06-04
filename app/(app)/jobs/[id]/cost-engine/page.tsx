'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { cn } from '@/lib/utils';
import Modal from '@/components/ui/Modal';
import SearchSelect from '@/components/ui/SearchSelect';
import Spinner from '@/components/ui/Spinner';
import {
  useAddJobItemMutation,
  useAddJobItemProgressEntryMutation,
  useApproveJobCostingSnapshotMutation,
  useCalculateJobCostEngineMutation,
  useCreateJobCostingSnapshotMutation,
  useDeleteJobCostingSnapshotMutation,
  useRenameJobCostingSnapshotMutation,
  useDeleteJobItemMutation,
  useDeleteJobItemProgressEntryMutation,
  useGetFormulaLibrariesQuery,
  useGetJobCostingSnapshotByIdQuery,
  useGetJobCostingSnapshotsQuery,
  useGetJobByIdQuery,
  useGetJobItemsQuery,
  useGetJobProgressEntriesForJobQuery,
  useGetMaterialsQuery,
  useGetWarehousesQuery,
  useUpdateJobItemMutation,
  useUpdateJobMutation,
} from '@/store/hooks';
import type { Material } from '@/store/api/endpoints/materials';
import {
  buildManualBudgetSpecifications,
  isManualBudgetSpecifications,
  parseManualBudgetSpecifications,
  validateManualBudgetForSave,
  type JobItemManualBudget,
} from '@/lib/job-costing/manualBudget';
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

type BudgetFormulaValue = {
  key: string;
  label: string;
  value: string;
  unit?: string;
};

type BudgetArea = {
  key: string;
  label: string;
  dynamic: boolean;
  fields: BudgetField[];
  formulaValues: BudgetFormulaValue[];
};

type BudgetSchema = {
  globalFields: BudgetField[];
  formulaValues: BudgetFormulaValue[];
  areas: BudgetArea[];
};

type BudgetMode = 'formula' | 'manual';

type ManualMaterialRow = {
  id: string;
  materialId: string;
  quantity: string;
  wastePercent: string;
};

type ManualLaborRow = {
  id: string;
  expertiseName: string;
  estimatedHours: string;
  crewSize: string;
};

type BudgetItemForm = {
  name: string;
  description: string;
  budgetMode: BudgetMode;
  formulaLibraryId: string;
  values: Record<string, string>;
  areaInstances: Record<string, BudgetAreaInstance[]>;
  manualMaterials: ManualMaterialRow[];
  manualLabor: ManualLaborRow[];
  trackingItems: Array<{
    id: string;
    sourceKey: string;
    label: string;
    unit: string;
    targetValue: string;
    finishedGoodMaterialId: string;
    finishedGoodWarehouseId: string;
  }>;
};

type BudgetAreaInstance = {
  id: string;
  label: string;
};

type ProgressForm = {
  progressPercent: string;
  actualStartDate: string;
  actualEndDate: string;
  progressNote: string;
};

type JobItemProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';

/** Map the job-level status to the JobItemProgressStatus that the cost engine tracks. */
function mapJobStatusToProgressStatus(
  jobStatus: 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED' | undefined,
  hasActualStart: boolean,
): JobItemProgressStatus {
  if (jobStatus === 'COMPLETED') return 'COMPLETED';
  if (jobStatus === 'ON_HOLD' || jobStatus === 'CANCELLED') return 'ON_HOLD';
  return hasActualStart ? 'IN_PROGRESS' : 'NOT_STARTED';
}

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

const BUDGET_TAB_ITEMS: Array<{ id: BudgetPageTab; label: string; description: string }> = [
  { id: 'overview', label: 'Overview', description: 'Budget setup and live costing' },
  { id: 'consumption', label: 'Consumption', description: 'Material budget and stock gap' },
  { id: 'progress', label: 'Progress', description: 'Job-wide roll-up and pace' },
  { id: 'entries', label: 'Quantity log', description: 'All trackable and dated entries for this job' },
  { id: 'snapshots', label: 'Snapshots', description: 'Saved versions and baseline drift' },
];

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
    progressPercent: '0',
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
    progressPercent: String(
      job.executionProgressPercent !== undefined && job.executionProgressPercent !== null
        ? job.executionProgressPercent
        : 0
    ),
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
    <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Progress & schedule</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Status and planned dates come from the job profile. Use this panel to record actual execution dates and manual progress for the cost engine.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" size="sm" onClick={() => void onPersist(form)} disabled={saving}>
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
        ) : null}
      </div>
      {hasAnyTrackedBudgetLine ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
          This job has trackable on one or more budget lines. Line-level % comes from dated entries; manual progress % is disabled while trackable exist.
        </div>
      ) : null}
      <div className="mt-4 rounded-xl border border-border bg-white px-3 py-3 text-xs dark:border-border dark:bg-background">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Job profile values
          </span>
          <span className="text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
            Edit on the job profile to change.
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div>
            <span className="block font-medium text-muted-foreground">Status</span>
            <span className="mt-1 inline-block rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground dark:bg-muted dark:text-foreground">
              {progressStatusLabel(mapJobStatusToProgressStatus(job?.status, !!form.actualStartDate))}
              {job?.status ? ` · ${job.status.replace('_', ' ').toLowerCase()}` : ''}
            </span>
          </div>
          <div>
            <span className="block font-medium text-muted-foreground">Planned start</span>
            <span className="mt-1 block text-sm font-semibold text-foreground">
              {job?.startDate ? new Date(job.startDate).toLocaleDateString() : '—'}
            </span>
          </div>
          <div>
            <span className="block font-medium text-muted-foreground">Planned end</span>
            <span className="mt-1 block text-sm font-semibold text-foreground">
              {job?.endDate ? new Date(job.endDate).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Progress percent
          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-border bg-white focus-within:border-emerald-300 dark:border-border dark:bg-background">
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
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:bg-muted dark:disabled:bg-muted"
            />
            <span className="border-l border-border px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-muted-foreground dark:border-border">
              %
            </span>
          </div>
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Actual start
          <input
            type="date"
            value={form.actualStartDate}
            onChange={(event) => setForm((current) => ({ ...current, actualStartDate: event.target.value }))}
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 disabled:bg-muted dark:border-border dark:bg-background dark:disabled:bg-muted"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Actual end
          <input
            type="date"
            value={form.actualEndDate}
            onChange={(event) => setForm((current) => ({ ...current, actualEndDate: event.target.value }))}
            disabled={!canEdit}
            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 disabled:bg-muted dark:border-border dark:bg-background dark:disabled:bg-muted"
          />
        </label>
      </div>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Note
        <textarea
          value={form.progressNote}
          onChange={(event) => setForm((current) => ({ ...current, progressNote: event.target.value }))}
          rows={3}
          disabled={!canEdit}
          className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 disabled:bg-muted dark:border-border dark:bg-background dark:disabled:bg-muted"
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

function formulaValueToString(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function parseFormulaOverrideValue(value: string) {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

function buildFormulaValuesFromConfig(config: Record<string, unknown>): BudgetFormulaValue[] {
  const values = new Map<string, BudgetFormulaValue>();
  if (isRecord(config.variables)) {
    for (const [key, value] of Object.entries(config.variables)) {
      if (typeof value !== 'number' && typeof value !== 'string') continue;
      values.set(key, { key, label: key, value: String(value) });
    }
  }
  if (Array.isArray(config.constants)) {
    for (const constant of config.constants) {
      if (!isRecord(constant) || typeof constant.key !== 'string' || !constant.key.trim()) continue;
      values.set(constant.key, {
        key: constant.key,
        label: typeof constant.label === 'string' && constant.label.trim() ? constant.label : constant.key,
        value: formulaValueToString(constant.value),
        unit: typeof constant.unit === 'string' ? constant.unit : undefined,
      });
    }
  }
  return Array.from(values.values());
}

function buildAreaFormulaValuesFromConfig(
  schemaArea: Record<string, unknown>,
  configArea?: Record<string, unknown>
): BudgetFormulaValue[] {
  const metadata = new Map<string, { label: string; unit?: string }>();
  if (Array.isArray(schemaArea.formulaValues)) {
    for (const field of schemaArea.formulaValues) {
      if (!isRecord(field) || typeof field.key !== 'string' || !field.key.trim()) continue;
      metadata.set(field.key, {
        label: typeof field.label === 'string' && field.label.trim() ? field.label : field.key,
        unit: typeof field.unit === 'string' ? field.unit : undefined,
      });
    }
  }

  const values = new Map<string, BudgetFormulaValue>();
  if (isRecord(configArea?.variables)) {
    for (const [key, value] of Object.entries(configArea.variables)) {
      if (typeof value !== 'number' && typeof value !== 'string') continue;
      const meta = metadata.get(key);
      values.set(key, {
        key,
        label: meta?.label ?? key,
        value: String(value),
        unit: meta?.unit,
      });
    }
  }
  for (const [key, meta] of metadata.entries()) {
    if (values.has(key)) continue;
    values.set(key, { key, label: meta.label, value: '', unit: meta.unit });
  }
  return Array.from(values.values());
}

function parseBudgetSchema(formula?: FormulaLibrary | null): BudgetSchema {
  const schema = isRecord(formula?.specificationSchema) ? formula.specificationSchema : {};
  const config = isRecord(formula?.formulaConfig) ? formula.formulaConfig : {};
  const defaultMaterialSelections = isRecord(config.defaultMaterialSelections) ? config.defaultMaterialSelections : {};
  const configAreas = Array.isArray(config.areas) ? config.areas.filter(isRecord) : [];
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
        const configArea = configAreas.find((row) => row.key === area.key);
        return [{
          key: area.key,
          label: area.label,
          dynamic: area.dynamic === true,
          fields,
          formulaValues: buildAreaFormulaValuesFromConfig(area, configArea),
        }];
      })
    : [];
  return { globalFields, formulaValues: buildFormulaValuesFromConfig(config), areas };
}

function buildInitialBudgetValues(schema: BudgetSchema) {
  const values: Record<string, string> = {};
  for (const field of schema.globalFields) {
    values[`global.${field.key}`] = field.inputType === 'material' ? (field.defaultMaterialId ?? '') : '';
  }
  for (const field of schema.formulaValues) {
    values[`formulaOverride.global.${field.key}`] = '';
  }
  for (const area of schema.areas) {
    for (const field of area.fields) {
      values[`area.${area.key}.${field.key}`] = '';
    }
    for (const field of area.formulaValues) {
      values[`formulaOverride.area.${area.key}.${field.key}`] = '';
    }
  }
  return values;
}

function createBudgetAreaInstance(area: BudgetArea, index: number): BudgetAreaInstance {
  return {
    id: crypto.randomUUID(),
    label: `${area.label || area.key || 'Area'} ${index + 1}`,
  };
}

function buildInitialAreaInstances(schema: BudgetSchema): Record<string, BudgetAreaInstance[]> {
  return Object.fromEntries(
    schema.areas
      .filter((area) => area.dynamic)
      .map((area) => [area.key, [createBudgetAreaInstance(area, 0)]])
  );
}

function areaInstanceValueKey(areaKey: string, instanceId: string, fieldKey: string) {
  return `areaInstance.${areaKey}.${instanceId}.${fieldKey}`;
}

function legacyAreaInstanceId(areaKey: string) {
  return `${areaKey}-legacy`;
}

function numericField(inputType?: string) {
  return ['number', 'percent', 'length', 'area', 'volume', 'count'].includes(inputType ?? 'number');
}

function buildTrackableSourceOptions(
  schema: BudgetSchema,
  areaInstances: Record<string, BudgetAreaInstance[]>
): TrackableSourceOption[] {
  const globalOptions = schema.globalFields
    .filter((field) => numericField(field.inputType))
    .map((field) => ({
      key: `global.${field.key}`,
      label: field.label,
      unit: field.unit,
    }));
  const areaOptions = schema.areas.flatMap((area) =>
    area.dynamic
      ? (areaInstances[area.key] ?? []).flatMap((instance) =>
          area.fields
            .filter((field) => numericField(field.inputType))
            .map((field) => ({
              key: areaInstanceValueKey(area.key, instance.id, field.key),
              label: `${area.label} - ${instance.label} - ${field.label}`,
              unit: field.unit,
            }))
        )
      : area.fields
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
    finishedGoodMaterialId: '',
    finishedGoodWarehouseId: '',
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

function buildSpecifications(
  schema: BudgetSchema,
  values: Record<string, string>,
  areaInstances: Record<string, BudgetAreaInstance[]>
) {
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
      if (area.dynamic) {
        return [
          area.key,
          {
            instances: (areaInstances[area.key] ?? []).map((instance) => {
              const measurements: Record<string, unknown> = {};
              const variables: Record<string, unknown> = {};
              for (const field of area.fields) {
                const target: Record<string, unknown> = field.storage === 'variable' ? variables : measurements;
                target[field.key] = parseInputValue(
                  values[areaInstanceValueKey(area.key, instance.id, field.key)] ?? '',
                  field.inputType
                );
              }
              return {
                id: instance.id,
                label: instance.label.trim() || area.label,
                ...(Object.keys(measurements).length > 0 ? { measurements } : {}),
                ...(Object.keys(variables).length > 0 ? { variables } : {}),
              };
            }),
          },
        ];
      }
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

  const globalFormulaOverrides = Object.fromEntries(
    schema.formulaValues.flatMap((field) => {
      const rawValue = values[`formulaOverride.global.${field.key}`]?.trim();
      return rawValue ? [[field.key, parseFormulaOverrideValue(rawValue)]] : [];
    })
  );
  const areaFormulaOverrides = Object.fromEntries(
    schema.areas.flatMap((area) => {
      const overrides = Object.fromEntries(
        area.formulaValues.flatMap((field) => {
          const rawValue = values[`formulaOverride.area.${area.key}.${field.key}`]?.trim();
          return rawValue ? [[field.key, parseFormulaOverrideValue(rawValue)]] : [];
        })
      );
      return Object.keys(overrides).length > 0 ? [[area.key, overrides]] : [];
    })
  );
  const formulaOverrides = {
    ...(Object.keys(globalFormulaOverrides).length > 0 ? { global: globalFormulaOverrides } : {}),
    ...(Object.keys(areaFormulaOverrides).length > 0 ? { areas: areaFormulaOverrides } : {}),
  };

  return {
    ...(Object.keys(global).length > 0 ? { global } : {}),
    areas,
    ...(Object.keys(formulaOverrides).length > 0 ? { formulaOverrides } : {}),
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
  const formulaOverrides = isRecord(specs.formulaOverrides) ? specs.formulaOverrides : {};
  const globalFormulaOverrides = isRecord(formulaOverrides.global) ? formulaOverrides.global : {};
  const areaFormulaOverrides = isRecord(formulaOverrides.areas) ? formulaOverrides.areas : {};
  const values: Record<string, string> = {};

  for (const field of schema.globalFields) {
    const raw = valueToFormString(global[field.key]);
    values[`global.${field.key}`] = field.inputType === 'material' ? (raw || field.defaultMaterialId || '') : raw;
  }
  for (const field of schema.formulaValues) {
    values[`formulaOverride.global.${field.key}`] = valueToFormString(globalFormulaOverrides[field.key]);
  }

  for (const area of schema.areas) {
    const rawAreaSpecs = areas[area.key];
    const areaSpecs: Record<string, unknown> = isRecord(rawAreaSpecs) ? rawAreaSpecs : {};
    if (area.dynamic) {
      const instances = Array.isArray(areaSpecs.instances) ? areaSpecs.instances : [];
      const hydratedInstances = instances.length > 0
        ? instances
        : Object.keys(areaSpecs).some((key) => key === 'measurements' || key === 'variables')
          ? [{ ...areaSpecs, id: legacyAreaInstanceId(area.key), label: `${area.label || area.key || 'Area'} 1` }]
          : [];
      hydratedInstances.forEach((rawInstance, index) => {
        if (!isRecord(rawInstance)) return;
        const instanceId = typeof rawInstance.id === 'string' && rawInstance.id.trim()
          ? rawInstance.id
          : `${area.key}-${index + 1}`;
        const measurements = isRecord(rawInstance.measurements) ? rawInstance.measurements : {};
        const variables = isRecord(rawInstance.variables) ? rawInstance.variables : {};
        for (const field of area.fields) {
          const source = field.storage === 'variable' ? variables : measurements;
          values[areaInstanceValueKey(area.key, instanceId, field.key)] = valueToFormString(source[field.key]);
        }
      });
      continue;
    }
    const measurements = isRecord(areaSpecs.measurements) ? areaSpecs.measurements : {};
    const variables = isRecord(areaSpecs.variables) ? areaSpecs.variables : {};
    const rawAreaOverrides = areaFormulaOverrides[area.key];
    const areaOverrides: Record<string, unknown> = isRecord(rawAreaOverrides) ? rawAreaOverrides : {};

    for (const field of area.fields) {
      const source = field.storage === 'variable' ? variables : measurements;
      values[`area.${area.key}.${field.key}`] = valueToFormString(source[field.key]);
    }
    for (const field of area.formulaValues) {
      values[`formulaOverride.area.${area.key}.${field.key}`] = valueToFormString(areaOverrides[field.key]);
    }
  }

  return values;
}

function buildAreaInstancesFromSpecifications(
  schema: BudgetSchema,
  specifications: unknown
): Record<string, BudgetAreaInstance[]> {
  const specs = isRecord(specifications) ? specifications : {};
  const areas = isRecord(specs.areas) ? specs.areas : {};
  return Object.fromEntries(
    schema.areas
      .filter((area) => area.dynamic)
      .map((area) => {
        const rawAreaSpecs = areas[area.key];
        const areaSpecs: Record<string, unknown> = isRecord(rawAreaSpecs) ? rawAreaSpecs : {};
        const rawInstances: unknown[] = Array.isArray(areaSpecs.instances) ? areaSpecs.instances : [];
        const hasLegacyValues = Object.keys(areaSpecs).some((key) => key === 'measurements' || key === 'variables');
        const instances = rawInstances.flatMap((rawInstance, index): BudgetAreaInstance[] => {
          if (!isRecord(rawInstance)) return [];
          const id = typeof rawInstance.id === 'string' && rawInstance.id.trim()
            ? rawInstance.id
            : `${area.key}-${index + 1}`;
          return [{
            id,
            label:
              typeof rawInstance.label === 'string' && rawInstance.label.trim()
                ? rawInstance.label
                : `${area.label || area.key || 'Area'} ${index + 1}`,
          }];
        });
        if (instances.length > 0) return [area.key, instances];
        if (hasLegacyValues) {
          return [area.key, [{ id: legacyAreaInstanceId(area.key), label: `${area.label || area.key || 'Area'} 1` }]];
        }
        return [area.key, [createBudgetAreaInstance(area, 0)]];
      })
  );
}

function createManualMaterialRow(): ManualMaterialRow {
  return {
    id: crypto.randomUUID(),
    materialId: '',
    quantity: '',
    wastePercent: '',
  };
}

function createManualLaborRow(): ManualLaborRow {
  return {
    id: crypto.randomUUID(),
    expertiseName: '',
    estimatedHours: '',
    crewSize: '1',
  };
}

function buildManualBudgetFromForm(form: BudgetItemForm): JobItemManualBudget {
  return {
    materials: form.manualMaterials.flatMap((row) => {
      const quantity = Number(row.quantity);
      if (!row.materialId.trim() || !Number.isFinite(quantity) || quantity <= 0) return [];
      const wastePercent = Number(row.wastePercent);
      return [{
        id: row.id,
        materialId: row.materialId.trim(),
        quantity,
        ...(Number.isFinite(wastePercent) && wastePercent > 0 ? { wastePercent } : {}),
      }];
    }),
    labor: form.manualLabor.flatMap((row) => {
      const estimatedHours = Number(row.estimatedHours);
      if (!row.expertiseName.trim() || !Number.isFinite(estimatedHours) || estimatedHours <= 0) return [];
      const crewSize = Number(row.crewSize);
      return [{
        id: row.id,
        expertiseName: row.expertiseName.trim(),
        estimatedHours,
        ...(Number.isFinite(crewSize) && crewSize > 1 ? { crewSize: Math.ceil(crewSize) } : {}),
      }];
    }),
  };
}

function manualBudgetToFormRows(manual: JobItemManualBudget): Pick<BudgetItemForm, 'manualMaterials' | 'manualLabor'> {
  return {
    manualMaterials: manual.materials.map((line) => ({
      id: line.id,
      materialId: line.materialId,
      quantity: String(line.quantity),
      wastePercent: line.wastePercent !== undefined ? String(line.wastePercent) : '',
    })),
    manualLabor: manual.labor.map((line) => ({
      id: line.id,
      expertiseName: line.expertiseName,
      estimatedHours: String(line.estimatedHours),
      crewSize: line.crewSize !== undefined ? String(line.crewSize) : '1',
    })),
  };
}

function emptyBudgetForm(budgetMode: BudgetMode = 'formula'): BudgetItemForm {
  return {
    name: '',
    description: '',
    budgetMode,
    formulaLibraryId: '',
    values: {},
    areaInstances: {},
    manualMaterials: budgetMode === 'manual' ? [createManualMaterialRow()] : [],
    manualLabor: budgetMode === 'manual' ? [createManualLaborRow()] : [],
    trackingItems: [],
  };
}

function isEmptyBudgetValue(field: BudgetField, value: string | undefined) {
  if (field.inputType === 'boolean') return false;
  if (numericField(field.inputType)) return false;
  if (field.inputType === 'material') return !(value ?? field.defaultMaterialId ?? '').trim();
  return !(value ?? '').trim();
}

interface JobCostEnginePageProps {
  /** Force a specific tab and hide the tab bar + page header chrome. Used when this page is embedded inside another page. */
  embeddedTab?: BudgetPageTab;
  /** Hide the listed tabs from the tab bar (e.g. when delegating those tabs to another page). */
  hiddenTabs?: BudgetPageTab[];
}

export default function JobCostEnginePage({ embeddedTab, hiddenTabs }: JobCostEnginePageProps = {}) {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const jobId = params.id as string;
  const perms = (session?.user?.permissions ?? []) as string[];
  /** Matches APIs that only require JOB_VIEW (e.g. budget lines, quantity log). */
  const canViewJob = (session?.user?.isSuperAdmin ?? false) || perms.includes('job.view');
  /** Full costing UI: formulas, materials, live calculation, snapshots (matches cost-engine API checks). */
  const canViewMaterialBudget =
    (session?.user?.isSuperAdmin ?? false) || (perms.includes('job.view') && perms.includes('material.view'));
  const canEdit = (session?.user?.isSuperAdmin ?? false) || perms.includes('job.edit');

  const { data: job, isLoading: jobLoading } = useGetJobByIdQuery(jobId, { skip: !jobId });
  const { data: jobItemsData, isLoading: itemsLoading } = useGetJobItemsQuery(jobId, { skip: !jobId || !canViewJob });
  const { data: formulas = [] } = useGetFormulaLibrariesQuery(undefined, { skip: !canViewMaterialBudget });
  const { data: materials = [] } = useGetMaterialsQuery(undefined, { skip: !canViewMaterialBudget });
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, { skip: !canViewMaterialBudget });
  const { data: costingSnapshots = [] } = useGetJobCostingSnapshotsQuery(jobId, {
    skip: !jobId || !canViewMaterialBudget,
  });
  const [addJobItem, { isLoading: addingItem }] = useAddJobItemMutation();
  const [updateJobItem, { isLoading: updatingItem }] = useUpdateJobItemMutation();
  const [deleteJobItem, { isLoading: deletingItem }] = useDeleteJobItemMutation();
  const [addProgressEntry, { isLoading: addingProgressEntry }] = useAddJobItemProgressEntryMutation();
  const [deleteProgressEntry, { isLoading: deletingProgressEntry }] = useDeleteJobItemProgressEntryMutation();
  const [calculate, { isLoading: calculating }] = useCalculateJobCostEngineMutation();
  const [createCostingSnapshot, { isLoading: savingSnapshot }] = useCreateJobCostingSnapshotMutation();
  const [approveSnapshot, { isLoading: approvingSnapshot }] = useApproveJobCostingSnapshotMutation();
  const [renameSnapshot, { isLoading: renamingSnapshot }] = useRenameJobCostingSnapshotMutation();
  const [deleteSnapshot, { isLoading: deletingSnapshot }] = useDeleteJobCostingSnapshotMutation();
  const [updateJob, { isLoading: updatingJob }] = useUpdateJobMutation();

  const [pricingMode, setPricingMode] = useState<PricingMode>('FIFO');
  const [postingDate, setPostingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<JobCostEngineResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customUnitCosts, setCustomUnitCosts] = useState<Record<string, string>>({});
  const [debouncedCustomUnitCosts, setDebouncedCustomUnitCosts] = useState<Record<string, number>>({});
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [activeTabDraft, setActiveTab] = useState<BudgetPageTab>('overview');
  const [showBudgetItemModal, setShowBudgetItemModal] = useState(false);
  const [showBudgetFormulaOverrides, setShowBudgetFormulaOverrides] = useState(false);
  const [collapsedAreaInstanceIds, setCollapsedAreaInstanceIds] = useState<Record<string, boolean>>({});
  const [budgetForm, setBudgetForm] = useState<BudgetItemForm>(emptyBudgetForm);
  const [editingBudgetItemId, setEditingBudgetItemId] = useState<string | null>(null);
  const [progressEntryForm, setProgressEntryForm] = useState<ProgressEntryForm>(emptyProgressEntryForm);
  const [calculationRevision, setCalculationRevision] = useState(0);
  const [snapshotDeleteTarget, setSnapshotDeleteTarget] = useState<JobCostingSnapshotMeta | null>(null);
  const [snapshotDeleteStep, setSnapshotDeleteStep] = useState<1 | 2>(1);
  const [snapshotRenameTarget, setSnapshotRenameTarget] = useState<JobCostingSnapshotMeta | null>(null);
  const [snapshotRenameNote, setSnapshotRenameNote] = useState('');
  const itemSaving = addingItem || updatingItem;
  const visibleTabItems = useMemo(
    () => BUDGET_TAB_ITEMS.filter((tab) => !hiddenTabs?.includes(tab.id)),
    [hiddenTabs],
  );
  const activeTab = useMemo(() => {
    if (embeddedTab) return embeddedTab;
    if (hiddenTabs?.includes(activeTabDraft)) return visibleTabItems[0]?.id ?? activeTabDraft;
    return activeTabDraft;
  }, [activeTabDraft, embeddedTab, hiddenTabs, visibleTabItems]);

  const isChildJob = Boolean(job?.parentJobId);
  const selectedItemIds = useMemo(
    () => (jobItemsData?.items ?? []).map((item) => item.id),
    [jobItemsData?.items]
  );
  const isManualBudgetForm = budgetForm.budgetMode === 'manual';
  const selectedFormula = useMemo(
    () =>
      isManualBudgetForm
        ? null
        : (formulas.find((formula) => formula.id === budgetForm.formulaLibraryId) ?? null),
    [budgetForm.formulaLibraryId, formulas, isManualBudgetForm]
  );
  const searchableMaterialItems = useMemo(
    () =>
      materials.map((material) => ({
        id: material.id,
        label: material.name,
        sublabel: material.unit ? `${material.unit}${material.category ? ` · ${material.category}` : ''}` : material.category,
      })),
    [materials]
  );
  const approvedBaseline = useMemo(
    () => costingSnapshots.find((snapshot) => snapshot.status === 'APPROVED') ?? null,
    [costingSnapshots]
  );
  const { data: selectedSnapshotData } = useGetJobCostingSnapshotByIdQuery(
    { jobId, snapshotId: selectedSnapshotId ?? '' },
    { skip: !jobId || !selectedSnapshotId || !canViewMaterialBudget }
  );
  const { data: approvedBaselineData } = useGetJobCostingSnapshotByIdQuery(
    { jobId, snapshotId: approvedBaseline?.id ?? '' },
    {
      skip:
        !jobId ||
        !approvedBaseline?.id ||
        approvedBaseline.id === selectedSnapshotId ||
        !canViewMaterialBudget,
    }
  );
  const selectedSchema = useMemo(
    () => (isManualBudgetForm ? { globalFields: [], formulaValues: [], areas: [] } : parseBudgetSchema(selectedFormula)),
    [isManualBudgetForm, selectedFormula]
  );
  const hasBudgetFormulaOverrides = useMemo(
    () =>
      selectedSchema.formulaValues.length > 0 ||
      selectedSchema.areas.some((area) => area.formulaValues.length > 0),
    [selectedSchema]
  );
  const trackableSourceOptions = useMemo(
    () => buildTrackableSourceOptions(selectedSchema, budgetForm.areaInstances),
    [budgetForm.areaInstances, selectedSchema]
  );
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
    { skip: !jobId || activeTab !== 'entries' || !canViewJob }
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
  const searchableFinishedGoodMaterials = useMemo(
    () =>
      materials.map((material) => ({
        id: material.id,
        label: material.name,
        searchText: [
          material.name,
          material.unit,
          material.stockType,
          material.category,
          material.warehouse,
          material.externalItemName,
        ]
          .filter(Boolean)
          .join(' '),
        unit: material.unit,
        stockType: material.stockType,
        warehouse: material.warehouse,
      })),
    [materials]
  );
  const displayResult = selectedSnapshotData?.result ?? result;
  const livePricingSnapshots = useMemo(() => result?.pricingSnapshots ?? [], [result?.pricingSnapshots]);
  const activePricingMode = selectedSnapshotData?.snapshot.pricingMode ?? pricingMode;
  const activePostingDate = selectedSnapshotData?.snapshot.postingDate ?? postingDate;
  const comparisonBaseline = selectedSnapshotData?.snapshot.status === 'APPROVED'
    ? selectedSnapshotData
    : approvedBaselineData;
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
    const timer = window.setTimeout(() => {
      setCustomUnitCosts(Object.fromEntries(sourceRows.map((row) => [row.materialId, String(row.baseUnitCost)])));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customUnitCosts, livePricingSnapshots, pricingMode]);

  useEffect(() => {
    if (!canViewMaterialBudget || !jobId || selectedItemIds.length === 0) return;

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
  }, [
    calculate,
    calculationRevision,
    canViewMaterialBudget,
    debouncedCustomUnitCosts,
    jobId,
    postingDate,
    pricingMode,
    selectedItemIds,
  ]);

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

  const headerOverviewStats = useMemo(() => {
    const items = jobItemsData?.items ?? [];
    const linesWithTrackables = items.filter((item) => (item.trackingItems?.length ?? 0) > 0).length;
    const totalTrackables = items.reduce((sum, item) => sum + (item.trackingItems?.length ?? 0), 0);
    const stockLinkedTrackables = items.reduce(
      (sum, item) =>
        sum + (item.trackingItems ?? []).filter((tracker) => Boolean(tracker.finishedGoodMaterialId)).length,
      0,
    );
    const savedSnapshots = costingSnapshots.filter((snapshot) => snapshot.status === 'SAVED').length;
    const approvedSnapshot = costingSnapshots.find((snapshot) => snapshot.status === 'APPROVED') ?? null;
    const supersededSnapshots = costingSnapshots.filter((snapshot) => snapshot.status === 'SUPERSEDED').length;

    return {
      itemCount: items.length,
      linesWithTrackables,
      totalTrackables,
      stockLinkedTrackables,
      savedSnapshots,
      approvedSnapshot,
      supersededSnapshots,
    };
  }, [costingSnapshots, jobItemsData?.items]);

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

  const openBudgetItemModal = (budgetMode: BudgetMode = 'formula') => {
    setEditingBudgetItemId(null);
    setBudgetForm(emptyBudgetForm(budgetMode));
    setShowBudgetFormulaOverrides(false);
    setCollapsedAreaInstanceIds({});
    setProgressEntryForm(emptyProgressEntryForm());
    setEntryFormJobItemId('');
    setShowBudgetItemModal(true);
  };

  const openEditBudgetItemModal = (item: JobItem) => {
    const isManual = !item.formulaLibraryId || isManualBudgetSpecifications(item.specifications);
    const formula = isManual
      ? null
      : (formulas.find((row) => row.id === item.formulaLibraryId) ?? item.formulaLibrary ?? null);
    const schema = parseBudgetSchema(formula);
    const manualBudget = isManual ? parseManualBudgetSpecifications(item.specifications) : null;
    setEditingBudgetItemId(item.id);
    setBudgetForm({
      name: item.name,
      description: item.description ?? '',
      budgetMode: isManual ? 'manual' : 'formula',
      formulaLibraryId: item.formulaLibraryId ?? '',
      values: isManual ? {} : buildValuesFromSpecifications(schema, item.specifications),
      areaInstances: isManual ? {} : buildAreaInstancesFromSpecifications(schema, item.specifications),
      manualMaterials: manualBudget && manualBudget.materials.length > 0
        ? manualBudgetToFormRows(manualBudget).manualMaterials
        : [createManualMaterialRow()],
      manualLabor: manualBudget && manualBudget.labor.length > 0
        ? manualBudgetToFormRows(manualBudget).manualLabor
        : [createManualLaborRow()],
      trackingItems:
        item.trackingItems?.map((tracker) => ({
          id: tracker.id,
          sourceKey: tracker.sourceKey ?? '',
          label: tracker.label,
          unit: tracker.unit ?? '',
          targetValue: String(tracker.targetValue),
          finishedGoodMaterialId: tracker.finishedGoodMaterialId ?? '',
          finishedGoodWarehouseId: tracker.finishedGoodWarehouseId ?? '',
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
              finishedGoodMaterialId: '',
              finishedGoodWarehouseId: '',
            }]
          : []),
    });
    setShowBudgetFormulaOverrides(false);
    setCollapsedAreaInstanceIds({});
    setShowBudgetItemModal(true);
    setProgressEntryForm({
      ...emptyProgressEntryForm(),
      trackerId: item.trackingItems?.[0]?.id ?? '',
    });
  };

  const closeBudgetItemModal = () => {
    if (itemSaving) return;
    setShowBudgetItemModal(false);
    setShowBudgetFormulaOverrides(false);
    setCollapsedAreaInstanceIds({});
    setBudgetForm(emptyBudgetForm());
    setEditingBudgetItemId(null);
    setProgressEntryForm(emptyProgressEntryForm());
    setEntryFormJobItemId('');
  };

  const addDynamicAreaInstance = (area: BudgetArea) => {
    setBudgetForm((current) => {
      const currentInstances = current.areaInstances[area.key] ?? [];
      const instance = createBudgetAreaInstance(area, currentInstances.length);
      return {
        ...current,
        areaInstances: {
          ...current.areaInstances,
          [area.key]: [...currentInstances, instance],
        },
      };
    });
  };

  const duplicateDynamicAreaInstance = (area: BudgetArea, sourceInstance: BudgetAreaInstance) => {
    setBudgetForm((current) => {
      const currentInstances = current.areaInstances[area.key] ?? [];
      const instance = {
        id: crypto.randomUUID(),
        label: `${sourceInstance.label || area.label} Copy`,
      };
      const nextValues = { ...current.values };
      for (const field of area.fields) {
        nextValues[areaInstanceValueKey(area.key, instance.id, field.key)] =
          current.values[areaInstanceValueKey(area.key, sourceInstance.id, field.key)] ?? '';
      }
      return {
        ...current,
        values: nextValues,
        areaInstances: {
          ...current.areaInstances,
          [area.key]: [
            ...currentInstances,
            instance,
          ],
        },
      };
    });
  };

  const removeDynamicAreaInstance = (area: BudgetArea, instanceId: string) => {
    setBudgetForm((current) => {
      const nextValues = { ...current.values };
      for (const field of area.fields) {
        delete nextValues[areaInstanceValueKey(area.key, instanceId, field.key)];
      }
      const nextInstances = (current.areaInstances[area.key] ?? []).filter((instance) => instance.id !== instanceId);
      return {
        ...current,
        values: nextValues,
        areaInstances: {
          ...current.areaInstances,
          [area.key]: nextInstances,
        },
      };
    });
    setCollapsedAreaInstanceIds((current) => {
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  };

  const updateDynamicAreaInstanceLabel = (areaKey: string, instanceId: string, label: string) => {
    setBudgetForm((current) => ({
      ...current,
      areaInstances: {
        ...current.areaInstances,
        [areaKey]: (current.areaInstances[areaKey] ?? []).map((instance) =>
          instance.id === instanceId ? { ...instance, label } : instance
        ),
      },
    }));
  };

  const saveBudgetItem = async () => {
    if (!budgetForm.name.trim() && !isManualBudgetForm && !selectedFormula) {
      toast.error('Enter an item name or select a formula');
      return;
    }
    if (isManualBudgetForm) {
      const manualBudget = buildManualBudgetFromForm(budgetForm);
      const validationError = validateManualBudgetForSave(manualBudget);
      if (validationError) {
        toast.error(validationError);
        return;
      }
      const trackingItems = budgetForm.trackingItems.flatMap((tracker) => {
        const targetValue = Number(tracker.targetValue || '0');
        const label = tracker.label.trim();
        const unit = tracker.unit.trim();
        const finishedGoodMaterialId = tracker.finishedGoodMaterialId.trim();
        const defaultWarehouseId = materials.find((material) => material.id === finishedGoodMaterialId)?.warehouseId ?? '';
        const finishedGoodWarehouseId = finishedGoodMaterialId
          ? (tracker.finishedGoodWarehouseId.trim() || defaultWarehouseId || null)
          : null;
        if (!label || !Number.isFinite(targetValue) || targetValue <= 0) return [];
        return [{
          id: tracker.id,
          label,
          unit: unit || null,
          targetValue,
          sourceKey: null,
          finishedGoodMaterialId: finishedGoodMaterialId || null,
          finishedGoodWarehouseId,
        }];
      });
      if (budgetForm.trackingItems.some((tracker) => {
        const targetValue = Number(tracker.targetValue || '0');
        return !tracker.label.trim() || !Number.isFinite(targetValue) || targetValue <= 0;
      })) {
        toast.error('Each trackable item needs a label and target greater than zero');
        return;
      }
      const name = budgetForm.name.trim() || 'Manual budget item';
      try {
        const data = {
          name,
          description: budgetForm.description.trim() || undefined,
          formulaLibraryId: null,
          specifications: buildManualBudgetSpecifications(manualBudget),
          trackingItems,
          trackingEnabled: trackingItems.length > 0,
          trackingLabel: trackingItems[0]?.label ?? null,
          trackingUnit: trackingItems[0]?.unit ?? null,
          trackingTargetValue: trackingItems[0]?.targetValue ?? null,
          trackingSourceKey: null,
        };
        if (editingBudgetItemId) {
          await updateJobItem({ jobId, itemId: editingBudgetItemId, data }).unwrap();
          toast.success('Budget item updated');
        } else {
          await addJobItem({
            jobId,
            data: { ...data, sortOrder: jobItemsData?.items?.length ?? 0 },
          }).unwrap();
          toast.success('Manual budget item added');
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
      return;
    }

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
      if (area.dynamic) {
        const instances = budgetForm.areaInstances[area.key] ?? [];
        if (instances.length === 0) {
          toast.error(`${area.label}: add at least one area instance`);
          return;
        }
        const missingInstance = instances.flatMap((instance) => {
          const missingField = area.fields.find(
            (field) =>
              field.required !== false &&
              isEmptyBudgetValue(field, budgetForm.values[areaInstanceValueKey(area.key, instance.id, field.key)])
          );
          return missingField ? [{ instance, field: missingField }] : [];
        })[0];
        if (missingInstance) {
          toast.error(`${area.label} - ${missingInstance.instance.label}: ${missingInstance.field.label} is required`);
          return;
        }
        continue;
      }
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
      const finishedGoodMaterialId = tracker.finishedGoodMaterialId.trim();
      const defaultWarehouseId = materials.find((material) => material.id === finishedGoodMaterialId)?.warehouseId ?? '';
      const finishedGoodWarehouseId = finishedGoodMaterialId
        ? (tracker.finishedGoodWarehouseId.trim() || defaultWarehouseId || null)
        : null;
      if (!label || !Number.isFinite(targetValue) || targetValue <= 0) return [];
      return [{
        id: tracker.id,
        label,
        unit: unit || null,
        targetValue,
        sourceKey: tracker.sourceKey || null,
        finishedGoodMaterialId: finishedGoodMaterialId || null,
        finishedGoodWarehouseId,
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
        specifications: buildSpecifications(selectedSchema, budgetForm.values, budgetForm.areaInstances),
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
    const derivedProgressStatus = mapJobStatusToProgressStatus(job?.status, !!form.actualStartDate);
    if (!hasAnyTrackedBudgetLine && derivedProgressStatus === 'COMPLETED' && progressPercent < 100) {
      toast.error('Job is marked completed on the profile. Set progress to 100% or move actuals forward before saving.');
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
          executionProgressStatus: derivedProgressStatus,
          executionProgressPercent:
            !hasAnyTrackedBudgetLine && derivedProgressStatus === 'COMPLETED' ? 100 : progressPercent,
          executionPlannedStartDate: job?.startDate ? isoDateInput(job.startDate) : null,
          executionPlannedEndDate: job?.endDate ? isoDateInput(job.endDate) : null,
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

  const openRenameSnapshot = (snapshot: JobCostingSnapshotMeta) => {
    setSnapshotRenameTarget(snapshot);
    setSnapshotRenameNote(snapshot.note?.trim() || `Version ${snapshot.versionNumber}`);
  };

  const closeRenameSnapshot = () => {
    setSnapshotRenameTarget(null);
    setSnapshotRenameNote('');
  };

  const saveSnapshotRename = async () => {
    if (!snapshotRenameTarget) return;
    const note = snapshotRenameNote.trim();
    if (!note) {
      toast.error('Enter a label for this cost version');
      return;
    }
    try {
      await renameSnapshot({ jobId, snapshotId: snapshotRenameTarget.id, note }).unwrap();
      toast.success('Cost version renamed');
      closeRenameSnapshot();
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to rename cost version';
      toast.error(message);
    }
  };

  const openDeleteSnapshot = (snapshot: JobCostingSnapshotMeta) => {
    setSnapshotDeleteTarget(snapshot);
    setSnapshotDeleteStep(1);
  };

  const closeDeleteSnapshot = () => {
    setSnapshotDeleteTarget(null);
    setSnapshotDeleteStep(1);
  };

  const confirmDeleteSnapshotStep = async () => {
    if (!snapshotDeleteTarget) return;
    if (snapshotDeleteStep === 1) {
      setSnapshotDeleteStep(2);
      return;
    }
    try {
      await deleteSnapshot({ jobId, snapshotId: snapshotDeleteTarget.id }).unwrap();
      if (selectedSnapshotId === snapshotDeleteTarget.id) {
        setSelectedSnapshotId(null);
      }
      toast.success(`Deleted cost version ${snapshotDeleteTarget.versionNumber}`);
      closeDeleteSnapshot();
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'data' in error &&
        typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
          ? (error as { data: { error: string } }).data.error
          : 'Failed to delete cost version';
      toast.error(message);
    }
  };

  const snapshotDisplayTitle = (snapshot: JobCostingSnapshotMeta) =>
    snapshot.note?.trim() ? snapshot.note.trim() : `Version ${snapshot.versionNumber}`;

  if (!canViewJob) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">You do not have permission to view this job.</p>
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
    return <div className="py-12 text-center text-muted-foreground">Job not found.</div>;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {!embeddedTab ? (
      <>
        <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-1">
            {isChildJob && job.parentJobId ? (
              <div className="mb-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
                Budget lines and saved cost snapshots belong to the parent contract. Material dispatch on this variation (and siblings) rolls into consumption against that budget.
                <Link
                  href={`/jobs/${job.parentJobId}/cost-engine`}
                  className={cn(
                    buttonVariants({ variant: 'link', size: 'sm' }),
                    'mt-2 block h-auto min-h-0 justify-start p-0 text-xs font-semibold uppercase tracking-wide',
                  )}
                >
                  Open parent contract costing
                </Link>
              </div>
            ) : null}
            <Link
              href={`/jobs/${jobId}`}
              className={cn(
                buttonVariants({ variant: 'link', size: 'sm' }),
                'h-auto p-0 text-xs font-medium uppercase tracking-wide text-muted-foreground',
              )}
            >
              {isChildJob ? 'Variation workspace' : 'Contract job'}
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Costing & material budget</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Build theoretical material budgets from formula-driven job items, price them from material costing methods, compare them against actual FIFO dispatch consumption, and review workforce readiness before site execution.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {canEdit ? (
              <>
                <Button type="button" size="sm" onClick={() => openBudgetItemModal('formula')}>
                  Add Budget Item
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => openBudgetItemModal('manual')}>
                  Add Manual Budget
                </Button>
              </>
            ) : null}
            <Link href="/stock/job-budget/formulas" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Formula Library
            </Link>
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push(`/jobs/${jobId}`)}>
              Back to Job
            </Button>
          </div>
        </header>

        <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {isChildJob ? 'This variation' : 'Contract job'}
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{job.jobNumber}</p>
              <p className="mt-1 text-xs text-muted-foreground">{job.description || 'No description'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Budget & tracking</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{headerOverviewStats.itemCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatQty(overallProgress)}% weighted progress
                {headerOverviewStats.itemCount > 0
                  ? ` · ${headerOverviewStats.linesWithTrackables}/${headerOverviewStats.itemCount} lines with trackables`
                  : ''}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {headerOverviewStats.totalTrackables > 0
                  ? `${headerOverviewStats.totalTrackables} trackable item${headerOverviewStats.totalTrackables === 1 ? '' : 's'} · ${headerOverviewStats.stockLinkedTrackables}/${headerOverviewStats.totalTrackables} stock linked`
                  : 'No trackable items yet'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Cost & snapshots</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
                {formatMoney(displayResult?.summary.totalQuotedMaterialCost ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {pricingModeLabel(activePricingMode)} · {formatDays(displayResult?.summary.totalEstimatedCompletionDays ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {headerOverviewStats.savedSnapshots} saved
                {headerOverviewStats.approvedSnapshot
                  ? ` · approved baseline v${headerOverviewStats.approvedSnapshot.versionNumber}`
                  : ' · no approved baseline'}
                {headerOverviewStats.supersededSnapshots > 0
                  ? ` · ${headerOverviewStats.supersededSnapshots} superseded`
                  : ''}
              </p>
            </CardContent>
          </Card>
        </section>
      </>
      ) : null}

      {!embeddedTab && visibleTabItems.length > 0 ? (
      <section className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap gap-2">
          {visibleTabItems.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                activeTab === tab.id
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <div className={cn('font-semibold', activeTab === tab.id ? 'text-foreground' : 'text-muted-foreground')}>{tab.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{tab.description}</div>
            </button>
          ))}
        </div>
      </section>
      ) : null}

      {calculating ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Spinner size="sm" />
          Recalculating material budget and costing...
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {(activeTab === 'overview' || activeTab === 'snapshots') ? (
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div
          className={cn(
            'grid gap-4',
            activeTab === 'snapshots' ? 'lg:grid-cols-[minmax(0,1fr)_200px]' : 'max-w-sm',
          )}
        >
          {activeTab === 'snapshots' ? (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Posting Date
              </label>
              <input
                type="date"
                value={postingDate}
                onChange={(event) => setPostingDate(event.target.value)}
                className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-border dark:bg-background"
              />
            </div>
          ) : null}
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Pricing Mode
            </label>
            <select
              value={pricingMode}
              onChange={(event) => handlePricingModeChange(event.target.value as PricingMode)}
              className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-border dark:bg-background"
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

        {activeTab === 'snapshots' && !selectedSnapshotData ? (
          <div className="mt-4 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground dark:border-border dark:bg-muted/30">
            Live calculation uses posting date {new Date(activePostingDate).toLocaleDateString()}. Save a cost version to freeze this price basis and compare it later.
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
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">Material drift</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {formatMoney(displayResult.summary.totalQuotedMaterialCost - comparisonBaseline.result.summary.totalQuotedMaterialCost)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">Timeline drift</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {formatDays(displayResult.summary.totalEstimatedCompletionDays - comparisonBaseline.result.summary.totalEstimatedCompletionDays)}
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-800 dark:text-emerald-200">Baseline mode</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {pricingModeLabel(comparisonBaseline.snapshot.pricingMode)}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'overview' && pricingMode === 'CUSTOM' && !selectedSnapshotData ? (
          <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Custom material prices</p>
                <p className="mt-1 text-xs text-muted-foreground">
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
                <label key={snapshot.materialId} className="rounded-2xl border border-border bg-card p-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:border-border">
                  {snapshot.materialName}
                  <div className="mt-1 text-[11px] normal-case tracking-normal text-muted-foreground">
                    {snapshot.baseUnit} · posting-date base {formatMoney(snapshot.baseUnitCost)}
                  </div>
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-border bg-white focus-within:border-emerald-300 dark:border-border dark:bg-background">
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
                      className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="border-l border-border px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-muted-foreground dark:border-border">
                      AED
                    </span>
                  </div>
                </label>
              ))}
              {livePricingSnapshots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm normal-case tracking-normal text-muted-foreground dark:border-border">
                  No material price rows yet. Add budget items first so the costing engine knows which materials to price.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'snapshots' ? (
        <div className="mt-4 rounded-2xl border border-border bg-white p-4 dark:border-border dark:bg-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Saved cost versions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Save a frozen price snapshot so later material price changes do not overwrite what was calculated today.
              </p>
            </div>
            <Button
              size="sm"
              onClick={saveCostVersion}
              disabled={selectedItemIds.length === 0 || savingSnapshot}
            >
              {savingSnapshot ? 'Saving…' : 'Save Cost Version'}
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {costingSnapshots.map((snapshot: JobCostingSnapshotMeta) => (
              <div key={snapshot.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-3 dark:border-border dark:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">
                    {snapshotDisplayTitle(snapshot)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      v{snapshot.versionNumber} · {pricingModeLabel(snapshot.pricingMode)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Posting date {new Date(snapshot.postingDate).toLocaleDateString()} · saved {new Date(snapshot.createdAt).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      snapshot.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                        : snapshot.status === 'SUPERSEDED'
                          ? 'bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground'
                          : 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
                    }`}>
                      {snapshot.status === 'APPROVED' ? 'Execution baseline' : snapshot.status}
                    </span>
                    {snapshot.approvedAt ? (
                      <span className="text-[11px] text-muted-foreground">
                        approved {new Date(snapshot.approvedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <div className="text-right text-xs text-muted-foreground sm:mr-2">
                    <div>{formatMoney(snapshot.totalQuotedMaterialCost)}</div>
                    <div>{formatDays(snapshot.totalEstimatedCompletionDays)}</div>
                  </div>
                  {canEdit ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={approvingSnapshot || snapshot.status === 'APPROVED'}
                        onClick={() => approveAsBaseline(snapshot.id)}
                      >
                        {snapshot.status === 'APPROVED' ? 'Approved' : 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={renamingSnapshot}
                        onClick={() => openRenameSnapshot(snapshot)}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingSnapshot}
                        onClick={() => openDeleteSnapshot(snapshot)}
                      >
                        Delete
                      </Button>
                    </>
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
              <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground dark:border-border">
                No saved cost versions yet.
              </div>
            ) : null}
          </div>
        </div>
        ) : null}
      </section>
      ) : null}

      {activeTab === 'overview' ? (
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 dark:border-border sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">Budget Items</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one item per scope, such as GRP lining, MEP, steel, or finishing.
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openBudgetItemModal('formula')}>Add Budget Item</Button>
              <Button size="sm" variant="secondary" onClick={() => openBudgetItemModal('manual')}>
                Add Manual Budget
              </Button>
            </div>
          ) : null}
        </div>
        <div className="divide-y divide-border dark:divide-border">
          {(jobItemsData?.items ?? []).map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">{item.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.formulaLibrary?.name ?? 'Manual budget'} {item.description ? `- ${item.description}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {(item.trackingItems?.length ?? 0) > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                      {item.trackingItems?.length} trackable item{item.trackingItems?.length === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No trackables</span>
                  )}
                  {(item.trackingItems?.length ?? 0) > 0 ? (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                      {(item.trackingItems ?? []).filter((tracker) => tracker.finishedGoodMaterialId).length} stock linked
                    </span>
                  ) : null}
                </div>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
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
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              No budget items yet. Add one budget item, choose a formula, then enter the measurements.
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {activeTab === 'consumption' ? (
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 dark:border-border">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">Material Budget</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Base-unit normalized estimate vs actual dispatch consumption, ready to compare with issue reconcile activity.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
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
                <tr key={material.materialId} className="border-t border-border dark:border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{material.materialName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{material.baseUnit}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatQty(material.estimatedBaseQuantity)} {material.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatQty(material.expectedIssuedBaseQuantity)} {material.baseUnit}
                    <div className="mt-1 text-xs text-muted-foreground">{formatMoney(material.expectedIssuedCost)}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">{formatMoney(material.quotedCost)}</td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatQty(material.actualIssuedBaseQuantity)} {material.baseUnit}
                    <div className="mt-1 text-xs text-muted-foreground">{formatMoney(material.actualIssuedCost)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={
                      material.issuePaceStatus === 'OVER_ISSUED'
                        ? 'text-amber-600 dark:text-amber-300'
                        : material.issuePaceStatus === 'UNDER_ISSUED'
                          ? 'text-sky-600 dark:text-sky-300'
                          : 'text-foreground'
                    }>
                      {issuePaceLabel(material.issuePaceStatus)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatQty(material.issuePaceVariance)} {material.baseUnit}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatQty(material.remainingRequiredQuantity)} {material.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
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
                    <div className="mt-1 text-xs text-muted-foreground">
                      {material.stockGapQuantity > 0
                        ? `${formatQty(material.stockGapQuantity)} ${material.baseUnit} gap`
                        : '0 gap'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={material.quantityVariance >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}>
                      {formatQty(material.quantityVariance)} {material.baseUnit}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatMoney(material.costVariance)}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{material.pricingSource.replaceAll('_', ' ')}</td>
                </tr>
              ))}
              {aggregatedMaterials.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-sm text-muted-foreground">
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
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4 dark:border-border">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">Procurement Need</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Materials still required to complete the current budget, after considering what is already on hand.
          </p>
        </div>

        <div className="grid gap-px bg-border dark:bg-border md:grid-cols-3">
          <div className="bg-card px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Short materials</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{procurementSummary.shortageCount}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">To procure qty</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatQty(procurementSummary.totalToProcureQuantity)}</p>
          </div>
          <div className="bg-card px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Procurement exposure</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatMoney(procurementSummary.totalToProcureCost)}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
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
                <tr key={row.materialId} className="border-t border-border dark:border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{row.materialName}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{row.baseUnit}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatQty(row.remainingRequiredQuantity)} {row.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatQty(row.currentStock)} {row.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-300">
                    {formatQty(row.toProcureQuantity)} {row.baseUnit}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatMoney(row.estimatedProcurementCost)}
                  </td>
                </tr>
              ))}
              {procurementRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
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
      <section className="rounded-2xl border border-border/90 bg-card shadow-sm dark:border-border">
        <div className="border-b border-border px-4 py-4 dark:border-border sm:px-6">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Progress</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Roll-up across every budget line from the current costing result. Weighted % follows internal material budget by line.
            Internal budget is from the cost engine; LPO / contract value comes from the job record. Pace uses HR attendance once for the whole job. Status, dates, and notes below apply to the entire job. Dated quantities are on the{' '}
            <span className="font-medium text-foreground">Quantity log</span> tab.
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
            <p className="text-sm text-muted-foreground">
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
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Budget lines</p>
                <div className="mt-2 flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1">
                  {(displayResult?.items ?? []).map((row) => (
                    <div
                      key={row.itemId}
                      className="inline-flex min-w-42 shrink-0 flex-col gap-0.5 rounded-xl border border-border bg-muted/40 px-3 py-2 dark:border-border dark:bg-muted/30"
                    >
                      <span className="text-sm font-semibold text-foreground">{row.itemName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatQty(row.progress?.percentComplete ?? 0)}% · {progressStatusLabel(row.progress?.status)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Combined summary</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Weighted progress</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatQty(combinedProgressStats.weightedPercent)}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Budget lines</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatQty(combinedProgressStats.lineCount)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Internal material budget</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatMoney(combinedProgressStats.internalMaterialBudget)}
                    </p>
                    {combinedProgressStats.lpoRemainingAfterConsumption !== null ? (
                      <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        <p>
                          <span className="text-muted-foreground">LPO − consumption: </span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {formatMoney(combinedProgressStats.lpoRemainingAfterConsumption)}
                          </span>
                        </p>
                        {combinedProgressStats.internalBudgetVsLpoRemaining !== null ? (
                          <p>
                            <span className="text-muted-foreground">Internal − (LPO − consumption): </span>
                            <span
                              className={`font-semibold tabular-nums ${
                                combinedProgressStats.internalBudgetVsLpoRemaining > 0
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : combinedProgressStats.internalBudgetVsLpoRemaining < 0
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-foreground'
                              }`}
                            >
                              {formatMoney(combinedProgressStats.internalBudgetVsLpoRemaining)}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">Set LPO value on the job to compare with contract headroom after consumption.</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">LPO / contract value</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {combinedProgressStats.lpoValue !== null ? formatMoney(combinedProgressStats.lpoValue) : '—'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">From job LPO</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Actual consumption</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatMoney(combinedProgressStats.totalActualMaterialCost)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      All job issues and returns (budgeted materials plus extras from dispatch / delivery notes, each material once)
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Remaining internal budget</p>
                    <p
                      className={`mt-1.5 text-2xl font-semibold tabular-nums ${
                        combinedProgressStats.remainingInternalBudget < 0
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-foreground'
                      }`}
                    >
                      {formatMoney(combinedProgressStats.remainingInternalBudget)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Internal plan total minus actual consumption (quoted plan vs issued cost)
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Attendance work days (job)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatQty(combinedProgressStats.sumWorkedDays)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {combinedProgressStats.hasJobWideAttendance
                        ? `${combinedProgressStats.linesWithTracking} line(s) with tracking`
                        : 'Recalculate cost to refresh job-wide attendance'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Worked hours (job)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatQty(combinedProgressStats.sumHours)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Workers (distinct)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatQty(combinedProgressStats.maxWorkers)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Avg {formatQty(combinedProgressStats.avgWorkersPerDay)} per attendance day
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tracked quantity (sum)</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
                      {formatQty(combinedProgressStats.sumTrackedComplete)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40/90 px-4 py-3 dark:border-border dark:bg-muted/30">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lines awaiting pace</p>
                    <p className="mt-1.5 text-2xl font-semibold tabular-nums text-foreground">
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
        <section className="rounded-2xl border border-border/90 bg-card shadow-sm dark:border-border">
          <div className="border-b border-border px-4 py-4 dark:border-border sm:px-6">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Quantity log</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              One job-wide view: every trackable target and every dated quantity entry, across all budget lines.
            </p>
          </div>
          <div className="space-y-8 p-4 sm:p-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Trackable targets</h3>
              <p className="mt-1 text-xs text-muted-foreground">Progress % and completed qty come from the latest costing result when available.</p>
              <div className="mt-3 overflow-x-auto rounded-xl border border-border dark:border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
                        <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          No trackable items on this job yet. Enable tracking on a budget line in Edit.
                        </td>
                      </tr>
                    ) : (
                      flatTrackableRows.map((row) => (
                        <tr key={`${row.jobItemId}-${row.trackerId}`} className="border-t border-border dark:border-border">
                          <td className="px-3 py-2.5 font-medium text-foreground">{row.jobItemName}</td>
                          <td className="px-3 py-2.5 text-foreground">{row.label}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.targetValue)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.completedValue)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(Math.max(row.targetValue - row.completedValue, 0))}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.percentComplete)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.unit ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(row.entryCount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {canEdit ? (
              <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
                <h3 className="text-sm font-semibold text-foreground">Add quantity entry</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_minmax(0,1fr)_120px]">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                      className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
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
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Trackable
                    <select
                      value={progressEntryForm.trackerId}
                      onChange={(event) => setProgressEntryForm((current) => ({ ...current, trackerId: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                    >
                      <option value="">Select trackable</option>
                      {entryFormTrackers.map((tracker) => (
                        <option key={tracker.id} value={tracker.id}>
                          {tracker.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Entry date
                    <input
                      type="date"
                      value={progressEntryForm.entryDate}
                      onChange={(event) => setProgressEntryForm((current) => ({ ...current, entryDate: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Note
                    <input
                      value={progressEntryForm.note}
                      onChange={(event) => setProgressEntryForm((current) => ({ ...current, note: event.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Quantity
                    <div className="mt-1.5 flex overflow-hidden rounded-xl border border-border bg-white focus-within:border-emerald-300 dark:border-border dark:bg-background">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={progressEntryForm.quantity}
                        onChange={(event) => setProgressEntryForm((current) => ({ ...current, quantity: event.target.value }))}
                        onWheel={(event) => event.currentTarget.blur()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
                        }}
                        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      {entryFormTrackers.find((t) => t.id === progressEntryForm.trackerId)?.unit ? (
                        <span className="border-l border-border px-3 py-2.5 text-sm font-medium text-muted-foreground dark:border-border">
                          {entryFormTrackers.find((t) => t.id === progressEntryForm.trackerId)?.unit}
                        </span>
                      ) : null}
                    </div>
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button type="button" size="sm" onClick={saveProgressEntry} disabled={addingProgressEntry}>
                    {addingProgressEntry ? 'Adding…' : 'Add entry'}
                  </Button>
                </div>
              </div>
            ) : null}

            <div>
              <h3 className="text-sm font-semibold text-foreground">All dated entries</h3>
              <div className="mt-3 overflow-x-auto rounded-xl border border-border dark:border-border">
                {jobProgressEntriesLoading ? (
                  <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
                    <Spinner size="sm" /> Loading entries…
                  </div>
                ) : (
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
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
                        <tr key={entry.id} className="border-t border-border dark:border-border">
                          <td className="px-3 py-2.5 text-foreground">{new Date(entry.entryDate).toLocaleDateString()}</td>
                          <td className="px-3 py-2.5 font-medium text-foreground">{entry.jobItemName}</td>
                          <td className="px-3 py-2.5 text-foreground">{entry.trackerLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{formatQty(entry.quantity)}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{entry.trackerUnit ?? '—'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{entry.note || '—'}</td>
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
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No quantity entries yet.</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <Modal
        isOpen={Boolean(snapshotRenameTarget)}
        onClose={closeRenameSnapshot}
        title="Rename cost version"
        size="sm"
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
            Label
            <input
              type="text"
              value={snapshotRenameNote}
              onChange={(event) => setSnapshotRenameNote(event.target.value)}
              maxLength={500}
              className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-border dark:bg-background"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeRenameSnapshot}>
              Cancel
            </Button>
            <Button type="button" onClick={saveSnapshotRename} disabled={renamingSnapshot}>
              {renamingSnapshot ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(snapshotDeleteTarget)}
        onClose={closeDeleteSnapshot}
        title={snapshotDeleteStep === 1 ? 'Delete cost version?' : 'Confirm deletion'}
        size="sm"
      >
        {snapshotDeleteTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {snapshotDeleteStep === 1 ? (
                <>
                  Delete <span className="font-semibold text-foreground">{snapshotDisplayTitle(snapshotDeleteTarget)}</span>{' '}
                  (v{snapshotDeleteTarget.versionNumber})? This removes the frozen costing snapshot.
                </>
              ) : (
                <>
                  This cannot be undone. Permanently delete version {snapshotDeleteTarget.versionNumber}
                  {snapshotDeleteTarget.status === 'APPROVED' ? ' (current execution baseline)' : ''}?
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeDeleteSnapshot}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDeleteSnapshotStep}
                disabled={deletingSnapshot}
              >
                {deletingSnapshot
                  ? 'Deleting…'
                  : snapshotDeleteStep === 1
                    ? 'Continue'
                    : 'Delete permanently'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={showBudgetItemModal}
        onClose={closeBudgetItemModal}
        title={
          editingBudgetItemId
            ? 'Edit Budget Item'
            : isManualBudgetForm
              ? 'Add Manual Budget Item'
              : 'Add Budget Item'
        }
        size="2xl"
      >
        <div className="max-h-[min(82dvh,100%)] space-y-4 overflow-y-auto pr-1">
          {!editingBudgetItemId ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={isManualBudgetForm ? 'secondary' : 'default'}
                onClick={() => setBudgetForm(emptyBudgetForm('formula'))}
              >
                Formula-based
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isManualBudgetForm ? 'default' : 'secondary'}
                onClick={() => setBudgetForm(emptyBudgetForm('manual'))}
              >
                Manual budget
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {!isManualBudgetForm ? (
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Formula
                <div className="mt-1.5">
                  <SearchSelect
                    items={searchableFormulaItems}
                    value={budgetForm.formulaLibraryId}
                    onChange={(id) => {
                      const formula = formulas.find((row) => row.id === id);
                      const schema = parseBudgetSchema(formula);
                      setBudgetForm((current) => ({
                        ...current,
                        budgetMode: 'formula',
                        name: formula?.name ?? '',
                        description: '',
                        formulaLibraryId: id,
                        values: buildInitialBudgetValues(schema),
                        areaInstances: buildInitialAreaInstances(schema),
                        trackingItems: [],
                        manualMaterials: [],
                        manualLabor: [],
                      }));
                      setShowBudgetFormulaOverrides(false);
                      setCollapsedAreaInstanceIds({});
                    }}
                    placeholder="Select formula"
                    openOnFocus
                    dropdownInPortal
                    clearOnEmptyInput
                  />
                </div>
              </label>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 text-xs text-emerald-950 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                <p className="font-semibold">Manual material and labor budget</p>
                <p className="mt-1 text-emerald-900/80 dark:text-emerald-100/80">
                  Enter planned material quantities and labor hours directly. No formula is required for one-off projects.
                </p>
              </div>
            )}
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Item Name
              <input
                value={budgetForm.name}
                onChange={(event) => setBudgetForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
              />
            </label>
          </div>

          <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Description
            <input
              value={budgetForm.description}
              onChange={(event) => setBudgetForm((current) => ({ ...current, description: event.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
            />
          </label>

          {isManualBudgetForm ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Material budget</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Planned quantities in each material&apos;s base unit. Waste % is optional.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setBudgetForm((current) => ({
                        ...current,
                        manualMaterials: [...current.manualMaterials, createManualMaterialRow()],
                      }))
                    }
                  >
                    Add material
                  </Button>
                </div>
                <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-white dark:border-border dark:bg-card">
                  <table className="w-full min-w-160 text-left text-sm">
                    <thead className="bg-muted/50 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">#</th>
                        <th className="min-w-[18rem] px-3 py-2.5 font-semibold">Material</th>
                        <th className="w-36 px-3 py-2.5 font-semibold text-right">Quantity</th>
                        <th className="w-28 px-3 py-2.5 font-semibold text-right">Waste %</th>
                        <th className="w-28 px-3 py-2.5 font-semibold text-right">Unit</th>
                        <th className="w-24 px-3 py-2.5 text-right font-semibold" />
                      </tr>
                    </thead>
                    <tbody>
                      {budgetForm.manualMaterials.map((row, index) => {
                        const materialMeta = materials.find((material) => material.id === row.materialId);
                        return (
                          <tr key={row.id} className="border-t border-border dark:border-border">
                            <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                            <td className="px-3 py-2">
                              <SearchSelect
                                items={searchableMaterialItems}
                                value={row.materialId}
                                onChange={(materialId) =>
                                  setBudgetForm((current) => ({
                                    ...current,
                                    manualMaterials: current.manualMaterials.map((entry) =>
                                      entry.id === row.id ? { ...entry, materialId } : entry
                                    ),
                                  }))
                                }
                                placeholder="Search material"
                                openOnFocus
                                dropdownInPortal
                                clearOnEmptyInput
                                inputProps={{
                                  className:
                                    'rounded-lg border-border bg-background px-2.5 py-2 text-sm dark:border-border dark:bg-background',
                                }}
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                value={row.quantity}
                                onChange={(event) =>
                                  setBudgetForm((current) => ({
                                    ...current,
                                    manualMaterials: current.manualMaterials.map((entry) =>
                                      entry.id === row.id ? { ...entry, quantity: event.target.value } : entry
                                    ),
                                  }))
                                }
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-right text-sm text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                inputMode="decimal"
                                value={row.wastePercent}
                                onChange={(event) =>
                                  setBudgetForm((current) => ({
                                    ...current,
                                    manualMaterials: current.manualMaterials.map((entry) =>
                                      entry.id === row.id ? { ...entry, wastePercent: event.target.value } : entry
                                    ),
                                  }))
                                }
                                placeholder="0"
                                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-right text-sm text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {materialMeta?.unit ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setBudgetForm((current) => ({
                                    ...current,
                                    manualMaterials: current.manualMaterials.filter((entry) => entry.id !== row.id),
                                  }))
                                }
                              >
                                Remove
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {budgetForm.manualMaterials.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                            No material lines yet. Click Add material to start.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Labor budget</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enter estimated labor hours by trade or expertise. Crew size defaults to one worker.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setBudgetForm((current) => ({
                        ...current,
                        manualLabor: [...current.manualLabor, createManualLaborRow()],
                      }))
                    }
                  >
                    Add labor
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {budgetForm.manualLabor.map((row, index) => (
                    <div key={row.id} className="rounded-2xl border border-border bg-white p-3 dark:border-border dark:bg-card">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">Labor {index + 1}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setBudgetForm((current) => ({
                              ...current,
                              manualLabor: current.manualLabor.filter((entry) => entry.id !== row.id),
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Expertise / trade
                          <input
                            value={row.expertiseName}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                manualLabor: current.manualLabor.map((entry) =>
                                  entry.id === row.id ? { ...entry, expertiseName: event.target.value } : entry
                                ),
                              }))
                            }
                            placeholder="e.g. GRP Laminator"
                            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                          />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Estimated hours
                          <input
                            type="number"
                            inputMode="decimal"
                            value={row.estimatedHours}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                manualLabor: current.manualLabor.map((entry) =>
                                  entry.id === row.id ? { ...entry, estimatedHours: event.target.value } : entry
                                ),
                              }))
                            }
                            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                          />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Crew size
                          <input
                            type="number"
                            inputMode="numeric"
                            value={row.crewSize}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                manualLabor: current.manualLabor.map((entry) =>
                                  entry.id === row.id ? { ...entry, crewSize: event.target.value } : entry
                                ),
                              }))
                            }
                            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  {budgetForm.manualLabor.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No labor lines yet.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Track work progress</h3>
                <p className="mt-1 text-xs text-muted-foreground">
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
                  const finishedGoodMaterial = materials.find((material) => material.id === tracker.finishedGoodMaterialId);
                  const effectiveFinishedGoodWarehouseId =
                    tracker.finishedGoodWarehouseId || finishedGoodMaterial?.warehouseId || '';
                  return (
                    <div key={tracker.id} className="rounded-2xl border border-border bg-white p-3 dark:border-border dark:bg-card">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">Trackable item {index + 1}</p>
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
                        {!isManualBudgetForm ? (
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                              className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                            >
                              <option value="">Custom trackable target</option>
                              {trackableSourceOptions.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 disabled:bg-muted disabled:text-muted-foreground dark:border-border dark:bg-background dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                          />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 disabled:bg-muted disabled:text-muted-foreground dark:border-border dark:bg-background dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                          />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Tracking target
                          <div className="mt-1.5 flex overflow-hidden rounded-xl border border-border bg-white focus-within:border-emerald-300 dark:border-border dark:bg-background">
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
                              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-foreground outline-none [appearance:textfield] disabled:bg-muted disabled:text-muted-foreground [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                            />
                            {(resolvedUnit ?? '') ? (
                              <span className="border-l border-border px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-muted-foreground dark:border-border">
                                {resolvedUnit}
                              </span>
                            ) : null}
                          </div>
                        </label>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Finished goods material
                          </p>
                          <div className="mt-1.5">
                            <SearchSelect
                              items={searchableFinishedGoodMaterials}
                              value={tracker.finishedGoodMaterialId}
                              onChange={(materialId) => {
                                const material = materials.find((entry) => entry.id === materialId);
                                setBudgetForm((current) => ({
                                  ...current,
                                  trackingItems: current.trackingItems.map((entry) =>
                                    entry.id === tracker.id
                                      ? {
                                          ...entry,
                                          finishedGoodMaterialId: materialId,
                                          finishedGoodWarehouseId: material?.warehouseId ?? '',
                                        }
                                      : entry
                                  ),
                                }));
                              }}
                              placeholder="Search finished goods material"
                              openOnFocus
                              clearOnEmptyInput
                              dropdownInPortal
                              inputProps={{
                                className:
                                  'rounded-xl border-border bg-white px-3 py-2.5 font-normal text-foreground focus:ring-0 focus:border-emerald-300 dark:border-border dark:bg-background',
                              }}
                              renderItem={(item) => (
                                <div>
                                  <div className="font-medium">{item.label}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {[item.unit, item.stockType, item.warehouse ? `WH: ${item.warehouse}` : null]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </div>
                                </div>
                              )}
                            />
                          </div>
                          {finishedGoodMaterial ? (
                            <p className="mt-1 text-[11px] normal-case tracking-normal text-muted-foreground">
                              Default warehouse: {finishedGoodMaterial.warehouse || 'none'}
                            </p>
                          ) : null}
                          {!tracker.finishedGoodMaterialId ? (
                            <p className="mt-1 text-[11px] normal-case tracking-normal text-muted-foreground">
                              Progress only - no stock update.
                            </p>
                          ) : null}
                        </div>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Finished goods warehouse
                          <select
                            value={effectiveFinishedGoodWarehouseId}
                            onChange={(event) =>
                              setBudgetForm((current) => ({
                                ...current,
                                trackingItems: current.trackingItems.map((entry) =>
                                  entry.id === tracker.id ? { ...entry, finishedGoodWarehouseId: event.target.value } : entry
                                ),
                              }))
                            }
                            disabled={!tracker.finishedGoodMaterialId}
                            className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 disabled:bg-muted disabled:text-muted-foreground dark:border-border dark:bg-background dark:disabled:bg-muted dark:disabled:text-muted-foreground"
                          >
                            <option value="">Use material default warehouse</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground dark:border-border">
                No trackable items yet.
              </div>
            )}
          </div>

          {!isManualBudgetForm && selectedFormula ? (
            <div className="space-y-4">
              {selectedSchema.globalFields.length > 0 ? (
                <div className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
                  <h3 className="text-sm font-semibold text-foreground">Global Measurements</h3>
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

              {hasBudgetFormulaOverrides ? (
                <div className="rounded-2xl border border-cyan-200 bg-background p-4 dark:border-cyan-500/20 dark:bg-background/60">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Stored formula value overrides</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Keep hidden unless this budget item needs values different from the formula defaults.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowBudgetFormulaOverrides((current) => !current)}
                    >
                      {showBudgetFormulaOverrides ? 'Hide override input boxes' : 'View override input boxes'}
                    </Button>
                  </div>
                </div>
              ) : null}

              {showBudgetFormulaOverrides && selectedSchema.formulaValues.length > 0 ? (
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/10">
                  <h3 className="text-sm font-semibold text-foreground">Stored formula value overrides</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank to use the formula default. Override values can be fixed numbers or expressions.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {selectedSchema.formulaValues.map((field) => (
                      <FormulaOverrideInput
                        key={field.key}
                        field={field}
                        token={`formula.${field.key}`}
                        value={budgetForm.values[`formulaOverride.global.${field.key}`] ?? ''}
                        onChange={(value) =>
                          setBudgetForm((current) => ({
                            ...current,
                            values: { ...current.values, [`formulaOverride.global.${field.key}`]: value },
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedSchema.areas.map((area) => (
                <div key={area.key} className="rounded-2xl border border-border bg-muted/40 p-4 dark:border-border dark:bg-muted/30">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{area.label}</h3>
                      {area.dynamic ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Repeat this area for each separate measurement set. Formulas run once per instance and totals are combined.
                        </p>
                      ) : null}
                    </div>
                    {area.dynamic ? (
                      <Button type="button" size="sm" variant="secondary" onClick={() => addDynamicAreaInstance(area)}>
                        Add {area.label || 'area'}
                      </Button>
                    ) : null}
                  </div>
                  {area.dynamic ? (
                    <div className="mt-3 space-y-3">
                      {(budgetForm.areaInstances[area.key] ?? []).map((instance, instanceIndex) => {
                        const collapsed = Boolean(collapsedAreaInstanceIds[instance.id]);
                        return (
                          <div
                            key={instance.id}
                            className="rounded-2xl border border-border bg-background p-3 dark:border-border dark:bg-background/60"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <label className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Instance label
                                <input
                                  value={instance.label}
                                  onChange={(event) => updateDynamicAreaInstanceLabel(area.key, instance.id, event.target.value)}
                                  placeholder={`${area.label || 'Area'} ${instanceIndex + 1}`}
                                  className="mt-1.5 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-normal text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background"
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    setCollapsedAreaInstanceIds((current) => ({
                                      ...current,
                                      [instance.id]: !current[instance.id],
                                    }))
                                  }
                                >
                                  {collapsed ? 'Expand' : 'Collapse'}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => duplicateDynamicAreaInstance(area, instance)}
                                >
                                  Duplicate
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeDynamicAreaInstance(area, instance.id)}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                            {!collapsed ? (
                              area.fields.length > 0 ? (
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  {area.fields.map((field) => (
                                    <BudgetInput
                                      key={`${area.key}.${instance.id}.${field.key}`}
                                      field={field}
                                      materials={materials}
                                      value={budgetForm.values[areaInstanceValueKey(area.key, instance.id, field.key)] ?? ''}
                                      onChange={(value) =>
                                        setBudgetForm((current) => ({
                                          ...current,
                                          values: {
                                            ...current.values,
                                            [areaInstanceValueKey(area.key, instance.id, field.key)]: value,
                                          },
                                        }))
                                      }
                                    />
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                  This formula area has no input fields yet.
                                </p>
                              )
                            ) : null}
                          </div>
                        );
                      })}
                      {(budgetForm.areaInstances[area.key] ?? []).length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border bg-background/60 px-4 py-6 text-center text-sm text-muted-foreground dark:border-border">
                          No {area.label || 'area'} instances yet. Add one to enter measurements.
                        </div>
                      ) : null}
                    </div>
                  ) : area.fields.length > 0 ? (
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
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      This formula area has no input fields yet.
                    </p>
                  )}
                  {showBudgetFormulaOverrides && area.formulaValues.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-cyan-200 bg-background/70 p-3 dark:border-cyan-500/20 dark:bg-background/40">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                        Area stored value overrides
                      </h4>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {area.formulaValues.map((field) => (
                          <FormulaOverrideInput
                            key={`${area.key}.${field.key}`}
                            field={field}
                            token={`area.formula.${field.key}`}
                            value={budgetForm.values[`formulaOverride.area.${area.key}.${field.key}`] ?? ''}
                            onChange={(value) =>
                              setBudgetForm((current) => ({
                                ...current,
                                values: {
                                  ...current.values,
                                  [`formulaOverride.area.${area.key}.${field.key}`]: value,
                                },
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : !isManualBudgetForm ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground dark:border-border">
              Select a formula to load the measurement fields, or switch to manual budget for one-off projects.
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="w-full" onClick={closeBudgetItemModal} disabled={itemSaving}>
              Cancel
            </Button>
            <Button type="button" className="w-full" onClick={saveBudgetItem} disabled={itemSaving}>
              {itemSaving ? 'Saving…' : editingBudgetItemId ? 'Update Budget Item' : 'Save Budget Item'}
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
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {field.label}
        <div className="mt-1.5 flex items-center justify-between rounded-xl border border-border bg-white px-3 py-3 dark:border-border dark:bg-background">
          <div>
            <p className="text-sm font-medium normal-case tracking-normal text-foreground">
              {enabled ? 'Yes' : 'No'}
            </p>
            <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
              Boolean input
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(enabled ? 'false' : 'true')}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
              enabled ? 'bg-emerald-500' : 'bg-muted-foreground/25 dark:bg-muted-foreground/40'
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
      <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {field.label}
      <div className="mt-1.5 flex overflow-hidden rounded-xl border border-border bg-white focus-within:border-emerald-300 dark:border-border dark:bg-background">
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
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {field.unit ? (
          <span className="border-l border-border px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-muted-foreground dark:border-border">
            {field.unit}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function FormulaOverrideInput({
  field,
  token,
  value,
  onChange,
}: {
  field: BudgetFormulaValue;
  token: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {field.label || field.key}
      <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-white focus-within:border-cyan-300 dark:border-border dark:bg-background">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Default: ${field.value || '0'}`}
          className="w-full bg-transparent px-3 py-2.5 font-mono text-sm font-normal normal-case tracking-normal text-foreground outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2 text-[11px] font-normal normal-case tracking-normal text-muted-foreground dark:border-border">
          <span className="font-mono text-cyan-700 dark:text-cyan-300">{token}</span>
          <span>
            Default {field.value || '0'}{field.unit ? ` ${field.unit}` : ''}
          </span>
        </div>
      </div>
    </label>
  );
}
