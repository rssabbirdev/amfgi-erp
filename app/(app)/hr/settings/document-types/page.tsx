'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import {
  canHrDocumentTypeCreate,
  canHrDocumentTypeDelete,
  canHrDocumentTypeEdit,
  canHrDocumentTypeView,
} from '@/lib/hr/documentTypePermissions';
import { type HrDocumentType, useGetHrDocumentTypesQuery } from '@/store/api/endpoints/hr';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';
const checkClass =
  'size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export default function HrDocumentTypesPage() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<HrDocumentType | null>(null);

  const canView = session?.user ? canHrDocumentTypeView(session.user) : false;
  const canCreate = session?.user ? canHrDocumentTypeCreate(session.user) : false;
  const canEdit = session?.user ? canHrDocumentTypeEdit(session.user) : false;
  const canDelete = session?.user ? canHrDocumentTypeDelete(session.user) : false;
  const canMutate = canCreate || canEdit || canDelete;
  const { data: list = [], isLoading: loading, refetch } = useGetHrDocumentTypesQuery(undefined, {
    skip: !canView,
  });

  const createType = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canCreate || saving) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      slug: String(fd.get('slug') ?? '').trim(),
      requiresVisaPeriod: fd.get('requiresVisaPeriod') === 'on',
      requiresExpiry: fd.get('requiresExpiry') === 'on',
      defaultAlertDaysBeforeExpiry: Number(fd.get('defaultAlertDaysBeforeExpiry') ?? 30) || 30,
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
      isActive: fd.get('isActive') === 'on',
    };
    const res = await fetch('/api/hr/document-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
    else {
      toast.success('Document type created');
      setShowCreate(false);
      await refetch();
    }
    setSaving(false);
  };

  const saveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || !editing || saving) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get('name') ?? '').trim(),
      slug: String(fd.get('slug') ?? '').trim(),
      requiresVisaPeriod: fd.get('requiresVisaPeriod') === 'on',
      requiresExpiry: fd.get('requiresExpiry') === 'on',
      defaultAlertDaysBeforeExpiry: Number(fd.get('defaultAlertDaysBeforeExpiry') ?? 30) || 30,
      sortOrder: Number(fd.get('sortOrder') ?? 0) || 0,
      isActive: fd.get('isActive') === 'on',
    };
    const res = await fetch(`/api/hr/document-types/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Update failed');
    else {
      toast.success('Document type saved');
      setEditing(null);
      await refetch();
    }
    setSaving(false);
  };

  const removeType = async (id: string) => {
    if (!canDelete || saving || !window.confirm('Delete this document type?')) return;
    setSaving(true);
    const res = await fetch(`/api/hr/document-types/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Document type removed');
      if (editing?.id === id) setEditing(null);
      await refetch();
    }
    setSaving(false);
  };

  const closeCreate = () => {
    if (!saving) setShowCreate(false);
  };
  const closeEdit = () => {
    if (!saving) setEditing(null);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Document types</CardTitle>
            <CardDescription>You do not have permission to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          <div className="h-7 w-48 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-full max-w-lg animate-pulse rounded bg-muted" />
        </div>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const formFields = (mode: 'create' | 'edit') => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor={mode === 'create' ? 'dt-name' : 'dt-edit-name'} className={labelClass}>
          Name
        </label>
        <Input
          id={mode === 'create' ? 'dt-name' : 'dt-edit-name'}
          name="name"
          required
          defaultValue={mode === 'edit' && editing ? editing.name : undefined}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor={mode === 'create' ? 'dt-slug' : 'dt-edit-slug'} className={labelClass}>
          Slug
        </label>
        <Input
          id={mode === 'create' ? 'dt-slug' : 'dt-edit-slug'}
          name="slug"
          required
          className="font-mono text-sm"
          defaultValue={mode === 'edit' && editing ? editing.slug : undefined}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          name="requiresVisaPeriod"
          type="checkbox"
          className={checkClass}
          defaultChecked={mode === 'edit' && editing ? editing.requiresVisaPeriod : false}
        />
        <span className="text-sm text-foreground">Requires visa period</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          name="requiresExpiry"
          type="checkbox"
          className={checkClass}
          defaultChecked={mode === 'edit' && editing ? editing.requiresExpiry : true}
        />
        <span className="text-sm text-foreground">Requires expiry date</span>
      </label>
      <div className="space-y-2">
        <label htmlFor={mode === 'create' ? 'dt-alert' : 'dt-edit-alert'} className={labelClass}>
          Alert days
        </label>
        <Input
          id={mode === 'create' ? 'dt-alert' : 'dt-edit-alert'}
          name="defaultAlertDaysBeforeExpiry"
          type="number"
          min={0}
          max={3650}
          defaultValue={mode === 'edit' && editing ? editing.defaultAlertDaysBeforeExpiry : 30}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor={mode === 'create' ? 'dt-order' : 'dt-edit-order'} className={labelClass}>
          Sort order
        </label>
        <Input
          id={mode === 'create' ? 'dt-order' : 'dt-edit-order'}
          name="sortOrder"
          type="number"
          defaultValue={mode === 'edit' && editing ? editing.sortOrder : 0}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
        <input
          name="isActive"
          type="checkbox"
          className={checkClass}
          defaultChecked={mode === 'edit' && editing ? editing.isActive : true}
        />
        <span className="text-sm text-foreground">Active</span>
      </label>
    </div>
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Document types</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">HR document catalog for your company.</p>
        </div>
        {canCreate ? (
          <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
            New type
          </Button>
        ) : null}
      </header>

      {showCreate && canCreate ? (
        <Modal isOpen onClose={closeCreate} title="Create document type" size="lg">
          <form onSubmit={createType} className="space-y-4">
            {formFields('create')}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeCreate} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create type'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing && canEdit ? (
        <Modal isOpen onClose={closeEdit} title="Edit document type" size="lg">
          <form key={editing.id} onSubmit={saveEdit} className="space-y-4">
            {formFields('edit')}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeEdit} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Rules</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                {canMutate ? <th className="w-36 px-4 py-3">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={canMutate ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">
                    No document types yet.
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.slug}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.requiresVisaPeriod ? 'Visa ' : ''}
                      {r.requiresExpiry ? 'Expiry ' : ''}
                      <span className="text-muted-foreground/70">· alert {r.defaultAlertDaysBeforeExpiry}d</span>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">{r.sortOrder}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.isActive ? 'active' : 'inactive'}</td>
                    {canMutate ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {canEdit ? (
                            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setEditing(r)}>
                              Edit
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-destructive"
                              onClick={() => void removeType(r.id)}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
