import {
  buildStockBatchReceiptHeaderMeta,
  mergeStockBatchReceiptMeta,
  parseReceiptHeaderMetadata,
  resolveReceiptBillAmount,
} from '@/lib/utils/receiptHeaderMetadata';
import { buildStockBatchReceiptLineMeta } from '@/lib/utils/receiptLineMetadata';

describe('receiptHeaderMetadata', () => {
  it('round-trips header fields on batch meta', () => {
    const headerMeta = buildStockBatchReceiptHeaderMeta({
      lpoNumber: 'LPO-1001',
      supplierInvoiceNumber: 'INV-55',
      billAmount: 105,
      includeTax: true,
      taxAmount: 5,
    });
    const parsed = parseReceiptHeaderMetadata(headerMeta);
    expect(parsed.lpoNumber).toBe('LPO-1001');
    expect(parsed.supplierInvoiceNumber).toBe('INV-55');
    expect(parsed.billAmount).toBe(105);
    expect(parsed.includeTax).toBe(true);
    expect(parsed.taxAmount).toBe(5);
  });

  it('falls back to subtotal when bill amount is missing', () => {
    expect(resolveReceiptBillAmount(parseReceiptHeaderMetadata(null), 88.5)).toBe(88.5);
  });

  it('merges line and header meta without clobbering', () => {
    const merged = mergeStockBatchReceiptMeta(
      buildStockBatchReceiptLineMeta({
        displayQuantity: 5,
        displayUnitCost: 12.5,
      }),
      buildStockBatchReceiptHeaderMeta({
        lpoNumber: 'LPO-2002',
      })
    );

    expect(merged).toMatchObject({
      receiptLine: {
        displayQuantity: 5,
        displayUnitCost: 12.5,
      },
      receiptHeader: {
        lpoNumber: 'LPO-2002',
      },
    });
  });
});
