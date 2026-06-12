import { buildDataContext, isDeliveryNoteRecord } from '@/lib/utils/templateData';

describe('delivery note print context', () => {
  it('detects delivery note API records', () => {
    expect(
      isDeliveryNoteRecord({
        id: 'dn-1',
        number: 3,
        documentNotes: null,
        customItemsJson: [],
      })
    ).toBe(true);
    expect(
      isDeliveryNoteRecord({
        id: 'txn-1',
        type: 'STOCK_OUT',
        notes: '--- DELIVERY NOTE #3',
      })
    ).toBe(false);
  });

  it('includes custom items when printing from a delivery note entity', () => {
    const ctx = buildDataContext(
      'delivery-note',
      {
        id: 'dn-1',
        number: 5,
        date: '2026-06-10',
        documentNotes: 'note body',
        customItemsJson: [{ name: 'Widget', qty: '2', unit: 'pcs' }],
      },
      { name: 'Co' }
    );

    expect(ctx.customItems).toHaveLength(1);
    expect(ctx.customItems[0].name).toBe('Widget');
    expect(ctx.customItems[0].qty).toBe('2');
  });
});
