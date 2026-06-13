import {
  buildMaterialTransactionReportRows,
  buildOpeningStockReportRows,
  isOpeningStockBatch,
  materialTransactionHref,
  materialTransactionKindLabel,
  materialTransactionPartyName,
  mergeMaterialTransactionReportRows,
  parseReceiptNumberFromTransaction,
} from '@/lib/materials/materialTransactionReport';

describe('materialTransactionReport', () => {
  const baseTxn = {
    id: 'txn-1',
    type: 'STOCK_OUT' as const,
    quantity: 5,
    totalCost: 100,
    averageCost: 20,
    date: new Date('2026-01-10T12:00:00.000Z'),
    notes: 'Dispatch note line',
    isDeliveryNote: false,
    deliveryNoteId: null,
    parentTransactionId: null,
    referenceType: null,
    sourceModule: 'stock',
    counterpartCompany: null,
    jobId: 'job-1',
    job: { jobNumber: 'JOB-100', customer: { name: 'Acme Corp' } },
    warehouse: { name: 'Main WH' },
    deliveryNote: null,
    material: { unit: 'bag', unitCost: 20 },
    batchesUsed: [],
    parent: null,
  };

  it('labels dispatch stock-out rows', () => {
    expect(materialTransactionKindLabel(baseTxn)).toBe('Dispatch');
    expect(materialTransactionPartyName(baseTxn)).toBe('Acme Corp');
    expect(materialTransactionHref(baseTxn)).toBe('/stock/dispatch/entry?jobId=job-1&date=2026-01-10');
  });

  it('builds entry rows for delivery notes and purchases', () => {
    const delivery = {
      ...baseTxn,
      isDeliveryNote: true,
      deliveryNoteId: 'dn-1',
      deliveryNote: { number: 42, deliveryType: 'DISPATCH', supplier: null },
    };
    expect(materialTransactionKindLabel(delivery)).toBe('Dispatch note');
    expect(materialTransactionHref(delivery)).toBe('/stock/dispatch/delivery-note?deliveryNoteId=dn-1');

    const purchase = {
      ...baseTxn,
      type: 'STOCK_IN' as const,
      job: null,
      jobId: null,
      notes: '[RECEIPT:REC-100]',
      batchesUsed: [],
    };
    expect(parseReceiptNumberFromTransaction(purchase)).toBe('REC-100');
    expect(materialTransactionHref(purchase)).toBe('/stock/goods-receipt/receive?edit=REC-100');

    const purchaseLookup = new Map([['REC-100', { supplierName: 'Supplier A' }]]);
    const rows = buildMaterialTransactionReportRows([purchase], { purchaseReceiptByNumber: purchaseLookup });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'purchase',
      kindLabel: 'Purchase',
      partyName: 'Supplier A',
      quantity: 5,
      value: 100,
      href: '/stock/goods-receipt/receive?edit=REC-100',
    });
  });

  it('groups dispatch activity by job and day and hides return lines', () => {
    const secondLine = {
      ...baseTxn,
      id: 'txn-2',
      quantity: 3,
      totalCost: 60,
    };
    const returnTxn = {
      ...baseTxn,
      id: 'txn-return',
      type: 'RETURN' as const,
      parentTransactionId: 'txn-1',
      quantity: 2,
      totalCost: 40,
      job: null,
      jobId: null,
    };
    const deliveryNote = {
      ...baseTxn,
      id: 'txn-dn',
      isDeliveryNote: true,
      deliveryNoteId: 'dn-9',
      deliveryNote: { number: 9, deliveryType: 'DISPATCH', supplier: null },
    };

    const rows = buildMaterialTransactionReportRows([baseTxn, secondLine, returnTxn, deliveryNote]);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.kind === 'dispatch')).toMatchObject({
      kindLabel: 'Dispatch',
      quantity: 6,
      value: 120,
      jobNumber: 'JOB-100',
    });
    expect(rows.find((row) => row.kind === 'dispatch_note')).toMatchObject({
      kindLabel: 'Dispatch note',
      quantity: 5,
      value: 100,
      href: '/stock/dispatch/delivery-note?deliveryNoteId=dn-9',
    });
    expect(rows.some((row) => row.kindLabel === 'Return')).toBe(false);
  });

  it('detects opening stock batches and builds report rows', () => {
    expect(
      isOpeningStockBatch({
        batchNumber: 'OPEN-123-abc',
        supplier: 'Opening balance',
        receiptNumber: null,
        notes: 'Created on material setup',
      }),
    ).toBe(true);
    expect(
      isOpeningStockBatch({
        batchNumber: 'BATCH-1',
        supplier: 'Supplier A',
        receiptNumber: 'REC-1',
        notes: null,
      }),
    ).toBe(false);

    const openingRows = buildOpeningStockReportRows(
      [
        {
          id: 'batch-open',
          batchNumber: 'OPEN-123-abc',
          quantityReceived: 50,
          totalCost: 500,
          supplier: 'Opening balance',
          receiptNumber: null,
          receivedDate: new Date('2025-06-01T10:00:00.000Z'),
          notes: 'Created on material setup',
          warehouse: { name: 'Main WH' },
        },
      ],
      { id: 'mat-1', unit: 'bag' },
    );

    expect(openingRows).toHaveLength(1);
    expect(openingRows[0]).toMatchObject({
      kind: 'opening_stock',
      kindLabel: 'Opening stock',
      partyName: 'Main WH',
      quantity: 50,
      value: 500,
      href: '/stock/materials/mat-1',
    });

    const merged = mergeMaterialTransactionReportRows(
      buildMaterialTransactionReportRows([baseTxn]),
      openingRows,
    );
    expect(merged).toHaveLength(2);
    expect(merged.some((row) => row.kind === 'opening_stock')).toBe(true);
  });
});
