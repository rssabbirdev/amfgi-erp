export const WAREHOUSE_TRANSFER_REFERENCE_TYPE = 'warehouse_transfer';
export const SUBCONTRACT_ISSUE_REFERENCE_TYPE = 'subcontract_issue';
export const SUBCONTRACT_RECEIVE_REFERENCE_TYPE = 'subcontract_receive';

/** Subcontract send/receive moves stock between warehouses — not a supplier purchase receipt. */
export function isSubcontractWarehouseTransfer(referenceType?: string | null): boolean {
  return (
    referenceType === SUBCONTRACT_ISSUE_REFERENCE_TYPE ||
    referenceType === SUBCONTRACT_RECEIVE_REFERENCE_TYPE
  );
}

export function warehouseTransferReceiptNumber(
  referenceType: string,
  transferOutTransactionId: string
): string | undefined {
  if (isSubcontractWarehouseTransfer(referenceType)) return undefined;
  return `WH-XFER-${transferOutTransactionId.slice(-8).toUpperCase()}`;
}
