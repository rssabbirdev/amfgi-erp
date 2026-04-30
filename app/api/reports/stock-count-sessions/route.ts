import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

function formatSessionStatusLabel(status: string) {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'ADJUSTMENT_PENDING':
      return 'Adjustment pending';
    case 'ADJUSTMENT_APPROVED':
      return 'Adjustment approved';
    case 'ADJUSTMENT_REJECTED':
      return 'Adjustment rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function hoursBetween(start: Date, end: Date | null) {
  if (!end) return null;
  return Number((((end.getTime() - start.getTime()) / (1000 * 60 * 60)) || 0).toFixed(2));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView = session.user.isSuperAdmin || session.user.permissions.includes('report.view');
  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const sessions = await prisma.stockCountSession.findMany({
      where: { companyId },
      include: {
        warehouse: {
          select: { id: true, name: true },
        },
        lines: {
          orderBy: { sortOrder: 'asc' },
          select: {
            materialId: true,
            materialName: true,
            unit: true,
            varianceQty: true,
            unitCost: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const approvalIds = Array.from(
      new Set(sessions.map((row) => row.linkedAdjustmentApprovalId).filter((value): value is string => Boolean(value)))
    );

    const approvals = approvalIds.length
      ? await prisma.stockExceptionApproval.findMany({
          where: {
            companyId,
            id: { in: approvalIds },
          },
          select: {
            id: true,
            status: true,
            referenceNumber: true,
            decidedAt: true,
            decidedByName: true,
            decisionNote: true,
          },
        })
      : [];

    const approvalMap = new Map(approvals.map((approval) => [approval.id, approval]));
    const warehouseRollup = new Map<
      string,
      {
        warehouseId: string;
        warehouseName: string;
        totalSessions: number;
        varianceSessionCount: number;
        draftCount: number;
        pendingCount: number;
        approvedCount: number;
        rejectedCount: number;
        grossExcessQty: number;
        grossShortageQty: number;
        netVarianceQty: number;
        estimatedNetValue: number;
        approvalHoursValues: number[];
        latestSessionAt: string;
      }
    >();
    const materialRollup = new Map<
      string,
      {
        materialId: string;
        materialName: string;
        unit: string;
        sessionIds: Set<string>;
        varianceSessionCount: number;
        grossExcessQty: number;
        grossShortageQty: number;
        netVarianceQty: number;
        estimatedNetValue: number;
        latestSessionAt: string;
      }
    >();

    const rows = sessions.map((row) => {
      const approval = row.linkedAdjustmentApprovalId ? approvalMap.get(row.linkedAdjustmentApprovalId) : null;
      let grossExcessQty = 0;
      let grossShortageQty = 0;
      let netVarianceQty = 0;
      let estimatedNetValue = 0;
      let varianceLineCount = 0;

      row.lines.forEach((line) => {
        const varianceQty = decimalToNumberOrZero(line.varianceQty);
        const unitCost = decimalToNumberOrZero(line.unitCost);
        if (Math.abs(varianceQty) < 0.001) return;

        varianceLineCount += 1;
        if (varianceQty > 0) grossExcessQty += varianceQty;
        if (varianceQty < 0) grossShortageQty += Math.abs(varianceQty);
        netVarianceQty += varianceQty;
        estimatedNetValue += varianceQty * unitCost;

        const current = materialRollup.get(line.materialId) ?? {
          materialId: line.materialId,
          materialName: line.materialName,
          unit: line.unit,
          sessionIds: new Set<string>(),
          varianceSessionCount: 0,
          grossExcessQty: 0,
          grossShortageQty: 0,
          netVarianceQty: 0,
          estimatedNetValue: 0,
          latestSessionAt: row.updatedAt.toISOString(),
        };

        if (!current.sessionIds.has(row.id)) {
          current.sessionIds.add(row.id);
          current.varianceSessionCount += 1;
        }
        if (varianceQty > 0) current.grossExcessQty += varianceQty;
        if (varianceQty < 0) current.grossShortageQty += Math.abs(varianceQty);
        current.netVarianceQty += varianceQty;
        current.estimatedNetValue += varianceQty * unitCost;
        if (new Date(current.latestSessionAt).getTime() < row.updatedAt.getTime()) {
          current.latestSessionAt = row.updatedAt.toISOString();
        }

        materialRollup.set(line.materialId, current);
      });

      const approvalStatus =
        approval?.status ??
        (row.status === 'ADJUSTMENT_PENDING'
          ? 'PENDING'
          : row.status === 'ADJUSTMENT_APPROVED'
            ? 'APPROVED'
            : row.status === 'ADJUSTMENT_REJECTED'
            ? 'REJECTED'
              : null);

      const approvalHours = hoursBetween(row.createdAt, approval?.decidedAt ?? row.reviewedAt ?? null);
      const warehouseCurrent = warehouseRollup.get(row.warehouseId) ?? {
        warehouseId: row.warehouseId,
        warehouseName: row.warehouse.name,
        totalSessions: 0,
        varianceSessionCount: 0,
        draftCount: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        grossExcessQty: 0,
        grossShortageQty: 0,
        netVarianceQty: 0,
        estimatedNetValue: 0,
        approvalHoursValues: [],
        latestSessionAt: row.updatedAt.toISOString(),
      };

      warehouseCurrent.totalSessions += 1;
      if (varianceLineCount > 0) warehouseCurrent.varianceSessionCount += 1;
      if (row.status === 'DRAFT') warehouseCurrent.draftCount += 1;
      if (row.status === 'ADJUSTMENT_PENDING') warehouseCurrent.pendingCount += 1;
      if (row.status === 'ADJUSTMENT_APPROVED') warehouseCurrent.approvedCount += 1;
      if (row.status === 'ADJUSTMENT_REJECTED') warehouseCurrent.rejectedCount += 1;
      warehouseCurrent.grossExcessQty += grossExcessQty;
      warehouseCurrent.grossShortageQty += grossShortageQty;
      warehouseCurrent.netVarianceQty += netVarianceQty;
      warehouseCurrent.estimatedNetValue += estimatedNetValue;
      if (approvalHours != null) warehouseCurrent.approvalHoursValues.push(approvalHours);
      if (new Date(warehouseCurrent.latestSessionAt).getTime() < row.updatedAt.getTime()) {
        warehouseCurrent.latestSessionAt = row.updatedAt.toISOString();
      }
      warehouseRollup.set(row.warehouseId, warehouseCurrent);

      return {
        id: row.id,
        title: row.title,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouse.name,
        status: row.status,
        statusLabel: formatSessionStatusLabel(row.status),
        evidenceReference: row.evidenceReference,
        linkedAdjustmentApprovalId: row.linkedAdjustmentApprovalId,
        linkedAdjustmentReferenceNumber:
          approval?.referenceNumber ?? row.linkedAdjustmentReferenceNumber ?? null,
        linkedAdjustmentStatus: approvalStatus,
        linkedAdjustmentDecisionNote: approval?.decisionNote ?? null,
        currentRevision: row.currentRevision,
        lineCount: row.lines.length,
        varianceLineCount,
        grossExcessQty,
        grossShortageQty,
        netVarianceQty,
        estimatedNetValue,
        createdByName: row.createdByName,
        reviewedByName: approval?.decidedByName ?? row.reviewedByName,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        reviewedAt: (approval?.decidedAt ?? row.reviewedAt)?.toISOString() ?? null,
        approvalHours,
      };
    });

    const materialRows = Array.from(materialRollup.values())
      .map((row) => ({
        materialId: row.materialId,
        materialName: row.materialName,
        unit: row.unit,
        sessionCount: row.sessionIds.size,
        varianceSessionCount: row.varianceSessionCount,
        grossExcessQty: row.grossExcessQty,
        grossShortageQty: row.grossShortageQty,
        netVarianceQty: row.netVarianceQty,
        estimatedNetValue: row.estimatedNetValue,
        latestSessionAt: row.latestSessionAt,
      }))
      .sort((a, b) => {
        if (b.varianceSessionCount !== a.varianceSessionCount) {
          return b.varianceSessionCount - a.varianceSessionCount;
        }
        return Math.abs(b.netVarianceQty) - Math.abs(a.netVarianceQty);
      })
      .slice(0, 15);

    const warehouseRows = Array.from(warehouseRollup.values())
      .map((row) => ({
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        totalSessions: row.totalSessions,
        varianceSessionCount: row.varianceSessionCount,
        draftCount: row.draftCount,
        pendingCount: row.pendingCount,
        approvedCount: row.approvedCount,
        rejectedCount: row.rejectedCount,
        grossExcessQty: row.grossExcessQty,
        grossShortageQty: row.grossShortageQty,
        netVarianceQty: row.netVarianceQty,
        estimatedNetValue: row.estimatedNetValue,
        avgApprovalHours:
          row.approvalHoursValues.length > 0
            ? Number(
                (
                  row.approvalHoursValues.reduce((sum, value) => sum + value, 0) /
                  row.approvalHoursValues.length
                ).toFixed(2)
              )
            : null,
        latestSessionAt: row.latestSessionAt,
      }))
      .sort((a, b) => {
        if (b.varianceSessionCount !== a.varianceSessionCount) {
          return b.varianceSessionCount - a.varianceSessionCount;
        }
        return Math.abs(b.netVarianceQty) - Math.abs(a.netVarianceQty);
      });

    const approvalHoursValues = rows
      .map((row) => row.approvalHours)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    return successResponse({
      summary: {
        totalSessions: rows.length,
        draftCount: rows.filter((row) => row.status === 'DRAFT').length,
        pendingAdjustmentCount: rows.filter((row) => row.status === 'ADJUSTMENT_PENDING').length,
        approvedAdjustmentCount: rows.filter((row) => row.status === 'ADJUSTMENT_APPROVED').length,
        rejectedAdjustmentCount: rows.filter((row) => row.status === 'ADJUSTMENT_REJECTED').length,
        cancelledCount: rows.filter((row) => row.status === 'CANCELLED').length,
        warehousesCovered: new Set(rows.map((row) => row.warehouseId)).size,
        linkedAdjustmentCount: rows.filter((row) => Boolean(row.linkedAdjustmentApprovalId)).length,
        recountCount: rows.filter((row) => row.currentRevision > 1).length,
        avgApprovalHours:
          approvalHoursValues.length > 0
            ? Number(
                (
                  approvalHoursValues.reduce((sum, value) => sum + value, 0) /
                  approvalHoursValues.length
                ).toFixed(2)
              )
            : null,
        varianceSessionCount: rows.filter((row) => row.varianceLineCount > 0).length,
        totalVarianceLines: rows.reduce((sum, row) => sum + row.varianceLineCount, 0),
        grossExcessQty: rows.reduce((sum, row) => sum + row.grossExcessQty, 0),
        grossShortageQty: rows.reduce((sum, row) => sum + row.grossShortageQty, 0),
        netVarianceQty: rows.reduce((sum, row) => sum + row.netVarianceQty, 0),
        estimatedNetValue: rows.reduce((sum, row) => sum + row.estimatedNetValue, 0),
      },
      rows,
      warehouseRows,
      materialRows,
    });
  } catch (error: unknown) {
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load stock count sessions report',
      500
    );
  }
}
