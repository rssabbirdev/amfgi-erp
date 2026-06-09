'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { readApiJson } from '@/lib/utils/readApiResponse';

type AllowanceType = { id: string; name: string; code: string; isActive: boolean };
type AllowanceRow = {
  id: string;
  allowanceTypeId: string;
  allowanceType: AllowanceType;
  amount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

function isActiveForMonth(row: AllowanceRow, month: string) {
  const monthStart = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const monthEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  if (row.effectiveFrom > monthEnd) return false;
  if (row.effectiveTo && row.effectiveTo < monthStart) return false;
  return true;
}

export default function EmployeeAllowancesPanel({
  employeeId,
  canEdit,
}: {
  employeeId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<AllowanceRow[]>([]);
  const [types, setTypes] = useState<AllowanceType[]>([]);
  const [allowanceTypeId, setAllowanceTypeId] = useState('');
  const [amount, setAmount] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const previewMonth = new Date().toISOString().slice(0, 7);

  const load = useCallback(async () => {
    const [allowRes, typeRes] = await Promise.all([
      fetch(`/api/hr/employees/${employeeId}/allowances`, { cache: 'no-store' }),
      fetch('/api/hr/salary-components', { cache: 'no-store' }),
    ]);
    const allowJson = await readApiJson<AllowanceRow[]>(allowRes);
    const typeJson = await readApiJson<AllowanceType[]>(typeRes);
    if (allowRes.ok && allowJson?.success) setRows((allowJson.data ?? []) as AllowanceRow[]);
    if (typeRes.ok && typeJson?.success) {
      const active = ((typeJson.data ?? []) as AllowanceType[]).filter((t) => t.isActive);
      setTypes(active);
      if (!allowanceTypeId && active[0]) setAllowanceTypeId(active[0].id);
    }
  }, [employeeId, allowanceTypeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTotal = useMemo(
    () =>
      rows
        .filter((row) => isActiveForMonth(row, previewMonth))
        .reduce((sum, row) => sum + row.amount, 0),
    [rows, previewMonth]
  );

  const resetForm = () => {
    setEditingId(null);
    setAmount('');
    setEffectiveTo('');
    setNotes('');
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    if (types[0]) setAllowanceTypeId(types[0].id);
  };

  const save = async () => {
    if (!allowanceTypeId) {
      toast.error('Select an allowance type');
      return;
    }
    if (!amount || Number(amount) < 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    const payload = {
      allowanceTypeId,
      amount: Number(amount),
      effectiveFrom,
      effectiveTo: effectiveTo.trim() || null,
      notes: notes.trim() || null,
    };

    const res = editingId
      ? await fetch(`/api/hr/employees/${employeeId}/allowances/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/hr/employees/${employeeId}/allowances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Save failed');
    } else {
      toast.success(editingId ? 'Allowance updated' : 'Allowance added');
      resetForm();
      setModalOpen(false);
      await load();
    }
    setSaving(false);
  };

  const startCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const startEdit = (row: AllowanceRow) => {
    setEditingId(row.id);
    setAllowanceTypeId(row.allowanceTypeId);
    setAmount(String(row.amount));
    setEffectiveFrom(row.effectiveFrom);
    setEffectiveTo(row.effectiveTo ?? '');
    setNotes(row.notes ?? '');
    setModalOpen(true);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Remove this allowance record?')) return;
    setSaving(true);
    const res = await fetch(`/api/hr/employees/${employeeId}/allowances/${id}`, {
      method: 'DELETE',
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Allowance removed');
      if (editingId === id) resetForm();
      await load();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Allowances</h3>
          <p className="text-xs text-muted-foreground">
            Type-wise monthly allowances. Payroll sums all active types for the month.
          </p>
        </div>
        <p className="text-sm tabular-nums">
          <span className="text-muted-foreground">This month total:</span>{' '}
          <span className="font-semibold">{activeTotal.toLocaleString()} AED</span>
        </p>
      </div>

      {canEdit && types.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          No allowance types yet. Create them under HR → Settings → Allowance types.
        </p>
      ) : null}

      {canEdit && types.length > 0 ? (
        <Button size="sm" variant="outline" onClick={startCreate}>
          Add allowance
        </Button>
      ) : null}

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No allowance records.</p>
        ) : (
          rows.map((row) => {
            const activeNow = isActiveForMonth(row, previewMonth);
            return (
              <div key={row.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {row.allowanceType.name}{' '}
                      <span className="font-mono text-xs text-muted-foreground">({row.allowanceType.code})</span>
                    </p>
                    <p className="mt-1 tabular-nums">{row.amount.toLocaleString()} AED / month</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.effectiveFrom}
                      {row.effectiveTo ? ` → ${row.effectiveTo}` : ' → ongoing'}
                      {!activeNow ? ' · not active this month' : ''}
                    </p>
                    {row.notes ? <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={saving} onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => void remove(row.id)}>
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        isOpen={canEdit && types.length > 0 && modalOpen}
        onClose={() => {
          if (!saving) {
            setModalOpen(false);
          }
        }}
        title={editingId ? 'Edit allowance' : 'Add allowance'}
        description="Type-wise monthly allowance for this employee."
        size="md"
        actions={
          <>
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add allowance'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Type</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={allowanceTypeId}
                disabled={Boolean(editingId)}
                onChange={(e) => setAllowanceTypeId(e.target.value)}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Amount (AED / month)</label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Effective from</label>
              <Input
                className="mt-1"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Effective to (optional)</label>
              <Input
                className="mt-1"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <Input className="mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
