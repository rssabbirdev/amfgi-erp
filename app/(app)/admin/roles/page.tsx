'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { PERMISSION_GROUPS, ROLE_PRESET_LABELS, ROLE_PRESETS } from '@/lib/permissions';
import type { Column } from '@/components/ui/DataTable';
import {
  useGetRolesQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
} from '@/store/hooks';
import toast from 'react-hot-toast';

type Role = {
  id: string;
  name: string;
  slug: string;
  permissions: string[];
  isSystem: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

export default function AdminRolesPage() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const { data: roles = [], isFetching: loading } = useGetRolesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [createRole] = useCreateRoleMutation();
  const [updateRole] = useUpdateRoleMutation();
  const [deleteRole] = useDeleteRoleMutation();

  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPermissions(new Set());
    setModal(true);
  };

  const openEdit = (r: Role) => {
    setEditing(r);
    setName(r.name);
    setPermissions(new Set(r.permissions));
    setModal(true);
  };

  const togglePerm = (key: string) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyPreset = (preset: keyof typeof ROLE_PRESETS) => {
    setPermissions(new Set(ROLE_PRESETS[preset]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    const body = { name, permissions: Array.from(permissions) };

    try {
      if (editing) {
        await updateRole({ id: editing.id, data: body }).unwrap();
      } else {
        await createRole(body).unwrap();
      }
      setFormLoading(false);
      toast.success(editing ? 'Role updated' : 'Role created');
      setModal(false);
    } catch (error) {
      setFormLoading(false);
      const message = (error as { data?: { error?: string } }).data?.error ?? 'Save failed';
      toast.error(message);
    }
  };

  const handleDelete = async (r: Role) => {
    if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    try {
      await deleteRole({ id: r.id }).unwrap();
      toast.success('Role deleted');
    } catch (error) {
      const err = error as { status?: number; data?: { error?: string; details?: { assignmentCount?: number } } };
      const assignmentCount = err.data?.details?.assignmentCount;
      if (err.status === 409 && assignmentCount) {
        const force = confirm(
          `${assignmentCount} user${assignmentCount === 1 ? '' : 's'} still ${assignmentCount === 1 ? 'has' : 'have'} this role. Remove those assignments and delete the role?`
        );
        if (!force) return;
        try {
          await deleteRole({ id: r.id, hardDelete: true }).unwrap();
          toast.success('Role deleted');
          return;
        } catch (retryError) {
          const message =
            (retryError as { data?: { error?: string } }).data?.error ?? 'Delete failed';
          toast.error(message);
          return;
        }
      }
      const message = err.data?.error ?? 'Delete failed';
      toast.error(message);
    }
  };

  const columns: Column<Role>[] = [
    {
      key: 'name',
      header: 'Role name',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{r.name}</span>
          {r.isSystem ? (
            <Badge variant="secondary" className="font-normal">
              System
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.permissions.length} permission{r.permissions.length !== 1 ? 's' : ''}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(r)}>
            Edit
          </Button>
          {!r.isSystem ? (
            <Button type="button" size="sm" variant="destructive" onClick={() => void handleDelete(r)}>
              Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Role management</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Define granular permission sets for each role.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          Create role
        </Button>
      </header>

      <DataTable columns={columns} data={roles} loading={loading} emptyText="No roles found." searchKeys={['name']} />

      <Modal isOpen={modal} onClose={() => !formLoading && setModal(false)} title={editing ? 'Edit role' : 'Create role'} size="lg">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="role-name" className={labelClass}>
              Role name <span className="text-destructive">*</span>
              {editing?.isSystem ? (
                <span className="ml-2 normal-case text-amber-600 dark:text-amber-400">(system role)</span>
              ) : null}
            </label>
            <Input
              id="role-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Store keeper"
            />
          </div>

          <div className="space-y-2">
            <p className={labelClass}>Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROLE_PRESETS) as Array<keyof typeof ROLE_PRESETS>).map((preset) => (
                <Button key={preset} type="button" variant="outline" size="sm" onClick={() => applyPreset(preset)}>
                  {ROLE_PRESET_LABELS[preset]}
                </Button>
              ))}
              <Button type="button" variant="outline" size="sm" className="text-muted-foreground" onClick={() => setPermissions(new Set())}>
                Clear all
              </Button>
            </div>
          </div>

          <div className="max-h-96 space-y-4 overflow-y-auto pr-1">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.group}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.perms.map((p) => (
                    <label
                      key={p.key}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                        permissions.has(p.key)
                          ? 'border-primary/40 bg-primary/10 text-foreground'
                          : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={permissions.has(p.key)}
                        onChange={() => togglePerm(p.key)}
                        className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" disabled={formLoading} onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={formLoading}>
              {formLoading ? 'Saving…' : editing ? 'Update role' : 'Create role'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
