import {
  mapManualStockAdjustmentImportRows,
  parseManualStockAdjustmentText,
} from '@/lib/utils/manualStockAdjustmentImport';

describe('Manual stock adjustment import', () => {
  it('parses pasted tab-delimited text and resolves material and warehouse by name', () => {
    const parsed = parseManualStockAdjustmentText(
      ['Material\tWarehouse\tQty Delta\tUnit Cost', 'Glass Mat\tMain Warehouse\t-5\t', 'Resin\tMain Warehouse\t4\t6.5'].join('\n')
    );

    expect(parsed.headers).toEqual(['Material', 'Warehouse', 'Qty Delta', 'Unit Cost']);

    const mapped = mapManualStockAdjustmentImportRows({
      headers: parsed.headers,
      rows: parsed.rows,
      materials: [
        { id: 'mat-1', name: 'Glass Mat' },
        { id: 'mat-2', name: 'Resin' },
      ],
      warehouses: [{ id: 'wh-1', name: 'Main Warehouse' }],
    });

    expect(mapped.errors).toHaveLength(0);
    expect(mapped.lines).toEqual([
      {
        materialId: 'mat-1',
        warehouseId: 'wh-1',
        quantityDelta: '-5',
        unitCost: '',
      },
      {
        materialId: 'mat-2',
        warehouseId: 'wh-1',
        quantityDelta: '4',
        unitCost: '6.5',
      },
    ]);
  });

  it('returns row-level errors for unresolved references and invalid numbers', () => {
    const parsed = parseManualStockAdjustmentText(
      ['Material ID,Warehouse ID,Quantity,Unit Cost', 'missing,wh-1,-3,', 'mat-2,missing,nope,1'].join('\n')
    );

    const mapped = mapManualStockAdjustmentImportRows({
      headers: parsed.headers,
      rows: parsed.rows,
      materials: [{ id: 'mat-2', name: 'Resin' }],
      warehouses: [{ id: 'wh-1', name: 'Main Warehouse' }],
    });

    expect(mapped.lines).toHaveLength(0);
    expect(mapped.errors).toHaveLength(2);
    expect(mapped.errors[0]?.message).toBe('Material not found: missing');
    expect(mapped.errors[1]?.message).toBe('Warehouse not found: missing');
  });
});
