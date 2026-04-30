'use client';

import { useState }  from 'react';
import { Button }               from '@/components/ui/Button';
import DataTable                from '@/components/ui/DataTable';
import { Badge }                from '@/components/ui/Badge';
import Modal                    from '@/components/ui/Modal';
import toast                    from 'react-hot-toast';
import type { Column }          from '@/components/ui/DataTable';
import {
  useGetUsersQuery,
  useGetCompaniesQuery,
  useGetRolesQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
} from '@/store/hooks';

type Company = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type Role = {
  id: string;
  name: string;
  slug: string;
  permissions: string[];
  isSystem: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type UserCompanyAccessItem = {
  userId: string;
  companyId: string;
  roleId: string;
  role?: { id: string; name: string; permissions: string[] };
  company?: { id: string; name: string; slug: string };
};

type User = {
  id: string;
  name: string;
  email: string;
  password?: string;
  image?: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  activeCompanyId?: string;
  companyAccess?: UserCompanyAccessItem[];
  createdAt: string | Date;
  updatedAt?: string | Date;
};

export default function AdminUsersPage() {
  const [modal,       setModal]       = useState(false);
  const [editing,     setEditing]     = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const { data: users = [], isFetching: usersLoading } = useGetUsersQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { data: companies = [], isFetching: companiesLoading } = useGetCompaniesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { data: roles = [], isFetching: rolesLoading } = useGetRolesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  const loading = usersLoading || companiesLoading || rolesLoading;

  // Form fields
  const [name,         setName]         = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // companyAccess: { companyId, roleId }[]
  const [accessRows, setAccessRows] = useState<{ companyId: string; roleId: string }[]>([]);

  const openCreate = () => {
    setEditing(null);
    setName(''); setEmail(''); setPassword('');
    setIsSuperAdmin(false); setAccessRows([]);
    setModal(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setName(u.name); setEmail(u.email); setPassword('');
    setIsSuperAdmin(u.isSuperAdmin);
    setAccessRows(
      (u.companyAccess ?? []).map((a) => ({
        companyId: a.companyId,
        roleId:    a.roleId,
      }))
    );
    setModal(true);
  };

  const addAccessRow = () =>
    setAccessRows((prev) => [...prev, { companyId: companies[0]?.id ?? '', roleId: roles[0]?.id ?? '' }]);

  const removeAccessRow = (i: number) =>
    setAccessRows((prev) => prev.filter((_, idx) => idx !== i));

  const updateAccessRow = (i: number, field: 'companyId' | 'roleId', value: string) =>
    setAccessRows((prev) => prev.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const body: Record<string, unknown> = {
      name,
      isSuperAdmin,
      companyAccess: accessRows.filter((r) => r.companyId && r.roleId),
    };
    if (!editing) body.email = email;
    if (password) body.password = password;

    try {
      if (editing) {
        await updateUser({ id: editing.id, data: body }).unwrap();
      } else {
        await createUser(body as Partial<User> & { password: string }).unwrap();
      }
      setFormLoading(false);
      toast.success(editing ? 'User updated' : 'User created');
      setModal(false);
    } catch (error: any) {
      setFormLoading(false);
      toast.error(error?.data?.error ?? 'Save failed');
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      await updateUser({ id: u.id, data: { isActive: !u.isActive } }).unwrap();
      toast.success(u.isActive ? 'User deactivated' : 'User activated');
    } catch (error: any) {
      toast.error(error?.data?.error ?? 'Update failed');
    }
  };

  const columns: Column<User>[] = [
    { key: 'name',  header: 'Name',  sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'isSuperAdmin', header: 'Role',
      render: (u) => u.isSuperAdmin
        ? <Badge label="Super Admin" variant="orange" />
        : <Badge label="User" variant="gray" />,
    },
    {
      key: 'companyAccess', header: 'Company Access',
      render: (u) => u.isSuperAdmin
        ? <span className="text-slate-400 text-xs">All companies</span>
        : (u.companyAccess ?? []).length
          ? (
            <div className="flex gap-1 flex-wrap">
              {(u.companyAccess ?? []).map((a, i) => (
                <span key={i} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                  {a.company?.name} / {a.role?.name}
                </span>
              ))}
            </div>
          )
          : <span className="text-slate-500 text-xs">No access</span>,
    },
    {
      key: 'isActive', header: 'Status',
      render: (u) => <Badge label={u.isActive ? 'Active' : 'Inactive'} variant={u.isActive ? 'green' : 'red'} />,
    },
    {
      key: 'actions', header: '',
      render: (u) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>Edit</Button>
          <Button
            size="sm"
            variant={u.isActive ? 'danger' : 'secondary'}
            onClick={() => handleToggleActive(u)}
          >
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} users registered</p>
        </div>
        <Button onClick={openCreate}>+ Add User</Button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        emptyText="No users found."
        searchKeys={['name', 'email']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit User' : 'Create User'} size="lg">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email {!editing && '*'}</label>
              <input
                type="email"
                required={!editing}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editing}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                {editing ? 'New Password (leave blank to keep)' : 'Password *'}
              </label>
              <input
                type="password"
                required={!editing}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Super Admin toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setIsSuperAdmin((v) => !v)}
              className={[
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                isSuperAdmin ? 'bg-emerald-600' : 'bg-slate-700',
              ].join(' ')}
            >
              <span className={[
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                isSuperAdmin ? 'translate-x-6' : 'translate-x-1',
              ].join(' ')} />
            </div>
            <span className="text-sm text-slate-300">
              Super Admin <span className="text-slate-500">(full access to all companies)</span>
            </span>
          </label>

          {/* Company Access rows */}
          {!isSuperAdmin && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Company Access</label>
                <Button type="button" size="sm" variant="ghost" onClick={addAccessRow}>+ Add</Button>
              </div>
              {accessRows.length === 0 && (
                <p className="text-xs text-slate-500 py-2">No company access assigned. Click + Add to grant access.</p>
              )}
              <div className="space-y-2">
                {accessRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={row.companyId}
                      onChange={(e) => updateAccessRow(i, 'companyId', e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Select company…</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                      value={row.roleId}
                      onChange={(e) => updateAccessRow(i, 'roleId', e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="">Select role…</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeAccessRow(i)}
                      className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>
              {editing ? 'Update User' : 'Create User'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
