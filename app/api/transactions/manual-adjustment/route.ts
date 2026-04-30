import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { createManualStockAdjustmentRequest } from '@/lib/utils/manualStockAdjustmentRequest';
import { type ManualStockAdjustmentLinePayload } from '@/lib/utils/manualStockAdjustmentExecution';
import { z } from 'zod';

const ManualStockAdjustmentLineSchema = z.object({
  materialId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantityDelta: z.number().finite().refine((value) => Math.abs(value) >= 0.001, {
    message: 'Adjustment quantity must be non-zero',
  }),
  unitCost: z.number().finite().min(0).optional(),
});

const ManualStockAdjustmentSchema = z.object({
  lines: z.array(ManualStockAdjustmentLineSchema).min(1, 'At least one adjustment line is required'),
  reason: z.string().trim().min(3).max(500),
  evidenceType: z.enum(['PHYSICAL_COUNT', 'DAMAGE_REPORT', 'SUPPLIER_CLAIM', 'CUSTOMER_RETURN', 'OTHER']),
  evidenceReference: z.string().trim().min(3).max(100),
  evidenceNotes: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(20000).optional(),
});
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.adjust')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = ManualStockAdjustmentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const companyId = session.user.activeCompanyId;
  const lines = parsed.data.lines as ManualStockAdjustmentLinePayload[];

  try {
    const result = await prisma.$transaction(async (tx) => {
      const adjustment = await createManualStockAdjustmentRequest({
        tx,
        companyId,
        user: session.user,
        lines,
        reason: parsed.data.reason,
        evidenceType: parsed.data.evidenceType,
        evidenceReference: parsed.data.evidenceReference,
        evidenceNotes: parsed.data.evidenceNotes ?? null,
        notes: parsed.data.notes ?? null,
      });

      return {
        id: adjustment.approval.id,
        referenceId: adjustment.approval.referenceId,
        referenceNumber: adjustment.approval.referenceNumber ?? adjustment.approval.referenceId,
        status: adjustment.approval.status,
        appliedTransactionIds: adjustment.appliedTransactionIds,
        lineCount: adjustment.lineCount,
        policySummary: adjustment.policySummary,
      };
    });

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: 'manual-stock-adjustment',
      action: 'changed',
    });

    return successResponse(
      {
        requested: true,
        ...result,
      },
      201
    );
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to create manual stock adjustment request',
      400
    );
  }
}
