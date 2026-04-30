import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { buildStockCountSessionSnapshot, mapStockCountSessionLine } from '@/lib/utils/stockCountSessionServer';
import { z } from 'zod';

const SessionLineSchema = z.object({
  materialId: z.string().min(1),
  materialName: z.string().min(1),
  unit: z.string().min(1),
  warehouseId: z.string().min(1),
  systemQty: z.number().finite(),
  countedQty: z.number().finite().nullable().optional(),
  varianceQty: z.number().finite(),
  unitCost: z.number().finite().min(0),
  sortOrder: z.number().int().nonnegative(),
});

const UpdateSessionSchema = z.object({
  warehouseId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  evidenceReference: z.string().trim().max(100).optional(),
  evidenceNotes: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(20000).optional(),
  lines: z.array(SessionLineSchema),
});

async function loadSession(companyId: string, id: string) {
  return prisma.stockCountSession.findFirst({
    where: {
      id,
      companyId,
    },
    include: {
      warehouse: { select: { id: true, name: true } },
      lines: { orderBy: { sortOrder: 'asc' } },
      revisions: { orderBy: { revisionNumber: 'desc' }, take: 20 },
    },
  });
}

export async function GET(
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
    const sessionRow = await loadSession(session.user.activeCompanyId, id);
    if (!sessionRow) return errorResponse('Stock count session not found', 404);

    return successResponse({
      id: sessionRow.id,
      warehouseId: sessionRow.warehouseId,
      warehouseName: sessionRow.warehouse.name,
      title: sessionRow.title,
      status: sessionRow.status,
      evidenceReference: sessionRow.evidenceReference,
      evidenceNotes: sessionRow.evidenceNotes,
      notes: sessionRow.notes,
      currentRevision: sessionRow.currentRevision,
      linkedAdjustmentApprovalId: sessionRow.linkedAdjustmentApprovalId,
      linkedAdjustmentReferenceNumber: sessionRow.linkedAdjustmentReferenceNumber,
      createdByName: sessionRow.createdByName,
      reviewedByName: sessionRow.reviewedByName,
      reviewedAt: sessionRow.reviewedAt?.toISOString() ?? null,
      createdAt: sessionRow.createdAt.toISOString(),
      updatedAt: sessionRow.updatedAt.toISOString(),
      lines: sessionRow.lines.map(mapStockCountSessionLine),
      revisions: sessionRow.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        action: revision.action,
        savedById: revision.savedById,
        savedByName: revision.savedByName,
        createdAt: revision.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load stock count session', 500);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.adjust')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = UpdateSessionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  try {
    const { id } = await params;
    const existing = await loadSession(session.user.activeCompanyId, id);
    if (!existing) return errorResponse('Stock count session not found', 404);
    if (!['DRAFT', 'ADJUSTMENT_REJECTED'].includes(existing.status)) {
      return errorResponse('Only draft or rejected count sessions can be edited', 409);
    }

    const actorName = session.user.name || session.user.email || session.user.id || null;
    const nextRevision = existing.currentRevision + 1;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.stockCountSessionLine.deleteMany({ where: { sessionId: existing.id } });

      const sessionRow = await tx.stockCountSession.update({
        where: { id: existing.id },
        data: {
          warehouseId: parsed.data.warehouseId,
          title: parsed.data.title,
          evidenceReference: parsed.data.evidenceReference?.trim() || null,
          evidenceNotes: parsed.data.evidenceNotes?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
          status: existing.status === 'ADJUSTMENT_REJECTED' ? 'DRAFT' : existing.status,
          currentRevision: nextRevision,
          linkedAdjustmentApprovalId: existing.status === 'ADJUSTMENT_REJECTED' ? null : existing.linkedAdjustmentApprovalId,
          linkedAdjustmentReferenceNumber:
            existing.status === 'ADJUSTMENT_REJECTED' ? null : existing.linkedAdjustmentReferenceNumber,
          reviewedById: existing.status === 'ADJUSTMENT_REJECTED' ? null : existing.reviewedById,
          reviewedByName: existing.status === 'ADJUSTMENT_REJECTED' ? null : existing.reviewedByName,
          reviewedAt: existing.status === 'ADJUSTMENT_REJECTED' ? null : existing.reviewedAt,
          lines: {
            create: parsed.data.lines.map((line) => ({
              materialId: line.materialId,
              materialName: line.materialName,
              unit: line.unit,
              warehouseId: line.warehouseId,
              systemQty: line.systemQty,
              countedQty: line.countedQty ?? null,
              varianceQty: line.varianceQty,
              unitCost: line.unitCost,
              sortOrder: line.sortOrder,
            })),
          },
        },
        include: {
          warehouse: { select: { id: true, name: true } },
          lines: { orderBy: { sortOrder: 'asc' } },
          revisions: { orderBy: { revisionNumber: 'desc' }, take: 20 },
        },
      });

      await tx.stockCountSessionRevision.create({
        data: {
          sessionId: existing.id,
          revisionNumber: nextRevision,
          action: 'SAVED',
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

      return sessionRow;
    });

    return successResponse({
      id: updated.id,
      warehouseId: updated.warehouseId,
      warehouseName: updated.warehouse.name,
      title: updated.title,
      status: updated.status,
      evidenceReference: updated.evidenceReference,
      evidenceNotes: updated.evidenceNotes,
      notes: updated.notes,
      currentRevision: updated.currentRevision,
      linkedAdjustmentApprovalId: updated.linkedAdjustmentApprovalId,
      linkedAdjustmentReferenceNumber: updated.linkedAdjustmentReferenceNumber,
      createdByName: updated.createdByName,
      reviewedByName: updated.reviewedByName,
      reviewedAt: updated.reviewedAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      lines: updated.lines.map(mapStockCountSessionLine),
      revisions: updated.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        action: revision.action,
        savedById: revision.savedById,
        savedByName: revision.savedByName,
        createdAt: revision.createdAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to save stock count session', 400);
  }
}
