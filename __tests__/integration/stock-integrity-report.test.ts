import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getStockIntegrity } from '@/app/api/reports/stock-integrity/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Stock integrity report', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['material.view', 'transaction.stock_in', 'transaction.stock_out'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('flags warehouse, batch, batchless, and inactive warehouse exceptions', async () => {
    const activeWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `INT-WH-ACT-${Date.now().toString(36)}`,
        isActive: true,
      },
    });
    const inactiveWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `INT-WH-INACT-${Date.now().toString(36)}`,
        isActive: false,
      },
    });

    const balancedMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Integrity Balanced ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: activeWarehouse.name,
        warehouseId: activeWarehouse.id,
        stockType: 'Raw Material',
        externalItemName: `INT-BAL-${Date.now().toString(36)}`,
        currentStock: 12,
        unitCost: 10,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: balancedMaterial.id,
        warehouseId: activeWarehouse.id,
        currentStock: 12,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: balancedMaterial.id,
        warehouseId: activeWarehouse.id,
        batchNumber: `BAL-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 12,
        quantityAvailable: 12,
        unitCost: 10,
        totalCost: 120,
        receivedDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const driftMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Integrity Drift ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: activeWarehouse.name,
        warehouseId: activeWarehouse.id,
        stockType: 'Raw Material',
        externalItemName: `INT-DRIFT-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 11,
      },
    });

    await prisma.materialWarehouseStock.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          materialId: driftMaterial.id,
          warehouseId: activeWarehouse.id,
          currentStock: 6,
        },
        {
          companyId: ctx.amfgiCompany.id,
          materialId: driftMaterial.id,
          warehouseId: inactiveWarehouse.id,
          currentStock: 2,
        },
      ],
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: driftMaterial.id,
        warehouseId: activeWarehouse.id,
        batchNumber: `DRIFT-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 6,
        quantityAvailable: 6,
        unitCost: 11,
        totalCost: 66,
        receivedDate: new Date('2026-01-02T00:00:00.000Z'),
      },
    });

    const response = await getStockIntegrity();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);

    const rows = payload.data.rows as Array<{
      materialId: string;
      companyTotal: number;
      warehouseTotal: number;
      batchTotal: number;
      batchlessWarehouseQty: number;
      inactiveWarehouseQty: number;
      exceptions: string[];
    }>;
    const driftRow = rows.find((row) => row.materialId === driftMaterial.id);
    const balancedRow = rows.find((row) => row.materialId === balancedMaterial.id);

    expect(driftRow).toBeTruthy();
    expect(driftRow?.companyTotal).toBe(10);
    expect(driftRow?.warehouseTotal).toBe(8);
    expect(driftRow?.batchTotal).toBe(6);
    expect(driftRow?.batchlessWarehouseQty).toBe(2);
    expect(driftRow?.inactiveWarehouseQty).toBe(2);
    expect(driftRow?.exceptions).toEqual(
      expect.arrayContaining([
        'warehouse_mismatch',
        'batch_mismatch',
        'batchless_stock',
        'inactive_warehouse_stock',
      ])
    );

    expect(balancedRow?.exceptions ?? []).toHaveLength(0);
    expect(payload.data.summary.totalMaterials).toBeGreaterThanOrEqual(2);
    expect(payload.data.summary.materialsWithExceptions).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.warehouseMismatchCount).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.batchMismatchCount).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.batchlessStockCount).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.inactiveWarehouseStockCount).toBeGreaterThanOrEqual(1);
  });
});
