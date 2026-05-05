'use client';

import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import SearchSelect from '@/components/ui/SearchSelect';
import type { Material } from '@/store/api/endpoints/materials';
import {
  FIELD_TYPES,
  type AreaRule,
  type BuilderState,
  type DynamicField,
  type FieldType,
  type FormulaConstantField,
  type FormulaToken,
  type LaborRule,
  type MaterialRule,
  type PlaygroundValues,
  buildAreaFormulaValueTokens,
  buildFormulaTokens,
  describeFieldType,
  describeLaborRule,
  describeMaterialRule,
  formatPreviewMoney,
  formatPreviewQty,
  getTokenChipClasses,
  newLaborRule,
  newMaterialRule,
  normalizeFormulaKey,
  reorderItemsById,
  tokenizeExpressionDisplay,
} from './shared';

export type FormulaEditorRequest = {
  title: string;
  description?: string;
  value: string;
  placeholder: string;
  tokens: FormulaToken[];
  onChange: (value: string) => void;
  resolvePreview?: (value: string) => string | null;
  previewLabel?: string;
};

function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="inline-flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 active:cursor-grabbing dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10"
      title={`Drag to reorder ${label}`}
    >
      <span className="text-sm leading-none">::</span>
      <span>Move</span>
    </button>
  );
}

function duplicateMaterialRule(rule: MaterialRule): MaterialRule {
  return {
    ...rule,
    id: `material-${Math.random().toString(36).slice(2, 9)}`,
  };
}

function duplicateLaborRule(rule: LaborRule): LaborRule {
  return {
    ...rule,
    id: `labor-${Math.random().toString(36).slice(2, 9)}`,
  };
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

export function FieldRows({
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
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);

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
          <div
            key={field.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!draggingFieldId || draggingFieldId === field.id) return;
              onChange(reorderItemsById(fields, draggingFieldId, field.id));
              setDraggingFieldId(null);
            }}
            className={`rounded-2xl border bg-white p-3 shadow-sm transition ${
              draggingFieldId === field.id
                ? 'border-emerald-300 ring-2 ring-emerald-500/20 dark:border-emerald-500/40'
                : 'border-slate-200 dark:border-slate-800'
            } dark:bg-slate-950/70`}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <DragHandle
                label="field"
                onDragStart={() => setDraggingFieldId(field.id)}
                onDragEnd={() => setDraggingFieldId(null)}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Drag to reorder</span>
            </div>
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
            <div className="mt-2 space-y-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{describeFieldType(field.inputType)}{field.unit ? ` • ${field.unit}` : ''}</span>
                {showScope && field.scope ? (
                  <span className="rounded-full border border-slate-200 px-2 py-1 uppercase tracking-[0.12em] dark:border-slate-700">
                    {field.scope}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>{field.inputType === 'material' ? 'Stores selected material ID for this job' : 'Use this token inside quantity expressions'}</span>
                <span className="font-mono text-sky-700 dark:text-sky-300">{token}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AreaFormulaValueRows({
  area,
  globalFields,
  formulaConstants,
  onChange,
  onRequestFormulaEditor,
}: {
  area: AreaRule;
  globalFields: DynamicField[];
  formulaConstants: FormulaConstantField[];
  onChange: (fields: FormulaConstantField[]) => void;
  onRequestFormulaEditor: (request: FormulaEditorRequest) => void;
}) {
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);

  if (area.formulaValues.length === 0) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-cyan-200 bg-cyan-50/60 px-4 py-6 text-sm text-slate-500 dark:border-cyan-500/20 dark:bg-cyan-500/5">
        No area-only values yet. Add resin rate, overlap factor, coverage rate, or other stored expressions that belong only to this area.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {area.formulaValues.map((field) => (
        <div
          key={field.id}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (!draggingFieldId || draggingFieldId === field.id) return;
            onChange(reorderItemsById(area.formulaValues, draggingFieldId, field.id));
            setDraggingFieldId(null);
          }}
          className={`rounded-2xl border bg-white p-3 shadow-sm transition ${
            draggingFieldId === field.id
              ? 'border-cyan-300 ring-2 ring-cyan-500/20 dark:border-cyan-500/40'
              : 'border-slate-200 dark:border-slate-800'
          } dark:bg-slate-950/70`}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <DragHandle
              label="area value"
              onDragStart={() => setDraggingFieldId(field.id)}
              onDragEnd={() => setDraggingFieldId(null)}
            />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Area only</span>
          </div>
          <div className="grid gap-2">
            <input
              value={field.label}
              onChange={(event) => onChange(area.formulaValues.map((item) => (item.id === field.id ? { ...item, label: event.target.value } : item)))}
              placeholder="Label, e.g. Wall resin rate"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              value={field.key}
              onChange={(event) => onChange(area.formulaValues.map((item) => (item.id === field.id ? { ...item, key: normalizeFormulaKey(event.target.value) } : item)))}
              placeholder="wall_resin_rate"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem]">
              <ExpressionInput
                value={field.value}
                onChange={(value) => onChange(area.formulaValues.map((item) => (item.id === field.id ? { ...item, value } : item)))}
                tokens={buildAreaFormulaValueTokens(globalFields, formulaConstants, area, field.id)}
                placeholder="area.area_sqm * 0.85 or formula.resin_use_rate"
                className="focus:border-cyan-300 dark:focus:border-cyan-400"
                title={`${area.label || area.key || 'Area'} value formula`}
                description="This stored value is only available inside the current area."
                onRequestEditor={onRequestFormulaEditor}
              />
              <input
                value={field.unit}
                onChange={(event) => onChange(area.formulaValues.map((item) => (item.id === field.id ? { ...item, unit: event.target.value } : item)))}
                placeholder="kg/sqm"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-cyan-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="mt-2 space-y-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
            <div className="flex items-center justify-between gap-2">
              <span>{field.unit || 'Stored area-only value'}</span>
              <Button size="sm" variant="ghost" onClick={() => onChange(area.formulaValues.filter((item) => item.id !== field.id))}>
                Remove
              </Button>
            </div>
            <span className="block truncate font-mono text-cyan-700 dark:text-cyan-300">{field.key ? `area.formula.${field.key}` : 'area.formula.key'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormulaPlayground({
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
  preview: ReturnType<typeof import('./shared').buildPlaygroundPreview>;
}) {
  const setValue = (key: string, value: string) => {
    onChange({ ...values, [key]: value });
  };
  const setBooleanValue = (key: string, checked: boolean) => {
    onChange({ ...values, [key]: checked ? 'true' : 'false' });
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
                <div className="mt-1.5">
                  <SearchSelect
                    items={materials.map((material) => ({
                      id: material.id,
                      label: material.name,
                      searchText: `${material.name} ${material.unit} ${formatPreviewMoney(Number(material.unitCost ?? 0))}`,
                    }))}
                    value={values[`global.${field.key}`] ?? field.defaultMaterialId ?? ''}
                    onChange={(id) => setValue(`global.${field.key}`, id)}
                    placeholder="Select material"
                    openOnFocus
                    dropdownInPortal
                    clearOnEmptyInput
                    inputProps={{
                      className:
                        'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white',
                    }}
                  />
                </div>
              ) : field.inputType === 'boolean' ? (
                <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950">
                  <div>
                    <p className="text-sm font-medium normal-case tracking-normal text-slate-900 dark:text-white">
                      {(values[`global.${field.key}`] ?? 'false') === 'true' ? 'Yes' : 'No'}
                    </p>
                    <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">
                      Boolean input
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={(values[`global.${field.key}`] ?? 'false') === 'true'}
                    onClick={() => setBooleanValue(`global.${field.key}`, (values[`global.${field.key}`] ?? 'false') !== 'true')}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                      (values[`global.${field.key}`] ?? 'false') === 'true'
                        ? 'bg-emerald-500'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                        (values[`global.${field.key}`] ?? 'false') === 'true' ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-sky-300 dark:border-slate-700 dark:bg-slate-950">
                  <input
                    type={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(field.inputType) ? 'number' : 'text'}
                    inputMode={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(field.inputType) ? 'decimal' : undefined}
                    value={values[`global.${field.key}`] ?? ''}
                    onChange={(event) => setValue(`global.${field.key}`, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
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

      {form.formulaConstants.length > 0 ? (
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">Stored formula values</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                These fixed values come from the formula sidebar and are always available as <span className="font-mono">formula.key</span>.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {form.formulaConstants.map((field) => (
              <div key={field.id} className="rounded-2xl border border-cyan-100 bg-white px-4 py-3 dark:border-cyan-500/20 dark:bg-slate-950/70">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-white">{field.label || field.key || 'Stored value'}</p>
                    <p className="mt-1 font-mono text-[11px] text-cyan-700 dark:text-cyan-300">{field.key ? `formula.${field.key}` : 'formula.key'}</p>
                  </div>
                  <p className="text-right text-sm font-semibold text-slate-950 dark:text-white">
                    {field.value || '0'} {field.unit || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        {form.areas.map((area) => (
          <div key={area.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
            <h3 className="text-base font-semibold text-slate-950 dark:text-white">{area.label || area.key || 'Area'}</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {area.fields.map((field) => (
                <label key={field.id} className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {field.label || field.key || 'Area input'}
                  {field.inputType === 'boolean' ? (
                    <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                      <div>
                        <p className="text-sm font-medium normal-case tracking-normal text-slate-900 dark:text-white">
                          {(values[`area.${area.id}.${field.key}`] ?? 'false') === 'true' ? 'Yes' : 'No'}
                        </p>
                        <p className="mt-0.5 text-[11px] font-normal normal-case tracking-normal text-slate-500 dark:text-slate-400">
                          Boolean input
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={(values[`area.${area.id}.${field.key}`] ?? 'false') === 'true'}
                        onClick={() => setBooleanValue(`area.${area.id}.${field.key}`, (values[`area.${area.id}.${field.key}`] ?? 'false') !== 'true')}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                          (values[`area.${area.id}.${field.key}`] ?? 'false') === 'true'
                            ? 'bg-emerald-500'
                            : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
                            (values[`area.${area.id}.${field.key}`] ?? 'false') === 'true' ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 focus-within:border-sky-300 dark:border-slate-700 dark:bg-slate-900">
                      <input
                        type={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(field.inputType) ? 'number' : 'text'}
                        inputMode={['number', 'percent', 'length', 'area', 'volume', 'count'].includes(field.inputType) ? 'decimal' : undefined}
                        value={values[`area.${area.id}.${field.key}`] ?? ''}
                        onChange={(event) => setValue(`area.${area.id}.${field.key}`, event.target.value)}
                        className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:text-white"
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

export function ExpressionInput({
  value,
  onChange,
  tokens,
  placeholder,
  title,
  description,
  onRequestEditor,
  resolvePreview,
  previewLabel,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  tokens: FormulaToken[];
  placeholder: string;
  title: string;
  description?: string;
  onRequestEditor: (request: FormulaEditorRequest) => void;
  resolvePreview?: (value: string) => string | null;
  previewLabel?: string;
  className?: string;
}) {
  const displayParts = useMemo(() => tokenizeExpressionDisplay(value, tokens), [tokens, value]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onRequestEditor({ title, description, value, placeholder, tokens, onChange, resolvePreview, previewLabel })}
        className={`flex min-h-[2.5rem] w-full items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:hover:border-emerald-500/30 ${className}`}
      >
        <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap font-mono text-sm">
          {value ? (
            displayParts.map((part, index) =>
              part.type === 'token' ? (
                <span
                  key={`${part.text}-${index}`}
                  title={part.token.token}
                  className={`mx-[1px] inline-flex max-w-full items-center rounded-md border px-1.5 py-0 text-[11px] font-semibold leading-5 align-middle ${getTokenChipClasses(part.token.group)}`}
                >
                  <span className="truncate">{part.token.token}</span>
                </span>
              ) : (
                <span key={`${part.text}-${index}`} className="text-slate-600 dark:text-slate-300">
                  {part.text}
                </span>
              )
            )
          ) : (
            <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
          )}
        </div>
        <span className="ml-3 shrink-0 rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Edit
        </span>
      </button>
    </div>
  );
}

export function RuleRows({
  area,
  materials,
  globalFields,
  formulaConstants,
  globalMaterialFields,
  onMaterialsChange,
  onLaborChange,
  resolveMaterialPreview,
  resolveLaborPreview,
  onRequestFormulaEditor,
}: {
  area: AreaRule;
  materials: Array<{ id: string; name: string }>;
  globalFields: DynamicField[];
  formulaConstants: FormulaConstantField[];
  globalMaterialFields: DynamicField[];
  onMaterialsChange: (rules: MaterialRule[]) => void;
  onLaborChange: (rules: LaborRule[]) => void;
  resolveMaterialPreview: (rule: MaterialRule) => string;
  resolveLaborPreview: (rule: LaborRule) => string;
  onRequestFormulaEditor: (request: FormulaEditorRequest) => void;
}) {
  const formulaTokens = buildFormulaTokens(globalFields, formulaConstants, area);
  const searchableGlobalMaterialFields = useMemo(
    () =>
      globalMaterialFields.map((field) => ({
        id: field.key,
        label: field.label || field.key,
        searchText: `specs.global.${field.key}`,
      })),
    [globalMaterialFields]
  );
  const searchableMaterials = useMemo(
    () =>
      materials.map((material) => ({
        id: material.id,
        label: material.name,
      })),
    [materials]
  );
  const [materialEditor, setMaterialEditor] = useState<{ mode: 'create' | 'edit'; draft: MaterialRule; initialDraft: MaterialRule } | null>(null);
  const [laborEditor, setLaborEditor] = useState<{ mode: 'create' | 'edit'; draft: LaborRule; initialDraft: LaborRule } | null>(null);
  const materialBackdropRef = useRef<HTMLButtonElement | null>(null);
  const materialPanelRef = useRef<HTMLDivElement | null>(null);
  const laborBackdropRef = useRef<HTMLButtonElement | null>(null);
  const laborPanelRef = useRef<HTMLDivElement | null>(null);

  const saveMaterialRule = () => {
    if (!materialEditor) return;
    const draft = { ...materialEditor.draft, wastePercent: materialEditor.draft.wastePercent || '0' };
    if ((draft.materialSource === 'fixed' && !draft.materialId) || (draft.materialSource === 'global' && !draft.materialSelectorKey)) return;
    if (!draft.quantityExpression.trim()) return;
    onMaterialsChange(
      materialEditor.mode === 'create'
        ? [...area.materials, draft]
        : area.materials.map((rule) => (rule.id === draft.id ? draft : rule))
    );
    animateDrawerClose(materialBackdropRef.current, materialPanelRef.current, () => setMaterialEditor(null));
  };

  const saveLaborRule = () => {
    if (!laborEditor) return;
    const draft = laborEditor.draft;
    if (!draft.expertiseName.trim() || !draft.productivityPerWorkerPerDay.trim()) return;
    onLaborChange(
      laborEditor.mode === 'create'
        ? [...area.labor, draft]
        : area.labor.map((rule) => (rule.id === draft.id ? draft : rule))
    );
    animateDrawerClose(laborBackdropRef.current, laborPanelRef.current, () => setLaborEditor(null));
  };

  const attemptCloseMaterialEditor = () => {
    if (!materialEditor) return;
    if (isDrawerDraftDirty(materialEditor.draft, materialEditor.initialDraft)) {
      toast.error('Unsaved changes detected. Save or use Cancel to discard them.');
      return;
    }
    animateDrawerClose(materialBackdropRef.current, materialPanelRef.current, () => setMaterialEditor(null));
  };

  const attemptCloseLaborEditor = () => {
    if (!laborEditor) return;
    if (isDrawerDraftDirty(laborEditor.draft, laborEditor.initialDraft)) {
      toast.error('Unsaved changes detected. Save or use Cancel to discard them.');
      return;
    }
    animateDrawerClose(laborBackdropRef.current, laborPanelRef.current, () => setLaborEditor(null));
  };

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-teal-100 bg-teal-50/60 p-4 dark:border-teal-500/15 dark:bg-teal-500/5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Material costing rules</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose fixed stock items or use job-level material dropdowns for brand-sensitive costing.</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const initialDraft = newMaterialRule();
                setMaterialEditor({ mode: 'create', draft: initialDraft, initialDraft });
              }}
            >
              Add rule
            </Button>
          </div>
          <div className="space-y-3">
            {area.materials.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-teal-300 bg-white/70 px-4 py-5 text-sm text-slate-500 dark:border-teal-500/30 dark:bg-slate-950/50">No material rules yet. Add resin, gelcoat, fiber, catalyst, solvent, or other consumable rules here.</p>
            ) : (
              area.materials.map((rule, index) => (
                <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                        {rule.materialSource === 'global'
                          ? globalMaterialFields.find((field) => field.key === rule.materialSelectorKey)?.label || rule.materialSelectorKey || 'Job material'
                          : materials.find((material) => material.id === rule.materialId)?.name || 'Fixed material'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{describeMaterialRule(rule)}</p>
                      <p className="mt-1 truncate font-mono text-xs text-teal-700 dark:text-teal-300">{rule.quantityExpression || '--'}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Possible output: {resolveMaterialPreview(rule)}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Waste: {rule.wastePercent || '0'}%</p>
                    </div>
                    <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                      {rule.materialSource === 'global' ? 'job material' : 'fixed'}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const initialDraft = { ...rule };
                        setMaterialEditor({ mode: 'edit', draft: { ...rule }, initialDraft });
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onMaterialsChange([
                      ...area.materials.slice(0, index + 1),
                      duplicateMaterialRule(rule),
                      ...area.materials.slice(index + 1),
                    ])}>Duplicate</Button>
                    <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onMaterialsChange(reorderItemsById(area.materials, rule.id, area.materials[index - 1]?.id ?? rule.id))}>Up</Button>
                    <Button size="sm" variant="ghost" disabled={index === area.materials.length - 1} onClick={() => onMaterialsChange(reorderItemsById(area.materials, rule.id, area.materials[index + 1]?.id ?? rule.id))}>Down</Button>
                    <Button size="sm" variant="ghost" onClick={() => onMaterialsChange(area.materials.filter((item) => item.id !== rule.id))}>Remove</Button>
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const initialDraft = newLaborRule();
                setLaborEditor({ mode: 'create', draft: initialDraft, initialDraft });
              }}
            >
              Add labor
            </Button>
          </div>
          <div className="space-y-3">
            {area.labor.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-amber-300 bg-white/70 px-4 py-5 text-sm text-slate-500 dark:border-amber-500/30 dark:bg-slate-950/50">No labor rules yet. Add lamination, gelcoat, finishing, welding, or MEP expertise here.</p>
            ) : (
              area.labor.map((rule, index) => (
                <div key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {describeLaborRule(rule)}
                  </div>
                  <div className="mt-3">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{rule.expertiseName || 'Unnamed expertise'}</p>
                    <p className="mt-1 truncate font-mono text-xs text-amber-700 dark:text-amber-300">{rule.quantityExpression || '--'}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Possible output: {resolveLaborPreview(rule)}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Crew: {rule.crewSizeExpression || '--'} • Productivity: {rule.productivityPerWorkerPerDay || '--'}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const initialDraft = { ...rule };
                        setLaborEditor({ mode: 'edit', draft: { ...rule }, initialDraft });
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onLaborChange([
                      ...area.labor.slice(0, index + 1),
                      duplicateLaborRule(rule),
                      ...area.labor.slice(index + 1),
                    ])}>Duplicate</Button>
                    <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => onLaborChange(reorderItemsById(area.labor, rule.id, area.labor[index - 1]?.id ?? rule.id))}>Up</Button>
                    <Button size="sm" variant="ghost" disabled={index === area.labor.length - 1} onClick={() => onLaborChange(reorderItemsById(area.labor, rule.id, area.labor[index + 1]?.id ?? rule.id))}>Down</Button>
                    <Button size="sm" variant="ghost" onClick={() => onLaborChange(area.labor.filter((item) => item.id !== rule.id))}>Remove</Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {materialEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button ref={materialBackdropRef} type="button" aria-label="Close material rule editor" onClick={attemptCloseMaterialEditor} className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem]">
            <div ref={materialPanelRef} className="drawer-panel-enter ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white/98 shadow-2xl shadow-slate-950/25 backdrop-blur-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/98">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">Material rule editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{materialEditor.mode === 'create' ? 'Add material rule' : 'Edit material rule'}</h3>
                  </div>
                  <Button size="sm" variant="secondary" onClick={attemptCloseMaterialEditor}>Close</Button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Material source
                  <select value={materialEditor.draft.materialSource} onChange={(event) => setMaterialEditor((current) => current ? { ...current, draft: { ...current.draft, materialSource: event.target.value as 'fixed' | 'global', materialId: event.target.value === 'fixed' ? current.draft.materialId : '', materialSelectorKey: event.target.value === 'global' ? current.draft.materialSelectorKey : '' } } : current)} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950">
                    <option value="fixed">Fixed stock item</option>
                    <option value="global">Brand selected on job</option>
                  </select>
                </label>
                {materialEditor.draft.materialSource === 'global' ? (
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Job material dropdown
                    <div className="mt-1.5">
                      <SearchSelect
                        items={searchableGlobalMaterialFields}
                        value={materialEditor.draft.materialSelectorKey}
                        onChange={(id) =>
                          setMaterialEditor((current) =>
                            current ? { ...current, draft: { ...current.draft, materialSelectorKey: id, materialId: '' } } : current
                          )
                        }
                        placeholder="Select job material dropdown"
                        openOnFocus
                        dropdownInPortal
                        clearOnEmptyInput
                        inputProps={{
                          className:
                            'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950',
                        }}
                      />
                    </div>
                  </label>
                ) : (
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Fixed material
                    <div className="mt-1.5">
                      <SearchSelect
                        items={searchableMaterials}
                        value={materialEditor.draft.materialId}
                        onChange={(id) =>
                          setMaterialEditor((current) =>
                            current ? { ...current, draft: { ...current.draft, materialId: id, materialSelectorKey: '' } } : current
                          )
                        }
                        placeholder="Select fixed material"
                        openOnFocus
                        dropdownInPortal
                        clearOnEmptyInput
                        inputProps={{
                          className:
                            'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950',
                        }}
                      />
                    </div>
                  </label>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Quantity formula</p>
                  <ExpressionInput value={materialEditor.draft.quantityExpression} onChange={(value) => setMaterialEditor((current) => current ? { ...current, draft: { ...current.draft, quantityExpression: value } } : current)} tokens={formulaTokens} placeholder="Quantity formula, e.g. area.area_sqm * specs.global.resin_kg_per_sqm" title={`${area.label || area.key || 'Area'} material quantity`} description="This formula controls the issued quantity for the selected material rule." resolvePreview={(value) => resolveMaterialPreview({ ...materialEditor.draft, quantityExpression: value })} previewLabel="Possible output with current playground" onRequestEditor={onRequestFormulaEditor} />
                </div>
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Waste percent
                  <input value={materialEditor.draft.wastePercent} onChange={(event) => setMaterialEditor((current) => current ? { ...current, draft: { ...current.draft, wastePercent: event.target.value } } : current)} placeholder="0" className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950" />
                </label>
              </div>
              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => animateDrawerClose(materialBackdropRef.current, materialPanelRef.current, () => setMaterialEditor(null))}>Cancel</Button>
                  <Button onClick={saveMaterialRule}>{materialEditor.mode === 'create' ? 'Add rule' : 'Save rule'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {laborEditor ? (
        <div className="fixed inset-x-0 bottom-0 top-14 z-40">
          <button ref={laborBackdropRef} type="button" aria-label="Close labor rule editor" onClick={attemptCloseLaborEditor} className="drawer-backdrop-enter absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-200" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem]">
            <div ref={laborPanelRef} className="drawer-panel-enter ml-auto flex h-full w-full flex-col border-l border-slate-200 bg-white/98 shadow-2xl shadow-slate-950/25 backdrop-blur-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-950/98">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Labor rule editor</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{laborEditor.mode === 'create' ? 'Add labor rule' : 'Edit labor rule'}</h3>
                  </div>
                  <Button size="sm" variant="secondary" onClick={attemptCloseLaborEditor}>Close</Button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Expertise
                  <input value={laborEditor.draft.expertiseName} onChange={(event) => setLaborEditor((current) => current ? { ...current, draft: { ...current.draft, expertiseName: event.target.value } } : current)} placeholder="Required expertise, e.g. Lamination" className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:bg-slate-950" />
                </label>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Work quantity</p>
                  <ExpressionInput value={laborEditor.draft.quantityExpression} onChange={(value) => setLaborEditor((current) => current ? { ...current, draft: { ...current.draft, quantityExpression: value } } : current)} tokens={formulaTokens} placeholder="Work quantity, e.g. area.area_sqm" title={`${area.label || area.key || 'Area'} labor quantity`} description="This formula defines the work quantity used by the labor rule." resolvePreview={(value) => resolveLaborPreview({ ...laborEditor.draft, quantityExpression: value })} previewLabel="Possible output with current playground" onRequestEditor={onRequestFormulaEditor} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Crew size</p>
                  <ExpressionInput value={laborEditor.draft.crewSizeExpression} onChange={(value) => setLaborEditor((current) => current ? { ...current, draft: { ...current.draft, crewSizeExpression: value } } : current)} tokens={formulaTokens} placeholder="Crew size" title={`${area.label || area.key || 'Area'} crew size`} description="Set a fixed crew size or derive it from another formula value." resolvePreview={(value) => resolveLaborPreview({ ...laborEditor.draft, crewSizeExpression: value })} previewLabel="Possible output with current playground" onRequestEditor={onRequestFormulaEditor} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Productivity per worker per day</p>
                  <ExpressionInput value={laborEditor.draft.productivityPerWorkerPerDay} onChange={(value) => setLaborEditor((current) => current ? { ...current, draft: { ...current.draft, productivityPerWorkerPerDay: value } } : current)} tokens={formulaTokens} placeholder="Qty / worker / day" title={`${area.label || area.key || 'Area'} productivity`} description="Define how much one worker can finish per day for this area labor rule." resolvePreview={(value) => resolveLaborPreview({ ...laborEditor.draft, productivityPerWorkerPerDay: value })} previewLabel="Possible output with current playground" onRequestEditor={onRequestFormulaEditor} />
                </div>
              </div>
              <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" onClick={() => animateDrawerClose(laborBackdropRef.current, laborPanelRef.current, () => setLaborEditor(null))}>Cancel</Button>
                  <Button onClick={saveLaborRule}>{laborEditor.mode === 'create' ? 'Add labor' : 'Save labor'}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
