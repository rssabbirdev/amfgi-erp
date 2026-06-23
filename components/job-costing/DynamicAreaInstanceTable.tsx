'use client';

import { Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import type { Material } from '@/store/api/endpoints/materials';

export type DynamicAreaField = {
  key: string;
  label: string;
  inputType?: string;
  unit?: string;
  defaultMaterialId?: string;
  defaultValue?: string;
};

export type DynamicAreaInstance = {
  id: string;
  label: string;
};

function numericField(inputType?: string) {
  return ['number', 'percent', 'length', 'area', 'volume', 'count'].includes(inputType ?? 'number');
}

function DynamicAreaCellInput({
  field,
  value,
  onChange,
  materials,
  tone,
}: {
  field: DynamicAreaField;
  value: string;
  onChange: (value: string) => void;
  materials: Material[];
  tone: 'default' | 'playground';
}) {
  const inputClass =
    tone === 'playground'
      ? 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white'
      : 'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background';

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
          searchText: `${material.name} ${material.unit}`,
        }))}
        value={value || field.defaultMaterialId || ''}
        onChange={onChange}
        placeholder="Material"
        openOnFocus
        dropdownInPortal
        clearOnEmptyInput
        inputProps={{ className: inputClass }}
      />
    );
  }

  return (
    <input
      type={numericField(field.inputType) ? 'number' : 'text'}
      inputMode={numericField(field.inputType) ? 'decimal' : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}

export function DynamicAreaInstanceTable({
  areaLabel,
  fields,
  instances,
  getValue,
  onValueChange,
  onInstanceLabelChange,
  onAddInstance,
  onDuplicateInstance,
  onRemoveInstance,
  materials = [],
  tone = 'default',
}: {
  areaLabel: string;
  fields: DynamicAreaField[];
  instances: DynamicAreaInstance[];
  getValue: (instanceId: string, fieldKey: string) => string;
  onValueChange: (instanceId: string, fieldKey: string, value: string) => void;
  onInstanceLabelChange: (instanceId: string, label: string) => void;
  onAddInstance: () => void;
  onDuplicateInstance: (instanceId: string) => void;
  onRemoveInstance: (instanceId: string) => void;
  materials?: Material[];
  tone?: 'default' | 'playground';
}) {
  const tableShellClass =
    tone === 'playground'
      ? 'overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'
      : 'overflow-x-auto rounded-xl border border-border bg-white dark:border-border dark:bg-card';
  const headClass =
    tone === 'playground'
      ? 'bg-slate-100 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900 dark:text-slate-400'
      : 'bg-muted/50 text-[11px] uppercase tracking-[0.16em] text-muted-foreground';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Enter one row per {areaLabel || 'area'} instance. Totals combine across all rows.
        </p>
        <Button type="button" size="sm" variant="secondary" onClick={onAddInstance}>
          Add row
        </Button>
      </div>
      {instances.length > 0 && fields.length > 0 ? (
        <div className={tableShellClass}>
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className={headClass}>
              <tr>
                <th className="w-10 px-3 py-2.5 font-semibold">#</th>
                <th className="min-w-[10rem] px-3 py-2.5 font-semibold">Label</th>
                {fields.map((field) => (
                  <th key={field.key} className="min-w-[8rem] px-3 py-2.5 font-semibold">
                    {field.label}
                    {field.unit ? <span className="ml-1 font-normal normal-case text-muted-foreground">({field.unit})</span> : null}
                  </th>
                ))}
                <th className="w-20 px-3 py-2.5 text-right font-semibold" />
              </tr>
            </thead>
            <tbody>
              {instances.map((instance, index) => (
                <tr key={instance.id} className="border-t border-border dark:border-border">
                  <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={instance.label}
                      onChange={(event) => onInstanceLabelChange(instance.id, event.target.value)}
                      placeholder={`${areaLabel || 'Area'} ${index + 1}`}
                      className={
                        tone === 'playground'
                          ? 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white'
                          : 'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background'
                      }
                    />
                  </td>
                  {fields.map((field) => (
                    <td key={`${instance.id}.${field.key}`} className="px-3 py-2">
                      <DynamicAreaCellInput
                        field={field}
                        value={getValue(instance.id, field.key)}
                        onChange={(value) => onValueChange(instance.id, field.key, value)}
                        materials={materials}
                        tone={tone}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onDuplicateInstance(instance.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Duplicate row"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveInstance(instance.id)}
                        disabled={instances.length <= 1}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                        title="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : instances.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground dark:border-border">
          No {areaLabel || 'area'} rows yet. Add one to enter measurements.
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This area has no input fields yet.</p>
      )}
    </div>
  );
}
