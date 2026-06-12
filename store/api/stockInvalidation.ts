/** RTK Query tags to refresh after stock ledger changes (dispatch, receipt, transfer, etc.). */
export const STOCK_LEDGER_INVALIDATES = [
  { type: 'Material' as const, id: 'LIST' },
  { type: 'StockBatch' as const, id: 'LIST' },
  { type: 'Transaction' as const, id: 'LIST' },
  { type: 'StockValuation' as const },
  { type: 'DispatchEntry' as const },
  { type: 'DispatchEntryRevision' as const },
  { type: 'ReceiptEntry' as const },
  { type: 'Consumption' as const },
  { type: 'StockIntegrity' as const },
  { type: 'StockExceptionApproval' as const },
  { type: 'JobMaterials' as const },
];
