import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

type ApprovalPayloadLine = {
  warehouseId?: string;
  quantityDelta?: number;
};

type ApprovalPayload = {
  lines?: ApprovalPayloadLine[];
  evidenceType?: string | null;
  evidenceReference?: string | null;
  sourceSessionId?: string | null;
  sourceSessionTitle?: string | null;
  policySummary?: {
    requiresDecisionNote?: boolean;
  } | null;
};

function parsePayload(payload: unknown): ApprovalPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload as ApprovalPayload;
}

function toWarehouseIds(payload: ApprovalPayload | null) {
  if (!payload?.lines || !Array.isArray(payload.lines)) return [];
  return Array.from(
    new Set(
      payload.lines
        .map((line) => (typeof line?.warehouseId === 'string' ? line.warehouseId : null))
        .filter((value): value is string => Boolean(value))
    )
  );
}

function toNetQuantity(payload: ApprovalPayload | null) {
  if (!payload?.lines || !Array.isArray(payload.lines)) return null;
  const value = payload.lines.reduce((sum, line) => sum + Number(line?.quantityDelta ?? 0), 0);
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView = session.user.isSuperAdmin || session.user.permissions.includes('report.view');
  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const requestedStatus = searchParams.get('status');
  const status =
    requestedStatus === 'PENDING' || requestedStatus === 'APPROVED' || requestedStatus === 'REJECTED'
      ? requestedStatus
      : undefined;

  try {
    const rows = await prisma.stockExceptionApproval.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    const warehouseIds = Array.from(
      new Set(
        rows.flatMap((row) => {
          const payload = parsePayload(row.payload);
          return toWarehouseIds(payload);
        })
      )
    );

    const warehouses = warehouseIds.length
      ? await prisma.warehouse.findMany({
          where: {
            companyId,
            id: { in: warehouseIds },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];

    const warehouseMap = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
    const now = new Date();

    return successResponse({
      summary: {
        total: rows.length,
        pending: rows.filter((row) => row.status === 'PENDING').length,
        approved: rows.filter((row) => row.status === 'APPROVED').length,
        rejected: rows.filter((row) => row.status === 'REJECTED').length,
        pendingOver24h: rows.filter(
          (row) => row.status === 'PENDING' && now.getTime() - row.createdAt.getTime() >= 24 * 60 * 60 * 1000
        ).length,
        manualAdjustmentPendingCount: rows.filter(
          (row) => row.status === 'PENDING' && row.exceptionType === 'MANUAL_STOCK_ADJUSTMENT'
        ).length,
        dispatchOverridePendingCount: rows.filter(
          (row) => row.status === 'PENDING' && row.exceptionType === 'DISPATCH_OVERRIDE'
        ).length,
      },
      rows: rows.map((row) => ({
        ...(function () {
          const payload = parsePayload(row.payload);
          const warehouseNames = toWarehouseIds(payload)
            .map((warehouseId) => warehouseMap.get(warehouseId))
            .filter((value): value is string => Boolean(value));
          const lineCount = Array.isArray(payload?.lines) ? payload.lines.length : 0;
          const ageHours = Number(
            ((((row.decidedAt ?? now).getTime() - row.createdAt.getTime()) / (1000 * 60 * 60)) || 0).toFixed(2)
          );

          return {
            warehouseNames,
            lineCount,
            netQuantity: toNetQuantity(payload),
            evidenceType: payload?.evidenceType ?? null,
            evidenceReference: payload?.evidenceReference ?? null,
            sourceSessionId: payload?.sourceSessionId ?? null,
            sourceSessionTitle: payload?.sourceSessionTitle ?? null,
            requiresDecisionNote: Boolean(payload?.policySummary?.requiresDecisionNote),
            ageHours,
          };
        })(),
        id: row.id,
        exceptionType: row.exceptionType,
        status: row.status,
        referenceId: row.referenceId,
        referenceNumber: row.referenceNumber,
        reason: row.reason,
        payload: row.payload,
        createdById: row.createdById,
        createdByName: row.createdByName,
        createdAt: row.createdAt.toISOString(),
        decidedById: row.decidedById,
        decidedByName: row.decidedByName,
        decidedAt: row.decidedAt?.toISOString() ?? null,
        decisionNote: row.decisionNote,
      })),
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load stock exception approvals',
      500
    );
  }
}
