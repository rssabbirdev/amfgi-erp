'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import JobCostEnginePage from '@/app/(app)/jobs/[id]/cost-engine/page';
import Spinner from '@/components/ui/Spinner';
import { useGetJobByIdQuery } from '@/store/hooks';

/**
 * Stock workspace always opens the **parent contract** job for budgeting.
 * Variation URLs are redirected so budget lines cannot be edited in a variation context from here.
 */
export default function StockJobBudgetByIdPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = typeof params?.id === 'string' ? params.id : '';
  const { data: job, isLoading, isFetching, isError } = useGetJobByIdQuery(jobId, { skip: !jobId });
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!jobId || isLoading || !job) return;
    if (job.parentJobId) {
      setRedirecting(true);
      router.replace(`/stock/job-budget/${job.parentJobId}`);
    }
  }, [jobId, job, isLoading, router]);

  if (!jobId) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Missing job id.</div>;
  }

  if (isLoading || isFetching || redirecting || (job && job.parentJobId)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (isError || !job) {
    return <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">Job not found.</div>;
  }

  return <JobCostEnginePage />;
}
