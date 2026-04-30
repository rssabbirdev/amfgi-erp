import type { Prisma, StockExceptionApprovalStatus, StockExceptionType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

type StockExceptionApprovalInput = {
  companyId: string;
  exceptionType: StockExceptionType;
  referenceId: string;
  referenceNumber?: string | null;
  reason: string;
  payload?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null;
  createdById?: string | null;
  createdByName?: string | null;
  status: StockExceptionApprovalStatus;
  decidedById?: string | null;
  decidedByName?: string | null;
  decidedAt?: Date | null;
  decisionNote?: string | null;
};

export async function upsertStockExceptionApproval(
  tx: Tx,
  input: StockExceptionApprovalInput
) {
  const {
    companyId,
    exceptionType,
    referenceId,
    referenceNumber,
    reason,
    payload,
    createdById,
    createdByName,
    status,
    decidedById,
    decidedByName,
    decidedAt,
    decisionNote,
  } = input;

  return tx.stockExceptionApproval.upsert({
    where: {
      companyId_exceptionType_referenceId: {
        companyId,
        exceptionType,
        referenceId,
      },
    },
    update: {
      referenceNumber: referenceNumber ?? undefined,
      reason,
      payload: payload ?? undefined,
      createdById: createdById ?? undefined,
      createdByName: createdByName ?? undefined,
      status,
      decidedById: decidedById ?? undefined,
      decidedByName: decidedByName ?? undefined,
      decidedAt: decidedAt ?? undefined,
      decisionNote: decisionNote ?? undefined,
    },
    create: {
      companyId,
      exceptionType,
      referenceId,
      referenceNumber: referenceNumber ?? undefined,
      reason,
      payload: payload ?? undefined,
      createdById: createdById ?? undefined,
      createdByName: createdByName ?? undefined,
      status,
      decidedById: decidedById ?? undefined,
      decidedByName: decidedByName ?? undefined,
      decidedAt: decidedAt ?? undefined,
      decisionNote: decisionNote ?? undefined,
    },
  });
}
