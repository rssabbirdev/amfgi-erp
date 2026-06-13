import {
  isSubcontractWarehouseTransfer,
  SUBCONTRACT_ISSUE_REFERENCE_TYPE,
  SUBCONTRACT_RECEIVE_REFERENCE_TYPE,
  WAREHOUSE_TRANSFER_REFERENCE_TYPE,
  warehouseTransferReceiptNumber,
} from '@/lib/stock/warehouseTransferConstants';

describe('warehouseTransferConstants', () => {
  it('detects subcontract warehouse transfers', () => {
    expect(isSubcontractWarehouseTransfer(SUBCONTRACT_ISSUE_REFERENCE_TYPE)).toBe(true);
    expect(isSubcontractWarehouseTransfer(SUBCONTRACT_RECEIVE_REFERENCE_TYPE)).toBe(true);
    expect(isSubcontractWarehouseTransfer(WAREHOUSE_TRANSFER_REFERENCE_TYPE)).toBe(false);
    expect(isSubcontractWarehouseTransfer(null)).toBe(false);
  });

  it('does not assign receipt numbers for subcontract transfers', () => {
    expect(
      warehouseTransferReceiptNumber(SUBCONTRACT_ISSUE_REFERENCE_TYPE, 'txn-abcdef12')
    ).toBeUndefined();
    expect(
      warehouseTransferReceiptNumber(SUBCONTRACT_RECEIVE_REFERENCE_TYPE, 'txn-abcdef12')
    ).toBeUndefined();
  });

  it('assigns WH-XFER receipt numbers for manual warehouse transfers', () => {
    expect(warehouseTransferReceiptNumber(WAREHOUSE_TRANSFER_REFERENCE_TYPE, 'txn-abcdef12')).toBe(
      'WH-XFER-ABCDEF12'
    );
  });
});
