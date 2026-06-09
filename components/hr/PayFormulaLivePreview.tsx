'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/shadcn/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/shadcn/collapsible';
import { Input } from '@/components/ui/shadcn/input';
import SearchSelect from '@/components/ui/SearchSelect';
import { labelForBreakdownKey } from '@/lib/hr/payroll/formulaLabels';
import { FORMULA_PREVIEW_SCENARIOS } from '@/lib/hr/payroll/formulaPreviewSamples';
import { previewPayConfig } from '@/lib/hr/payroll/previewPayConfig';
import type { CompensationInput, PayTypeConfig } from '@/lib/hr/payroll/types';
import { readApiJson } from '@/lib/utils/readApiResponse';

type EmployeeOption = { id: string; label: string; searchText: string };

type PreviewContext = {
  label: string;
  month: string;
  compensation: CompensationInput;
  lines: Array<{
    workDate: string;
    status: string;
    leaveType: string | null;
    basicHours: number;
    workedMinutes: number;
    isSunday: boolean;
  }>;
  attendanceNote: string | null;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

export default function PayFormulaLivePreview({
  config,
  formulaScript,
  mode,
}: {
  config: PayTypeConfig;
  formulaScript: string;
  mode: PayTypeConfig['mode'];
}) {
  const [month, setMonth] = useState('2026-06');
  const [source, setSource] = useState<'dummy' | 'employee'>('dummy');
  const [scenarioId, setScenarioId] = useState('office');
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeContext, setEmployeeContext] = useState<PreviewContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [monthlyBasic, setMonthlyBasic] = useState('');
  const [monthlyAllowance, setMonthlyAllowance] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [overrideEnabled, setOverrideEnabled] = useState(false);

  const draftConfig = useMemo((): PayTypeConfig => {
    const base: PayTypeConfig = { ...config, mode };
    if (mode === 'CUSTOM') base.formulaScript = formulaScript;
    return base;
  }, [config, formulaScript, mode]);

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    const res = await fetch('/api/hr/employees?status=ACTIVE&limit=500', { cache: 'no-store' });
    const json = await readApiJson<
      | Array<{ id: string; fullName: string; preferredName: string | null; employeeCode: string }>
      | { items: Array<{ id: string; fullName: string; preferredName: string | null; employeeCode: string }> }
    >(res);
    if (res.ok && json?.success) {
      const raw = json.data;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
      setEmployees(
        list.map((e) => ({
          id: e.id,
          label: `${e.preferredName || e.fullName} (${e.employeeCode})`,
          searchText: `${e.fullName} ${e.preferredName ?? ''} ${e.employeeCode}`,
        }))
      );
    }
    setLoadingEmployees(false);
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const fetchEmployeeContext = useCallback(async () => {
    if (!employeeId) {
      setEmployeeContext(null);
      return;
    }
    setLoadingContext(true);
    const res = await fetch('/api/hr/payroll/formula-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month,
        config: { mode: 'MONTHLY_FIXED' },
        source: 'employee',
        employeeId,
      }),
    });
    const json = await readApiJson<{ context: PreviewContext }>(res);
    if (res.ok && json?.success && json.data?.context) {
      setEmployeeContext(json.data.context);
      if (!overrideEnabled) {
        setMonthlyBasic(String(json.data.context.compensation.monthlyBasic));
        setMonthlyAllowance(String(json.data.context.compensation.monthlyAllowance));
        setDailyRate(String(json.data.context.compensation.dailyRate));
      }
    }
    setLoadingContext(false);
  }, [employeeId, month, overrideEnabled]);

  useEffect(() => {
    if (source === 'employee') void fetchEmployeeContext();
  }, [source, employeeId, month, fetchEmployeeContext]);

  const dummyScenario = FORMULA_PREVIEW_SCENARIOS.find((s) => s.id === scenarioId) ?? FORMULA_PREVIEW_SCENARIOS[0];

  const activeContext = useMemo((): PreviewContext => {
    if (source === 'employee' && employeeContext) {
      return {
        ...employeeContext,
        month,
        compensation: overrideEnabled
          ? {
              monthlyBasic: Number(monthlyBasic) || 0,
              monthlyAllowance: Number(monthlyAllowance) || 0,
              dailyRate: Number(dailyRate) || 0,
            }
          : employeeContext.compensation,
      };
    }
    const comp = overrideEnabled
      ? {
          monthlyBasic: Number(monthlyBasic) || dummyScenario.compensation.monthlyBasic,
          monthlyAllowance: Number(monthlyAllowance) || dummyScenario.compensation.monthlyAllowance,
          dailyRate: Number(dailyRate) || dummyScenario.compensation.dailyRate,
        }
      : dummyScenario.compensation;
    return {
      label: dummyScenario.label,
      month,
      compensation: comp,
      lines: dummyScenario.lines,
      attendanceNote: `${dummyScenario.lines.length} sample days`,
    };
  }, [
    source,
    employeeContext,
    month,
    overrideEnabled,
    monthlyBasic,
    monthlyAllowance,
    dailyRate,
    dummyScenario,
  ]);

  useEffect(() => {
    if (source === 'dummy' && !overrideEnabled) {
      setMonthlyBasic(String(dummyScenario.compensation.monthlyBasic));
      setMonthlyAllowance(String(dummyScenario.compensation.monthlyAllowance));
      setDailyRate(String(dummyScenario.compensation.dailyRate));
    }
  }, [source, scenarioId, dummyScenario, overrideEnabled]);

  const preview = useMemo(
    () =>
      previewPayConfig({
        month: activeContext.month,
        config: draftConfig,
        compensation: activeContext.compensation,
        lines: activeContext.lines,
      }),
    [activeContext, draftConfig]
  );

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Pay preview</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        See what an employee would earn this month with the settings above.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <label className={labelClass}>Month</label>
          <Input className="mt-1" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={source === 'dummy' ? 'default' : 'outline'}
            onClick={() => setSource('dummy')}
          >
            Sample
          </Button>
          <Button
            type="button"
            size="sm"
            variant={source === 'employee' ? 'default' : 'outline'}
            onClick={() => setSource('employee')}
          >
            Employee
          </Button>
        </div>
      </div>

      {source === 'dummy' ? (
        <div className="mt-2">
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
          >
            {FORMULA_PREVIEW_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mt-2">
          <SearchSelect
            items={employees}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="Search employee…"
            loading={loadingEmployees}
            minCharactersToSearch={0}
            openOnFocus
          />
          {loadingContext ? <p className="mt-1 text-xs text-muted-foreground">Loading…</p> : null}
        </div>
      )}

      <div className="mt-4 rounded-md bg-muted/40 px-3 py-3">
        <p className="text-xs text-muted-foreground">{activeContext.label}</p>
        {preview.formulaError ? (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{preview.formulaError}</p>
        ) : (
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {preview.gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        )}
      </div>

      {(Object.keys(preview.breakdown).length > 0 || preview.days.length > 0) && !preview.formulaError ? (
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
              {detailsOpen ? 'Hide breakdown' : 'Show breakdown'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1">
            {Object.keys(preview.breakdown).length > 0 ? (
              <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                {Object.entries(preview.breakdown).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span>{labelForBreakdownKey(k)}</span>
                    <span className="tabular-nums">{v.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {preview.days.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-border text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b bg-muted/30 text-muted-foreground">
                      <th className="px-2 py-1">Date</th>
                      <th className="px-2 py-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.days.map((d) => (
                      <tr key={d.date} className="border-b">
                        <td className="px-2 py-1 font-mono">{d.date}</td>
                        <td className="px-2 py-1 tabular-nums">{d.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen} className="mt-1">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground">
            {optionsOpen ? 'Hide options' : 'Compensation override'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overrideEnabled}
              onChange={(e) => setOverrideEnabled(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Use custom amounts for this preview only
          </label>
          {overrideEnabled ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Basic</label>
                <Input className="mt-1" type="number" value={monthlyBasic} onChange={(e) => setMonthlyBasic(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Allowance</label>
                <Input
                  className="mt-1"
                  type="number"
                  value={monthlyAllowance}
                  onChange={(e) => setMonthlyAllowance(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Daily</label>
                <Input className="mt-1" type="number" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
              </div>
            </div>
          ) : null}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
