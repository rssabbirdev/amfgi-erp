export type CreatorUserRow = {
  id: string;
  name: string | null;
  email: string;
  signatureUrl: string | null;
};

export type CreatedBySlice = {
  createdByUserId?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdBySignatureUrl?: string;
};

type DeliveryNoteCreator = {
  createdByUserId?: string | null;
  createdByName?: string | null;
} | null | undefined;

type TransactionActor = {
  performedByUserId?: string | null;
  performedByName?: string | null;
  performedBy?: string | null;
} | null | undefined;

export function resolveEntryCreatedBy(
  deliveryNote: DeliveryNoteCreator,
  transaction: TransactionActor,
  creatorsById: Map<string, CreatorUserRow>
): CreatedBySlice {
  const userId =
    deliveryNote?.createdByUserId?.trim() ||
    transaction?.performedByUserId?.trim() ||
    undefined;
  const user = userId ? creatorsById.get(userId) : undefined;
  const name =
    (userId ? user?.name?.trim() : undefined) ||
    deliveryNote?.createdByName?.trim() ||
    transaction?.performedByName?.trim() ||
    transaction?.performedBy?.trim() ||
    undefined;

  return {
    createdByUserId: userId,
    createdByName: name,
    createdByEmail: user?.email,
    createdBySignatureUrl: user?.signatureUrl ?? undefined,
  };
}
