'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import Modal from '@/components/ui/Modal';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import type { LeaveAllocationBasis, LeavePayTier, LeaveTypeRules } from '@/lib/hr/leaveTypeRules';
import { LEAVE_ALLOCATION_BASIS_OPTIONS, summarizeLeaveRules } from '@/lib/hr/leaveTypeRules';
import { readApiJson } from '@/lib/utils/readApiResponse';

type LeaveTypeRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  rules: LeaveTypeRules;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';
const selectClass =
  'mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function slugifyCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function emptyTier(): LeavePayTier {
  return { fromDay: 1, toDay: 15, payPercent: 100 };
}

export default function LeaveTypesSettingsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = session?.user?.isSuperAdmin || perms.includes('hr.payroll.settings');

  const [rows, setRows] = useState<LeaveTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [entitlementDays, setEntitlementDays] = useState('');
  const [allocationBasis, setAllocationBasis] = useState<LeaveAllocationBasis>('OLDEST_VISA_OR_HIRE');
  const [requiresProbation, setRequiresProbation] = useState(false);
  const [countsAsPaidLeave, setCountsAsPaidLeave] = useState(false);
  const [deductFromBalance, setDeductFromBalance] = useState(false);
  const [hideFromEmployeePortal, setHideFromEmployeePortal] = useState(false);
  const [payTiers, setPayTiers] = useState<LeavePayTier[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hr/leave-types', { cache: 'no-store' });
    const json = await readApiJson<LeaveTypeRow[]>(res);
    if (res.ok && json?.success) setRows((json.data ?? []) as LeaveTypeRow[]);
    else toast.error(json?.error ?? 'Failed to load leave types');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  const loadRulesIntoForm = (rules: LeaveTypeRules) => {
    setEntitlementDays(rules.entitlementDays != null ? String(rules.entitlementDays) : '');
    setAllocationBasis(rules.allocationBasis ?? 'HIRE_DATE');
    setRequiresProbation(Boolean(rules.requiresProbationComplete));
    setCountsAsPaidLeave(Boolean(rules.countsAsPaidLeave));
    setDeductFromBalance(Boolean(rules.deductFromBalance));
    setHideFromEmployeePortal(Boolean(rules.hideFromEmployeePortal));
    setPayTiers(rules.payTiers?.length ? rules.payTiers : []);
  };

  const buildRulesFromForm = (): LeaveTypeRules => ({
    ...(entitlementDays ? { entitlementDays: Number(entitlementDays) || undefined } : {}),
    allocationBasis,
    requiresProbationComplete: requiresProbation || undefined,
    countsAsPaidLeave: countsAsPaidLeave || undefined,
    deductFromBalance: deductFromBalance || undefined,
    hideFromEmployeePortal: hideFromEmployeePortal || undefined,
    ...(payTiers.length > 0 ? { payTiers } : {}),
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setDescription('');
    setIsActive(true);
    loadRulesIntoForm({ allocationBasis: 'OLDEST_VISA_OR_HIRE' });
  };

  const closeModal = () => {
    setModalOpen(false);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const startEdit = (row: LeaveTypeRow) => {
    setEditingId(row.id);
    setName(row.name);
    setCode(row.code);
    setDescription(row.description ?? '');
    setIsActive(row.isActive);
    loadRulesIntoForm(row.rules ?? {});
    setModalOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    const rules = buildRulesFromForm();

    if (editingId) {
      const res = await fetch(`/api/hr/leave-types/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          isActive,
          rules,
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Save failed');
      else {
        toast.success('Leave type saved');
        closeModal();
        await load();
      }
    } else {
      const finalCode = (code.trim() || slugifyCode(name)).toUpperCase();
      const res = await fetch('/api/hr/leave-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: finalCode,
          description: description.trim() || null,
          isActive,
          rules,
        }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
      else {
        toast.success('Leave type created');
        closeModal();
        await load();
      }
    }
    setSaving(false);
  };

  const remove = async (row: LeaveTypeRow) => {
    if (!window.confirm(`Delete leave type "${row.name}"?`)) return;
    setSaving(true);
    const res = await fetch(`/api/hr/leave-types/${row.id}`, { method: 'DELETE' });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Leave type deleted');
      if (editingId === row.id) closeModal();
      await load();
    }
    setSaving(false);
  };

  if (!canManage) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.payroll.settings permission.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Leave types</h1>
          <p className="text-sm text-muted-foreground">
            Configure leave categories and pay rules (e.g. UAE sick leave tiers). Annual entitlement
            is prorated per calendar year from the allocation date configured below.
          </p>
        </div>
        <Button onClick={openCreateModal}>Add leave type</Button>
      </div>

      <section className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Leave types</h2>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No leave types yet.</p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{row.code}</p>
                  {row.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">{summarizeLeaveRules(row.rules ?? {})}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!row.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                  {row.rules?.hideFromEmployeePortal ? (
                    <Badge variant="outline">Hidden from portal</Badge>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => void remove(row)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit leave type' : 'New leave type'}
        description="Configure leave category, pay tiers, and how annual entitlement is allocated."
        size="lg"
        actions={
          <>
            <Button variant="outline" disabled={saving} onClick={closeModal}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create leave type'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Name</label>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editingId && !code.trim()) setCode(slugifyCode(e.target.value));
              }}
            />
          </div>
          {!editingId ? (
            <div>
              <label className={labelClass}>Code</label>
              <Input
                className="mt-1 font-mono text-sm"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Code: <span className="font-mono">{code}</span>
            </p>
          )}
          <div>
            <label className={labelClass}>Description</label>
            <Input className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <p className="text-sm font-medium">Pay rules</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Entitlement days</label>
                <Input
                  type="number"
                  min={1}
                  className="mt-1"
                  placeholder="e.g. 30"
                  value={entitlementDays}
                  onChange={(e) => setEntitlementDays(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Allocation from</label>
                <select
                  className={selectClass}
                  value={allocationBasis}
                  onChange={(e) => setAllocationBasis(e.target.value as LeaveAllocationBasis)}
                >
                  {LEAVE_ALLOCATION_BASIS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              For balance-deducting types, entitlement is prorated for the first calendar year from this
              date. Company-provided visa uses the oldest visa period start; otherwise hire date is used.
            </p>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={requiresProbation}
                  onChange={(e) => setRequiresProbation(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Paid tiers apply only after probation
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={countsAsPaidLeave}
                  onChange={(e) => setCountsAsPaidLeave(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Counts as paid leave (no salary deduction)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deductFromBalance}
                  onChange={(e) => setDeductFromBalance(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Deduct from leave balance
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hideFromEmployeePortal}
                  onChange={(e) => setHideFromEmployeePortal(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Hide from employee portal (HR-only assignment)
              </label>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className={labelClass}>Pay tiers (within entitlement)</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setPayTiers((t) => [...t, emptyTier()])}>
                  Add tier
                </Button>
              </div>
              {payTiers.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No tiers — uses full pay or unpaid based on checkbox above.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {payTiers.map((tier, idx) => (
                    <li key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="text-[10px] text-muted-foreground">From day</label>
                        <Input
                          type="number"
                          min={1}
                          value={tier.fromDay}
                          onChange={(e) =>
                            setPayTiers((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, fromDay: Number(e.target.value) || 1 } : r,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">To day</label>
                        <Input
                          type="number"
                          min={1}
                          value={tier.toDay}
                          onChange={(e) =>
                            setPayTiers((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, toDay: Number(e.target.value) || 1 } : r,
                              ),
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Pay %</label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={tier.payPercent}
                          onChange={(e) =>
                            setPayTiers((rows) =>
                              rows.map((r, i) =>
                                i === idx ? { ...r, payPercent: Number(e.target.value) || 0 } : r,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setPayTiers((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Example (UAE sick leave): days 1–15 at 100%, 16–45 at 50%, 46–90 at 0%.
              </p>
            </div>
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
        </div>
      </Modal>
    </HrPageChrome>
  );
}
