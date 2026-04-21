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

const CATEGORY_COPY: Record<AppNavItem['category'], string> = {
  Operations: 'Daily work areas for receipts, dispatch, and operational processing.',
  'Master Data': 'Reference records that support customers, suppliers, jobs, and materials.',
  People: 'HR, workforce records, and self-service related pages.',
  Insights: 'Reports and review areas for monitoring business activity.',
  Administration: 'System setup, access control, media, and company configuration.',
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
      <section className="rounded-2xl border px-6 py-6 sm:px-8" style={sectionCardStyle()}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em]" style={mutedTextStyle()}>
              Workspace Home
            </p>
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--foreground)' }}>
                {session.user.activeCompanyName || 'Company workspace'}
              </h1>
              <p className="mt-2 max-w-3xl text-sm sm:text-base" style={bodyTextStyle()}>
                Every module is grouped below by category. The large title on each card is the short title for
                faster scanning, and the smaller line underneath keeps the full menu name visible.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border px-4 py-3" style={sectionCardStyle()}>
              <p className="text-xs uppercase tracking-[0.16em]" style={mutedTextStyle()}>
                Categories
              </p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
                {groupedItems.length}
              </p>
            </div>
            <div className="rounded-xl border px-4 py-3" style={sectionCardStyle()}>
              <p className="text-xs uppercase tracking-[0.16em]" style={mutedTextStyle()}>
                Modules
              </p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
                {visibleItems.length}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border px-4 py-3 sm:col-span-1" style={sectionCardStyle()}>
              <p className="text-xs uppercase tracking-[0.16em]" style={mutedTextStyle()}>
                Active company
              </p>
              <p className="mt-2 truncate text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                {session.user.activeCompanyName || 'Not set'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {groupedItems.map((group) => (
        <section key={group.category} className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
                {group.category}
              </h2>
              <p className="mt-1 text-sm" style={mutedTextStyle()}>
                {CATEGORY_COPY[group.category]}
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
                className="group rounded-2xl border px-5 py-5 transition-colors duration-200 hover:bg-white/5"
                style={sectionCardStyle()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-cyan-400 transition-colors duration-200 group-hover:text-cyan-300"
                    style={{
                      backgroundColor: 'var(--surface-subtle)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    {item.icon}
                  </div>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]"
                    style={{
                      color: 'var(--foreground-muted)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    {group.category}
                  </span>
                </div>

                <div className="mt-5">
                  <h3 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
                    {item.shortTitle}
                  </h3>
                  <p className="mt-1 text-sm font-medium" style={bodyTextStyle()}>
                    {item.label}
                  </p>
                  <p className="mt-3 text-sm leading-6" style={mutedTextStyle()}>
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
