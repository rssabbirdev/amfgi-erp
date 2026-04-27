'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { APP_NAV_ITEMS, filterVisibleNavItems, type AppNavItem } from '@/lib/navigation/appNavigation';

const CATEGORY_ORDER = [
  'Operations',
  'Master Data',
  'People',
  'Insights',
  'Administration',
] as const satisfies ReadonlyArray<AppNavItem['category']>;

const CATEGORY_ACCENT: Record<
  AppNavItem['category'],
  {
    border: string;
    glow: string;
    line: string;
    marker: string;
    icon: string;
  }
> = {
  'Master Data': {
    border: 'border-sky-400/30',
    glow: 'from-sky-500/18 via-sky-500/6 to-transparent',
    line: 'from-sky-400/75 to-cyan-300/50',
    marker: 'bg-sky-400 text-slate-950',
    icon: 'text-sky-500',
  },
  Operations: {
    border: 'border-emerald-400/30',
    glow: 'from-emerald-500/18 via-emerald-500/6 to-transparent',
    line: 'from-emerald-400/75 to-teal-300/50',
    marker: 'bg-emerald-400 text-slate-950',
    icon: 'text-emerald-500',
  },
  People: {
    border: 'border-amber-300/35',
    glow: 'from-amber-400/18 via-amber-300/6 to-transparent',
    line: 'from-amber-300/75 to-orange-200/50',
    marker: 'bg-amber-300 text-slate-950',
    icon: 'text-amber-500',
  },
  Insights: {
    border: 'border-fuchsia-300/30',
    glow: 'from-fuchsia-400/18 via-fuchsia-400/6 to-transparent',
    line: 'from-fuchsia-300/75 to-pink-200/50',
    marker: 'bg-fuchsia-300 text-slate-950',
    icon: 'text-fuchsia-500',
  },
  Administration: {
    border: 'border-slate-300/25',
    glow: 'from-slate-300/16 via-slate-300/6 to-transparent',
    line: 'from-slate-300/75 to-slate-100/45',
    marker: 'bg-slate-200 text-slate-950',
    icon: 'text-slate-500',
  },
};

const CATEGORY_FLOW_COPY: Record<
  AppNavItem['category'],
  {
    eyebrow: string;
    summary: string;
  }
> = {
  'Master Data': {
    eyebrow: 'Prepare the foundation',
    summary: 'Set up customers, suppliers, jobs, and core records before live processing starts.',
  },
  Operations: {
    eyebrow: 'Run the live movement',
    summary: 'Post receipts, dispatches, and stock activity against the correct jobs and materials.',
  },
  People: {
    eyebrow: 'Coordinate the workforce',
    summary: 'Manage employees, attendance, and site controls that support daily operations.',
  },
  Insights: {
    eyebrow: 'Review the business signal',
    summary: 'Review reports and consumption to understand what happened after execution.',
  },
  Administration: {
    eyebrow: 'Control the system rules',
    summary: 'Maintain settings, roles, and integrations that keep the workflow controlled.',
  },
};

const DASHBOARD_SCROLL_KEY = 'workspace-home-scroll';
const DASHBOARD_RESTORE_KEY = 'workspace-home-restore';

function sectionCardStyle() {
  return {
    backgroundColor: 'var(--surface-panel-soft)',
    borderColor: 'var(--border-strong)',
  };
}

function mutedTextStyle() {
  return { color: 'var(--foreground-muted)' };
}

function bodyTextStyle() {
  return { color: 'var(--foreground-soft)' };
}

function strongTextStyle() {
  return { color: 'var(--foreground)' };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const shouldRestore = window.sessionStorage.getItem(DASHBOARD_RESTORE_KEY);
    const savedScroll = window.sessionStorage.getItem(DASHBOARD_SCROLL_KEY);

    if (shouldRestore === '1' && savedScroll) {
      window.sessionStorage.removeItem(DASHBOARD_RESTORE_KEY);
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: Number(savedScroll), behavior: 'auto' });
      });
    }
  }, []);

  const rememberScrollPosition = () => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(DASHBOARD_SCROLL_KEY, String(window.scrollY));
    window.sessionStorage.setItem(DASHBOARD_RESTORE_KEY, '1');
  };

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border px-6 py-6 sm:px-8" style={sectionCardStyle()}>
          <p className="text-sm font-medium uppercase tracking-[0.18em]" style={mutedTextStyle()}>
            Workspace Home
          </p>
          <div className="mt-4 h-8 w-56 rounded-lg" style={{ backgroundColor: 'var(--surface-subtle)' }} />
          <div className="mt-3 h-4 w-full max-w-2xl rounded-lg" style={{ backgroundColor: 'var(--surface-subtle)' }} />
        </section>
      </div>
    );
  }

  if (!session?.user) {
    redirect('/login');
  }

  if (isEmployeeSelfServiceUser(session.user)) {
    redirect('/me/profile');
  }

  if (!session.user.activeCompanyId) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border px-6 py-6 sm:px-8" style={sectionCardStyle()}>
          <p className="text-sm font-medium uppercase tracking-[0.18em]" style={mutedTextStyle()}>
            Workspace Home
          </p>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--foreground)' }}>
            Select a company to continue
          </h1>
          <p className="mt-2 max-w-2xl text-sm sm:text-base" style={bodyTextStyle()}>
            This home page is organized by category and shows the modules available for the active company.
            Select a company from the header first, then open the work area you need.
          </p>
        </section>

        <section className="rounded-2xl border px-6 py-8 text-center" style={sectionCardStyle()}>
          <p className="text-sm" style={mutedTextStyle()}>
            No active company selected. Use the company switcher in the top bar to load your workspace.
          </p>
        </section>
      </div>
    );
  }

  const visibleItems = filterVisibleNavItems(APP_NAV_ITEMS, {
    permissions: session.user.permissions ?? [],
    isSuperAdmin: session.user.isSuperAdmin ?? false,
    linkedEmployeeId: session.user.linkedEmployeeId,
    selfServiceOnly: false,
  }).filter((item) => item.href !== '/dashboard');

  const groupedItems = CATEGORY_ORDER.map((category) => ({
    category,
    items: visibleItems.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-3xl border shadow-sm"
        style={{
          ...sectionCardStyle(),
          backgroundImage:
            'radial-gradient(circle at top left, rgba(56,189,248,0.14), transparent 22%), radial-gradient(circle at top right, rgba(16,185,129,0.18), transparent 24%), linear-gradient(180deg, var(--surface-panel-soft), color-mix(in srgb, var(--surface-panel-soft) 76%, transparent))',
        }}
      >
        <div className="px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">
                Operations Workflow
              </p>
              <div className="max-w-4xl">
                <h1 className="text-3xl font-semibold" style={strongTextStyle()}>
                  {session.user.activeCompanyName || 'Company workspace'}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6" style={mutedTextStyle()}>
                  Open modules in a clearer business order, from setup through execution and review.
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              {groupedItems.map((group, index) => {
                const accent = CATEGORY_ACCENT[group.category];
                return (
                  <div
                    key={group.category}
                    className={`relative rounded-[1.4rem] border px-4 py-4 ${accent.border} bg-linear-to-br ${accent.glow}`}
                    style={{ backgroundColor: 'color-mix(in srgb, var(--surface-panel-soft) 88%, transparent)' }}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${accent.marker}`}>
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.16em]" style={mutedTextStyle()}>
                            {CATEGORY_FLOW_COPY[group.category].eyebrow}
                          </p>
                          <h2 className="mt-1 text-sm font-semibold" style={strongTextStyle()}>
                            {group.category}
                          </h2>
                        </div>
                      </div>
                    <p className="mt-3 text-sm leading-5" style={bodyTextStyle()}>
                      {CATEGORY_FLOW_COPY[group.category].summary}
                    </p>
                    {index < groupedItems.length - 1 ? (
                      <div className="mt-3 hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] lg:flex" style={mutedTextStyle()}>
                        <span>Next</span>
                        <span className="text-base">→</span>
                        <span>{groupedItems[index + 1]?.category}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-5">
        {groupedItems.map((group, index) => {
          const accent = CATEGORY_ACCENT[group.category];
          const nextGroup = groupedItems[index + 1];

          return (
            <div key={group.category} className="space-y-4">
              <section className="relative overflow-hidden rounded-2xl border shadow-sm" style={sectionCardStyle()}>
                <div className="absolute inset-y-0 left-0 hidden w-px lg:block">
                  <div className={`h-full w-full bg-linear-to-b ${accent.line}`} />
                </div>

                <div className="grid gap-px lg:grid-cols-[18rem_minmax(0,1fr)]" style={{ backgroundColor: 'var(--border-strong)' }}>
                  <div
                    className={`relative bg-linear-to-br px-5 py-5 ${accent.glow}`}
                    style={{ backgroundColor: 'color-mix(in srgb, var(--surface-panel-soft) 92%, transparent)' }}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 place-items-center rounded-2xl text-sm font-bold ${accent.marker}`}>
                        {index + 1}
                      </span>
                      <div>
                        <p className="text-xs uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                          {CATEGORY_FLOW_COPY[group.category].eyebrow}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold" style={strongTextStyle()}>
                          {group.category}
                        </h2>
                      </div>
                    </div>

                    <p className="mt-3 text-sm leading-6" style={bodyTextStyle()}>
                      {CATEGORY_FLOW_COPY[group.category].summary}
                    </p>
                  </div>

                  <div className="px-5 py-5">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={mutedTextStyle()}>
                          Available pages
                        </p>
                        <p className="mt-1 text-sm" style={mutedTextStyle()}>
                          Open the modules in this stage.
                        </p>
                      </div>
                      <p className="text-xs uppercase tracking-[0.16em]" style={mutedTextStyle()}>
                        {group.items.length} item{group.items.length === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onNavigate={rememberScrollPosition}
                          className="group rounded-[1.4rem] border px-5 py-5 transition duration-200 hover:-translate-y-0.5"
                          style={{
                            ...sectionCardStyle(),
                            borderColor: 'color-mix(in srgb, var(--border-strong) 86%, transparent)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${accent.icon}`}
                              style={{
                                backgroundColor: 'var(--surface-subtle)',
                                borderColor: 'color-mix(in srgb, var(--border-strong) 86%, transparent)',
                              }}
                            >
                              {item.icon}
                            </div>
                            <span
                              className="rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]"
                              style={{
                                color: 'var(--foreground-muted)',
                                borderColor: 'color-mix(in srgb, var(--border-strong) 86%, transparent)',
                              }}
                            >
                              Step {index + 1}
                            </span>
                          </div>

                          <div className="mt-5">
                            <h3 className="text-xl font-semibold" style={strongTextStyle()}>
                              {item.shortTitle}
                            </h3>
                            <p className="mt-1 text-sm font-medium" style={bodyTextStyle()}>
                              {item.label}
                            </p>
                            <p className="mt-3 text-sm leading-6" style={mutedTextStyle()}>
                              {item.description}
                            </p>
                          </div>

                          <div className="mt-5 flex items-center justify-between">
                            <span className="text-xs uppercase tracking-[0.16em]" style={mutedTextStyle()}>
                              Open module
                            </span>
                            <span className={`text-lg ${accent.icon}`}>→</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {nextGroup ? (
                <div className="flex items-center justify-center">
                  <div
                    className="flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{
                      backgroundColor: 'var(--surface-panel-soft)',
                      borderColor: 'color-mix(in srgb, var(--border-strong) 86%, transparent)',
                      color: 'var(--foreground-muted)',
                    }}
                  >
                    <span>{group.category}</span>
                    <span className="text-base">→</span>
                    <span>{nextGroup.category}</span>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
