'use client';

import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { useTheme } from '@/providers/ThemeProvider';
import { SidebarTrigger } from '@/components/ui/shadcn/sidebar';

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);
  const selfServiceTitle =
    pathname?.startsWith('/me/attendance')
      ? 'My Attendance'
      : pathname?.startsWith('/me/leave')
        ? 'My Leave'
        : pathname?.startsWith('/me/documents')
          ? 'My Documents'
          : pathname === '/me' || pathname?.startsWith('/me/profile')
            ? 'My Profile'
            : 'Employee Portal';

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-3 backdrop-blur-xl supports-backdrop-filter:bg-background/70 sm:gap-4 sm:px-5 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <SidebarTrigger className="touch-manipulation rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:hidden [&_svg]:size-5" />
        <div className="min-w-0 flex-1">
          {selfServiceOnly ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{selfServiceTitle}</p>
              <p className="text-xs text-muted-foreground">Employee self service</p>
            </div>
          ) : (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {session?.user?.activeCompanyName ?? 'AMFGI ERP'}
              </p>
              <p className="truncate text-xs text-muted-foreground">Signed in as {session?.user?.name ?? 'User'}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggle}
          className="touch-manipulation rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
