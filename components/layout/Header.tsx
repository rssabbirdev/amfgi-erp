'use client';

import { useSession, signOut } from 'next-auth/react';
import CompanySwitcher from './CompanySwitcher';

type HeaderProps = {
  onMenuToggle?: () => void;
};

export default function Header({ onMenuToggle }: HeaderProps) {
  const { data: session } = useSession();

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
          <CompanySwitcher />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden min-w-0 items-center gap-2.5 sm:flex sm:gap-3">
          <div className="hidden text-right md:block">
            <p className="max-w-40 truncate text-sm font-medium leading-tight text-white lg:max-w-56">
              {session?.user?.name}
            </p>
            <p className="text-xs leading-tight text-slate-500">
              {session?.user?.isSuperAdmin ? 'Super Admin' : 'User'}
            </p>
          </div>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-emerald-700 text-sm font-semibold text-white ring-1 ring-white/10 sm:h-9 sm:w-9"
            title={session?.user?.name ?? 'User'}
          >
            {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="touch-manipulation rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/6 hover:text-white"
          title="Sign out"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}
