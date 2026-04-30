import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { createManualStockAdjustmentRequest } from '@/lib/utils/manualStockAdjustmentRequest';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { buildStockCountSessionSnapshot } from '@/lib/utils/stockCountSessionServer';
import { buildManualAdjustmentLinesFromCount } from '@/lib/utils/stockCountSession';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.adjust')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const { id } = await params;
    const existing = await prisma.stockCountSession.findFirst({
      where: {
        id,
        companyId: session.user.activeCompanyId,
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        lines: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!existing) return errorResponse('Stock count session not found', 404);
    if (!['DRAFT', 'ADJUSTMENT_REJECTED'].includes(existing.status)) {
      return errorResponse('Only draft or rejected count sessions can be submitted', 409);
    }

    const adjustmentLines = buildManualAdjustmentLinesFromCount(
      existing.lines.map((line) => ({
        materialId: line.materialId,
        materialName: line.materialName,
        unit: line.unit,
        warehouseId: line.warehouseId,
        systemQty: Number(line.systemQty),
        countedQty: line.countedQty == null ? '' : Number(line.countedQty).toString(),
        varianceQty: Number(line.varianceQty),
        unitCost: Number(line.unitCost),
      }))
    );

    if (adjustmentLines.length === 0) {
      return errorResponse('This count session has no variance lines to submit', 409);
    }
    if (!existing.evidenceReference?.trim()) {
      return errorResponse('Count sheet reference is required before submit', 409);
    }

    const actorName = session.user.name || session.user.email || session.user.id || null;
    const result = await prisma.$transaction(async (tx) => {
      const adjustment = await createManualStockAdjustmentRequest({
        tx,
        companyId: session.user.activeCompanyId!,
        user: session.user,
        lines: adjustmentLines,
        reason: existing.title.trim() || `Stock count adjustment for ${existing.warehouse.name}`,
        evidenceType: 'PHYSICAL_COUNT',
        evidenceReference: existing.evidenceReference!,
        evidenceNotes: existing.evidenceNotes ?? null,
        notes: existing.notes ?? null,
        source: {
          type: 'STOCK_COUNT_SESSION',
          sessionId: existing.id,
          sessionTitle: existing.title,
        },
      });

      const nextStatus = adjustment.approval.status === 'APPROVED' ? 'ADJUSTMENT_APPROVED' : 'ADJUSTMENT_PENDING';
      const nextRevision = existing.currentRevision + 1;
      const sessionRow = await tx.stockCountSession.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          currentRevision: nextRevision,
          linkedAdjustmentApprovalId: adjustment.approval.id,
          linkedAdjustmentReferenceNumber: adjustment.approval.referenceNumber ?? adjustment.approval.referenceId,
          reviewedById: adjustment.approval.status === 'APPROVED' ? (session.user.id ?? null) : existing.reviewedById,
          reviewedByName: adjustment.approval.status === 'APPROVED' ? actorName : existing.reviewedByName,
          reviewedAt: adjustment.approval.status === 'APPROVED' ? adjustment.approval.decidedAt ?? new Date() : existing.reviewedAt,
        },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.stockCountSessionRevision.create({
        data: {
          sessionId: existing.id,
          revisionNumber: nextRevision,
          action: 'SUBMITTED',
          savedById: session.user.id ?? null,
          savedByName: actorName,
          snapshot: buildStockCountSessionSnapshot({
            title: sessionRow.title,
            warehouseId: sessionRow.warehouseId,
            evidenceReference: sessionRow.evidenceReference,
            evidenceNotes: sessionRow.evidenceNotes,
            notes: sessionRow.notes,
            status: sessionRow.status,
            lines: sessionRow.lines.map((line) => ({
              materialId: line.materialId,
              materialName: line.materialName,
              unit: line.unit,
              warehouseId: line.warehouseId,
              systemQty: Number(line.systemQty),
              countedQty: line.countedQty == null ? null : Number(line.countedQty),
              varianceQty: Number(line.varianceQty),
              unitCost: Number(line.unitCost),
              sortOrder: line.sortOrder,
            })),
          }),
        },
      });

      return {
        sessionRow,
        adjustment,
      };
    });

    return successResponse({
      sessionId: result.sessionRow.id,
      status: result.sessionRow.status,
      linkedAdjustmentApprovalId: result.sessionRow.linkedAdjustmentApprovalId,
      linkedAdjustmentReferenceNumber: result.sessionRow.linkedAdjustmentReferenceNumber,
      approvalStatus: result.adjustment.approval.status,
    });
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to submit stock count session', 400);
  }
}
