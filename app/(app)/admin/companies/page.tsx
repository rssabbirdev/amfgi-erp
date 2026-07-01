'use client';

import { useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import type { Column } from '@/components/ui/DataTable';
import type { Company } from '@/store/api/adminEndpoints/companies';
import { useGetCompaniesQuery, useCreateCompanyMutation, useUpdateCompanyMutation, useDeleteCompanyMutation } from '@/store/hooks';
import toast from 'react-hot-toast';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

const textareaClass =
  'min-h-[5.5rem] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background resize-none';

export default function AdminCompaniesPage() {
  const { data: companies = [], isLoading: companiesLoading } = useGetCompaniesQuery(
    { includeInactive: true },
    { refetchOnMountOrArgChange: 30 },
  );
  const [createCompany, { isLoading: isCreating }] = useCreateCompanyMutation();
  const [updateCompany, { isLoading: isUpdating }] = useUpdateCompanyMutation();
  const [deleteCompany, { isLoading: isDeleting }] = useDeleteCompanyMutation();

  const [modal, setModal] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [externalCompanyId, setExternalCompanyId] = useState('');

  const formBusy = isCreating || isUpdating;

  const extractApiError = (err: unknown, fallback: string) => {
    const message = (err as { data?: { error?: string } }).data?.error;
    return typeof message === 'string' && message.trim() ? message : fallback;
  };

  const openCreate = () => {
    setEditing(null);
    setName('');
    setSlug('');
    setDescription('');
    setExternalCompanyId('');
    setModal(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setName(c.name);
    setDescription(c.description ?? '');
    setExternalCompanyId(c.externalCompanyId ?? '');
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const body = editing
      ? { name, description, externalCompanyId }
      : {
          name,
          description,
          externalCompanyId,
          ...(slug.trim() ? { slug: slug.trim() } : {}),
        };

    try {
      if (editing) {
        await updateCompany({ id: editing.id, data: body }).unwrap();
        toast.success('Company updated');
      } else {
        await createCompany(body).unwrap();
        toast.success('Company created');
      }
      setModal(false);
    } catch (err) {
      const message = (err as { data?: { error?: string } }).data?.error ?? 'Save failed';
      toast.error(message);
    }
  };

  const handleToggleActive = async (c: Company) => {
    try {
      await updateCompany({
        id: c.id,
        data: { isActive: !c.isActive },
      }).unwrap();
      toast.success(c.isActive ? 'Company deactivated' : 'Company activated');
    } catch {
      toast.error('Failed to update company');
    }
  };

  const handleDelete = async () => {
    if (!deletingCompany) return;
    try {
      await deleteCompany(deletingCompany.id).unwrap();
      toast.success('Company deleted');
      setDeletingCompany(null);
    } catch (err) {
      toast.error(extractApiError(err, 'Failed to delete company'));
    }
  };

  const columns: Column<Company>[] = [
    { key: 'name', header: 'Company name', sortable: true },
    {
      key: 'slug',
      header: 'Slug',
      render: (c) => (
        <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{c.slug}</code>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (c) => <span className="text-sm text-muted-foreground">{c.description || '—'}</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (c) =>
        c.isActive ? (
          <Badge variant="secondary" className="font-normal">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            Inactive
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(c)}>
            Edit
          </Button>
          {c.canDelete ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setDeletingCompany(c)}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={c.isActive ? 'outline' : 'default'}
            onClick={() => void handleToggleActive(c)}
          >
            {c.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Company management</h1>
          <p className="text-sm text-muted-foreground">
            Each company has its own isolated data scope. {companies.length}{' '}
            {companies.length === 1 ? 'company' : 'companies'} registered.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/companies/company"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'inline-flex')}
          >
            Active company profile
          </Link>
          <Button type="button" size="sm" onClick={openCreate}>
            Add company
          </Button>
        </div>
      </header>

      <DataTable
        columns={columns}
        data={companies}
        loading={companiesLoading}
        emptyText="No companies registered yet."
        searchKeys={['name', 'slug']}
        preferenceKey="admin-companies"
      />

      <Modal
        isOpen={modal}
        onClose={() => !formBusy && setModal(false)}
        title={editing ? 'Edit company' : 'Create company'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {editing ? (
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                Slug: <code className="text-foreground">{editing.slug}</code>
              </p>
            </div>
          ) : (
            <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                Optional <strong className="text-foreground">slug</strong> sets the URL-safe identifier. Leave it blank
                to generate one from the company name. Slug cannot be changed after creation.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="company-name" className={labelClass}>
              Company name <span className="text-destructive">*</span>
            </label>
            <Input
              id="company-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Almuraqib Fiber Glass Industry"
            />
          </div>
          {!editing ? (
            <div className="space-y-2">
              <label htmlFor="company-slug" className={labelClass}>
                Slug (optional)
              </label>
              <Input
                id="company-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. acme-fiberglass — lowercase letters, numbers, hyphens"
                className="font-mono text-sm"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Non-ASCII characters are stripped server-side. Empty = derived from name above.
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="company-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="company-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description"
              className={textareaClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="company-external-id" className={labelClass}>
              External company ID
            </label>
            <Input
              id="company-external-id"
              value={externalCompanyId}
              onChange={(e) => setExternalCompanyId(e.target.value)}
              placeholder="Used by external Project Management sync"
            />
          </div>
          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" disabled={formBusy} onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={formBusy}>
              {formBusy ? 'Saving…' : editing ? 'Update company' : 'Create company'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deletingCompany)}
        onClose={() => !isDeleting && setDeletingCompany(null)}
        title="Delete company"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Permanently delete <strong className="text-foreground">{deletingCompany?.name}</strong>? This is only
            available for companies with no jobs, stock, customers, employees, or other operational data.
          </p>
          <div className="flex gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isDeleting}
              onClick={() => setDeletingCompany(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
            >
              {isDeleting ? 'Deleting…' : 'Delete company'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
