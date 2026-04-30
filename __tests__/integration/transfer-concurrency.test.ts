import 'dotenv/config';
import { auth } from '@/auth';
import { POST as createTransfer } from '@/app/api/transactions/transfer/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';
import { decimalToNumberOrZero } from '../../lib/utils/decimal';
import { SYSTEM_FALLBACK_WAREHOUSE_NAME } from '../../lib/warehouses/companyWarehouseMode';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Transfer concurrency guard', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.transfer'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('allows only one transfer when requests oversubscribe stock concurrently', async () => {
    const sourceWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'SRC-WH-CONC',
        isActive: true,
      },
    });
    const destinationWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.kmCompany.id,
        name: 'DST-WH-CONC',
        isActive: true,
      },
    });
    const sourceFallbackWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: SYSTEM_FALLBACK_WAREHOUSE_NAME,
        isActive: true,
        isSystem: true,
      },
    });
    const destinationFallbackWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.kmCompany.id,
        name: SYSTEM_FALLBACK_WAREHOUSE_NAME,
        isActive: true,
        isSystem: true,
      },
    });
    await prisma.company.update({
      where: { id: ctx.amfgiCompany.id },
      data: { stockFallbackWarehouseId: sourceFallbackWarehouse.id },
    });
    await prisma.company.update({
      where: { id: ctx.kmCompany.id },
      data: { stockFallbackWarehouseId: destinationFallbackWarehouse.id },
    });

    const sourceMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Concurrent Transfer Material',
        unit: 'kg',
        category: 'Test',
        warehouse: sourceWarehouse.name,
        warehouseId: sourceWarehouse.id,
        stockType: 'Raw Material',
        externalItemName: 'CONCURRENT-TRANSFER',
        currentStock: 10,
        allowNegativeConsumption: false,
        unitCost: 10,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: sourceMaterial.id,
        warehouseId: sourceWarehouse.id,
        batchNumber: 'CONC-BATCH-001',
        quantityReceived: 10,
        quantityAvailable: 10,
        unitCost: 10,
        totalCost: 100,
        receivedDate: new Date('2026-01-01'),
      },
    });

    const transferBody = (quantity: number) =>
      JSON.stringify({
        sourceCompanyId: ctx.amfgiCompany.id,
        destinationCompanyId: ctx.kmCompany.id,
        sourceWarehouseId: sourceWarehouse.id,
        destinationWarehouseId: destinationWarehouse.id,
        materialId: sourceMaterial.id,
        quantity,
      });

    const [resA, resB] = await Promise.all([
      createTransfer(
        new Request('http://localhost/api/transactions/transfer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: transferBody(7),
        })
      ),
      createTransfer(
        new Request('http://localhost/api/transactions/transfer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: transferBody(5),
        })
      ),
    ]);

    const statuses = [resA.status, resB.status];
    const successCount = statuses.filter((s) => s === 201).length;
    const failureCount = statuses.filter((s) => s === 400).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    const failedResponse = resA.status === 400 ? await resA.json() : await resB.json();
    expect(String(failedResponse?.error ?? '').includes('Stock changed')).toBe(true);

    const updatedSourceMaterial = await prisma.material.findUnique({
      where: { id: sourceMaterial.id },
    });
    const transferOutTxns = await prisma.transaction.findMany({
      where: {
        companyId: ctx.amfgiCompany.id,
        type: 'TRANSFER_OUT',
        materialId: sourceMaterial.id,
      },
    });

    expect(transferOutTxns).toHaveLength(1);
    const transferredQty = decimalToNumberOrZero(transferOutTxns[0].quantity);
    expect([5, 7].includes(transferredQty)).toBe(true);
    expect(decimalToNumberOrZero(updatedSourceMaterial?.currentStock)).toBe(10 - transferredQty);
  });
});
