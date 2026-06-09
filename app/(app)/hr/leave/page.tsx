'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import HrPageChrome from '@/components/hr/HrPageChrome';
import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import SearchSelect from '@/components/ui/SearchSelect';
import { LEAVE_TYPE_OPTIONS } from '@/lib/hr/leaveTypes';
import { cn } from '@/lib/utils';

type LeaveRow = {
  id: string;
  leaveType: string;
  leaveTypeId: string | null;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
  submittedAt: string;
  reviewNote: string | null;
  leaveTypeRef?: { id: string; name: string; code: string } | null;
  employee: { fullName: string; preferredName: string | null; employeeCode: string };
};

type BalanceRow = {
  id: string;
  employeeId: string;
  year: number;
  entitlementDays: number;
  usedDays: number;
  adjustedDays: number;
  remainingDays: number;
  employee: { fullName: string; preferredName: string | null; employeeCode: string };
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-amber-500/10 text-amber-800',
    APPROVED: 'bg-emerald-500/10 text-emerald-800',
    REJECTED: 'bg-red-500/10 text-red-800',
    CANCELLED: 'bg-slate-500/10 text-slate-600',
  };
  return map[status] ?? 'bg-slate-500/10';
}

export default function HrLeavePage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canApprove = session?.user?.isSuperAdmin || perms.includes('hr.leave.approve');
  const canView = session?.user?.isSuperAdmin || perms.includes('hr.leave.view') || canApprove;

  const [tab, setTab] = useState<'queue' | 'balances'>('queue');
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [requests, setRequests] = useState<LeaveRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear());
  const [balanceEmployeeId, setBalanceEmployeeId] = useState('');
  const [balanceEntitlement, setBalanceEntitlement] = useState('30');
  const [employeeOptions, setEmployeeOptions] = useState<
    Array<{ id: string; employeeCode: string; fullName: string; preferredName: string | null }>
  >([]);

  useEffect(() => {
    if (!canView) return;
    void fetch('/api/hr/employees?limit=500', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data?.items)) {
          setEmployeeOptions(json.data.items);
        }
      })
      .catch(() => {});
  }, [canView]);

  const loadRequests = useCallback(async () => {
    const q = filter === 'PENDING' ? '?status=PENDING' : '';
    const res = await fetch(`/api/hr/leave-requests${q}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) setRequests(json.data as LeaveRow[]);
  }, [filter]);

  const loadBalances = useCallback(async () => {
    const res = await fetch(`/api/hr/leave-balances?year=${balanceYear}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) setBalances(json.data as BalanceRow[]);
  }, [balanceYear]);

  useEffect(() => {
    if (!canView) return;
    setLoading(true);
    void Promise.all([loadRequests(), loadBalances()]).finally(() => setLoading(false));
  }, [canView, loadRequests, loadBalances]);

  const review = async (id: string, action: 'approve' | 'reject', allowInsufficientBalance?: boolean) => {
    const res = await fetch(`/api/hr/leave-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, allowInsufficientBalance }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Action failed');
      return;
    }
    toast.success(action === 'approve' ? 'Leave approved' : 'Leave rejected');
    void loadRequests();
    void loadBalances();
  };

  const saveBalance = async () => {
    if (!balanceEmployeeId.trim()) {
      toast.error('Select an employee');
      return;
    }
    const res = await fetch('/api/hr/leave-balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: balanceEmployeeId.trim(),
        year: balanceYear,
        entitlementDays: Number(balanceEntitlement),
      }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save balance');
      return;
    }
    toast.success('Leave balance updated');
    setBalanceEmployeeId('');
    void loadBalances();
  };

  if (!canView) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You do not have permission to view leave requests.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Leave management</h1>
        <p className="text-sm text-muted-foreground">
          Review employee leave requests and maintain annual leave balances.
        </p>
      </div>
      <div className="flex gap-2 border-b border-border pb-2">
        <Button variant={tab === 'queue' ? 'default' : 'outline'} size="sm" onClick={() => setTab('queue')}>
          Request queue
        </Button>
        <Button variant={tab === 'balances' ? 'default' : 'outline'} size="sm" onClick={() => setTab('balances')}>
          Annual balances
        </Button>
      </div>

      {tab === 'queue' ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={filter === 'PENDING' ? 'default' : 'outline'} onClick={() => setFilter('PENDING')}>
              Pending
            </Button>
            <Button size="sm" variant={filter === 'ALL' ? 'default' : 'outline'} onClick={() => setFilter('ALL')}>
              All
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave requests.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((row) => (
                <div key={row.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {row.employee.preferredName || row.employee.fullName}{' '}
                        <span className="text-muted-foreground">({row.employee.employeeCode})</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {row.leaveTypeRef?.name ??
                          LEAVE_TYPE_OPTIONS.find((o) => o.value === row.leaveType)?.label ??
                          row.leaveType}{' '}
                        · {String(row.startDate).slice(0, 10)}
                        {String(row.endDate).slice(0, 10) !== String(row.startDate).slice(0, 10)
                          ? ` → ${String(row.endDate).slice(0, 10)}`
                          : ''}
                      </p>
                      {row.reason ? <p className="mt-1 text-sm">{row.reason}</p> : null}
                    </div>
                    <Badge className={cn('font-medium', statusBadge(row.status))}>{row.status}</Badge>
                  </div>
                  {row.status === 'PENDING' && canApprove ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void review(row.id, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void review(row.id, 'approve', true)}>
                        Approve (override balance)
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void review(row.id, 'reject')}>
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-4">
            <div>
              <label className="text-xs text-muted-foreground">Year</label>
              <Input
                type="number"
                className="w-24"
                value={balanceYear}
                onChange={(e) => setBalanceYear(Number(e.target.value))}
              />
            </div>
            <div className="min-w-[240px] flex-1 max-w-md">
              <label className="text-xs text-muted-foreground">Employee</label>
              <SearchSelect
                items={employeeOptions.map((e) => ({
                  id: e.id,
                  label: `${e.preferredName || e.fullName} (${e.employeeCode})`,
                  searchText: `${e.employeeCode} ${e.fullName} ${e.preferredName ?? ''}`,
                }))}
                value={balanceEmployeeId}
                onChange={setBalanceEmployeeId}
                placeholder="Search employee…"
                minCharactersToSearch={0}
                openOnFocus
                dropdownInPortal
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Entitlement days</label>
              <Input
                type="number"
                className="w-24"
                value={balanceEntitlement}
                onChange={(e) => setBalanceEntitlement(e.target.value)}
              />
            </div>
            {canApprove ? (
              <Button size="sm" onClick={() => void saveBalance()}>
                Save entitlement
              </Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Entitled</th>
                  <th className="px-3 py-2">Used</th>
                  <th className="px-3 py-2">Adjusted</th>
                  <th className="px-3 py-2">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="px-3 py-2">
                      {b.employee.preferredName || b.employee.fullName} ({b.employee.employeeCode})
                    </td>
                    <td className="px-3 py-2">{Number(b.entitlementDays)}</td>
                    <td className="px-3 py-2">{Number(b.usedDays)}</td>
                    <td className="px-3 py-2">{Number(b.adjustedDays)}</td>
                    <td className="px-3 py-2 font-medium">{Number(b.remainingDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </HrPageChrome>
  );
}
