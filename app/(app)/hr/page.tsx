'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';

type HubCard = {
  href: string;
  title: string;
  description: string;
  eyebrow: string;
  tone: 'emerald' | 'sky' | 'amber';
  perms?: string[];
};

const HUB_SECTIONS: Array<{
  title: string;
  description: string;
  cards: HubCard[];
}> = [
  {
    title: 'Daily Operations',
    description: 'Move through the core HR day from workforce planning into attendance confirmation.',
    cards: [
      {
        href: '/hr/schedule',
        title: 'Schedule Planning',
        description: 'Create team groups, assign drivers and workers, and prepare day timing before attendance opens.',
        eyebrow: 'Planning',
        tone: 'emerald',
        perms: ['hr.schedule.view'],
      },
      {
        href: '/hr/attendance',
        title: 'Attendance Management',
        description: 'Review published schedules, generate attendance sheets, and correct daily worked-hour records.',
        eyebrow: 'Attendance',
        tone: 'sky',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/geofence',
        title: 'Geofence Attendance',
        description: 'Draw factory polygon borders, place gate entry points, and prepare mobile-ready geofence attendance zones.',
        eyebrow: 'Geofence',
        tone: 'amber',
        perms: ['hr.geofence.view'],
      },
      {
        href: '/hr/reports/attendance',
        title: 'Monthly Attendance Reports',
        description: 'Review employee-wise monthly attendance and export Excel files for one employee or the full month.',
        eyebrow: 'Reports',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
    ],
  },
  {
    title: 'Workforce',
    description: 'Maintain the employee master file and monitor the people records that support planning and payroll.',
    cards: [
      {
        href: '/hr/employees',
        title: 'Employees',
        description: 'Manage employee records, profile details, default timing, documents, and workforce attributes.',
        eyebrow: 'People',
        tone: 'emerald',
        perms: ['hr.employee.view'],
      },
    ],
  },
  {
    title: 'HR Setup',
    description: 'Configure the reference data that keeps the HR module structured and consistent across companies.',
    cards: [
      {
        href: '/hr/settings/document-types',
        title: 'Document Types',
        description: 'Define passport, visa, licence, and other tracked document categories with compliance rules.',
        eyebrow: 'Compliance',
        tone: 'amber',
        perms: ['hr.settings.document_types', 'hr.document.view'],
      },
      {
        href: '/hr/settings/expertises',
        title: 'Expertise Catalog',
        description: 'Maintain the workforce skill catalog used when matching employees to jobs and teams.',
        eyebrow: 'Skills',
        tone: 'sky',
        perms: ['hr.settings.expertise_catalog', 'hr.employee.view'],
      },
      {
        href: '/hr/settings/employee-types',
        title: 'Employee Type Timings',
        description: 'Set baseline timing and hours logic for office staff, drivers, hybrid roles, and labour teams.',
        eyebrow: 'Timing Rules',
        tone: 'emerald',
        perms: ['hr.settings.employee_types', 'hr.employee.view'],
      },
    ],
  },
];

const toneClasses: Record<HubCard['tone'], string> = {
  emerald:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-cyan-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300',
};

function canSeeCard(isSuperAdmin: boolean, permissions: string[], card: HubCard) {
  if (isSuperAdmin) return true;
  if (!card.perms || card.perms.length === 0) return true;
  return card.perms.some((perm) => permissions.includes(perm));
}

function HubLinkCard({ card }: { card: HubCard }) {
  return (
    <Link
      href={card.href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/50 dark:hover:bg-white/5 dark:hover:shadow-black/10"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_38%)] opacity-70 dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_38%)]"
        aria-hidden
      />
      <div className="relative">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${toneClasses[card.tone]}`}>
          {card.eyebrow}
        </span>
        <h3 className="mt-4 text-xl font-semibold text-slate-900 transition-colors group-hover:text-emerald-700 dark:text-white dark:group-hover:text-emerald-300">
          {card.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{card.description}</p>
        <div className="mt-5 flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white">
          <span>Open section</span>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function HrHubPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const permissions = (session?.user?.permissions ?? []) as string[];

  const visibleSections = HUB_SECTIONS.map((section) => ({
    ...section,
    cards: section.cards.filter((card) => canSeeCard(isSuperAdmin, permissions, card)),
  })).filter((section) => section.cards.length > 0);

  const totalVisibleCards = visibleSections.reduce((sum, section) => sum + section.cards.length, 0);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border p-6 shadow-sm" style={{ backgroundColor: 'var(--surface-panel-soft)', borderColor: 'var(--border-strong)' }}>
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_38%)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:text-emerald-300/80">Human Resources</p>
            <h1 className="mt-2 text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>HR operations hub</h1>
            <p className="mt-3 text-sm leading-6" style={{ color: 'var(--foreground-muted)' }}>
              Run daily workforce planning, attendance control, employee records, and HR setup from one entry point built for operations teams.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[26rem]">
            <div className="rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: 'var(--surface-panel-soft)', borderColor: 'var(--border-strong)' }}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>Accessible sections</p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>{totalVisibleCards}</p>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: 'var(--surface-panel-soft)', borderColor: 'var(--border-strong)' }}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>Primary workflow</p>
              <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">Schedule to attendance</p>
            </div>
            <div className="rounded-2xl border p-4 shadow-sm" style={{ backgroundColor: 'var(--surface-panel-soft)', borderColor: 'var(--border-strong)' }}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--foreground-muted)' }}>Data foundation</p>
              <p className="mt-2 text-sm font-medium" style={{ color: 'var(--foreground)' }}>Employees, skills, documents</p>
            </div>
          </div>
        </div>
      </section>

      {visibleSections.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-900/40">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">No HR sections available</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your account does not currently have HR permissions for this company.
          </p>
        </section>
      ) : (
        visibleSections.map((section) => (
          <section key={section.title} className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{section.title}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">{section.description}</p>
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {section.cards.length} section{section.cards.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {section.cards.map((card) => (
                <HubLinkCard key={card.href} card={card} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
