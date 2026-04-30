import {
  buildManualAdjustmentLinesFromCount,
  buildStockCountDraftLines,
  updateStockCountVariance,
} from '@/lib/utils/stockCountSession';

describe('Stock count session helpers', () => {
  it('builds warehouse-scoped draft lines and turns variances into adjustment payload lines', () => {
    const lines = buildStockCountDraftLines(
      [
        {
          id: 'mat-1',
          name: 'Glass Mat',
          unit: 'kg',
          warehouseId: 'wh-1',
          currentStock: 10,
          unitCost: 8,
          isActive: true,
          materialWarehouseStocks: [{ warehouseId: 'wh-1', currentStock: 10 }],
        },
        {
          id: 'mat-2',
          name: 'Resin',
          unit: 'ltr',
          warehouseId: 'wh-1',
          currentStock: 5,
          unitCost: 6.5,
          isActive: true,
          materialWarehouseStocks: [{ warehouseId: 'wh-1', currentStock: 5 }],
        },
      ],
      'wh-1'
    );

    expect(lines).toHaveLength(2);
    const counted = [
      updateStockCountVariance(lines[0]!, '8'),
      updateStockCountVariance(lines[1]!, '7'),
    ];

    expect(counted[0]?.varianceQty).toBe(-2);
    expect(counted[1]?.varianceQty).toBe(2);

    expect(buildManualAdjustmentLinesFromCount(counted)).toEqual([
      {
        materialId: 'mat-1',
        warehouseId: 'wh-1',
        quantityDelta: -2,
      },
      {
        materialId: 'mat-2',
        warehouseId: 'wh-1',
        quantityDelta: 2,
        unitCost: 6.5,
      },
    ]);
  });
});
