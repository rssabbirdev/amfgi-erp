import { auth }              from '@/auth';
import { getCompanyModels }  from '@/lib/db/company';
import StatCard              from '@/components/ui/StatCard';
import { redirect }          from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const dbName = session.user.activeCompanyDbName;

  // If no company selected, show a neutral welcome
  if (!dbName) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Select a company from the header to view its data.
          </p>
        </div>
        <div className="p-8 rounded-xl bg-slate-900 border border-slate-700/50 text-center text-slate-500">
          No company selected. Use the company switcher in the top bar.
        </div>
      </div>
    );
  }

  const { Job, Material, Transaction } = await getCompanyModels(dbName);

  const [activeJobs, totalMaterials, lowStock, todayTx] = await Promise.all([
    Job.countDocuments({ status: { $in: ['ACTIVE', 'IN_PROGRESS', 'PENDING'] } }),
    Material.countDocuments({ isActive: true }),
    Material.countDocuments({
      isActive:     true,
      $expr:        { $lte: ['$currentStock', '$minStock'] },
      minStock:     { $exists: true, $gt: 0 },
    }),
    Transaction.countDocuments({
      type: 'STOCK_OUT',
      date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">
          {session.user.activeCompanyName} — live overview
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Active Jobs"
          value={activeJobs}
          color="green"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          title="Materials in Stock"
          value={totalMaterials}
          color="blue"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          }
        />
        <StatCard
          title="Low Stock Alerts"
          value={lowStock}
          color={lowStock > 0 ? 'red' : 'green'}
          sub={lowStock > 0 ? 'Needs reordering' : 'All levels OK'}
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          title="Today's Dispatches"
          value={todayTx}
          color="orange"
          icon={
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
