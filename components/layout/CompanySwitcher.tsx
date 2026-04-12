'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from 'next-auth/react';
import { useAppDispatch } from '@/store/hooks';
import { switchActiveCompany } from '@/store/slices/companySlice';
import toast from 'react-hot-toast';
import { useGetCompaniesQuery } from '@/store/hooks';
import { appApi } from '@/store/api/appApi';

/** Below HoverTooltip (10000), above app chrome (sidebar ~40, header ~30). */
const Z_DROPDOWN_BACKDROP = 6000;
const Z_DROPDOWN_PANEL = 6010;
const Z_CONFIRM_BACKDROP = 6020;
const Z_CONFIRM_DIALOG = 6030;

interface Company {
  id: string;
  name: string;
  slug: string;
}

export default function CompanySwitcher() {
  const { data: session, update } = useSession();
  const dispatch = useAppDispatch();
  const { data: companiesData = [] } = useGetCompaniesQuery();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; targetId: string | null }>({
    show: false,
    targetId: null,
  });
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 256 });

  const companies: Company[] = companiesData.map((c: { id: string; name: string; slug: string }) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  const activeCompany = companies.find((c) => c.id === session?.user?.activeCompanyId);

  const targetCompany = confirmDialog.targetId
    ? companies.find((c) => c.id === confirmDialog.targetId)
    : null;

  const updateMenuPos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 4;
    const w = Math.max(r.width, 256);
    let left = r.left;
    if (left + w > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - w - 8);
    }
    setMenuPos({ top: r.bottom + pad, left, width: w });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const fn = () => updateMenuPos();
    window.addEventListener('scroll', fn, true);
    window.addEventListener('resize', fn);
    return () => {
      window.removeEventListener('scroll', fn, true);
      window.removeEventListener('resize', fn);
    };
  }, [open, updateMenuPos]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleSwitchConfirmed = async (companyId: string | null) => {
    setConfirmDialog({ show: false, targetId: null });
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch('/api/session/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Switch failed');
      }
      const { data } = json;

      await update({
        activeCompanyId: data.activeCompanyId,
        activeCompanySlug: data.activeCompanySlug,
        activeCompanyName: data.activeCompanyName,
        permissions: data.permissions,
        allowedCompanyIds: data.allowedCompanyIds,
        isSuperAdmin: data.isSuperAdmin,
      });

      dispatch(
        switchActiveCompany({
          activeCompanyId: data.activeCompanyId,
          activeCompanySlug: data.activeCompanySlug,
          activeCompanyName: data.activeCompanyName,
          permissions: data.permissions,
        }),
      );

      dispatch(appApi.util.resetApiState());

      toast.success(
        data.activeCompanyName ? `Switched to ${data.activeCompanyName}` : 'Viewing all companies',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch company';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = (companyId: string | null) => {
    if (companyId === session?.user?.activeCompanyId) {
      setOpen(false);
      return;
    }
    setConfirmDialog({ show: true, targetId: companyId });
  };

  const visibleCompanies = session?.user?.isSuperAdmin
    ? companies
    : companies.filter((c) => session?.user?.allowedCompanyIds?.includes(c.id));

  if (visibleCompanies.length === 0) return null;

  const dropdownPortal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: Z_DROPDOWN_BACKDROP }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              className="fixed max-h-[min(70vh,calc(100vh-5rem))] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl ring-1 ring-white/5"
              style={{
                zIndex: Z_DROPDOWN_PANEL,
                top: menuPos.top,
                left: menuPos.left,
                minWidth: menuPos.width,
              }}
            >
              {session?.user?.isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => handleSwitch(null)}
                  className={[
                    'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors',
                    !session.user.activeCompanyId
                      ? 'bg-purple-600/10 text-purple-400'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                  ].join(' ')}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-purple-400" />
                  All Companies (Admin)
                </button>
              )}
              {visibleCompanies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSwitch(c.id)}
                  className={[
                    'flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-colors',
                    c.id === session?.user?.activeCompanyId
                      ? 'bg-emerald-600/10 text-emerald-400'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                  ].join(' ')}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${c.id === session?.user?.activeCompanyId ? 'bg-emerald-400' : 'bg-slate-500'}`}
                  />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </>,
          document.body,
        )
      : null;

  const confirmPortal =
    confirmDialog.show && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/50"
              style={{ zIndex: Z_CONFIRM_BACKDROP }}
              onClick={() => setConfirmDialog({ show: false, targetId: null })}
              aria-hidden
            />
            <div
              className="fixed left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700 bg-slate-800 p-6"
              style={{ zIndex: Z_CONFIRM_DIALOG }}
            >
              <h2 className="mb-2 text-lg font-semibold text-white">Switch Company?</h2>
              <p className="mb-6 text-sm text-slate-300">
                Switching to <strong>{targetCompany?.name || 'Admin View'}</strong> will refresh all data.
                <br />
                <span className="mt-2 block text-xs text-slate-400">
                  All materials, jobs, and customers from the current company will be replaced with data from the
                  target company.
                </span>
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDialog({ show: false, targetId: null })}
                  className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchConfirmed(confirmDialog.targetId)}
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loading ? 'Switching...' : 'Switch'}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="relative">
        <button
          ref={anchorRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={loading}
          className="flex max-w-full items-center gap-2 rounded-xl border border-white/10 bg-slate-800/80 px-2.5 py-1.5 text-sm text-slate-300 transition-colors hover:border-white/15 hover:text-white sm:px-3"
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <span className="min-w-0 truncate text-left">
            {activeCompany?.name ?? (session?.user?.isSuperAdmin ? 'Select Company' : 'No Company')}
          </span>
          <svg className="h-3 w-3 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {dropdownPortal}
      {confirmPortal}
    </>
  );
}
