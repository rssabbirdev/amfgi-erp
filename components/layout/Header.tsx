'use client';

import { useSession, signOut } from 'next-auth/react';
import CompanySwitcher          from './CompanySwitcher';

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-700/50 flex items-center justify-between px-6">
      <CompanySwitcher />

      <div className="flex items-center gap-4">
        {/* User info */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-white leading-tight">
              {session?.user?.name}
            </p>
            <p className="text-xs text-slate-500 leading-tight">
              {session?.user?.isSuperAdmin ? 'Super Admin' : 'User'}
            </p>
          </div>
          <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-semibold text-sm">
            {session?.user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="rounded-md p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Sign out"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  );
}
