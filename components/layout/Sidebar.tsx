'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { HoverTooltip, useLgUp } from '@/components/ui/HoverTooltip';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ReactNode;
  /** Permission required — undefined means always visible to authenticated users */
  perm?: string;
  /** Visible when the user has any one of these permissions */
  anyPerms?: string[];
  /** Super admin only */
  adminOnly?: boolean;
  /** Shown only when the user is linked to an employee (self-service) */
  linkedEmployeeOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/customers/jobs', label: 'Jobs', perm: 'job.view',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: '/stock', label: 'Stock', anyPerms: ['material.view', 'job.view', 'transaction.stock_in', 'transaction.stock_out', 'transaction.reconcile'],
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    href: '/suppliers', label: 'Suppliers', perm: 'supplier.view',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5.581a1 1 0 00-.424.106A2 2 0 005 19m2 0H3m2 0h5.581A2 2 0 0010 21m0-6h6m-6 0h6m0 0v-3m0 3v3" />
      </svg>
    ),
  },
  {
    href: '/customers', label: 'Customers', perm: 'customer.view',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/hr', label: 'HR', perm: 'hr.employee.view',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    href: '/me', label: 'My HR', linkedEmployeeOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/reports/job-consumption', label: 'Reports', perm: 'report.view',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    href: '/settings', label: 'Settings', perm: 'settings.manage',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/admin/companies', label: 'Companies', adminOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    href: '/admin/roles', label: 'Roles', perm: 'role.manage',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    href: '/admin/users', label: 'Users', perm: 'user.view',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

type SidebarProps = {
  /** Close mobile drawer after navigation */
  onNavigate?: () => void;
  className?: string;
  /** lg+ only: narrow rail with icons only */
  desktopCollapsed?: boolean;
  onToggleDesktopCollapse?: () => void;
};

export default function Sidebar({
  onNavigate,
  className = '',
  desktopCollapsed = false,
  onToggleDesktopCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const permissions = (session?.user?.permissions ?? []) as string[];
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;

  const linkedEmployeeId = (session?.user as { linkedEmployeeId?: string | null } | undefined)?.linkedEmployeeId;
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);

  const selfServiceItems: NavItem[] = [
    {
      href: '/me/profile',
      label: 'My Profile',
      linkedEmployeeOnly: true,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      ),
    },
    {
      href: '/me/attendance',
      label: 'My Attendance',
      linkedEmployeeOnly: true,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ];

  const visibleItems = (selfServiceOnly ? selfServiceItems : NAV_ITEMS).filter((item) => {
    if (item.adminOnly) return isSuperAdmin;
    if (item.linkedEmployeeOnly) return Boolean(linkedEmployeeId);
    if (item.anyPerms?.length) return isSuperAdmin || item.anyPerms.some((perm) => permissions.includes(perm));
    if (item.perm)      return isSuperAdmin || permissions.includes(item.perm);
    return true;
  });

  const activeCompanyName = session?.user?.activeCompanyName;
  const isLgUp = useLgUp();
  const showIconTooltips = Boolean(desktopCollapsed && isLgUp);

  return (
    <aside
      className={[
        'flex min-h-full shrink-0 flex-col bg-slate-900/95 backdrop-blur-xl supports-backdrop-filter:bg-slate-900/80',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Brand — full on mobile drawer; icon-only rail on lg when collapsed */}
      <div
        className={[
          'border-b border-white/5 px-5 py-4 sm:px-6 sm:py-5',
          desktopCollapsed ? 'lg:px-2 lg:py-4' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className={[
            'flex items-center gap-3',
            desktopCollapsed ? 'lg:justify-center lg:gap-0' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-900/30 ring-1 ring-white/10">
            <span className="text-sm font-bold text-white">
              {activeCompanyName?.[0]?.toUpperCase() ?? 'A'}
            </span>
          </div>
          <div
            className={[
              'min-w-0',
              desktopCollapsed ? 'lg:sr-only' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <p className="truncate text-sm font-semibold leading-tight text-white">
              {selfServiceOnly ? 'Employee Portal' : activeCompanyName ?? 'Select Company'}
            </p>
            <p className="text-xs leading-tight text-slate-500">
              {selfServiceOnly ? 'Self service' : 'AMFGI ERP'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav
        className={[
          'flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-2 py-3 sm:px-3 sm:py-4',
          desktopCollapsed ? 'lg:px-1.5 lg:py-3' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <HoverTooltip
              key={item.href}
              label={item.label}
              enabled={showIconTooltips}
              className="w-full"
            >
              <Link
                href={item.href}
                onClick={() => onNavigate?.()}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  desktopCollapsed
                    ? 'lg:justify-center lg:px-0 lg:py-2.5'
                    : '',
                  active
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25'
                    : 'text-slate-400 hover:bg-white/6 hover:text-slate-100',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={['shrink-0', active ? 'text-emerald-400' : ''].filter(Boolean).join(' ')}>
                  {item.icon}
                </span>
                <span
                  className={[
                    'truncate',
                    desktopCollapsed ? 'lg:sr-only' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {item.label}
                </span>
              </Link>
            </HoverTooltip>
          );
        })}
      </nav>

      {/* Desktop collapse toggle */}
      {onToggleDesktopCollapse && (
        <div className="hidden shrink-0 border-t border-white/5 px-2 py-2 lg:block">
          <HoverTooltip
            label={desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            enabled={isLgUp}
            className="w-full"
          >
            <button
              type="button"
              onClick={onToggleDesktopCollapse}
              className="flex w-full items-center justify-center rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
              aria-expanded={!desktopCollapsed}
              aria-label={desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg
                className={[
                  'h-5 w-5 transition-transform duration-200 motion-reduce:transition-none',
                  desktopCollapsed ? 'rotate-180' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              </svg>
            </button>
          </HoverTooltip>
        </div>
      )}
      <div
        className={[
          'border-t border-white/5 px-3 py-3 text-center text-[11px] text-slate-600 sm:py-4',
          desktopCollapsed ? 'lg:hidden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        Almuraqib FGI © {new Date().getFullYear()}
      </div>
    </aside>
  );
}
