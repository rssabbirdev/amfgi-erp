'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export type VisaRow = {
  id: string;
  label: string;
  sponsorType: string | null;
  visaType: string | null;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
};

export type DocRow = {
  id: string;
  documentNumber: string | null;
  expiryDate: string | null;
  documentType: { id: string; name: string; slug: string };
};

export type EmployeeRecord = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  designation: string | null;
  department: string | null;
  employmentType: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  status: string;
  bloodGroup: string | null;
  photoUrl: string | null;
  portalEnabled: boolean;
  profileExtension?: unknown;
  visaPeriods: VisaRow[];
  documents: DocRow[];
};

export type AttendanceRow = {
  id: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakStartAt?: string | null;
  breakEndAt?: string | null;
  overtimeMinutes?: number | null;
  workAssignment: {
    label: string | null;
    jobNumberSnapshot: string | null;
    locationType?: string | null;
    factoryCode?: string | null;
    factoryLabel?: string | null;
    siteNameSnapshot?: string | null;
    clientNameSnapshot?: string | null;
    job?: {
      jobNumber?: string | null;
      site?: string | null;
      projectName?: string | null;
      customer?: {
        name?: string | null;
      } | null;
    } | null;
  } | null;
};

export function currentMonthValue() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

export function monthBounds(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

export function formatTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Dubai',
  });
}

export function diffMinutes(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const delta = endDate.getTime() - startDate.getTime();
  if (delta <= 0) return 0;
  return Math.round(delta / 60000);
}

export function formatHours(minutes: number) {
  return `${(Math.round((minutes / 60) * 100) / 100).toFixed(2)} h`;
}

export function displayName(emp: EmployeeRecord) {
  return emp.preferredName?.trim() || emp.fullName;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'PRESENT') return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300';
  if (normalized === 'ABSENT' || normalized === 'INACTIVE') return 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300';
  if (normalized === 'LEAVE') return 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300';
  return 'bg-slate-500/10 text-slate-700 ring-slate-500/20 dark:text-slate-300';
}

export function workLocationLabel(row: AttendanceRow) {
  const assignment = row.workAssignment;
  if (!assignment) return '-';
  if (assignment.locationType === 'FACTORY') {
    return assignment.factoryLabel || assignment.factoryCode || assignment.label || '-';
  }
  if (assignment.locationType === 'SITE_JOB') {
    return assignment.siteNameSnapshot || assignment.job?.site || assignment.label || '-';
  }
  return assignment.siteNameSnapshot || assignment.clientNameSnapshot || assignment.label || '-';
}

export function jobNumberLabel(row: AttendanceRow) {
  return row.workAssignment?.jobNumberSnapshot || row.workAssignment?.job?.jobNumber || '';
}

export function upcomingDocument(documents: DocRow[]) {
  const withExpiry = documents
    .filter((doc) => doc.expiryDate)
    .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());
  return withExpiry[0] ?? null;
}

export function SelfServiceTabs() {
  const pathname = usePathname();
  const items = [
    { href: '/me/profile', label: 'Profile' },
    { href: '/me/attendance', label: 'Attendance' },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white',
            ].join(' ')}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export function SelfServiceHero({
  employee,
  eyebrow,
}: {
  employee: EmployeeRecord;
  eyebrow: string;
}) {
  const name = displayName(employee);
  const photoUrl = employee.photoUrl?.trim() || null;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
      <div className="bg-linear-to-r from-emerald-500/10 via-transparent to-sky-500/10 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-xl font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {photoUrl ? (
                <Image src={photoUrl} alt={name} fill className="object-cover" sizes="64px" />
              ) : (
                initials(name)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300/80">
                {eyebrow}
              </p>
              <h1 className="mt-1 truncate text-2xl font-semibold text-slate-900 dark:text-white">{name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <span>{employee.employeeCode}</span>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <span>{employee.designation || 'No designation'}</span>
              </div>
            </div>
          </div>
          <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusTone(employee.status)}`}>
            {employee.status}
          </span>
        </div>
      </div>
    </section>
  );
}

export function InfoCard({
  label,
  value,
  subtle = false,
}: {
  label: string;
  value: string | null | undefined;
  subtle?: boolean;
}) {
  return (
    <div className={subtle ? '' : 'rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50'}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value?.trim() ? value : '-'}</p>
    </div>
  );
}

export function MetricCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'rose' | 'sky';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20'
      : tone === 'rose'
        ? 'bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/20'
        : tone === 'sky'
          ? 'bg-sky-50 border-sky-200 dark:bg-sky-500/10 dark:border-sky-500/20'
          : 'bg-slate-50 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700';

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
