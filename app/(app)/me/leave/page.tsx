'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { readApiJson } from '@/lib/utils/readApiResponse';

type LeaveTypeOption = { id: string; name: string; code: string; isActive?: boolean };

type LeaveRow = {
  id: string;
  leaveType: string;
  leaveTypeId: string | null;
  startDate: string;
  endDate: string;
  status: string;
  reason: string | null;
  submittedAt: string;
  leaveTypeRef?: { id: string; name: string; code: string } | null;
};

export default function MeLeavePage() {
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([]);
  const [balance, setBalance] = useState<{ remainingDays: number; entitlementDays: number; usedDays: number } | null>(
    null
  );
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const [reqRes, balRes, typesRes] = await Promise.all([
      fetch('/api/me/leave-requests', { cache: 'no-store' }),
      fetch(`/api/me/leave-balance?year=${new Date().getFullYear()}`, { cache: 'no-store' }),
      fetch('/api/me/leave-types', { cache: 'no-store' }),
    ]);
    const reqJson = await readApiJson<LeaveRow[]>(reqRes);
    const balJson = await readApiJson(balRes);
    const typesJson = await readApiJson<LeaveTypeOption[]>(typesRes);
    if (reqRes.ok && reqJson?.success) setRows(reqJson.data as LeaveRow[]);
    if (balRes.ok && balJson?.success) setBalance(balJson.data as typeof balance);
    if (typesRes.ok && typesJson?.success) {
      const types = (typesJson.data ?? []) as LeaveTypeOption[];
      const active = types.filter((t) => t.isActive !== false);
      setLeaveTypes(active);
      setLeaveTypeId((prev) => prev || active[0]?.id || '');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!startDate || !leaveTypeId) {
      toast.error('Start date and leave type required');
      return;
    }
    setSubmitting(true);
    const res = await fetch('/api/me/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaveTypeId,
        startDate,
        endDate: endDate || startDate,
        reason: reason.trim() || undefined,
      }),
    });
    const json = await readApiJson(res);
    setSubmitting(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to submit');
      return;
    }
    toast.success('Leave request submitted');
    setStartDate('');
    setEndDate('');
    setReason('');
    void load();
  };

  const cancel = async (id: string) => {
    const res = await fetch(`/api/me/leave-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Cancel failed');
      return;
    }
    toast.success('Request cancelled');
    void load();
  };

  const leaveLabel = (row: LeaveRow) =>
    row.leaveTypeRef?.name ??
    leaveTypes.find((t) => t.id === row.leaveTypeId)?.name ??
    row.leaveType.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Leave requests</h1>
        <p className="text-sm text-muted-foreground">
          Submit leave using types configured by HR (sick, annual, paid, unpaid, etc.).
        </p>
      </div>

      {balance ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
          <p className="font-medium text-emerald-800 dark:text-emerald-300">
            Annual leave balance ({new Date().getFullYear()})
          </p>
          <p className="mt-1 tabular-nums">
            {balance.remainingDays} remaining · {balance.usedDays} used · {balance.entitlementDays} entitled
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">New request</h2>
        <select
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={leaveTypeId}
          onChange={(e) => setLeaveTypeId(e.target.value)}
        >
          {leaveTypes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">End date (optional)</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Reason</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
        </div>
        <Button disabled={submitting || leaveTypes.length === 0} onClick={() => void submit()}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Your requests</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-medium">
                  {leaveLabel(row)} · {String(row.startDate).slice(0, 10)}
                </span>
                <span className="text-muted-foreground">{row.status}</span>
              </div>
              {row.reason ? <p className="mt-1 text-muted-foreground">{row.reason}</p> : null}
              {row.status === 'PENDING' ? (
                <Button size="sm" variant="outline" className="mt-2" onClick={() => void cancel(row.id)}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
