'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { readApiJson } from '@/lib/utils/readApiResponse';

type ComponentKind = 'EARNING' | 'DEDUCTION';
type ApplicationMode = 'FIXED_MONTHLY' | 'ATTENDANCE_PRESENT';

type SalaryComponentRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  componentKind: ComponentKind;
  applicationMode: ApplicationMode;
  isActive: boolean;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

function slugifyCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function kindLabel(kind: ComponentKind) {
  return kind === 'DEDUCTION' ? 'Deduction' : 'Earning';
}

function applicationLabel(mode: ApplicationMode) {
  return mode === 'FIXED_MONTHLY' ? 'Fixed monthly' : 'Present days';
}

export default function SalaryComponentPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = session?.user?.isSuperAdmin || perms.includes('hr.payroll.settings');

  const [rows, setRows] = useState<SalaryComponentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [componentKind, setComponentKind] = useState<ComponentKind>('EARNING');
  const [applicationMode, setApplicationMode] = useState<ApplicationMode>('ATTENDANCE_PRESENT');
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hr/salary-components', { cache: 'no-store' });
    const json = await readApiJson<SalaryComponentRow[]>(res);
    if (res.ok && json?.success) setRows((json.data ?? []) as SalaryComponentRow[]);
    else toast.error(json?.error ?? 'Failed to load salary components');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCode('');
    setDescription('');
    setComponentKind('EARNING');
    setApplicationMode('ATTENDANCE_PRESENT');
    setIsActive(true);
  };

  const startEdit = (row: SalaryComponentRow) => {
    setEditingId(row.id);
    setName(row.name);
    setCode(row.code);
    setDescription(row.description ?? '');
    setComponentKind(row.componentKind);
    setApplicationMode(row.applicationMode);
    setIsActive(row.isActive);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      componentKind,
      applicationMode,
      isActive,
    };

    if (editingId) {
      const res = await fetch(`/api/hr/salary-components/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Save failed');
      else {
        toast.success('Salary component saved');
        resetForm();
        await load();
      }
    } else {
      const finalCode = (code.trim() || slugifyCode(name)).toUpperCase();
      const res = await fetch('/api/hr/salary-components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, code: finalCode }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
      else {
        toast.success('Salary component created');
        resetForm();
        await load();
      }
    }
    setSaving(false);
  };

  const remove = async (row: SalaryComponentRow) => {
    if (!window.confirm(`Delete salary component "${row.name}"?`)) return;
    setSaving(true);
    const res = await fetch(`/api/hr/salary-components/${row.id}`, { method: 'DELETE' });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Salary component deleted');
      if (editingId === row.id) resetForm();
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
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Salary components</h1>
        <p className="text-sm text-muted-foreground">
          Define earnings and deductions (housing, transport, loans, etc.). Assign amounts per employee on
          their profile. Choose whether each component is added to salary directly each month or prorated by
          present days.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold">{editingId ? 'Edit component' : 'New salary component'}</h2>
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
          <div>
            <label className={labelClass}>Type</label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={componentKind}
              onChange={(e) => setComponentKind(e.target.value as ComponentKind)}
            >
              <option value="EARNING">Earning (adds to pay)</option>
              <option value="DEDUCTION">Deduction (reduces pay)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Application</label>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={applicationMode}
              onChange={(e) => setApplicationMode(e.target.value as ApplicationMode)}
            >
              <option value="FIXED_MONTHLY">Fixed monthly — full amount added/deducted from salary</option>
              <option value="ATTENDANCE_PRESENT">
                Present days — prorated by attendance present days in the month
              </option>
            </select>
          </div>
          <div className="flex items-end pb-1">
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
          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
            </Button>
            {editingId ? (
              <Button variant="outline" disabled={saving} onClick={resetForm}>
                Cancel
              </Button>
            ) : null}
          </div>
        </section>

        <section className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Components</h2>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No salary components yet.</p>
          ) : (
            <div className="divide-y">
              {rows.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{row.code}</p>
                    {row.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant={row.componentKind === 'DEDUCTION' ? 'destructive' : 'secondary'}>
                        {kindLabel(row.componentKind)}
                      </Badge>
                      <Badge variant="outline">{applicationLabel(row.applicationMode)}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!row.isActive ? <Badge variant="outline">Inactive</Badge> : null}
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
      </div>
    </HrPageChrome>
  );
}
