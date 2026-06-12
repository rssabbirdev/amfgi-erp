import type { DeliveryNoteTransitStatus } from '@prisma/client';
import { executeWarehouseTransferBatch } from '@/lib/stock/executeWarehouseTransfer';
import {
  SUBCONTRACT_ISSUE_REFERENCE_TYPE,
  SUBCONTRACT_RECEIVE_REFERENCE_TYPE,
} from '@/lib/stock/warehouseTransferConstants';
import { buildTransactionActorFields, type AuditActorUser } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { resolveQuantityToBase } from '@/lib/utils/materialUomDb';

type Tx = Parameters<Parameters<typeof import('@/lib/db/prisma').prisma.$transaction>[0]>[0];

const EPSILON = 0.0005;

export interface SubcontractIssueLineInput {
  materialId: string;
  quantity: number;
  quantityUomId?: string;
  sourceWarehouseId?: string;
  targetWarehouseId?: string;
}

export interface SubcontractReceiveLineInput {
  lineId: string;
  receiveQty: number;
  destinationWarehouseId?: string;
}

export function computeTransitStatus(
  lines: Array<{ issuedQty: number | { toString(): string }; receivedQty: number | { toString(): string } }>
): DeliveryNoteTransitStatus | null {
  if (lines.length === 0) return null;
  let anyReceived = false;
  let allFullyReceived = true;
  for (const line of lines) {
    const issued = decimalToNumberOrZero(line.issuedQty as never);
    const received = decimalToNumberOrZero(line.receivedQty as never);
    if (received > EPSILON) anyReceived = true;
    if (received + EPSILON < issued) allFullyReceived = false;
  }
  if (!anyReceived) return 'ON_TRANSIT';
  if (allFullyReceived) return 'RECEIVED';
  return 'PARTIALLY_RECEIVED';
}

export function outstandingQty(issuedQty: number, receivedQty: number): number {
  return Math.max(0, issuedQty - receivedQty);
}

export async function reverseSubcontractIssue(
  tx: Tx,
  params: {
    companyId: string;
    deliveryNoteId: string;
    sessionUser: AuditActorUser;
    notes?: string;
    date?: Date;
  }
) {
  const lines = await tx.deliveryNoteMaterialLine.findMany({
    where: { deliveryNoteId: params.deliveryNoteId, companyId: params.companyId },
    orderBy: { sortOrder: 'asc' },
  });

  for (const line of lines) {
    const received = decimalToNumberOrZero(line.receivedQty);
    if (received > EPSILON) {
      throw new Error('Cannot edit subcontract issue after material has been received');
    }
    const issued = decimalToNumberOrZero(line.issuedQty);
    if (issued <= EPSILON) continue;

    await executeWarehouseTransferBatch(tx, params.companyId, params.sessionUser, {
      sourceWarehouseId: line.targetWarehouseId,
      destinationWarehouseId: line.sourceWarehouseId,
      lines: [{ materialId: line.materialId, quantity: issued }],
      notes: params.notes || 'Reverse subcontract issue',
      date: params.date,
    });
  }

  await tx.deliveryNoteMaterialLine.deleteMany({ where: { deliveryNoteId: params.deliveryNoteId } });
}

export async function issueSubcontractDeliveryNote(
  tx: Tx,
  params: {
    companyId: string;
    deliveryNoteId: string;
    sourceWarehouseId: string;
    targetWarehouseId: string;
    lines: SubcontractIssueLineInput[];
    notes?: string;
    date?: Date;
    sessionUser: AuditActorUser;
  }
) {
  const { companyId, deliveryNoteId, sourceWarehouseId, targetWarehouseId, lines, notes, date, sessionUser } =
    params;

  await tx.deliveryNoteMaterialLine.deleteMany({ where: { deliveryNoteId } });

  const createdLines: Array<{ id: string; materialId: string; issuedQty: number }> = [];

  for (let sortOrder = 0; sortOrder < lines.length; sortOrder++) {
    const line = lines[sortOrder]!;
    const srcId = line.sourceWarehouseId?.trim() || sourceWarehouseId;
    const tgtId = line.targetWarehouseId?.trim() || targetWarehouseId;
    const qtyBase = await resolveQuantityToBase(tx, line.materialId, line.quantity, line.quantityUomId);

    const materialLine = await tx.deliveryNoteMaterialLine.create({
      data: {
        companyId,
        deliveryNoteId,
        materialId: line.materialId,
        quantityUomId: line.quantityUomId?.trim() || null,
        issuedQty: qtyBase,
        receivedQty: 0,
        sourceWarehouseId: srcId,
        targetWarehouseId: tgtId,
        sortOrder,
      },
    });

    const transferResult = await executeWarehouseTransferBatch(tx, companyId, sessionUser, {
      sourceWarehouseId: srcId,
      destinationWarehouseId: tgtId,
      lines: [{ materialId: line.materialId, quantity: line.quantity, quantityUomId: line.quantityUomId }],
      notes,
      date,
      lineLinks: [
        {
          deliveryNoteId,
          deliveryNoteLineId: materialLine.id,
          referenceType: SUBCONTRACT_ISSUE_REFERENCE_TYPE,
          isDeliveryNote: true,
        },
      ],
    });

    const transferLine = transferResult.lines[0];
    if (transferLine) {
      await tx.deliveryNoteMaterialLine.update({
        where: { id: materialLine.id },
        data: {
          issueTransferOutId: transferLine.transferOutId,
          issueTransferInId: transferLine.transferInId,
        },
      });
    }

    createdLines.push({ id: materialLine.id, materialId: line.materialId, issuedQty: qtyBase });
  }

  await tx.deliveryNote.update({
    where: { id: deliveryNoteId },
    data: { transitStatus: 'ON_TRANSIT' },
  });

  return createdLines;
}

export async function receiveSubcontractDeliveryNote(
  tx: Tx,
  params: {
    companyId: string;
    deliveryNoteId: string;
    lines: SubcontractReceiveLineInput[];
    notes?: string;
    date?: Date;
    sessionUser: AuditActorUser;
  }
) {
  const { companyId, deliveryNoteId, lines, notes, date, sessionUser } = params;
  const actorFields = buildTransactionActorFields(sessionUser);
  const txDate = date ?? new Date();

  const dn = await tx.deliveryNote.findFirst({
    where: { id: deliveryNoteId, companyId },
    include: { materialLines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!dn) throw new Error('Delivery note not found');
  if (dn.deliveryType !== 'SUBCONTRACT') throw new Error('Not a subcontract delivery note');

  for (const input of lines) {
    const materialLine = dn.materialLines.find((row) => row.id === input.lineId);
    if (!materialLine) throw new Error(`Material line ${input.lineId} not found`);

    const issued = decimalToNumberOrZero(materialLine.issuedQty);
    const alreadyReceived = decimalToNumberOrZero(materialLine.receivedQty);
    const remaining = outstandingQty(issued, alreadyReceived);
    const receiveQty = input.receiveQty;

    if (receiveQty <= 0) continue;
    if (receiveQty > remaining + EPSILON) {
      throw new Error(`Receive quantity exceeds outstanding for material line ${input.lineId}`);
    }

    const destinationId = input.destinationWarehouseId?.trim() || materialLine.sourceWarehouseId;
    const sourceTransitId = materialLine.targetWarehouseId;

    const transferResult = await executeWarehouseTransferBatch(tx, companyId, sessionUser, {
      sourceWarehouseId: sourceTransitId,
      destinationWarehouseId: destinationId,
      lines: [{ materialId: materialLine.materialId, quantity: receiveQty }],
      notes: notes || `Subcontract receive for DN #${dn.number}`,
      date: txDate,
      lineLinks: [
        {
          deliveryNoteId,
          deliveryNoteLineId: materialLine.id,
          referenceType: SUBCONTRACT_RECEIVE_REFERENCE_TYPE,
          isDeliveryNote: true,
        },
      ],
    });

    void transferResult;
    void actorFields;

    await tx.deliveryNoteMaterialLine.update({
      where: { id: materialLine.id },
      data: { receivedQty: alreadyReceived + receiveQty },
    });
  }

  const updatedLines = await tx.deliveryNoteMaterialLine.findMany({
    where: { deliveryNoteId },
    orderBy: { sortOrder: 'asc' },
  });

  const transitStatus = computeTransitStatus(updatedLines);
  await tx.deliveryNote.update({
    where: { id: deliveryNoteId },
    data: { transitStatus },
  });

  return {
    transitStatus,
    lines: updatedLines.map((row) => ({
      id: row.id,
      materialId: row.materialId,
      issuedQty: decimalToNumberOrZero(row.issuedQty),
      receivedQty: decimalToNumberOrZero(row.receivedQty),
      outstandingQty: outstandingQty(
        decimalToNumberOrZero(row.issuedQty),
        decimalToNumberOrZero(row.receivedQty)
      ),
    })),
  };
}

export function canEditSubcontractIssue(transitStatus: DeliveryNoteTransitStatus | null | undefined): boolean {
  return transitStatus === 'ON_TRANSIT' || transitStatus == null;
}

export function hasAnyReceived(
  lines: Array<{ receivedQty: number | { toString(): string } }>
): boolean {
  return lines.some((line) => decimalToNumberOrZero(line.receivedQty as never) > EPSILON);
}
