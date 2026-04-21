'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';

const SIDEBAR_COLLAPSED_KEY = 'amfgi-sidebar-collapsed';
const SCROLL_STATE_KEY_PREFIX = 'amfgi-scroll:';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const isScheduleEditorRoute = pathname?.startsWith('/hr/schedule/') ?? false;
  const isAttendanceCreateRoute = pathname?.startsWith('/hr/attendance/create') ?? false;
  const isEmployeePortalRoute = pathname?.startsWith('/me') ?? false;
  const isChromelessRoute = isScheduleEditorRoute || isAttendanceCreateRoute || isEmployeePortalRoute;
  const routeScrollKey = useMemo(() => {
    const query = searchParams?.toString();
    return `${SCROLL_STATE_KEY_PREFIX}${pathname || '/'}${query ? `?${query}` : ''}`;
  }, [pathname, searchParams]);

  const closeNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleNav = useCallback(() => setMobileNavOpen((o) => !o), []);

  const toggleDesktopCollapse = useCallback(() => {
    setDesktopCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let frame = 0;
    try {
      const nextCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
      frame = window.requestAnimationFrame(() => {
        setDesktopCollapsed(nextCollapsed);
      });
    } catch {
      frame = window.requestAnimationFrame(() => {
        setDesktopCollapsed(false);
      });
    }
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNav();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen, closeNav]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const persistScroll = () => {
      try {
        sessionStorage.setItem(routeScrollKey, String(main.scrollTop));
      } catch {
        /* ignore */
      }
    };

    persistScroll();
    main.addEventListener('scroll', persistScroll, { passive: true });
    window.addEventListener('beforeunload', persistScroll);

    return () => {
      persistScroll();
      main.removeEventListener('scroll', persistScroll);
      window.removeEventListener('beforeunload', persistScroll);
    };
  }, [routeScrollKey]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    let nextScrollTop = 0;

    try {
      const raw = sessionStorage.getItem(routeScrollKey);
      if (raw) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          nextScrollTop = parsed;
        }
      }
    } catch {
      nextScrollTop = 0;
    }

    const frame = window.requestAnimationFrame(() => {
      main.scrollTo({ top: nextScrollTop, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [routeScrollKey]);

  return (
    <div className="flex min-h-dvh h-dvh max-h-dvh overflow-hidden bg-slate-950 lg:h-screen lg:max-h-none">
      {!isChromelessRoute && mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm transition-opacity motion-reduce:transition-none lg:hidden"
          onClick={closeNav}
        />
      )}

      {!isChromelessRoute && (
        <Sidebar
          onNavigate={closeNav}
          desktopCollapsed={desktopCollapsed}
          onToggleDesktopCollapse={toggleDesktopCollapse}
          className={[
            'fixed inset-y-0 left-0 z-40 w-[min(17.5rem,88vw)] border-r border-white/5 shadow-2xl shadow-black/50',
            'transition-transform duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none',
            'lg:static lg:z-0 lg:max-w-none lg:shadow-none lg:translate-x-0',
            'lg:transition-[width] lg:duration-200 lg:ease-out motion-reduce:lg:transition-none',
            desktopCollapsed ? 'lg:w-19' : 'lg:w-64',
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!isChromelessRoute && <Header onMenuToggle={toggleNav} />}
        <main ref={mainRef} className="relative z-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]"
            aria-hidden
          />
          <div
            className={
              isChromelessRoute
                ? 'relative w-full'
                : 'relative mx-auto w-full max-w-[1680px] px-4 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6'
            }
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
