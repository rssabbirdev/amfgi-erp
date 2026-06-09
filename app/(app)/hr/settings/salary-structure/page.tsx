'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import PayTypeEditorTable, { type PayTypeRecord } from '@/components/hr/PayTypeEditorTable';
import HrPageChrome from '@/components/hr/HrPageChrome';
import { readApiJson } from '@/lib/utils/readApiResponse';

export default function SalaryStructureSettingsPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = session?.user?.isSuperAdmin || perms.includes('hr.payroll.settings');
  const [rows, setRows] = useState<PayTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hr/pay-types', { cache: 'no-store' });
    const json = await readApiJson<PayTypeRecord[]>(res);
    if (res.ok && json?.success) setRows((json.data ?? []) as PayTypeRecord[]);
    else toast.error(json?.error ?? 'Failed to load salary structures');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <HrPageChrome>
        <p className="text-sm text-muted-foreground">You need hr.payroll.settings permission.</p>
      </HrPageChrome>
    );
  }

  return (
    <HrPageChrome>
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Salary structure</h1>
        <p className="text-sm text-muted-foreground">
          Define how gross pay is calculated for each employee group. Set overtime as a percentage of the basic
          hourly rate, choose which weekdays count as working days, and assign a structure when setting compensation.
        </p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <PayTypeEditorTable
          rows={rows}
          saving={saving}
          onSavingChange={setSaving}
          onReload={load}
        />
      )}
    </HrPageChrome>
  );
}
