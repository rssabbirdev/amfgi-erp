'use client';

import { useState }              from 'react';
import { useSession }            from 'next-auth/react';
import { useRouter }             from 'next/navigation';
import { useAppDispatch }        from '@/store/hooks';
import { switchActiveCompany }   from '@/store/slices/companySlice';
import toast                     from 'react-hot-toast';
import { useGetCompaniesQuery } from '@/store/hooks';
import { appApi } from '@/store/api/appApi';

interface Company { _id: string; name: string; slug: string; description?: string }

export default function SelectCompanyPage() {
  const { data: session, update } = useSession();
  const router   = useRouter();
  const dispatch = useAppDispatch();
  const { data: companiesData = [] } = useGetCompaniesQuery();
  const [loading,   setLoading]   = useState<string | null>(null);

  // For type safety, cast companies data
  const companies: Company[] = companiesData.map((c: any) => ({
    _id: c._id,
    name: c.name,
    slug: c.slug,
    description: c.description,
  }));

  const allowed = (session?.user?.isSuperAdmin
    ? companies
    : companies.filter((c) => session?.user?.allowedCompanyIds?.includes(c._id))
  );

  const handleSelect = async (companyId: string) => {
    setLoading(companyId);
    try {
      const res = await fetch('/api/session/switch-company', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ companyId }),
      });
      if (!res.ok) throw new Error();
      const { data } = await res.json();

      await update({
        activeCompanyId:     data.activeCompanyId,
        activeCompanySlug:   data.activeCompanySlug,
        activeCompanyDbName: data.activeCompanyDbName,
        activeCompanyName:   data.activeCompanyName,
        permissions:         data.permissions,
      });

      dispatch(switchActiveCompany({
        activeCompanyId:   data.activeCompanyId,
        activeCompanySlug: data.activeCompanySlug,
        activeCompanyName: data.activeCompanyName,
        permissions:       data.permissions,
      }));

      // Reset all company-scoped cache
      dispatch(appApi.util.resetApiState());

      router.push('/dashboard');
    } catch {
      toast.error('Failed to select company');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 mb-4">
            <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Select Company</h1>
          <p className="text-slate-400 text-sm mt-1">
            Welcome, {session?.user?.name}. Choose which company to work in.
          </p>
        </div>

        <div className="space-y-3">
          {allowed.map((c) => (
            <button
              key={c._id}
              onClick={() => handleSelect(c._id)}
              disabled={!!loading}
              className="w-full flex items-center gap-4 p-5 rounded-xl bg-slate-800 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all text-left group disabled:opacity-50"
            >
              <div className="h-12 w-12 rounded-xl bg-slate-700 flex items-center justify-center text-xl font-bold text-emerald-400 flex-shrink-0 group-hover:bg-emerald-600/20 transition-colors">
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{c.name}</p>
                {c.description && (
                  <p className="text-sm text-slate-400 truncate mt-0.5">{c.description}</p>
                )}
              </div>
              {loading === c._id ? (
                <svg className="animate-spin h-5 w-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
          ))}

          {allowed.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p>No companies assigned to your account.</p>
              <p className="text-sm mt-1">Contact your administrator.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
