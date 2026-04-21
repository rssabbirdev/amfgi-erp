'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import CompanySwitcher from './CompanySwitcher';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';
import { useTheme } from '@/providers/ThemeProvider';

type HeaderProps = {
  onMenuToggle?: () => void;
};

export default function Header({ onMenuToggle }: HeaderProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);
  const selfServiceTitle =
    pathname?.startsWith('/me/attendance') ? 'My Attendance' : pathname?.startsWith('/me/profile') ? 'My Profile' : 'Employee Portal';
  const profileHref = selfServiceOnly ? '/me/profile' : '/profile';

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  const avatarImage = session?.user?.image?.trim() || '';

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-slate-900/75 px-3 backdrop-blur-xl supports-backdrop-filter:bg-slate-900/60 sm:gap-4 sm:px-5 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="touch-manipulation rounded-xl p-2 text-slate-300 hover:bg-white/6 hover:text-white lg:hidden"
            aria-label="Open navigation menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          {selfServiceOnly ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{selfServiceTitle}</p>
              <p className="text-xs text-slate-500">Employee self service</p>
            </div>
          ) : (
            <CompanySwitcher />
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggle}
          className="touch-manipulation rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
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

        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setAccountMenuOpen((open) => !open)}
            className="touch-manipulation flex items-center gap-2 rounded-xl px-2 py-1.5 text-slate-300 transition-colors hover:bg-white/6 hover:text-white sm:gap-3 sm:px-2.5"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            aria-label="Open account menu"
          >
            <div className="hidden min-w-0 text-right md:block">
              <p className="max-w-40 truncate text-sm font-medium leading-tight text-white lg:max-w-56">
                {session?.user?.name}
              </p>
              <p className="text-xs leading-tight text-slate-500">
                {selfServiceOnly ? 'Employee' : session?.user?.isSuperAdmin ? 'Super Admin' : 'User'}
              </p>
            </div>
            <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-emerald-500 to-emerald-700 text-sm font-semibold text-white ring-1 ring-white/10 sm:h-9 sm:w-9">
              {avatarImage ? (
                <Image src={avatarImage} alt="" fill className="object-cover" sizes="36px" />
              ) : (
                <span>{session?.user?.name?.[0]?.toUpperCase() ?? '?'}</span>
              )}
            </div>
            <svg className="hidden h-4 w-4 text-slate-500 md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {accountMenuOpen && (
            <div
              className="absolute right-0 top-full z-40 mt-2 w-48 rounded-2xl border border-white/10 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl"
              role="menu"
            >
              <Link
                href={profileHref}
                onClick={() => setAccountMenuOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/6 hover:text-white"
                role="menuitem"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span>Profile</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void signOut({ callbackUrl: '/login' });
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 hover:text-red-200"
                role="menuitem"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
