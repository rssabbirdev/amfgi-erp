import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

type AdjustmentLinePayload = {
  materialId?: string;
  warehouseId?: string;
  quantityDelta?: number;
  unitCost?: number | null;
};

type AdjustmentPayload = {
  lines?: AdjustmentLinePayload[];
  evidenceType?: string | null;
  evidenceReference?: string | null;
  evidenceNotes?: string | null;
  appliedTransactionIds?: string[];
};

function toLines(payload: unknown): AdjustmentLinePayload[] {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as AdjustmentPayload).lines)) {
    return [];
  }
  return (payload as AdjustmentPayload).lines ?? [];
}

function toTransactionIds(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as AdjustmentPayload).appliedTransactionIds)) {
    return [];
  }
  return ((payload as AdjustmentPayload).appliedTransactionIds ?? []).filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView = session.user.isSuperAdmin || session.user.permissions.includes('report.view');
  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const approvals = await prisma.stockExceptionApproval.findMany({
      where: {
        companyId,
        exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    const materialIds = new Set<string>();
    const warehouseIds = new Set<string>();
    const transactionIds = new Set<string>();

    for (const approval of approvals) {
      const lines = toLines(approval.payload);
      for (const line of lines) {
        if (typeof line.materialId === 'string' && line.materialId) materialIds.add(line.materialId);
        if (typeof line.warehouseId === 'string' && line.warehouseId) warehouseIds.add(line.warehouseId);
      }
      for (const transactionId of toTransactionIds(approval.payload)) {
        transactionIds.add(transactionId);
      }
    }

    const [materials, warehouses, transactions] = await Promise.all([
      materialIds.size > 0
        ? prisma.material.findMany({
            where: {
              companyId,
              id: { in: Array.from(materialIds) },
            },
            select: {
              id: true,
              name: true,
              unitCost: true,
            },
          })
        : Promise.resolve([]),
      warehouseIds.size > 0
        ? prisma.warehouse.findMany({
            where: {
              companyId,
              id: { in: Array.from(warehouseIds) },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : Promise.resolve([]),
      transactionIds.size > 0
        ? prisma.transaction.findMany({
            where: {
              companyId,
              id: { in: Array.from(transactionIds) },
            },
            select: {
              id: true,
              quantity: true,
              totalCost: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const materialMap = new Map(
      materials.map((material) => [
        material.id,
        {
          name: material.name,
          unitCost: decimalToNumberOrZero(material.unitCost),
        },
      ])
    );
    const warehouseMap = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
    const transactionMap = new Map(
      transactions.map((transaction) => [
        transaction.id,
        {
          quantity: decimalToNumberOrZero(transaction.quantity),
          totalCost: decimalToNumberOrZero(transaction.totalCost),
        },
      ])
    );

    const rows = approvals.map((approval) => {
      const payload = (approval.payload ?? null) as AdjustmentPayload | null;
      const lines = toLines(payload);
      const appliedTransactionIds = toTransactionIds(payload);
      const materialNames = uniqueStrings(
        lines.map((line) => (typeof line.materialId === 'string' ? materialMap.get(line.materialId)?.name : null))
      );
      const warehouseNames = uniqueStrings(
        lines.map((line) => (typeof line.warehouseId === 'string' ? warehouseMap.get(line.warehouseId) : null))
      );

      let grossIncreaseQty = 0;
      let grossDecreaseQty = 0;
      let netQty = 0;
      let estimatedValue = 0;
      let appliedIncreaseValue = 0;
      let appliedDecreaseValue = 0;

      lines.forEach((line, index) => {
        const qty = Number(line.quantityDelta ?? 0);
        if (!Number.isFinite(qty) || Math.abs(qty) < 0.0005) return;

        const fallbackUnitCost =
          typeof line.unitCost === 'number' && Number.isFinite(line.unitCost)
            ? line.unitCost
            : typeof line.materialId === 'string'
              ? materialMap.get(line.materialId)?.unitCost ?? 0
              : 0;

        if (qty > 0) grossIncreaseQty += qty;
        if (qty < 0) grossDecreaseQty += Math.abs(qty);
        netQty += qty;
        estimatedValue += qty * fallbackUnitCost;

        const appliedTransactionId = appliedTransactionIds[index];
        const appliedTransaction = appliedTransactionId ? transactionMap.get(appliedTransactionId) : null;
        if (!appliedTransaction) return;

        if (appliedTransaction.quantity >= 0) {
          appliedIncreaseValue += Math.abs(appliedTransaction.totalCost);
        } else {
          appliedDecreaseValue += Math.abs(appliedTransaction.totalCost);
        }
      });

      return {
        id: approval.id,
        referenceId: approval.referenceId,
        referenceNumber: approval.referenceNumber ?? approval.referenceId,
        status: approval.status,
        reason: approval.reason,
        evidenceType: payload?.evidenceType ?? null,
        evidenceReference: payload?.evidenceReference ?? null,
        evidenceNotes: payload?.evidenceNotes ?? null,
        createdAt: approval.createdAt.toISOString(),
        createdById: approval.createdById,
        createdByName: approval.createdByName,
        decidedAt: approval.decidedAt?.toISOString() ?? null,
        decidedById: approval.decidedById,
        decidedByName: approval.decidedByName,
        decisionNote: approval.decisionNote,
        lineCount: lines.length,
        materialNames,
        warehouseNames,
        grossIncreaseQty,
        grossDecreaseQty,
        netQty,
        estimatedNetValue: estimatedValue,
        appliedIncreaseValue: approval.status === 'APPROVED' ? appliedIncreaseValue : null,
        appliedDecreaseValue: approval.status === 'APPROVED' ? appliedDecreaseValue : null,
        appliedNetValue:
          approval.status === 'APPROVED' ? appliedIncreaseValue - appliedDecreaseValue : null,
      };
    });

    const approvedRows = rows.filter((row) => row.status === 'APPROVED');

    return successResponse({
      summary: {
        total: rows.length,
        pending: rows.filter((row) => row.status === 'PENDING').length,
        approved: approvedRows.length,
        rejected: rows.filter((row) => row.status === 'REJECTED').length,
        warehousesCovered: new Set(rows.flatMap((row) => row.warehouseNames)).size,
        requestersCovered: new Set(rows.map((row) => row.createdByName).filter(Boolean)).size,
        approversCovered: new Set(rows.map((row) => row.decidedByName).filter(Boolean)).size,
        grossIncreaseQty: rows.reduce((sum, row) => sum + row.grossIncreaseQty, 0),
        grossDecreaseQty: rows.reduce((sum, row) => sum + row.grossDecreaseQty, 0),
        estimatedNetValue: rows.reduce((sum, row) => sum + row.estimatedNetValue, 0),
        appliedNetValue: approvedRows.reduce((sum, row) => sum + (row.appliedNetValue ?? 0), 0),
      },
      rows,
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load stock adjustments report',
      500
    );
  }
}
