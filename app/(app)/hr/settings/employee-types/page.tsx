'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { WORKFORCE_EMPLOYEE_TYPE_OPTIONS, type WorkforceEmployeeType } from '@/lib/hr/workforceProfile';
import toast from 'react-hot-toast';
import { useGetHrEmployeeTypeSettingsQuery } from '@/store/api/endpoints/hr';

type SettingsMap = Record<
  WorkforceEmployeeType,
  { basicHoursPerDay: number; dutyStart: string; dutyEnd: string; breakStart: string; breakEnd: string }
>;

export default function EmployeeTypeSettingsPage() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [saving, setSaving] = useState(false);
  const { data, isLoading, refetch } = useGetHrEmployeeTypeSettingsQuery();

  useEffect(() => {
    if (data) {
      setSettings(data);
    }
  }, [data]);

  const update = (type: WorkforceEmployeeType, key: keyof SettingsMap[WorkforceEmployeeType], value: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const curr = prev[type];
      return {
        ...prev,
        [type]: {
          ...curr,
          [key]: key === 'basicHoursPerDay' ? Number(value) : value,
        },
      };
    });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const res = await fetch('/api/hr/employee-type-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Failed to save settings');
      return;
    }
    toast.success('Employee-type timing settings saved');
    await refetch();
  };

  if (isLoading && !settings) return <div className="text-slate-400">Loading...</div>;
  if (!settings) return <div className="text-slate-400">Unable to load settings</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Employee type timing settings</h1>
        <p className="text-sm text-slate-400">
          Define default basic hours and duty/break timings by employee type. Attendance will consume these defaults.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/40">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Employee type</th>
              <th className="px-3 py-2">Basic h/day</th>
              <th className="px-3 py-2">Duty in</th>
              <th className="px-3 py-2">Duty out</th>
              <th className="px-3 py-2">Break out</th>
              <th className="px-3 py-2">Break in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((opt) => {
              const row = settings[opt.value];
              return (
                <tr key={opt.value}>
                  <td className="px-3 py-2 text-slate-200">
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[11px] text-slate-500">{opt.value}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      max={24}
                      value={row.basicHoursPerDay}
                      onChange={(e) => update(opt.value, 'basicHoursPerDay', e.target.value)}
                      className="w-32 rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.dutyStart}
                      onChange={(e) => update(opt.value, 'dutyStart', e.target.value)}
                      className="rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.dutyEnd}
                      onChange={(e) => update(opt.value, 'dutyEnd', e.target.value)}
                      className="rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.breakStart}
                      onChange={(e) => update(opt.value, 'breakStart', e.target.value)}
                      className="rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="time"
                      value={row.breakEnd}
                      onChange={(e) => update(opt.value, 'breakEnd', e.target.value)}
                      className="rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
}
