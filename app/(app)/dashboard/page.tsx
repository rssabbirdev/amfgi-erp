'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';

import { EMPLOYEE_PORTAL_HOME, isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { APP_NAV_ITEMS, filterVisibleNavItems, type AppNavItem } from '@/lib/navigation/appNavigation';
import {
  WorkspaceHubHeader,
  WorkspaceHubLoadingSkeleton,
  WorkspaceHubSection,
  WorkspaceHubSectionsGrid,
  type WorkspaceHubSectionData,
} from '@/components/workspace';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const CATEGORY_ORDER = [
  'Operations',
  'Master Data',
  'People',
  'Insights',
  'Administration',
] as const satisfies ReadonlyArray<AppNavItem['category']>;

const SECTION_COPY: Record<AppNavItem['category'], { summary: string }> = {
  'Master Data': {
    summary: 'Customers, suppliers, jobs, and core records.',
  },
  Operations: {
    summary: 'Stock, receipts, dispatch, and live processing.',
  },
  People: {
    summary: 'Employees, attendance, and HR workflows.',
  },
  Insights: {
    summary: 'Reports and consumption review.',
  },
  Administration: {
    summary: 'Settings, roles, and system controls.',
  },
};

const DASHBOARD_SCROLL_KEY = 'workspace-home-scroll';
const DASHBOARD_RESTORE_KEY = 'workspace-home-restore';

function rememberScrollPosition() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(DASHBOARD_SCROLL_KEY, String(window.scrollY));
  window.sessionStorage.setItem(DASHBOARD_RESTORE_KEY, '1');
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

  if (status === 'loading') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2 border-b border-border pb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64 max-w-full sm:w-96" />
          <Skeleton className="h-4 w-48" />
        </div>
        <WorkspaceHubLoadingSkeleton sectionCount={6} columns={3} />
      </div>
    );
  }

  if (!session?.user) {
    redirect('/login');
  }

  if (isEmployeeSelfServiceUser(session.user)) {
    redirect(EMPLOYEE_PORTAL_HOME);
  }

  if (!session.user.activeCompanyId) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <div className="rounded-lg border border-border bg-card px-5 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Workspace</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Select a company</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Choose an active company from the header to load modules for that workspace.
          </p>
          <Link href="/select-company" className={cn(buttonVariants({ variant: 'default' }), 'mt-4 inline-flex')}>
            Company selection
          </Link>
        </div>
        <Alert>
          <AlertTitle>No active company</AlertTitle>
          <AlertDescription>Use the company switcher in the top bar.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const visibleItems = filterVisibleNavItems(APP_NAV_ITEMS, {
    permissions: session.user.permissions ?? [],
    isSuperAdmin: session.user.isSuperAdmin ?? false,
    linkedEmployeeId: session.user.linkedEmployeeId,
    selfServiceOnly: false,
  }).filter((item) => item.href !== '/dashboard');

  const sections: WorkspaceHubSectionData[] = CATEGORY_ORDER.map((category) => ({
    id: category.toLowerCase().replace(/\s+/g, '-'),
    title: category,
    description: SECTION_COPY[category].summary,
    links: visibleItems
      .filter((item) => item.category === category)
      .map((item) => ({
        href: item.href,
        title: item.shortTitle,
        subtitle: item.label,
        description: item.description,
        icon: item.icon,
        onClick: rememberScrollPosition,
      })),
  })).filter((section) => section.links.length > 0);

  const companyName = session.user.activeCompanyName || 'Company workspace';

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <WorkspaceHubHeader
        eyebrow="Home"
        title={companyName}
        description="Select a module from the lists below."
        trailing={`${visibleItems.length} module${visibleItems.length === 1 ? '' : 's'}`}
      />

      <WorkspaceHubSectionsGrid columns={3}>
        {sections.map((section) => (
          <WorkspaceHubSection key={section.id} section={section} />
        ))}
      </WorkspaceHubSectionsGrid>
    </div>
  );
}
