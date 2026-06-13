import {
  countMaterialBlockingLinks,
  permanentlyDeleteMaterial,
} from '@/lib/materials/permanentlyDeleteMaterial';

describe('permanentlyDeleteMaterial', () => {
  it('counts blocking ledger links', async () => {
    const tx = {
      transaction: { count: jest.fn(async () => 2) },
      deliveryNoteMaterialLine: { count: jest.fn(async () => 0) },
      jobItemTrackableMaterialLink: { count: jest.fn(async () => 1) },
    };

    await expect(
      countMaterialBlockingLinks(tx as never, { companyId: 'co-1', materialId: 'mat-1' })
    ).resolves.toBe(3);
  });

  it('deletes child rows before removing the material', async () => {
    const calls: string[] = [];
    const tx = {
      stockBatch: {
        findMany: jest.fn(async () => [{ id: 'batch-1' }]),
      },
      transactionBatch: {
        deleteMany: jest.fn(async () => {
          calls.push('transactionBatch');
          return { count: 1 };
        }),
      },
      stockBatchDeleteMany: jest.fn(),
      materialWarehouseStock: {
        deleteMany: jest.fn(async () => {
          calls.push('warehouseStock');
          return { count: 1 };
        }),
      },
      materialUom: {
        deleteMany: jest.fn(async () => {
          calls.push('uom');
          return { count: 1 };
        }),
      },
      materialAssemblyComponent: {
        deleteMany: jest.fn(async () => {
          calls.push('assembly');
          return { count: 0 };
        }),
      },
      materialLog: {
        deleteMany: jest.fn(async () => {
          calls.push('materialLog');
          return { count: 0 };
        }),
      },
      priceLog: {
        deleteMany: jest.fn(async () => {
          calls.push('priceLog');
          return { count: 0 };
        }),
      },
      material: {
        delete: jest.fn(async () => {
          calls.push('material');
          return { id: 'mat-1' };
        }),
      },
    };

    tx.stockBatch.deleteMany = jest.fn(async () => {
      calls.push('stockBatch');
      return { count: 1 };
    });

    await permanentlyDeleteMaterial(tx as never, { companyId: 'co-1', materialId: 'mat-1' });

    expect(calls).toEqual([
      'transactionBatch',
      'stockBatch',
      'warehouseStock',
      'uom',
      'assembly',
      'materialLog',
      'priceLog',
      'material',
    ]);
  });
});
