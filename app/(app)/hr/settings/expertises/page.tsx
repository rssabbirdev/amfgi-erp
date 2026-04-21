'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface Row {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export default function HrExpertisesPage() {
  const { data: session } = useSession();
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view') || perms.includes('hr.employee.edit');
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const load = async () => {
    const res = await fetch('/api/hr/expertises', { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) setList(json.data);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) {
        if (!cancelled) setLoading(false);
        return;
      }
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const onCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
      isActive: fd.get('isActive') === 'on',
    };
    const res = await fetch('/api/hr/expertises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
    else {
      toast.success('Expertise created');
      setShowCreate(false);
      await load();
    }
    setSaving(false);
  };

  const onSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || !editing || saving) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
      isActive: fd.get('isActive') === 'on',
    };
    const res = await fetch(`/api/hr/expertises/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Update failed');
    else {
      toast.success('Expertise saved');
      setEditing(null);
      await load();
    }
    setSaving(false);
  };

  const onDelete = async (id: string) => {
    if (!canEdit || saving || !window.confirm('Delete this expertise?')) return;
    setSaving(true);
    const res = await fetch(`/api/hr/expertises/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Expertise deleted');
      if (editing?.id === id) setEditing(null);
      await load();
    }
    setSaving(false);
  };

  if (!canView) return <div className="text-slate-400">Forbidden</div>;
  if (loading) return <div className="text-slate-400">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Expertise catalog</h1>
          <p className="text-sm text-slate-400">Skills used in employee matching and schedule suggestions</p>
        </div>
        {canEdit && <Button type="button" onClick={() => setShowCreate(true)}>New expertise</Button>}
      </div>

      {showCreate && canEdit && (
        <Modal isOpen onClose={() => (!saving ? setShowCreate(false) : undefined)} title="Create expertise" size="md">
          <form onSubmit={onCreate} className="space-y-4">
            <label className="block">
              <span className="text-xs text-slate-500">Name</span>
              <input name="name" required className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Sort order</span>
              <input name="sortOrder" type="number" defaultValue={0} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white" />
            </label>
            <label className="flex items-center gap-2">
              <input name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
              <span className="text-sm text-slate-300">Active</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create'}</Button>
            </div>
          </form>
        </Modal>
      )}

      {editing && canEdit && (
        <Modal isOpen onClose={() => (!saving ? setEditing(null) : undefined)} title="Edit expertise" size="md">
          <form key={editing.id} onSubmit={onSave} className="space-y-4">
            <label className="block">
              <span className="text-xs text-slate-500">Name</span>
              <input name="name" required defaultValue={editing.name} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Sort order</span>
              <input name="sortOrder" type="number" defaultValue={editing.sortOrder} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white" />
            </label>
            <label className="flex items-center gap-2">
              <input name="isActive" type="checkbox" defaultChecked={editing.isActive} className="h-4 w-4" />
              <span className="text-sm text-slate-300">Active</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/40">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 bg-slate-950/80 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Status</th>
              {canEdit && <th className="px-4 py-3 w-36">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {list.length === 0 ? (
              <tr><td colSpan={canEdit ? 4 : 3} className="px-4 py-8 text-center text-slate-500">No expertise items yet.</td></tr>
            ) : (
              list.map((r) => (
                <tr key={r.id} className="text-slate-200">
                  <td className="px-4 py-3 font-medium text-white">{r.name}</td>
                  <td className="px-4 py-3 text-xs">{r.sortOrder}</td>
                  <td className="px-4 py-3 text-xs">{r.isActive ? 'active' : 'inactive'}</td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" className="text-xs font-medium text-emerald-400 hover:text-emerald-300" onClick={() => setEditing(r)}>Edit</button>
                        <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => void onDelete(r.id)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
