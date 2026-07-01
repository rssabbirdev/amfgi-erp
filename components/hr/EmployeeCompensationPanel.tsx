'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { readApiJson } from '@/lib/utils/readApiResponse';
import type { PayCalculationMode } from '@/lib/hr/payroll/types';

type PayType = {
  id: string;
  name: string;
  code: string;
  config?: { mode?: PayCalculationMode };
};
type AllowanceType = {
  id: string;
  name: string;
  code: string;
  componentKind?: 'EARNING' | 'DEDUCTION';
  isActive?: boolean;
};
type VisaPeriod = { id: string; label: string; startDate: string; endDate: string; status: string };

type PackageAllowance = {
  id: string;
  allowanceTypeId: string;
  allowanceType: {
    id: string;
    name: string;
    code: string;
    componentKind?: 'EARNING' | 'DEDUCTION';
  };
  amount: number;
};

type ChangeLine = {
  label: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
};

type CompensationPackage = {
  id: string;
  payType: PayType;
  visaPeriod: VisaPeriod | null;
  monthlyBasic: number | null;
  dailyRate: number | null;
  wpsTransferAmount: number | null;
  totalAllowance: number;
  totalMonthly: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt?: string;
  notes: string | null;
  allowances: PackageAllowance[];
  changes: ChangeLine[];
  payTypeChanged: boolean;
  previousPayTypeName: string | null;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

function resolvePayTypeMode(payType: PayType | undefined): PayCalculationMode | null {
  return payType?.config?.mode ?? null;
}

function usesDailyRateField(mode: PayCalculationMode | null): boolean {
  return mode === 'DAILY_WAGE';
}

function usesMonthlyBasicField(mode: PayCalculationMode | null): boolean {
  return mode != null && mode !== 'DAILY_WAGE';
}

function formatMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return value.toLocaleString();
}

function formatDate(ymd: string | null | undefined) {
  if (!ymd) return '—';
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDelta(delta: number | null) {
  if (delta == null || delta === 0) return null;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toLocaleString()}`;
}

function CompensationDetailBody({ pkg }: { pkg: CompensationPackage }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className={labelClass}>Salary structure</p>
          <p className="mt-1 font-medium">
            {pkg.payType.name}{' '}
            <span className="font-mono text-xs text-muted-foreground">({pkg.payType.code})</span>
          </p>
        </div>
        <div>
          <p className={labelClass}>Status</p>
          <p className="mt-1">{pkg.effectiveTo ? 'Closed period' : 'Current package'}</p>
        </div>
        <div>
          <p className={labelClass}>Effective from</p>
          <p className="mt-1 tabular-nums">{formatDate(pkg.effectiveFrom)}</p>
        </div>
        <div>
          <p className={labelClass}>Effective to</p>
          <p className="mt-1 tabular-nums">{pkg.effectiveTo ? formatDate(pkg.effectiveTo) : 'Ongoing'}</p>
        </div>
        <div>
          <p className={labelClass}>Recorded on</p>
          <p className="mt-1 tabular-nums">{formatDateTime(pkg.createdAt)}</p>
        </div>
        {pkg.visaPeriod ? (
          <div>
            <p className={labelClass}>Visa period</p>
            <p className="mt-1">{pkg.visaPeriod.label}</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className={labelClass}>Monthly package</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3 tabular-nums">
          <div>
            <p className="text-xs text-muted-foreground">Basic</p>
            <p className="font-medium">{formatMoney(pkg.monthlyBasic)} AED</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Salary components (net)</p>
            <p className="font-medium">{formatMoney(pkg.totalAllowance)} AED</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total / month</p>
            <p className="font-semibold">{formatMoney(pkg.totalMonthly)} AED</p>
          </div>
        </div>
        {pkg.dailyRate != null ? (
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            Daily rate: {formatMoney(pkg.dailyRate)} AED
          </p>
        ) : null}
        {pkg.wpsTransferAmount != null ? (
          <p className="mt-2 text-xs text-muted-foreground tabular-nums">
            WPS transfer amount: {formatMoney(pkg.wpsTransferAmount)} AED
          </p>
        ) : null}
      </div>

      {pkg.allowances.length > 0 ? (
        <div>
          <p className={labelClass}>Component breakdown</p>
          <ul className="mt-2 space-y-1 rounded-md border border-border px-3 py-2">
            {pkg.allowances.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 tabular-nums">
                <span>
                  {a.allowanceType.name}
                  {a.allowanceType.componentKind === 'DEDUCTION' ? (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      Deduction
                    </Badge>
                  ) : null}
                </span>
                <span>
                  {a.allowanceType.componentKind === 'DEDUCTION' ? '−' : ''}
                  {formatMoney(a.amount)} AED
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pkg.changes.length > 0 || pkg.payTypeChanged ? (
        <div className="rounded-md bg-muted/40 px-3 py-2">
          <p className={labelClass}>Changes from previous package</p>
          <ul className="mt-2 space-y-1 text-xs">
            {pkg.payTypeChanged ? (
              <li>
                Salary structure: {pkg.previousPayTypeName ?? '—'} → {pkg.payType.name}
              </li>
            ) : null}
            {pkg.changes
              .filter(
                (c) =>
                  c.label !== 'Total allowances' &&
                  c.label !== 'Net salary components' &&
                  c.label !== 'Pay type'
              )
              .map((c) => (
                <li key={c.label}>
                  {c.label}: {formatMoney(c.previous)} → {formatMoney(c.current)}
                  {formatDelta(c.delta) ? (
                    <span
                      className={
                        (c.delta ?? 0) > 0
                          ? ' text-emerald-700 dark:text-emerald-400'
                          : ' text-red-700 dark:text-red-400'
                      }
                    >
                      {' '}
                      ({formatDelta(c.delta)})
                    </span>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {pkg.notes ? (
        <div>
          <p className={labelClass}>Notes</p>
          <p className="mt-1 text-muted-foreground">{pkg.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

export default function EmployeeCompensationPanel({
  employeeId,
  canRecord,
  canDelete,
}: {
  employeeId: string;
  canRecord: boolean;
  canDelete: boolean;
}) {
  const [packages, setPackages] = useState<CompensationPackage[]>([]);
  const [payTypes, setPayTypes] = useState<PayType[]>([]);
  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
  const [visaPeriods, setVisaPeriods] = useState<VisaPeriod[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [detailPackage, setDetailPackage] = useState<CompensationPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [payTypeId, setPayTypeId] = useState('');
  const [visaPeriodId, setVisaPeriodId] = useState('');
  const [monthlyBasic, setMonthlyBasic] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [wpsTransferAmount, setWpsTransferAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [allowanceAmounts, setAllowanceAmounts] = useState<Record<string, string>>({});

  const previewMonth = new Date().toISOString().slice(0, 7);
  const previewHref = `/hr/payroll/preview?month=${previewMonth}&employeeId=${encodeURIComponent(employeeId)}`;

  const draftAllowanceTotal = useMemo(
    () =>
      allowanceTypes.reduce((sum, t) => {
        const amount = Number(allowanceAmounts[t.id] || 0) || 0;
        return sum + (t.componentKind === 'DEDUCTION' ? -amount : amount);
      }, 0),
    [allowanceTypes, allowanceAmounts]
  );

  const sortedPackages = useMemo(
    () =>
      [...packages].sort(
        (a, b) =>
          b.effectiveFrom.localeCompare(a.effectiveFrom) ||
          (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      ),
    [packages]
  );

  const currentPackage = useMemo(
    () => sortedPackages.find((p) => !p.effectiveTo) ?? sortedPackages[0] ?? null,
    [sortedPackages]
  );

  const selectedPayType = useMemo(
    () => payTypes.find((pt) => pt.id === payTypeId),
    [payTypes, payTypeId]
  );
  const selectedPayTypeMode = resolvePayTypeMode(selectedPayType);
  const monthlyBasicEnabled = usesMonthlyBasicField(selectedPayTypeMode);
  const dailyRateEnabled = usesDailyRateField(selectedPayTypeMode);

  useEffect(() => {
    if (!selectedPayTypeMode) return;
    if (selectedPayTypeMode === 'DAILY_WAGE') {
      setMonthlyBasic('');
    } else {
      setDailyRate('');
    }
  }, [selectedPayTypeMode, payTypeId]);

  const load = useCallback(async () => {
    const [compRes, ptRes, atRes, visaRes] = await Promise.all([
      fetch(`/api/hr/employees/${employeeId}/compensation`, { cache: 'no-store' }),
      fetch('/api/hr/pay-types', { cache: 'no-store' }),
      fetch('/api/hr/salary-components', { cache: 'no-store' }),
      fetch(`/api/hr/employees/${employeeId}/visa-periods`, { cache: 'no-store' }),
    ]);
    const compJson = await readApiJson<CompensationPackage[]>(compRes);
    const ptJson = await readApiJson<PayType[]>(ptRes);
    const atJson = await readApiJson<AllowanceType[]>(atRes);
    const visaJson = await readApiJson<VisaPeriod[]>(visaRes);

    if (!compRes.ok || !compJson?.success) {
      toast.error(compJson?.error ?? 'Failed to load compensation history');
      setPackages([]);
    } else {
      setPackages((compJson.data ?? []) as CompensationPackage[]);
    }
    if (ptRes.ok && ptJson?.success) {
      setPayTypes(
        ((ptJson.data ?? []) as PayType[]).filter((row) => row.config?.mode !== 'MONTHLY_FIXED')
      );
    }
    if (atRes.ok && atJson?.success) {
      setAllowanceTypes(((atJson.data ?? []) as AllowanceType[]).filter((t) => t.isActive !== false));
    }
    if (visaRes.ok && visaJson?.success) setVisaPeriods((visaJson.data ?? []) as VisaPeriod[]);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    const activeVisa = visaPeriods.find((v) => v.status === 'ACTIVE') ?? visaPeriods[0] ?? null;
    const initialPayTypeId = currentPackage?.payType.id ?? payTypes[0]?.id ?? '';
    const initialMode = resolvePayTypeMode(payTypes.find((pt) => pt.id === initialPayTypeId));
    setPayTypeId(initialPayTypeId);
    setVisaPeriodId(activeVisa?.id ?? '');
    if (usesDailyRateField(initialMode)) {
      setMonthlyBasic('');
      setDailyRate(currentPackage?.dailyRate != null ? String(currentPackage.dailyRate) : '');
    } else if (usesMonthlyBasicField(initialMode)) {
      setDailyRate('');
      setMonthlyBasic(currentPackage?.monthlyBasic != null ? String(currentPackage.monthlyBasic) : '');
    } else {
      setMonthlyBasic(currentPackage?.monthlyBasic != null ? String(currentPackage.monthlyBasic) : '');
      setDailyRate(currentPackage?.dailyRate != null ? String(currentPackage.dailyRate) : '');
    }
    setWpsTransferAmount(
      currentPackage?.wpsTransferAmount != null ? String(currentPackage.wpsTransferAmount) : ''
    );
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setNotes('');
    const amounts: Record<string, string> = {};
    for (const t of allowanceTypes) {
      const existing = currentPackage?.allowances.find((a) => a.allowanceTypeId === t.id);
      amounts[t.id] = existing ? String(existing.amount) : '';
    }
    setAllowanceAmounts(amounts);
  };

  const openForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const save = async () => {
    if (!payTypeId) {
      toast.error('Select a salary structure');
      return;
    }
    const mode = resolvePayTypeMode(selectedPayType);
    if (usesDailyRateField(mode) && !dailyRate.trim()) {
      toast.error('Enter daily rate for daily wage');
      return;
    }
    if (usesMonthlyBasicField(mode) && !monthlyBasic.trim()) {
      toast.error('Enter monthly basic for this salary structure');
      return;
    }
    setSaving(true);

    const allowances = allowanceTypes
      .map((t) => ({
        allowanceTypeId: t.id,
        amount: Number(allowanceAmounts[t.id] || 0),
      }))
      .filter((a) => a.amount > 0);

    const res = await fetch(`/api/hr/employees/${employeeId}/compensation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payTypeId,
        monthlyBasic: monthlyBasicEnabled && monthlyBasic ? Number(monthlyBasic) : null,
        dailyRate: dailyRateEnabled && dailyRate ? Number(dailyRate) : null,
        wpsTransferAmount: wpsTransferAmount.trim() ? Number(wpsTransferAmount) : null,
        effectiveFrom,
        visaPeriodId: visaPeriodId || null,
        notes: notes.trim() || null,
        allowances,
      }),
    });

    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save');
    } else {
      toast.success('Compensation package saved');
      setFormOpen(false);
      await load();
    }
    setSaving(false);
  };

  const removePackage = async (pkg: CompensationPackage) => {
    const label = formatDate(pkg.effectiveFrom);
    if (
      !window.confirm(
        `Delete compensation record effective ${label}? This cannot be undone and will adjust adjacent periods.`
      )
    ) {
      return;
    }

    setDeletingId(pkg.id);
    const res = await fetch(`/api/hr/employees/${employeeId}/compensation/${pkg.id}`, {
      method: 'DELETE',
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Delete failed');
    } else {
      toast.success('Compensation record deleted');
      if (detailPackage?.id === pkg.id) setDetailPackage(null);
      await load();
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          One package per effective date: salary structure, basic/daily rates, and salary components saved together.
        </p>
        <Link href={previewHref} className="text-sm font-medium text-primary hover:underline">
          Preview payroll →
        </Link>
      </div>

      {currentPackage ? (
        <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current package</p>
              <p className="mt-1 font-medium">
                {currentPackage.payType.name}{' '}
                <span className="font-mono text-xs text-muted-foreground">({currentPackage.payType.code})</span>
              </p>
            </div>
            <Badge variant="outline">Current</Badge>
          </div>
          <p className="mt-2 tabular-nums">
            Basic {formatMoney(currentPackage.monthlyBasic)} + Components{' '}
            {formatMoney(currentPackage.totalAllowance)} ={' '}
            <span className="font-semibold">{formatMoney(currentPackage.totalMonthly)} AED/mo</span>
          </p>
          {currentPackage.dailyRate != null ? (
            <p className="mt-1 tabular-nums text-xs text-muted-foreground">
              Daily rate: {formatMoney(currentPackage.dailyRate)} AED
            </p>
          ) : null}
          {currentPackage.wpsTransferAmount != null ? (
            <p className="mt-1 tabular-nums text-xs text-muted-foreground">
              WPS transfer: {formatMoney(currentPackage.wpsTransferAmount)} AED
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Effective {formatDate(currentPackage.effectiveFrom)}
            {currentPackage.visaPeriod ? ` · Visa: ${currentPackage.visaPeriod.label}` : ''}
          </p>
          <Button
            size="sm"
            variant="link"
            className="mt-2 h-auto p-0 text-xs"
            onClick={() => setDetailPackage(currentPackage)}
          >
            View full details
          </Button>
        </div>
      ) : null}

      {canRecord ? (
        <Button size="sm" variant="outline" onClick={openForm}>
          {currentPackage ? 'Record change' : 'Add compensation'}
        </Button>
      ) : null}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Compensation history</h3>
        {sortedPackages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No compensation records.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Effective to</TableHead>
                  <TableHead className="text-right">Basic</TableHead>
                  <TableHead className="text-right">Components (net)</TableHead>
                  <TableHead className="text-right">Total / mo</TableHead>
                  <TableHead className="text-right">WPS transfer</TableHead>
                  <TableHead>Recorded</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPackages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      <div className="font-medium">{formatDate(pkg.effectiveFrom)}</div>
                      <div className="text-xs text-muted-foreground">{pkg.payType.name}</div>
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {pkg.effectiveTo ? formatDate(pkg.effectiveTo) : 'Ongoing'}
                      {!pkg.effectiveTo ? (
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          Current
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(pkg.monthlyBasic)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(pkg.totalAllowance)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoney(pkg.totalMonthly)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(pkg.wpsTransferAmount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(pkg.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setDetailPackage(pkg)}>
                          Details
                        </Button>
                        {canDelete ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            disabled={deletingId === pkg.id}
                            onClick={() => void removePackage(pkg)}
                          >
                            {deletingId === pkg.id ? '…' : 'Delete'}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Modal
        isOpen={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        title={currentPackage ? 'Record compensation change' : 'Add compensation package'}
        description="Basic, salary components, and effective date are saved as one entry. Previous package is closed automatically."
        size="lg"
        actions={
          <>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save package'}
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Salary structure</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={payTypeId}
                onChange={(e) => setPayTypeId(e.target.value)}
              >
                <option value="">Select structure</option>
                {payTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.name} ({pt.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Visa period</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={visaPeriodId}
                onChange={(e) => setVisaPeriodId(e.target.value)}
              >
                <option value="">Not linked</option>
                {visaPeriods.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} ({v.startDate.slice(0, 10)} – {v.endDate.slice(0, 10)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Monthly basic (AED)</label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={monthlyBasic}
                disabled={!monthlyBasicEnabled}
                placeholder={monthlyBasicEnabled ? '0' : 'Not used for daily wage'}
                onChange={(e) => setMonthlyBasic(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Daily rate (AED)</label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={dailyRate}
                disabled={!dailyRateEnabled}
                placeholder={dailyRateEnabled ? '0' : 'Not used for fixed monthly / hourly'}
                onChange={(e) => setDailyRate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>WPS transfer amount (AED)</label>
            <Input
              className="mt-1 max-w-xs"
              type="number"
              min={0}
              step="0.01"
              placeholder="Optional"
              value={wpsTransferAmount}
              onChange={(e) => setWpsTransferAmount(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Monthly amount sent via Wage Protection System (WPS) for this package.
            </p>
          </div>

          <div>
            <label className={labelClass}>Effective from (shared for basic + components)</label>
            <Input
              className="mt-1 max-w-xs"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>

          {allowanceTypes.length > 0 ? (
            <div>
              <p className={labelClass}>Salary components (AED / month)</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {allowanceTypes.map((t) => (
                  <div key={t.id}>
                    <label className="text-xs text-muted-foreground">
                      {t.name}
                      {t.componentKind === 'DEDUCTION' ? ' (deduction)' : ''}
                    </label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      placeholder="0"
                      value={allowanceAmounts[t.id] ?? ''}
                      onChange={(e) =>
                        setAllowanceAmounts((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              {draftAllowanceTotal !== 0 || (monthlyBasicEnabled && monthlyBasic) ? (
                <p className="mt-2 text-sm tabular-nums">
                  {monthlyBasicEnabled ? (
                    <>
                      Basic {formatMoney(Number(monthlyBasic) || 0)} + Components{' '}
                      {formatMoney(draftAllowanceTotal)} ={' '}
                      <span className="font-medium">
                        {formatMoney((Number(monthlyBasic) || 0) + draftAllowanceTotal)} AED/mo
                      </span>
                    </>
                  ) : dailyRateEnabled && dailyRate ? (
                    <span className="font-medium">Daily rate {formatMoney(Number(dailyRate) || 0)} AED</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No salary components defined. Add them under HR → Settings → Salary components.
            </p>
          )}

          <div>
            <label className={labelClass}>Notes</label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={detailPackage != null}
        onClose={() => {
          if (!deletingId) setDetailPackage(null);
        }}
        title="Compensation package details"
        description={
          detailPackage
            ? `Effective ${formatDate(detailPackage.effectiveFrom)}${
                detailPackage.effectiveTo ? ` – ${formatDate(detailPackage.effectiveTo)}` : ' – ongoing'
              }`
            : undefined
        }
        size="lg"
        actions={
          detailPackage ? (
            <>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deletingId === detailPackage.id}
                  onClick={() => void removePackage(detailPackage)}
                >
                  {deletingId === detailPackage.id ? 'Deleting…' : 'Delete record'}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setDetailPackage(null)}>
                Close
              </Button>
            </>
          ) : null
        }
      >
        {detailPackage ? <CompensationDetailBody pkg={detailPackage} /> : null}
      </Modal>
    </div>
  );
}
