'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import {
  EMPLOYEE_META_KIND_LABELS,
  EMPLOYEE_META_KINDS,
  type EmployeeMetaKind,
  type EmployeeMetaOptionRow,
} from '@/lib/hr/employeeMetaOptions';
import { readApiJson } from '@/lib/utils/readApiResponse';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

function MetaSection({
  kind,
  canEdit,
  rows,
  onReload,
}: {
  kind: EmployeeMetaKind;
  canEdit: boolean;
  rows: EmployeeMetaOptionRow[];
  onReload: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sectionRows = rows.filter((row) => row.kind === kind);

  const reset = () => {
    setEditingId(null);
    setName('');
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    if (editingId) {
      const res = await fetch(`/api/hr/employee-meta-options/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Save failed');
      else {
        toast.success(`${EMPLOYEE_META_KIND_LABELS[kind]} saved`);
        reset();
        await onReload();
      }
    } else {
      const res = await fetch('/api/hr/employee-meta-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name: name.trim() }),
      });
      const json = await readApiJson(res);
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
      else {
        toast.success(`${EMPLOYEE_META_KIND_LABELS[kind]} created`);
        reset();
        await onReload();
      }
    }
    setSaving(false);
  };

  const toggleActive = async (row: EmployeeMetaOptionRow) => {
    setSaving(true);
    const res = await fetch(`/api/hr/employee-meta-options/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Update failed');
    else await onReload();
    setSaving(false);
  };

  const remove = async (row: EmployeeMetaOptionRow) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    setSaving(true);
    const res = await fetch(`/api/hr/employee-meta-options/${row.id}`, { method: 'DELETE' });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      if (editingId === row.id) reset();
      await onReload();
    }
    setSaving(false);
  };

  return (
    <section className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{EMPLOYEE_META_KIND_LABELS[kind]}</h2>
      </div>
      {canEdit ? (
        <div className="border-b border-border px-4 py-3 space-y-2">
          <label className={labelClass}>{editingId ? 'Edit name' : 'Add new'}</label>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-xs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. ${
                kind === 'DESIGNATION'
                  ? 'Supervisor'
                  : kind === 'DEPARTMENT'
                    ? 'Operations'
                    : kind === 'SIGNATURE_GROUP'
                      ? 'Steel Section'
                      : 'Permanent'
              }`}
            />
            <Button size="sm" disabled={saving} onClick={() => void save()}>
              {editingId ? 'Save' : 'Add'}
            </Button>
            {editingId ? (
              <Button size="sm" variant="outline" disabled={saving} onClick={reset}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="divide-y">
        {sectionRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No options yet.</p>
        ) : (
          sectionRows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-sm font-medium">{row.name}</span>
              <div className="flex items-center gap-2">
                {!row.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                {canEdit ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setEditingId(row.id);
                        setName(row.name);
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void toggleActive(row)}>
                      {row.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={saving} onClick={() => void remove(row)}>
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function EmploymentOptionsSettingsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = session?.user?.isSuperAdmin || perms.includes('hr.employee.edit');

  const [rows, setRows] = useState<EmployeeMetaOptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hr/employee-meta-options', { cache: 'no-store' });
    const json = await readApiJson<EmployeeMetaOptionRow[]>(res);
    if (res.ok && json?.success) setRows((json.data ?? []) as EmployeeMetaOptionRow[]);
    else toast.error(json?.error ?? 'Failed to load employment options');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.employee.edit permission.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Employment options</h1>
        <p className="text-sm text-muted-foreground">
          Manage designation, department, employment type, and signature group lists used on employee profiles and
          attendance signature sheets.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          {EMPLOYEE_META_KINDS.map((kind) => (
            <MetaSection key={kind} kind={kind} canEdit={canManage} rows={rows} onReload={load} />
          ))}
        </div>
      )}
    </HrPageChrome>
  );
}
