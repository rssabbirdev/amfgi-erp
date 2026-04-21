'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  buildWorkforceProfileExtension,
} from '@/lib/hr/workforceProfile';
import { NATIONALITY_OPTIONS } from '@/lib/hr/employeeMeta';
import toast from 'react-hot-toast';

function generateEmployeeCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `EMP-${stamp.slice(-6)}`;
}

function summarizeName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { display: 'New employee', initials: 'NE' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { display: trimmed, initials: parts[0]!.slice(0, 2).toUpperCase() };
  return {
    display: trimmed,
    initials: `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase(),
  };
}

export default function NewEmployeePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nationality, setNationality] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [employeeType, setEmployeeType] = useState<'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER'>('LABOUR_WORKER');
  const [visaHolding, setVisaHolding] = useState<'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA'>('COMPANY_PROVIDED');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const preview = useMemo(() => summarizeName(fullName || preferredName), [fullName, preferredName]);
  const proposedCode = useMemo(() => generateEmployeeCode(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const legalName = fullName.trim() || preferredName.trim();
      const displayName = preferredName.trim() || legalName;
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: generateEmployeeCode(),
          fullName: legalName,
          preferredName: displayName || null,
          nationality: nationality || null,
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          profileExtension: buildWorkforceProfileExtension({
            employeeType,
            visaHolding,
            expertises: [],
          }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Save failed');
        return;
      }
      toast.success('Employee created');
      router.push(`/hr/employees/${json.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 text-slate-300 shadow-sm">
        You do not have permission to create employee records.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Employee Setup</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Create employee record</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Capture the essential HR identity and workforce setup first, then continue in the employee profile for documents, timing, and portal access.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[24rem]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Employee code</p>
              <p className="mt-2 font-mono text-sm text-emerald-300">{proposedCode}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next step</p>
              <p className="mt-2 text-sm font-medium text-slate-200">Complete full profile after create</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold text-white">Employee details</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This entry creates the employee and prepares the workforce setup for scheduling, attendance, and compliance tracking.
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2 sm:col-span-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Full legal name</span>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                  placeholder="Enter employee full name"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Preferred name</span>
                <input
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                  placeholder="Optional display name"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Mobile number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                  placeholder="e.g. +971..."
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Nationality</span>
                <select
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                >
                  <option value="">Select nationality</option>
                  {NATIONALITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Designation</span>
                <input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                  placeholder="e.g. Supervisor, Driver, Fabricator"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <h3 className="text-sm font-semibold text-white">Workforce setup</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Employee type</span>
                  <select
                    value={employeeType}
                    onChange={(e) => setEmployeeType(e.target.value as 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER')}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                  >
                    {WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Visa holding</span>
                  <select
                    value={visaHolding}
                    onChange={(e) => setVisaHolding(e.target.value as 'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA')}
                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-3 py-3 text-sm text-white outline-none ring-emerald-500/30 transition focus:ring-2"
                  >
                    {WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating employee...' : 'Create employee'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/hr/employees')}>
                Back to employees
              </Button>
            </div>
          </form>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Preview</p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-lg font-semibold text-emerald-300">
                {preview.initials}
              </div>
              <div>
                <p className="text-lg font-semibold text-white">{preview.display}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">Sample code: {proposedCode}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-white">Captured in this step</h3>
            <ul className="mt-3 space-y-3 text-sm text-slate-400">
              <li>Core employee identity for the HR master record.</li>
              <li>Nationality selection for cleaner standardized data.</li>
              <li>Visa holding choice: company provided, self own, or no visa.</li>
              <li>Workforce role type so the employee fits schedule and attendance rules.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
