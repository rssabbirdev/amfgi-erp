'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { isEmployeeSelfServiceAccount } from '@/lib/auth/selfService';
import { dedupeUserCompanyAccess } from '@/lib/auth/syncUserCompanyAccess';
import { isSuperAdminSelfTarget } from '@/lib/auth/userSelfProtection';
import { cn } from '@/lib/utils';
import type { Column } from '@/components/ui/DataTable';
import type { User } from '@/store/api/adminEndpoints/users';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import {
  useGetUsersPageQuery,
  useGetCompaniesQuery,
  useGetRolesQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  USER_PAGE_SIZE_OPTIONS,
} from '@/store/hooks';
import toast from 'react-hot-toast';

type UserTab = 'erp' | 'self-service';
type StatusFilter = 'all' | 'active' | 'inactive';

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

const checkClass =
  'h-4 w-4 rounded border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

type CompanyAccessGroup = { companyId: string; roleIds: string[] };

function groupCompanyAccess(access: User['companyAccess']): CompanyAccessGroup[] {
  const grouped = new Map<string, string[]>();
  for (const row of access ?? []) {
    const roleIds = grouped.get(row.companyId) ?? [];
    if (!roleIds.includes(row.roleId)) roleIds.push(row.roleId);
    grouped.set(row.companyId, roleIds);
  }
  return [...grouped.entries()].map(([companyId, roleIds]) => ({ companyId, roleIds }));
}

function flattenCompanyAccess(groups: CompanyAccessGroup[]): { companyId: string; roleId: string }[] {
  return groups.flatMap((group) =>
    group.roleIds.filter(Boolean).map((roleId) => ({ companyId: group.companyId, roleId }))
  );
}

function formatCompanyAccessLabel(access: User['companyAccess']): string {
  const grouped = new Map<string, string[]>();
  for (const row of access ?? []) {
    const companyName = row.company?.name ?? row.companyId;
    const roles = grouped.get(companyName) ?? [];
    if (row.role?.name && !roles.includes(row.role.name)) roles.push(row.role.name);
    grouped.set(companyName, roles);
  }
  return [...grouped.entries()]
    .map(([companyName, roleNames]) => `${companyName}: ${roleNames.join(', ')}`)
    .join(' · ');
}

const selectClass =
  'h-9 w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const formSelectClass =
  'flex-1 min-h-9 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [userTab, setUserTab] = useState<UserTab>('erp');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const deferredSearch = useDeferredValue(searchQuery);

  const { data: usersPage, isLoading: usersLoading } = useGetUsersPageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      search: deferredSearch,
      status: statusFilter,
      tab: userTab,
      companyId: companyFilter,
    },
    { refetchOnMountOrArgChange: 30 },
  );
  const users = usersPage?.items ?? [];
  const totalUsers = usersPage?.total ?? 0;

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, companyFilter, userTab, pageSize]);
  const { data: companies = [], isLoading: companiesInitialLoading } = useGetCompaniesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const { data: roles = [], isLoading: rolesInitialLoading } = useGetRolesQuery(undefined, {
    refetchOnMountOrArgChange: 30,
  });
  const [createUser] = useCreateUserMutation();
  const [updateUser] = useUpdateUserMutation();
  /** `isFetching` would flip true on background refetch and swap the whole table for a skeleton — use first-load only. */
  const dataTableLoading = usersLoading;
  const filtersDisabled = (companiesInitialLoading && companies.length === 0) || (rolesInitialLoading && roles.length === 0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [accessGroups, setAccessGroups] = useState<CompanyAccessGroup[]>([]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setEmail('');
    setPassword('');
    setIsSuperAdmin(false);
    setAccessGroups([]);
    setModal(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setIsSuperAdmin(u.isSuperAdmin);
    setAccessGroups(groupCompanyAccess(u.companyAccess));
    setModal(true);
  };

  const addAccessGroup = () =>
    setAccessGroups((prev) => [...prev, { companyId: companies[0]?.id ?? '', roleIds: [] }]);

  const removeAccessGroup = (i: number) => setAccessGroups((prev) => prev.filter((_, idx) => idx !== i));

  const updateAccessGroupCompany = (i: number, companyId: string) =>
    setAccessGroups((prev) => prev.map((group, idx) => (idx === i ? { ...group, companyId } : group)));

  const toggleAccessGroupRole = (i: number, roleId: string, checked: boolean) =>
    setAccessGroups((prev) =>
      prev.map((group, idx) => {
        if (idx !== i) return group;
        const roleIds = checked
          ? group.roleIds.includes(roleId)
            ? group.roleIds
            : [...group.roleIds, roleId]
          : group.roleIds.filter((id) => id !== roleId);
        return { ...group, roleIds };
      })
    );

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormLoading(true);

    const body: Record<string, unknown> = {
      name,
      isSuperAdmin,
      companyAccess: dedupeUserCompanyAccess(
        flattenCompanyAccess(accessGroups.filter((group) => group.companyId))
      ),
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
    } catch (error) {
      setFormLoading(false);
      const message = (error as { data?: { error?: string } }).data?.error ?? 'Save failed';
      toast.error(message);
    }
  };

  const handleToggleActive = async (u: User) => {
    if (currentUserId && isSuperAdminSelfTarget(currentUserId, u) && u.isActive) {
      toast.error('Super admins cannot deactivate their own account');
      return;
    }
    try {
      await updateUser({ id: u.id, data: { isActive: !u.isActive } }).unwrap();
      toast.success(u.isActive ? 'User deactivated' : 'User activated');
    } catch (error) {
      const message = (error as { data?: { error?: string } }).data?.error ?? 'Update failed';
      toast.error(message);
    }
  };

  const columns: Column<User>[] = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'email', header: 'Email', sortable: true },
    {
      key: 'isSuperAdmin',
      header: 'Role',
      render: (u) =>
        u.isSuperAdmin ? (
          <Badge variant="default" className="font-normal">
            Super admin
          </Badge>
        ) : isEmployeeSelfServiceAccount(u) ? (
          <Badge variant="secondary" className="font-normal">
            Self-service
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            ERP user
          </Badge>
        ),
    },
    {
      key: 'companyAccess',
      header: 'Company access',
      render: (u) =>
        u.isSuperAdmin ? (
          <span className="text-xs text-muted-foreground">All companies</span>
        ) : (u.companyAccess ?? []).length ? (
          <span className="text-xs text-foreground">{formatCompanyAccessLabel(u.companyAccess)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No access</span>
        ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (u) =>
        u.isActive ? (
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
      render: (u) => {
        const selfProtected = Boolean(currentUserId && isSuperAdminSelfTarget(currentUserId, u) && u.isActive);
        return (
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(u)}>
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant={u.isActive ? 'destructive' : 'default'}
            disabled={selfProtected}
            title={selfProtected ? 'Super admins cannot deactivate their own account' : undefined}
            onClick={() => void handleToggleActive(u)}
          >
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
        );
      },
    },
  ];

  const emptyText =
    totalUsers === 0 ? 'No users found.' : 'No users match the current tab and filters.';

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">User management</h1>
          <p className="text-sm text-muted-foreground">
            {totalUsers} user{totalUsers !== 1 ? 's' : ''} matching filters in this tab
          </p>
        </div>
        {userTab === 'erp' ? (
          <Button type="button" size="sm" onClick={openCreate}>
            Add user
          </Button>
        ) : (
          <p className="max-w-sm text-right text-xs text-muted-foreground sm:max-w-xs">
            Portal logins are usually created from HR when an employee is linked to a user.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        <div className="inline-flex w-full max-w-md rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setUserTab('erp')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
              userTab === 'erp'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            ERP users
          </button>
          <button
            type="button"
            onClick={() => setUserTab('self-service')}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
              userTab === 'self-service'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Self-service
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:min-w-[14rem]">
            <label htmlFor="user-search" className={labelClass}>
              Search
            </label>
            <Input
              id="user-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name or email"
              disabled={usersLoading}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="user-filter-status" className={labelClass}>
              Status
            </label>
            <select
              id="user-filter-status"
              className={selectClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              disabled={usersLoading}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="user-filter-company" className={labelClass}>
              Company (access)
            </label>
            <select
              id="user-filter-company"
              className={selectClass}
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              disabled={usersLoading || filtersDisabled}
            >
              <option value="all">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground sm:ml-auto sm:self-center">
            Showing {users.length} of {totalUsers} in this tab
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={users}
        loading={dataTableLoading}
        emptyText={emptyText}
        preferenceKey={`admin-users-${userTab}`}
        serverPagination={{
          page,
          pageSize,
          total: totalUsers,
          pageSizeOptions: USER_PAGE_SIZE_OPTIONS,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
      />

      <Modal
        isOpen={modal}
        onClose={() => !formLoading && setModal(false)}
        title={editing ? 'Edit user' : 'Create user'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="user-name" className={labelClass}>
                Full name <span className="text-destructive">*</span>
              </label>
              <Input id="user-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label htmlFor="user-email" className={labelClass}>
                Email {!editing ? <span className="text-destructive">*</span> : null}
              </label>
              <Input
                id="user-email"
                type="email"
                required={!editing}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editing}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label htmlFor="user-password" className={labelClass}>
                {editing ? 'New password (optional)' : 'Password'} {!editing ? <span className="text-destructive">*</span> : null}
              </label>
              <Input
                id="user-password"
                type="password"
                required={!editing}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'}
                autoComplete="new-password"
              />
            </div>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-3">
            <input
              type="checkbox"
              checked={isSuperAdmin}
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              className={checkClass}
            />
            <span className="text-sm text-foreground">
              Super admin <span className="text-muted-foreground">(full access to all companies)</span>
            </span>
          </label>

          {!isSuperAdmin ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className={labelClass}>Company access &amp; roles</span>
                <Button type="button" size="sm" variant="outline" onClick={addAccessGroup}>
                  Add company
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Select one or more roles per company. Permissions from all selected roles are combined for that company.
              </p>
              {accessGroups.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No company access assigned. Use Add company to grant access.
                </p>
              ) : null}
              <div className="space-y-3">
                {accessGroups.map((group, i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={group.companyId}
                        onChange={(e) => updateAccessGroupCompany(i, e.target.value)}
                        className={formSelectClass}
                      >
                        <option value="">Select company…</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAccessGroup(i)}>
                        Remove company
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {roles.map((role) => (
                        <label key={role.id} className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={group.roleIds.includes(role.id)}
                            onChange={(e) => toggleAccessGroupRole(i, role.id, e.target.checked)}
                            className={checkClass}
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" className="flex-1" disabled={formLoading} onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={formLoading}>
              {formLoading ? 'Saving…' : editing ? 'Update user' : 'Create user'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
