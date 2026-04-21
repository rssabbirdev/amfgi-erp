import Link from 'next/link';
import { auth } from '@/auth';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';

export default async function UnauthorizedPage() {
  const session = await auth();
  const selfServiceOnly = isEmployeeSelfServiceUser(session?.user);
  const backHref = selfServiceOnly ? '/me/profile' : '/dashboard';
  const backLabel = selfServiceOnly ? 'Go to My Profile' : 'Go to Dashboard';

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-6xl font-bold text-red-500">403</div>
        <h1 className="text-2xl font-semibold text-white">Access Denied</h1>
        <p className="text-slate-400">You do not have permission to view this page.</p>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
