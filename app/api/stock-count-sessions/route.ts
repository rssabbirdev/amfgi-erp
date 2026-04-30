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

const CreateSessionSchema = z.object({
  warehouseId: z.string().min(1),
  title: z.string().trim().min(3).max(200),
  evidenceReference: z.string().trim().max(100).optional(),
  evidenceNotes: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(20000).optional(),
  lines: z.array(SessionLineSchema),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.adjust')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const rows = await prisma.stockCountSession.findMany({
      where: {
        companyId: session.user.activeCompanyId,
      },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        lines: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    return successResponse({
      rows: rows.map((row) => ({
        id: row.id,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouse.name,
        title: row.title,
        status: row.status,
        evidenceReference: row.evidenceReference,
        linkedAdjustmentApprovalId: row.linkedAdjustmentApprovalId,
        linkedAdjustmentReferenceNumber: row.linkedAdjustmentReferenceNumber,
        currentRevision: row.currentRevision,
        createdByName: row.createdByName,
        reviewedByName: row.reviewedByName,
        reviewedAt: row.reviewedAt?.toISOString() ?? null,
        lineCount: row.lines.length,
        varianceLineCount: row.lines.filter((line) => Math.abs(Number(line.varianceQty)) >= 0.001).length,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    });
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to load stock count sessions', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.adjust')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const parsed = CreateSessionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  try {
    const actorName = session.user.name || session.user.email || session.user.id || null;
    const created = await prisma.$transaction(async (tx) => {
      const sessionRow = await tx.stockCountSession.create({
        data: {
          companyId: session.user.activeCompanyId!,
          warehouseId: parsed.data.warehouseId,
          title: parsed.data.title,
          evidenceReference: parsed.data.evidenceReference?.trim() || null,
          evidenceNotes: parsed.data.evidenceNotes?.trim() || null,
          notes: parsed.data.notes?.trim() || null,
          createdById: session.user.id ?? null,
          createdByName: actorName,
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
          lines: { orderBy: { sortOrder: 'asc' } },
          warehouse: { select: { id: true, name: true } },
        },
      });

      await tx.stockCountSessionRevision.create({
        data: {
          sessionId: sessionRow.id,
          revisionNumber: 1,
          action: 'CREATED',
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

    return successResponse(
      {
        id: created.id,
        warehouseId: created.warehouseId,
        warehouseName: created.warehouse.name,
        title: created.title,
        status: created.status,
        evidenceReference: created.evidenceReference,
        evidenceNotes: created.evidenceNotes,
        notes: created.notes,
        currentRevision: created.currentRevision,
        linkedAdjustmentApprovalId: created.linkedAdjustmentApprovalId,
        linkedAdjustmentReferenceNumber: created.linkedAdjustmentReferenceNumber,
        createdByName: created.createdByName,
        reviewedByName: created.reviewedByName,
        reviewedAt: created.reviewedAt?.toISOString() ?? null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        lines: created.lines.map(mapStockCountSessionLine),
        revisions: [],
      },
      201
    );
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : 'Failed to create stock count session', 400);
  }
}
