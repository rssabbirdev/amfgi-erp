'use client';

import { ChevronDown, ChevronUp, Copy, Pencil, Trash2 } from 'lucide-react';
import SearchSelect from '@/components/ui/SearchSelect';
import { isStoredGlobalField } from '@/components/job-costing/formula-builder/shared';
import { cn } from '@/lib/utils';
import type { Material } from '@/store/api/endpoints/materials';

export type JobLevelInputField = {
  id: string;
  label: string;
  key: string;
  inputType: string;
  unit?: string;
  defaultMaterialId?: string;
  defaultMaterialName?: string;
  defaultValue?: string;
  storedValue?: string;
};

type BuilderActions = {
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
};

function numericField(inputType?: string) {
  return ['number', 'percent', 'length', 'area', 'volume', 'count'].includes(inputType ?? 'number');
}

function inputTypeLabel(inputType: string) {
  if (inputType === 'material') return 'material';
  if (inputType === 'stored') return 'stored value';
  return inputType;
}

function keyTokenForField(field: JobLevelInputField, formatKeyToken?: (key: string) => string) {
  if (isStoredGlobalField(field)) {
    return field.key ? `formula.${field.key}` : 'formula.key';
  }
  return formatKeyToken?.(field.key) ?? (field.key ? `specs.global.${field.key}` : 'specs.global.key');
}

function toneClasses(tone: 'default' | 'playground' | 'teal') {
  if (tone === 'playground') {
    return {
      shell: 'overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950',
      head: 'bg-slate-100 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900 dark:text-slate-400',
      input:
        'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white',
      mono: 'font-mono text-sky-700 dark:text-sky-300',
      storedMono: 'font-mono text-cyan-700 dark:text-cyan-300',
    };
  }
  if (tone === 'teal') {
    return {
      shell: 'overflow-x-auto rounded-xl border border-teal-100 bg-white dark:border-teal-500/20 dark:bg-slate-950/70',
      head: 'bg-teal-50 text-[11px] uppercase tracking-[0.16em] text-teal-800 dark:bg-teal-500/10 dark:text-teal-200',
      input:
        'w-full rounded-lg border border-teal-100 bg-teal-50/40 px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-teal-300 dark:border-teal-500/20 dark:bg-slate-900 dark:text-white',
      mono: 'font-mono text-sky-700 dark:text-sky-300',
      storedMono: 'font-mono text-cyan-700 dark:text-cyan-300',
    };
  }
  return {
    shell: 'overflow-x-auto rounded-xl border border-border bg-white dark:border-border dark:bg-card',
    head: 'bg-muted/50 text-[11px] uppercase tracking-[0.16em] text-muted-foreground',
    input:
      'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background',
    mono: 'font-mono text-sky-700 dark:text-sky-300',
    storedMono: 'font-mono text-cyan-700 dark:text-cyan-300',
  };
}

function JobLevelValueInput({
  field,
  value,
  onChange,
  materials,
  tone,
  materialSearchText,
}: {
  field: JobLevelInputField;
  value: string;
  onChange: (value: string) => void;
  materials: Material[];
  tone: 'default' | 'playground' | 'teal';
  materialSearchText?: (material: Material) => string;
}) {
  const classes = toneClasses(tone);

  if (field.inputType === 'boolean') {
    const enabled = value === 'true';
    return (
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
          className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500/20"
          aria-label={field.label}
        />
      </div>
    );
  }

  if (field.inputType === 'material') {
    return (
      <SearchSelect
        items={materials.map((material) => ({
          id: material.id,
          label: material.name,
          searchText: materialSearchText?.(material) ?? `${material.name} ${material.unit}`,
        }))}
        value={value || field.defaultMaterialId || ''}
        onChange={onChange}
        placeholder="Select material"
        openOnFocus
        dropdownInPortal
        clearOnEmptyInput
        inputProps={{ className: classes.input }}
      />
    );
  }

  return (
    <input
      type={numericField(field.inputType) ? 'number' : 'text'}
      inputMode={numericField(field.inputType) ? 'decimal' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={classes.input}
    />
  );
}

export function JobLevelInputsTable({
  fields,
  mode,
  tone = 'default',
  getValue,
  onValueChange,
  showOverrideColumn = false,
  getOverrideValue,
  onOverrideChange,
  materials = [],
  materialSearchText,
  builderActions,
  formatKeyToken,
}: {
  fields: JobLevelInputField[];
  mode: 'builder' | 'entry';
  tone?: 'default' | 'playground' | 'teal';
  getValue?: (key: string) => string;
  onValueChange?: (key: string, value: string) => void;
  showOverrideColumn?: boolean;
  getOverrideValue?: (key: string) => string;
  onOverrideChange?: (key: string, value: string) => void;
  materials?: Material[];
  materialSearchText?: (material: Material) => string;
  builderActions?: BuilderActions;
  formatKeyToken?: (key: string) => string;
}) {
  const classes = toneClasses(tone);
  const hasStoredFields = fields.some((field) => isStoredGlobalField(field));
  const showOverride = mode === 'entry' && showOverrideColumn && hasStoredFields;

  if (fields.length === 0) return null;

  return (
    <div className={classes.shell}>
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className={classes.head}>
          <tr>
            <th className="w-10 px-3 py-2.5 font-semibold">#</th>
            <th className="min-w-[10rem] px-3 py-2.5 font-semibold">Label</th>
            <th className="min-w-[9rem] px-3 py-2.5 font-semibold">Key</th>
            <th className="w-28 px-3 py-2.5 font-semibold">Type</th>
            <th className="w-24 px-3 py-2.5 font-semibold">Unit</th>
            {mode === 'builder' ? (
              <th className="min-w-[10rem] px-3 py-2.5 font-semibold">Default / formula</th>
            ) : (
              <th className="min-w-[12rem] px-3 py-2.5 font-semibold">Value</th>
            )}
            {showOverride ? (
              <th className="min-w-[12rem] px-3 py-2.5 font-semibold">Override</th>
            ) : null}
            {mode === 'builder' ? <th className="w-36 px-3 py-2.5 text-right font-semibold" /> : null}
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const stored = isStoredGlobalField(field);
            return (
              <tr key={field.id} className="border-t border-border dark:border-border">
                <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-2 font-medium text-foreground">{field.label || 'Untitled input'}</td>
                <td className={cn('px-3 py-2 text-xs', stored ? classes.storedMono : classes.mono)}>
                  {keyTokenForField(field, formatKeyToken)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{inputTypeLabel(field.inputType)}</td>
                <td className="px-3 py-2 text-muted-foreground">{field.unit || '—'}</td>
                {mode === 'builder' ? (
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {stored ? (
                      <span className="break-all font-mono">{field.storedValue?.trim() || '0'}</span>
                    ) : field.inputType === 'material' ? (
                      field.defaultMaterialName || 'No default material'
                    ) : field.inputType === 'boolean' ? (
                      field.defaultValue === 'true'
                        ? 'true'
                        : field.defaultValue === 'false'
                          ? 'false'
                          : '—'
                    ) : field.defaultValue?.trim() ? (
                      field.defaultValue
                    ) : (
                      '—'
                    )}
                  </td>
                ) : stored ? (
                  <td className="px-3 py-2">
                    <div
                      className="rounded-lg border border-border bg-muted/40 px-2.5 py-2 font-mono text-xs text-muted-foreground dark:border-border dark:bg-muted/30"
                      title="Uses the formula default. Override in the next column if needed."
                    >
                      {field.storedValue?.trim() || '0'}
                    </div>
                  </td>
                ) : (
                  <td className="px-3 py-2">
                    <JobLevelValueInput
                      field={field}
                      value={getValue?.(field.key) ?? ''}
                      onChange={(value) => onValueChange?.(field.key, value)}
                      materials={materials}
                      tone={tone}
                      materialSearchText={materialSearchText}
                    />
                  </td>
                )}
                {showOverride && stored ? (
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={getOverrideValue?.(field.key) ?? ''}
                      onChange={(event) => onOverrideChange?.(field.key, event.target.value)}
                      placeholder={`Default: ${field.storedValue?.trim() || '0'}`}
                      className={cn(classes.input, 'font-mono text-xs')}
                    />
                  </td>
                ) : showOverride ? (
                  <td className="px-3 py-2 text-muted-foreground">—</td>
                ) : null}
                {mode === 'builder' && builderActions ? (
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => builderActions.onEdit(field.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => builderActions.onDuplicate(field.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Duplicate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!builderActions.canMoveUp(field.id)}
                        onClick={() => builderActions.onMoveUp(field.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!builderActions.canMoveDown(field.id)}
                        onClick={() => builderActions.onMoveDown(field.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => builderActions.onRemove(field.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        title="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
