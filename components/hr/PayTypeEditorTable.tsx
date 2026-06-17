'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import PayFormulaBuilder from '@/components/hr/PayFormulaBuilder';
import PayFormulaLivePreview from '@/components/hr/PayFormulaLivePreview';
import PayTypeModeGuide from '@/components/hr/PayTypeModeGuide';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/shadcn/collapsible';
import { Input } from '@/components/ui/shadcn/input';
import { labelForCompensationInput } from '@/lib/hr/payroll/formulaLabels';
import { formulaScriptForMode } from '@/lib/hr/payroll/formulaModeScripts';
import { DEFAULT_PAY_TYPE_TEMPLATES } from '@/lib/hr/payroll/payTypeTemplates';
import {
  PAY_CALCULATION_MODE_OPTIONS,
  buildPayTypeConfigFromFields,
  payTypeConfigFields,
  slugifyPayTypeCode,
} from '@/lib/hr/payroll/payTypeForm';
import { describePayTypeRow } from '@/lib/hr/payroll/payTypeFormulas';
import { WEEKDAY_OPTIONS } from '@/lib/hr/payroll/payTypeConfigHelpers';
import type { DeductDenominator, PayCalculationMode, PayTypeConfig } from '@/lib/hr/payroll/types';
import { readApiJson } from '@/lib/utils/readApiResponse';

export type PayTypeRecord = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

type EditorState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; row: PayTypeRecord };

function compensationNeedsLabel(config: Record<string, unknown>) {
  const desc = describePayTypeRow(config);
  if (!desc.compensationInputs?.length) return null;
  return desc.compensationInputs.map((k) => labelForCompensationInput(k)).join(', ');
}

export default function PayTypeEditorTable({
  rows,
  saving,
  onSavingChange,
  onReload,
}: {
  rows: PayTypeRecord[];
  saving: boolean;
  onSavingChange: (v: boolean) => void;
  onReload: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<EditorState>({ kind: 'none' });
  const [moreOpen, setMoreOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<PayCalculationMode>('MONTHLY_CALENDAR_DEDUCT');
  const [otPercent, setOtPercent] = useState('125');
  const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>([0]);
  const [deductDenominator, setDeductDenominator] = useState<DeductDenominator>('WORKING_DAYS');
  const [payExcludedWeekdayWorkAtOt, setPayExcludedWeekdayWorkAtOt] = useState(false);
  const [sortOrder, setSortOrder] = useState('100');
  const [isActive, setIsActive] = useState(true);
  const [formulaScript, setFormulaScript] = useState('');

  const editingRow = editor.kind === 'edit' ? editor.row : null;
  const isCreate = editor.kind === 'create';
  const isEditing = editor.kind !== 'none';
  const isEditingDeprecatedFixedMonthly =
    Boolean(editingRow) && payTypeConfigFields(editingRow!.config as Record<string, unknown>).mode === 'MONTHLY_FIXED';
  const usesWorkingDayExclusions =
    mode === 'DAILY_WAGE' ||
    mode === 'HOURLY_SPLIT' ||
    mode === 'CUSTOM' ||
    mode === 'MONTHLY_CALENDAR_DEDUCT';
  const usesOfficeDeductDenominator = mode === 'MONTHLY_CALENDAR_DEDUCT';

  const modeMeta = PAY_CALCULATION_MODE_OPTIONS.find((o) => o.value === mode);

  const usesSundayWorkOt =
    mode === 'DAILY_WAGE' ||
    mode === 'CUSTOM' ||
    (mode === 'MONTHLY_CALENDAR_DEDUCT' && payExcludedWeekdayWorkAtOt);

  const liveConfig = useMemo(
    () =>
      buildPayTypeConfigFromFields({
        mode,
        otPercent: Number(otPercent),
        excludedWeekdays: usesWorkingDayExclusions ? excludedWeekdays : undefined,
        deductDenominator: usesOfficeDeductDenominator ? deductDenominator : undefined,
        payExcludedWeekdayWorkAtOt:
          mode === 'MONTHLY_CALENDAR_DEDUCT' ? payExcludedWeekdayWorkAtOt : undefined,
        formulaScript: mode === 'CUSTOM' ? formulaScript : null,
      }),
    [
      mode,
      otPercent,
      excludedWeekdays,
      deductDenominator,
      payExcludedWeekdayWorkAtOt,
      formulaScript,
      usesWorkingDayExclusions,
      usesOfficeDeductDenominator,
    ]
  );

  const openCreate = () => {
    setEditor({ kind: 'create' });
    setName('');
    setCode('');
    setMode('MONTHLY_CALENDAR_DEDUCT');
    setOtPercent('125');
    setExcludedWeekdays([0]);
    setDeductDenominator('WORKING_DAYS');
    setPayExcludedWeekdayWorkAtOt(false);
    setSortOrder('100');
    setIsActive(true);
    setFormulaScript('');
    setMoreOpen(false);
  };

  const openEdit = (row: PayTypeRecord) => {
    const fields = payTypeConfigFields(row.config);
    setEditor({ kind: 'edit', row });
    setName(row.name);
    setCode(row.code);
    setMode(fields.mode);
    setOtPercent(String(fields.otPercent));
    setExcludedWeekdays(fields.excludedWeekdays);
    setDeductDenominator(fields.deductDenominator);
    setPayExcludedWeekdayWorkAtOt(fields.payExcludedWeekdayWorkAtOt);
    setSortOrder(String(row.sortOrder));
    setIsActive(row.isActive);
    setFormulaScript(
      fields.formulaScript ||
        (fields.mode === 'CUSTOM' ? formulaScriptForMode('MONTHLY_CALENDAR_DEDUCT') : '')
    );
    setMoreOpen(false);
  };

  const handleModeChange = (next: PayCalculationMode) => {
    setMode(next);
    if (next === 'DAILY_WAGE') {
      setExcludedWeekdays([]);
    } else if (
      next === 'HOURLY_SPLIT' ||
      next === 'CUSTOM' ||
      next === 'MONTHLY_CALENDAR_DEDUCT'
    ) {
      setExcludedWeekdays([0]);
    }
    if (next === 'CUSTOM' && !formulaScript.trim()) {
      setFormulaScript(formulaScriptForMode(mode === 'CUSTOM' ? 'MONTHLY_CALENDAR_DEDUCT' : mode));
    }
  };

  const switchToCustom = () => {
    setFormulaScript(formulaScriptForMode(mode === 'CUSTOM' ? 'MONTHLY_CALENDAR_DEDUCT' : mode));
    setMode('CUSTOM');
  };

  const closeEditor = () => setEditor({ kind: 'none' });

  const cloneTemplate = async (templateCode: string) => {
    const tpl = DEFAULT_PAY_TYPE_TEMPLATES.find((t) => t.code === templateCode);
    if (!tpl) return;
    onSavingChange(true);
    const res = await fetch('/api/hr/pay-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `${tpl.name} (custom)`,
        code: `${templateCode}_CUSTOM_${Date.now().toString(36).slice(-4)}`.toUpperCase(),
        config: tpl.config,
        sortOrder: tpl.sortOrder + 50,
      }),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Clone failed');
    else {
      toast.success('Custom pay type created from template');
      await onReload();
    }
    onSavingChange(false);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (mode === 'CUSTOM' && !formulaScript.trim()) {
      toast.error('Custom formula script is required');
      return;
    }
    const config = liveConfig;
    onSavingChange(true);

    if (isCreate) {
      const finalCode = (code.trim() || slugifyPayTypeCode(name)).toUpperCase();
      const res = await fetch('/api/hr/pay-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: finalCode,
          config,
          sortOrder: Number(sortOrder) || 100,
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
      else {
        toast.success('Salary structure created');
        closeEditor();
        await onReload();
      }
    } else if (editingRow) {
      const res = await fetch(`/api/hr/pay-types/${editingRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          config,
          sortOrder: Number(sortOrder) || editingRow.sortOrder,
          isActive,
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Save failed');
      else {
        toast.success('Salary structure saved');
        closeEditor();
        await onReload();
      }
    }
    onSavingChange(false);
  };

  const remove = async (row: PayTypeRecord) => {
    if (!window.confirm(`Delete salary structure "${row.name}"?`)) return;
    onSavingChange(true);
    const res = await fetch(`/api/hr/pay-types/${row.id}`, { method: 'DELETE' });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Salary structure deleted');
      if (editingRow?.id === row.id) closeEditor();
      await onReload();
    }
    onSavingChange(false);
  };

  // Hide deprecated fixed-monthly pay types from the UI.
  const sortedRows = [...rows]
    .filter((row) => payTypeConfigFields(row.config).mode !== 'MONTHLY_FIXED')
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      {!isEditing ? (
        <>
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
            Each salary structure defines <span className="text-foreground font-medium">how gross pay is calculated</span>{' '}
            from an employee&apos;s compensation and attendance. Assign a structure when setting up employee
            compensation.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{sortedRows.length} salary structures</p>
            <Button size="sm" onClick={openCreate} disabled={saving}>
              Add structure
            </Button>
          </div>

          <div className="divide-y rounded-lg border border-border">
            {sortedRows.map((row) => {
              const fields = payTypeConfigFields(row.config);
              const modeOption = PAY_CALCULATION_MODE_OPTIONS.find((o) => o.value === fields.mode);
              const needs = compensationNeedsLabel(row.config);
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/20"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.name}</p>
                      {row.isSystem ? <Badge variant="secondary">System</Badge> : null}
                      {!row.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {modeOption?.label ?? fields.mode}
                    </p>
                    {needs ? (
                      <p className="mt-1 text-xs text-muted-foreground">Needs: {needs}</p>
                    ) : null}
                    {modeOption?.description ? (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {modeOption.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                    {row.isSystem ? (
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => void cloneTemplate(row.code)}>
                        Duplicate
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void remove(row)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {isEditing ? (
        <section className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h3 className="font-semibold">{isCreate ? 'New salary structure' : editingRow?.name}</h3>
              {editingRow?.isSystem ? (
                <p className="text-xs text-muted-foreground">System template — you can change any setting below.</p>
              ) : null}
            </div>
            <Button size="sm" variant="ghost" onClick={closeEditor}>
              Back to list
            </Button>
          </div>

          <div className="grid gap-6 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Display name</label>
                <Input
                  className="mt-1"
                  value={name}
                  placeholder="e.g. Office staff"
                  onChange={(e) => {
                    setName(e.target.value);
                    if (isCreate && !code.trim()) setCode(slugifyPayTypeCode(e.target.value));
                  }}
                />
              </div>

              {isCreate ? (
                <div>
                  <label className={labelClass}>Internal code</label>
                  <Input
                    className="mt-1 font-mono text-sm"
                    value={code}
                    placeholder="OFFICE_STAFF"
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Used in reports. Auto-generated from name if left blank.</p>
                </div>
              ) : null}

              <div>
                <label className={labelClass}>How is pay calculated?</label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value as PayCalculationMode)}
                disabled={isEditingDeprecatedFixedMonthly}
                >
                  {PAY_CALCULATION_MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                {mode === 'MONTHLY_FIXED' ? (
                  <option value="MONTHLY_FIXED" disabled>
                    Fixed monthly (removed)
                  </option>
                ) : null}
                </select>
                {modeMeta ? <p className="mt-1.5 text-sm text-muted-foreground">{modeMeta.description}</p> : null}
              </div>

              {usesSundayWorkOt ? (
                <div>
                  <label className={labelClass}>Overtime % of basic hour rate</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    className="mt-1 max-w-[160px]"
                    value={otPercent}
                    onChange={(e) => setOtPercent(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mode === 'MONTHLY_CALENDAR_DEDUCT'
                      ? 'Used only when weekly off work pay is enabled below. Fixed monthly employees are not paid for Sunday or weekly off work unless this is turned on.'
                      : 'Example: 125 means OT pays 1.25× the basic hourly rate. Standard hours per day come from each attendance row (employee type timing), not from this screen.'}
                  </p>
                </div>
              ) : null}

              {mode === 'HOURLY_SPLIT' ? (
                <p className="text-sm text-muted-foreground">
                  Standard hours per day are taken from each attendance row when payroll runs — set them on the day
                  sheet or via employee type timings.
                </p>
              ) : null}

              {usesOfficeDeductDenominator ? (
                <div>
                  <label className={labelClass}>Divide monthly basic by</label>
                  <select
                    className="mt-1 flex h-9 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
                    value={deductDenominator}
                    onChange={(e) => setDeductDenominator(e.target.value as DeductDenominator)}
                  >
                    <option value="WORKING_DAYS">Working days (recommended)</option>
                    <option value="CALENDAR_DAYS">All calendar days in the month</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Working days excludes the weekly off-days below when calculating how much one absent
                    day costs. Public holidays are handled separately in Company holidays.
                  </p>
                </div>
              ) : null}

              {usesWorkingDayExclusions ? (
                <div>
                  <label className={labelClass}>
                    {usesOfficeDeductDenominator ? 'Weekly off-days' : 'Exclude from working-day count'}
                  </label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {usesOfficeDeductDenominator
                      ? 'These weekdays are not counted in the working-day divisor and absences on them do not deduct pay. Work on those days is informational only unless weekly off work pay is enabled below.'
                      : 'Selected weekdays are subtracted from the month when spreading monthly pay. Work on those days is paid at OT rate only when enabled for daily wage and hourly split. Leave all unchecked to use every calendar day.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const checked = excludedWeekdays.includes(day.value);
                      return (
                        <label
                          key={day.value}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setExcludedWeekdays((prev) =>
                                e.target.checked
                                  ? [...prev, day.value].sort((a, b) => a - b)
                                  : prev.filter((d) => d !== day.value)
                              );
                            }}
                            className="size-4 rounded border-border"
                          />
                          {day.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {usesOfficeDeductDenominator ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <label className="inline-flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 rounded border-border"
                      checked={payExcludedWeekdayWorkAtOt}
                      onChange={(e) => setPayExcludedWeekdayWorkAtOt(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium text-foreground">Pay weekly off work at OT rate</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        When off, Sunday and other weekly off work is shown in payroll preview but earns no extra pay.
                        Enable this to pay worked hours on weekly off-days at the OT rate above.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}

              <PayTypeModeGuide mode={mode} config={liveConfig as PayTypeConfig} />

              <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
                    {moreOpen ? 'Hide more options' : 'More options'}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2">
                  <div>
                    <label className={labelClass}>Sort order</label>
                    <Input
                      type="number"
                      className="mt-1 max-w-[120px]"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="size-4 rounded border-border"
                    />
                    Active
                  </label>
                  {!isCreate ? (
                    <p className="text-xs text-muted-foreground">
                      Code: <span className="font-mono">{code}</span>
                    </p>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>

              <div className="flex gap-2 pt-1">
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : isCreate ? 'Create' : 'Save'}
                </Button>
                <Button variant="outline" disabled={saving} onClick={closeEditor}>
                  Cancel
                </Button>
              </div>
            </div>

            <PayFormulaLivePreview
              config={liveConfig}
              formulaScript={
                formulaScript ||
                (mode === 'CUSTOM'
                  ? formulaScriptForMode('MONTHLY_CALENDAR_DEDUCT')
                  : formulaScriptForMode(mode))
              }
              mode={mode}
            />
          </div>

          <div className="border-t border-border p-4">
            <PayFormulaBuilder
              mode={mode}
              formulaScript={
                formulaScript ||
                (mode === 'CUSTOM' ? formulaScriptForMode('MONTHLY_CALENDAR_DEDUCT') : '')
              }
              onFormulaScriptChange={setFormulaScript}
              onSwitchToCustom={switchToCustom}
              readOnly={false}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
