'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import { useGetHrEmployeesQuery } from '@/store/api/endpoints/hr';

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';

const STATUS_OPTIONS: Array<{ value: 'ALL' | EmployeeStatus; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXITED', label: 'Exited' },
];

const statusBadgeClasses: Record<EmployeeStatus, string> = {
  ACTIVE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  ON_LEAVE: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  SUSPENDED: 'border-red-500/30 bg-red-500/10 text-red-400',
  EXITED: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

function prettyStatus(status: EmployeeStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl border p-4 shadow-sm"
      style={{
        backgroundColor: 'var(--surface-panel-soft)',
        borderColor: 'var(--border-strong)',
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
        {value}
      </p>
      <p className="mt-1 text-xs" style={{ color: 'var(--foreground-muted)' }}>
        {hint}
      </p>
    </div>
  );
}

export default function HrEmployeesPage() {
  const router = useRouter();
  const { openMenu } = useGlobalContextMenu();
  const { data: session } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | EmployeeStatus>('ALL');

  const deferredQuery = useDeferredValue(q);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view');
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const {
    data: list = [],
    isLoading: loading,
    isFetching: refreshing,
  } = useGetHrEmployeesQuery(
    {
      q: deferredQuery,
      status,
    },
    { skip: !canView }
  );

  const totals = useMemo(() => {
    const active = list.filter((employee) => employee.status === 'ACTIVE').length;
    const onLeave = list.filter((employee) => employee.status === 'ON_LEAVE').length;
    const portalEnabled = list.filter((employee) => employee.portalEnabled).length;
    return {
      total: list.length,
      active,
      onLeave,
      portalEnabled,
    };
  }, [list]);

  const openEmployeeProfile = (employeeId: string) => {
    router.push(`/hr/employees/${employeeId}`);
  };

  if (!canView) {
    return (
      <div
        className="rounded-2xl border p-6 shadow-sm"
        style={{
          backgroundColor: 'var(--surface-panel-soft)',
          borderColor: 'var(--border-strong)',
          color: 'var(--foreground-soft)',
        }}
      >
        You do not have permission to view employee records for this company.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section
        className="rounded-3xl border p-6 shadow-sm"
        style={{
          backgroundColor: 'var(--surface-panel-soft)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Workforce</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Employee directory
            </h1>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--foreground-muted)' }}>
              Maintain employee master data and open full profiles for documents, access, and employment details.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[30rem] xl:grid-cols-4">
            <SummaryCard label="Employees" value={totals.total} hint="Current filtered view" />
            <SummaryCard label="Active" value={totals.active} hint="Available for operations" />
            <SummaryCard label="On Leave" value={totals.onLeave} hint="Currently away" />
            <SummaryCard label="Portal Enabled" value={totals.portalEnabled} hint="Self-service access" />
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border p-5 shadow-sm"
        style={{
          backgroundColor: 'var(--surface-panel-soft)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1.4fr)_15rem]">
            <label className="space-y-2 text-sm" style={{ color: 'var(--foreground-soft)' }}>
              <span className="block text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
                Search
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, employee code, or mobile number"
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              />
            </label>
            <label className="space-y-2 text-sm" style={{ color: 'var(--foreground-soft)' }}>
              <span className="block text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
                Status
              </span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'ALL' | EmployeeStatus)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none ring-emerald-500/30 transition focus:ring-2"
                style={{
                  backgroundColor: 'var(--input-background)',
                  color: 'var(--input-foreground)',
                  borderColor: 'var(--input-border)',
                }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>
                {refreshing ? 'Refreshing records' : 'Directory status'}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--foreground-soft)' }}>
                {list.length} employee{list.length === 1 ? '' : 's'} listed
              </p>
            </div>
            {canEdit ? (
              <Link href="/hr/employees/new">
                <Button type="button">Add employee</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl border shadow-sm"
        style={{
          backgroundColor: 'var(--surface-panel-soft)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--border-strong)' }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              Employee master table
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Double-click a row to open the profile. Right-click a row for actions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3 px-5 py-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              No employees found
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--foreground-muted)' }}>
              Try adjusting the search or status filter, or create the first employee record for this company.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead style={{ backgroundColor: 'var(--surface-subtle)', color: 'var(--foreground-soft)' }}>
                <tr>
                  <th className="px-5 py-3 font-medium">Employee Name</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Designation</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Portal</th>
                  <th className="px-5 py-3 font-medium">Mobile Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5" style={{ color: 'var(--foreground-soft)' }}>
                {list.map((employee) => (
                  <tr
                    key={employee.id}
                    className="cursor-pointer transition-colors hover:bg-white/5"
                    onDoubleClick={() => openEmployeeProfile(employee.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openMenu(event.clientX, event.clientY, [
                        {
                          label: 'Open profile',
                          action: () => openEmployeeProfile(employee.id),
                        },
                      ]);
                    }}
                  >
                    <td className="px-5 py-4 align-top">
                      <div>
                        <p className="font-medium" style={{ color: 'var(--foreground)' }}>
                          {employee.fullName}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                          {employee.preferredName && employee.preferredName !== employee.fullName
                            ? `Preferred: ${employee.preferredName}`
                            : 'Employee profile'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top font-mono text-xs text-emerald-300/90">{employee.employeeCode}</td>
                    <td className="px-4 py-4 align-top">{employee.designation || 'Not set'}</td>
                    <td className="px-4 py-4 align-top">
                      <div>
                        <p>{employee.employeeType || 'Not set'}</p>
                        <p className="mt-1 text-xs" style={{ color: 'var(--foreground-muted)' }}>
                          {employee.basicHoursPerDay || 0} h/day
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${statusBadgeClasses[employee.status]}`}>
                        {prettyStatus(employee.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <span className={employee.portalEnabled ? 'text-sky-300' : ''} style={!employee.portalEnabled ? { color: 'var(--foreground-muted)' } : undefined}>
                        {employee.portalEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4 align-top">{employee.phone || 'Not added'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
