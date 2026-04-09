'use client';

import { useEffect, useState }  from 'react';
import { Button }               from '@/components/ui/Button';
import DataTable                from '@/components/ui/DataTable';
import { Badge }                from '@/components/ui/Badge';
import Modal                    from '@/components/ui/Modal';
import toast                    from 'react-hot-toast';
import { PERMISSION_GROUPS, ROLE_PRESETS } from '@/lib/permissions';
import type { Permission }      from '@/lib/permissions';
import type { Column }          from '@/components/ui/DataTable';

type Role = {
  id: string;
  name: string;
  slug: string;
  permissions: string[];
  isSystem: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export default function AdminRolesPage() {
  const [roles,       setRoles]       = useState<Role[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [editing,     setEditing]     = useState<Role | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [name,        setName]        = useState('');
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  const fetchRoles = () => {
    setLoading(true);
    fetch('/api/roles')
      .then((r) => r.json())
      .then((j) => { setRoles(j.data ?? []); setLoading(false); });
  };

  useEffect(() => { fetchRoles(); }, []);

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
      if (next.has(key)) next.delete(key); else next.add(key);
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

    const url    = editing ? `/api/roles/${editing.id}` : '/api/roles';
    const method = editing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    setFormLoading(false);
    if (res.ok) {
      toast.success(editing ? 'Role updated' : 'Role created');
      setModal(false);
      fetchRoles();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Save failed');
    }
  };

  const handleDelete = async (r: Role) => {
    if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/roles/${r.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Role deleted');
      fetchRoles();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Delete failed');
    }
  };

  const columns: Column<Role>[] = [
    {
      key: 'name', header: 'Role Name', sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{r.name}</span>
          {r.isSystem && <Badge label="System" variant="blue" />}
        </div>
      ),
    },
    {
      key: 'permissions', header: 'Permissions',
      render: (r) => (
        <span className="text-slate-400 text-sm">{r.permissions.length} permission{r.permissions.length !== 1 ? 's' : ''}</span>
      ),
    },
    {
      key: 'actions', header: '',
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
          {!r.isSystem && (
            <Button size="sm" variant="danger" onClick={() => handleDelete(r)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Role Management</h1>
          <p className="text-slate-400 text-sm mt-1">Define granular permission sets for each role.</p>
        </div>
        <Button onClick={openCreate}>+ Create Role</Button>
      </div>

      <DataTable
        columns={columns}
        data={roles}
        loading={loading}
        emptyText="No roles found."
        searchKeys={['name']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Role' : 'Create Role'} size="lg">
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Role Name * {editing?.isSystem && <span className="text-xs text-amber-400">(System Role)</span>}
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Store Keeper"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* Preset buttons */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Quick presets:</p>
              <div className="flex gap-2 flex-wrap">
                {Object.keys(ROLE_PRESETS).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPreset(preset as keyof typeof ROLE_PRESETS)}
                    className="px-3 py-1 rounded-full text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition-colors capitalize"
                  >
                    {preset.replace('_', ' ')}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPermissions(new Set())}
                  className="px-3 py-1 rounded-full text-xs bg-slate-700 text-slate-500 hover:bg-slate-600 hover:text-white transition-colors"
                >
                  Clear all
                </button>
              </div>
            </div>

          {/* Permission checkboxes */}
          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{group.group}</p>
                <div className="grid grid-cols-2 gap-2">
                  {group.perms.map((p) => (
                    <label
                      key={p.key}
                      className={[
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm',
                        permissions.has(p.key)
                          ? 'bg-emerald-600/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={permissions.has(p.key)}
                        onChange={() => togglePerm(p.key)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>
              {editing ? 'Update Role' : 'Create Role'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
