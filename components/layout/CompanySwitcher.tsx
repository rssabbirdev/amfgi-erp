'use client';

import { useState }                  from 'react';
import { useSession }                from 'next-auth/react';
import { useAppDispatch }            from '@/store/hooks';
import { switchActiveCompany }       from '@/store/slices/companySlice';
import toast                         from 'react-hot-toast';
import { useGetCompaniesQuery } from '@/store/hooks';
import { appApi } from '@/store/api/appApi';

interface Company {
  _id:  string;
  name: string;
  slug: string;
}

export default function CompanySwitcher() {
  const { data: session, update } = useSession();
  const dispatch = useAppDispatch();
  const { data: companiesData = [] } = useGetCompaniesQuery();
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; targetId: string | null }>({ show: false, targetId: null });

  // For type safety, cast companies data
  const companies: Company[] = companiesData.map((c: any) => ({
    _id: c._id,
    name: c.name,
    slug: c.slug,
  }));

  const activeCompany = companies.find(
    (c) => c._id === session?.user?.activeCompanyId
  );

  const targetCompany = confirmDialog.targetId
    ? companies.find((c) => c._id === confirmDialog.targetId)
    : null;

  const handleSwitchConfirmed = async (companyId: string | null) => {
    setConfirmDialog({ show: false, targetId: null });
    setLoading(true);
    setOpen(false);
    try {
      const res = await fetch('/api/session/switch-company', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ companyId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? 'Switch failed');
      }
      const { data } = json;

      // Update NextAuth JWT
      await update({
        activeCompanyId:     data.activeCompanyId,
        activeCompanySlug:   data.activeCompanySlug,
        activeCompanyDbName: data.activeCompanyDbName,
        activeCompanyName:   data.activeCompanyName,
        permissions:         data.permissions,
        allowedCompanyIds:   data.allowedCompanyIds,
        isSuperAdmin:        data.isSuperAdmin,
      });

      // Sync Redux
      dispatch(switchActiveCompany({
        activeCompanyId:   data.activeCompanyId,
        activeCompanySlug: data.activeCompanySlug,
        activeCompanyName: data.activeCompanyName,
        permissions:       data.permissions,
      }));

      // Reset all company-scoped cache (materials, jobs, customers, etc.)
      dispatch(appApi.util.resetApiState());

      toast.success(data.activeCompanyName ? `Switched to ${data.activeCompanyName}` : 'Viewing all companies');
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
      return; // No switch needed
    }

    // Show confirmation dialog
    setConfirmDialog({ show: true, targetId: companyId });
  };

  // Non-super-admins with exactly one company — no switcher needed
  const visibleCompanies = session?.user?.isSuperAdmin
    ? companies
    : companies.filter((c) => session?.user?.allowedCompanyIds?.includes(c._id));

  if (visibleCompanies.length === 0) return null;

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors"
        >
          <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span>{activeCompany?.name ?? (session?.user?.isSuperAdmin ? 'Select Company' : 'No Company')}</span>
          <svg className="h-3 w-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-20 w-64 rounded-lg bg-slate-800 border border-slate-700 shadow-xl py-1">
              {session?.user?.isSuperAdmin && (
                <button
                  onClick={() => handleSwitch(null)}
                  className={[
                    'w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
                    !session.user.activeCompanyId
                      ? 'text-purple-400 bg-purple-600/10'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                  ].join(' ')}
                >
                  <span className="h-2 w-2 rounded-full bg-purple-400 shrink-0" />
                  All Companies (Admin)
                </button>
              )}
              {visibleCompanies.map((c) => (
                <button
                  key={c._id}
                  onClick={() => handleSwitch(c._id)}
                  className={[
                    'w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors',
                    c._id === session?.user?.activeCompanyId
                      ? 'text-emerald-400 bg-emerald-600/10'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                  ].join(' ')}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${c._id === session?.user?.activeCompanyId ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog.show && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setConfirmDialog({ show: false, targetId: null })} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm">
            <h2 className="text-lg font-semibold text-white mb-2">Switch Company?</h2>
            <p className="text-slate-300 text-sm mb-6">
              Switching to <strong>{targetCompany?.name || 'Admin View'}</strong> will refresh all data.
              <br />
              <span className="text-xs text-slate-400 mt-2 block">All materials, jobs, and customers from the current company will be replaced with data from the target company.</span>
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog({ show: false, targetId: null })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSwitchConfirmed(confirmDialog.targetId)}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? 'Switching...' : 'Switch'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
