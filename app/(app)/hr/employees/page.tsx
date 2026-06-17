'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import EmployeeImportModal from '@/components/hr/EmployeeImportModal';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import { exportEmployeesToXlsx } from '@/lib/import-export/exportEmployees';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import { cn } from '@/lib/utils';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetHrEmployeesPageQuery,
  useLazyGetHrEmployeesForExportQuery,
  HR_EMPLOYEE_PAGE_SIZE_OPTIONS,
} from '@/store/api/endpoints/hr';

type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'EXITED';

const STATUS_OPTIONS: Array<{ value: 'ALL' | EmployeeStatus; label: string }> = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'EXITED', label: 'Exited' },
];

const statusBadgeClasses: Record<EmployeeStatus, string> = {
  ACTIVE:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 uppercase tracking-[0.18em] text-[11px] dark:text-emerald-300',
  ON_LEAVE:
    'border-amber-500/30 bg-amber-500/10 text-amber-800 uppercase tracking-[0.18em] text-[11px] dark:text-amber-300',
  SUSPENDED:
    'border-red-500/30 bg-red-500/10 text-red-700 uppercase tracking-[0.18em] text-[11px] dark:text-red-400',
  EXITED:
    'border-slate-500/30 bg-slate-500/10 text-slate-700 uppercase tracking-[0.18em] text-[11px] dark:text-slate-300',
};

function prettyStatus(status: EmployeeStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function prettyEmployeeType(type: string | null | undefined) {
  const t = (type ?? '').trim();
  if (!t) return 'Not set';
  return t
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function HrEmployeesPage() {
  const router = useRouter();
  const { openMenu } = useGlobalContextMenu();
  const { data: session } = useSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | EmployeeStatus>('ALL');
  const [employeeType, setEmployeeType] = useState<'ALL' | '__none__' | string>('ALL');
  const [portal, setPortal] = useState<'ALL' | 'enabled' | 'disabled'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);

  const deferredQuery = useDeferredValue(q);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view');
  const canEdit = isSA || perms.includes('hr.employee.edit');
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [fetchEmployeesForExport] = useLazyGetHrEmployeesForExportQuery();

  const {
    data: employeesPage,
    isLoading: loading,
    isFetching: refreshing,
  } = useGetHrEmployeesPageQuery(
    {
      limit: pageSize,
      offset: (page - 1) * pageSize,
      q: deferredQuery,
      status,
      employeeType,
      portal,
    },
    { skip: !canView },
  );

  const list = employeesPage?.items ?? [];
  const totalEmployees = employeesPage?.total ?? 0;
  const employeeTypeChoices = employeesPage?.employeeTypes ?? [];

  useEffect(() => {
    setPage(1);
  }, [deferredQuery, status, employeeType, portal, pageSize]);

  useEffect(() => {
    if (employeeType === 'ALL' || employeeType === '__none__') return;
    if (!employeeTypeChoices.includes(employeeType)) setEmployeeType('ALL');
  }, [employeeType, employeeTypeChoices]);

  const totals = useMemo(() => {
    const active = list.filter((employee) => employee.status === 'ACTIVE').length;
    const onLeave = list.filter((employee) => employee.status === 'ON_LEAVE').length;
    const portalEnabled = list.filter((employee) => employee.portalEnabled).length;
    return {
      total: totalEmployees,
      active,
      onLeave,
      portalEnabled,
    };
  }, [list, totalEmployees]);

  const totalPages = Math.max(1, Math.ceil(totalEmployees / pageSize));
  const pageStart = totalEmployees === 0 ? 0 : (page - 1) * pageSize;

  const openEmployeeProfile = (employeeId: string) => {
    router.push(`/hr/employees/${employeeId}`);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view employee records for this company.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="w-full min-w-0 space-y-6 border-b border-border pb-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workforce</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Employee directory</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Maintain employee master data and open full profiles for documents, access, and employment details.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Employees" value={totals.total} hint="Matching current filters" />
          <StatCard label="Active on page" value={totals.active} hint="Current page only" />
          <StatCard label="On leave on page" value={totals.onLeave} hint="Current page only" />
          <StatCard label="Portal on page" value={totals.portalEnabled} hint="Current page only" />
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 sm:col-span-2 xl:col-span-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search</span>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, employee code, or mobile number"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value as 'ALL' | EmployeeStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</span>
              <Select
                value={employeeType}
                onChange={(e) => setEmployeeType(e.target.value as 'ALL' | '__none__' | string)}
              >
                <option value="ALL">All types</option>
                <option value="__none__">No type</option>
                {employeeTypeChoices.map((t) => (
                  <option key={t} value={t}>
                    {prettyEmployeeType(t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Portal</span>
              <Select value={portal} onChange={(e) => setPortal(e.target.value as 'ALL' | 'enabled' | 'disabled')}>
                <option value="ALL">All</option>
                <option value="enabled">Enabled only</option>
                <option value="disabled">Disabled only</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {refreshing ? 'Refreshing records' : 'Directory status'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {list.length} of {totalEmployees} employee{totalEmployees === 1 ? '' : 's'} on this page
              </p>
            </div>
            {canView ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const all = await fetchEmployeesForExport({
                      q: deferredQuery,
                      status,
                      employeeType,
                      portal,
                    }).unwrap();
                    if (all.length === 0) {
                      toast.error('No employees to export for current filters');
                      return;
                    }
                    const hasFilters =
                      deferredQuery.trim() ||
                      status !== 'ALL' ||
                      employeeType !== 'ALL' ||
                      portal !== 'ALL';
                    exportEmployeesToXlsx(all, hasFilters ? 'employees-filtered' : 'employees');
                    toast.success(`Exported ${all.length} employee(s)`);
                  } catch {
                    toast.error('Failed to export employees');
                  }
                }}
              >
                Export
              </Button>
            ) : null}
            {canEdit ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setImportModalOpen(true)}>
                Import
              </Button>
            ) : null}
            {canEdit ? (
              <Link href="/hr/employees/new" className={buttonVariants({ size: 'sm' })}>
                Add employee
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <EmployeeImportModal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} />

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Employee master table</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Double-click a row to open the profile. Right-click a row for actions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Employee name', 'Code', 'Designation', 'Type', 'Status', 'Portal', 'Mobile number'].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                <TableSkeleton rows={6} columns={7} />
              </tbody>
            </table>
          </div>
        ) : totalEmployees === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">No employees found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try adjusting the search or status filter, or create the first employee record for this company.
            </p>
            {canEdit ? (
              <div className="mt-5 flex justify-center">
                <Link href="/hr/employees/new" className={buttonVariants({ size: 'sm' })}>
                  Add employee
                </Link>
              </div>
            ) : null}
          </div>
        ) : list.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <h3 className="text-lg font-semibold text-foreground">No employees on this page</h3>
            <p className="mt-2 text-sm text-muted-foreground">Try another page or adjust filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Employee name
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Code
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Designation
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Portal
                  </th>
                  <th className="px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Mobile number
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                {list.map((employee) => (
                  <tr
                    key={employee.id}
                    className="cursor-pointer align-top transition-colors hover:bg-muted/40"
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
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-medium text-foreground">{employee.fullName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {employee.preferredName && employee.preferredName !== employee.fullName
                            ? `Preferred: ${employee.preferredName}`
                            : 'Employee profile'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-emerald-600 dark:text-emerald-300/90">
                      {employee.employeeCode}
                    </td>
                    <td className="px-4 py-4">{employee.designation || 'Not set'}</td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-foreground">{prettyEmployeeType(employee.employeeType)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{employee.basicHoursPerDay || 0} h/day</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="outline" className={cn('font-medium', statusBadgeClasses[employee.status])}>
                        {prettyStatus(employee.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={employee.portalEnabled ? 'font-medium text-sky-600 dark:text-sky-300' : undefined}
                      >
                        {employee.portalEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-4">{employee.phone || 'Not added'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalEmployees > 0 ? (
          <div className="border-t border-border px-5 py-4">
            <DirectoryListPagination
              page={page}
              pageSize={pageSize}
              totalPages={totalPages}
              total={totalEmployees}
              pageStart={pageStart}
              pageEnd={pageStart + list.length}
              pageSizeOptions={HR_EMPLOYEE_PAGE_SIZE_OPTIONS}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
