'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { parseWorkforceProfile, WORKFORCE_VISA_HOLDING_OPTIONS } from '@/lib/hr/workforceProfile';
import {
  type EmployeeRecord,
  formatDate,
  InfoCard,
  SelfServiceHero,
  upcomingDocument,
} from './shared';

export default function MeProfilePage() {
  const { data: session } = useSession();
  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!session?.user?.linkedEmployeeId) {
        if (!cancelled) {
          setError('No employee portal is linked to your login.');
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);
      const res = await fetch('/api/me/employee', { cache: 'no-store' });
      const json = await res.json();
      if (cancelled) return;

      if (!res.ok || !json?.success) {
        setError(json?.error ?? 'Could not load employee profile.');
        setEmployee(null);
      } else {
        setEmployee(json.data as EmployeeRecord);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.linkedEmployeeId]);

  const workforce = useMemo(() => parseWorkforceProfile(employee?.profileExtension), [employee?.profileExtension]);
  const visaHoldingLabel = useMemo(
    () => WORKFORCE_VISA_HOLDING_OPTIONS.find((option) => option.value === workforce.visaHolding)?.label || '-',
    [workforce.visaHolding]
  );
  const nextDocument = useMemo(() => upcomingDocument(employee?.documents ?? []), [employee?.documents]);
  const latestVisa = employee?.visaPeriods?.[0] ?? null;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Loading employee profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {error}
      </div>
    );
  }

  if (!employee) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <SelfServiceHero employee={employee} eyebrow="Employee Self Service" />

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Profile details</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Personal and HR information from your employee record.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Read only
          </span>
        </div>

        <div className="mt-6 grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard label="Mobile number" value={employee.phone} />
            <InfoCard label="Email" value={employee.email} />
            <InfoCard label="Nationality" value={employee.nationality} />
            <InfoCard label="Gender" value={employee.gender} />
            <InfoCard label="Date of birth" value={formatDate(employee.dateOfBirth)} />
            <InfoCard label="Blood group" value={employee.bloodGroup} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Employment</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <InfoCard label="Department" value={employee.department} subtle />
              <InfoCard label="Employment type" value={employee.employmentType} subtle />
              <InfoCard label="Hire date" value={formatDate(employee.hireDate)} subtle />
              <InfoCard label="Visa holding" value={visaHoldingLabel} subtle />
              <InfoCard label="Employee type" value={workforce.employeeType.replaceAll('_', ' ')} subtle />
              <InfoCard label="Expertise" value={workforce.expertises.length ? workforce.expertises.join(', ') : '-'} subtle />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Visa status</h3>
              {latestVisa ? (
                <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Current visa</p>
                    <p className="mt-1 font-medium text-slate-900 dark:text-white">{latestVisa.label}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoCard label="Type" value={latestVisa.visaType} subtle />
                    <InfoCard label="Sponsor" value={latestVisa.sponsorType} subtle />
                    <InfoCard label="Start" value={formatDate(latestVisa.startDate)} subtle />
                    <InfoCard label="Expiry" value={formatDate(latestVisa.endDate)} subtle />
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No visa record is available.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Documents</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoCard label="Active documents" value={String(employee.documents.length)} subtle />
                <InfoCard label="Next expiry" value={nextDocument ? formatDate(nextDocument.expiryDate) : '-'} subtle />
              </div>
              {nextDocument ? (
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                  Next document due: <span className="font-medium text-slate-900 dark:text-white">{nextDocument.documentType.name}</span>
                </p>
              ) : (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No upcoming document expiry found.</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
