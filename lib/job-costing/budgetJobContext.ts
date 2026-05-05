import type { PrismaClient } from '@prisma/client';

export type JobBudgetContext = {
  /** Requested job id (URL param). */
  requestedJobId: string;
  /** Where `JobItem` / formula budget rows live — always the contract (parent) job. */
  budgetJobId: string;
  /** `parentJobId` of the requested job, or null if the requested job is the parent. */
  requestedParentJobId: string | null;
  /** Parent + all variation ids: dispatch, returns, work assignments, and attendance may be posted here. */
  consumptionJobIds: string[];
};

/**
 * Budget lines are stored on the parent contract job. Variations carry site work (dispatch, schedule)
 * but not the material budget rows. Consumption and HR roll-ups must aggregate across the tree.
 */
export async function resolveJobBudgetContext(
  db: PrismaClient,
  companyId: string,
  jobId: string
): Promise<JobBudgetContext | null> {
  const job = await db.job.findFirst({
    where: { id: jobId, companyId },
    select: { id: true, parentJobId: true },
  });
  if (!job) return null;

  const budgetJobId = job.parentJobId ?? job.id;

  let consumptionJobIds: string[];
  if (job.parentJobId) {
    consumptionJobIds = Array.from(new Set([job.parentJobId, job.id]));
  } else {
    const children = await db.job.findMany({
      where: { companyId, parentJobId: job.id },
      select: { id: true },
    });
    consumptionJobIds = [job.id, ...children.map((row) => row.id)];
  }

  return {
    requestedJobId: job.id,
    budgetJobId,
    requestedParentJobId: job.parentJobId,
    consumptionJobIds,
  };
}
