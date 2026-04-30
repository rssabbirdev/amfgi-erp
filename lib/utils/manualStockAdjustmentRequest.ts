import type { Prisma } from '@prisma/client';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import {
  applyManualStockAdjustmentApproval,
  type ManualStockAdjustmentLinePayload,
} from '@/lib/utils/manualStockAdjustmentExecution';
import { readStockControlSettingsFromCompanySettings } from '@/lib/stock-control/settings';
import { validateManualStockAdjustmentRequest } from '@/lib/utils/manualStockAdjustmentPolicy';
import { upsertStockExceptionApproval } from '@/lib/utils/stockExceptionApproval';

type Tx = Prisma.TransactionClient;

export type ManualStockAdjustmentRequestSource =
  | {
      type: 'STOCK_COUNT_SESSION';
      sessionId: string;
      sessionTitle?: string | null;
    }
  | undefined;

function buildReferenceNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MSA-${stamp}-${suffix}`;
}

export async function createManualStockAdjustmentRequest(args: {
  tx: Tx;
  companyId: string;
  user: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    isSuperAdmin?: boolean;
  };
  lines: ManualStockAdjustmentLinePayload[];
  reason: string;
  evidenceType: 'PHYSICAL_COUNT' | 'DAMAGE_REPORT' | 'SUPPLIER_CLAIM' | 'CUSTOMER_RETURN' | 'OTHER';
  evidenceReference: string;
  evidenceNotes?: string | null;
  notes?: string | null;
  source?: ManualStockAdjustmentRequestSource;
  referenceId?: string;
  referenceNumber?: string;
}) {
  const { tx, companyId, user, lines } = args;
  const actorName = user.name || user.email || user.id || null;
  const referenceId = args.referenceId ?? crypto.randomUUID();
  const referenceNumber = args.referenceNumber ?? buildReferenceNumber();
  const decidedAt = new Date();
  const companySettings = await tx.company.findUnique({
    where: { id: companyId },
    select: { jobCostingSettings: true },
  });
  const stockControlSettings = readStockControlSettingsFromCompanySettings(companySettings?.jobCostingSettings);

  const policySummary = validateManualStockAdjustmentRequest({
    lines,
    evidenceType: args.evidenceType,
    evidenceNotes: args.evidenceNotes ?? null,
    settings: stockControlSettings,
  });

  const uniqueMaterialIds = Array.from(new Set(lines.map((line) => line.materialId)));
  const uniqueWarehouseIds = Array.from(new Set(lines.map((line) => line.warehouseId)));
  const [materials, warehouses] = await Promise.all([
    tx.material.findMany({
      where: {
        companyId,
        id: { in: uniqueMaterialIds },
      },
      select: { id: true },
    }),
    tx.warehouse.findMany({
      where: {
        companyId,
        id: { in: uniqueWarehouseIds },
        isActive: true,
      },
      select: { id: true },
    }),
  ]);

  if (materials.length !== uniqueMaterialIds.length) throw new Error('One or more materials were not found');
  if (warehouses.length !== uniqueWarehouseIds.length) throw new Error('One or more warehouses were not found');

  const appliedTransactionIds: string[] = [];
  const isAutoApproved = Boolean(user.isSuperAdmin);

  if (isAutoApproved) {
    for (const line of lines) {
      const transaction = await applyManualStockAdjustmentApproval({
        tx,
        companyId,
        approvalId: referenceId,
        reason: args.reason,
        payload: line,
        requestNotes: args.notes ?? null,
        actor: buildTransactionActorFields(user),
        appliedAt: decidedAt,
      });
      appliedTransactionIds.push(transaction.id);
    }
  }

  const approval = await upsertStockExceptionApproval(tx, {
    companyId,
    exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
    referenceId,
    referenceNumber,
    reason: args.reason,
    payload: {
      lines,
      notes: args.notes ?? null,
      evidenceType: args.evidenceType,
      evidenceReference: args.evidenceReference,
      evidenceNotes: args.evidenceNotes ?? null,
      policySummary,
      stockControlSettings,
      requestedAt: decidedAt.toISOString(),
      appliedTransactionIds,
      sourceType: args.source?.type ?? null,
      sourceSessionId: args.source?.type === 'STOCK_COUNT_SESSION' ? args.source.sessionId : null,
      sourceSessionTitle: args.source?.type === 'STOCK_COUNT_SESSION' ? args.source.sessionTitle ?? null : null,
    },
    createdById: user.id ?? null,
    createdByName: actorName,
    status: isAutoApproved ? 'APPROVED' : 'PENDING',
    decidedById: isAutoApproved ? (user.id ?? null) : null,
    decidedByName: isAutoApproved ? actorName : null,
    decidedAt: isAutoApproved ? decidedAt : null,
    decisionNote: isAutoApproved
      ? policySummary.requiresDecisionNote
        ? 'Auto-approved by super admin for a high-impact negative adjustment. Evidence reviewed at request time.'
        : 'Auto-approved because manual stock adjustment was posted by super admin.'
      : null,
  });

  return {
    approval,
    appliedTransactionIds,
    lineCount: lines.length,
    policySummary,
  };
}
