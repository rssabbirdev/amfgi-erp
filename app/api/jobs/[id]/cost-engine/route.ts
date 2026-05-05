import { auth } from '@/auth';
import { calculateJobCostEngine } from '@/lib/job-costing/costEngine';
import type { PricingMode } from '@/lib/job-costing/types';
import { P } from '@/lib/permissions';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

export const CostEngineSchema = z.object({
  pricingMode: z.enum(['FIFO', 'MOVING_AVERAGE', 'CURRENT', 'CUSTOM']).default('FIFO'),
  postingDate: z.string().optional(),
  jobItemIds: z.array(z.string()).optional(),
  customUnitCosts: z.record(z.string(), z.number().min(0)).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    (!session.user.permissions.includes(P.JOB_VIEW) || !session.user.permissions.includes(P.MATERIAL_VIEW))
  ) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id: jobId } = await params;
  const body = await req.json();
  const parsed = CostEngineSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const companyId = session.user.activeCompanyId;
  const postingDate = parsed.data.postingDate ? new Date(parsed.data.postingDate) : new Date();
  if (Number.isNaN(postingDate.getTime())) {
    return errorResponse('Invalid posting date', 422);
  }

  try {
    const result = await calculateJobCostEngine({
      companyId,
      jobId,
      postingDate,
      pricingMode: parsed.data.pricingMode as PricingMode,
      jobItemIds: parsed.data.jobItemIds,
      customUnitCosts: parsed.data.customUnitCosts,
    });
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to calculate job costing';
    if (message === 'Job not found') return errorResponse(message, 404);
    if (message === 'No active job items found for this contract') return errorResponse(message, 404);
    return errorResponse(message, 500);
  }
}
