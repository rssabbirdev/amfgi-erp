import 'dotenv/config';
import { auth } from '@/auth';
import { POST as createBatchTransaction } from '@/app/api/transactions/batch/route';
import { DELETE as deleteTransaction } from '@/app/api/transactions/[id]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';
import { decimalToNumberOrZero } from '../../lib/utils/decimal';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Batch-aware return integrity', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.stock_out', 'transaction.stock_in', 'transaction.return'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  async function seedDispatchScenario() {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `RET-WH-${Date.now().toString(36)}`,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Return Customer ${Date.now().toString(36)}`,
      },
    });

    const job = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `JOB-RET-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Return Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `RET-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 10,
        allowNegativeConsumption: false,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 10,
      },
    });

    const batch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `RET-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 10,
        quantityAvailable: 10,
        unitCost: 10,
        totalCost: 100,
        receivedDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    return { warehouse, customer, job, material, batch };
  }

  it('restores batch availability when a return is created and removes it cleanly on delete', async () => {
    const { warehouse, job, material, batch } = await seedDispatchScenario();

    const response = await createBatchTransaction(
      new Request('http://localhost/api/transactions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_OUT',
          jobId: job.id,
          lines: [
            {
              materialId: material.id,
              quantity: 6,
              returnQty: 2,
              warehouseId: warehouse.id,
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(201);

    const transactions = await prisma.transaction.findMany({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
      },
      include: {
        batchesUsed: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const stockOutTxn = transactions.find((txn) => txn.type === 'STOCK_OUT');
    const returnTxn = transactions.find((txn) => txn.type === 'RETURN');
    const refreshedMaterial = await prisma.material.findUnique({ where: { id: material.id } });
    const refreshedWarehouseStock = await prisma.materialWarehouseStock.findUnique({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: warehouse.id,
        },
      },
    });
    const refreshedBatch = await prisma.stockBatch.findUnique({ where: { id: batch.id } });

    expect(stockOutTxn).toBeTruthy();
    expect(returnTxn).toBeTruthy();
    expect(stockOutTxn?.batchesUsed).toHaveLength(1);
    expect(returnTxn?.batchesUsed).toHaveLength(1);
    expect(decimalToNumberOrZero(stockOutTxn?.batchesUsed[0]?.quantityFromBatch)).toBe(6);
    expect(decimalToNumberOrZero(returnTxn?.batchesUsed[0]?.quantityFromBatch)).toBe(2);
    expect(decimalToNumberOrZero(refreshedMaterial?.currentStock)).toBe(6);
    expect(decimalToNumberOrZero(refreshedWarehouseStock?.currentStock)).toBe(6);
    expect(decimalToNumberOrZero(refreshedBatch?.quantityAvailable)).toBe(6);

    const deleteResponse = await deleteTransaction(
      new Request(`http://localhost/api/transactions/${returnTxn!.id}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: returnTxn!.id }) }
    );

    expect(deleteResponse.status).toBe(200);

    const afterDeleteMaterial = await prisma.material.findUnique({ where: { id: material.id } });
    const afterDeleteWarehouseStock = await prisma.materialWarehouseStock.findUnique({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: warehouse.id,
        },
      },
    });
    const afterDeleteBatch = await prisma.stockBatch.findUnique({ where: { id: batch.id } });
    const afterDeleteReturn = await prisma.transaction.findUnique({ where: { id: returnTxn!.id } });

    expect(afterDeleteReturn).toBeNull();
    expect(decimalToNumberOrZero(afterDeleteMaterial?.currentStock)).toBe(4);
    expect(decimalToNumberOrZero(afterDeleteWarehouseStock?.currentStock)).toBe(4);
    expect(decimalToNumberOrZero(afterDeleteBatch?.quantityAvailable)).toBe(4);
  });

  it('removes prior return batch restoration when a dispatch entry is updated', async () => {
    const { warehouse, job, material, batch } = await seedDispatchScenario();

    const initialResponse = await createBatchTransaction(
      new Request('http://localhost/api/transactions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_OUT',
          jobId: job.id,
          lines: [
            {
              materialId: material.id,
              quantity: 6,
              returnQty: 2,
              warehouseId: warehouse.id,
            },
          ],
        }),
      })
    );

    expect(initialResponse.status).toBe(201);

    const stockOutTxn = await prisma.transaction.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        type: 'STOCK_OUT',
      },
      orderBy: { createdAt: 'asc' },
    });

    const updateResponse = await createBatchTransaction(
      new Request('http://localhost/api/transactions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_OUT',
          jobId: job.id,
          existingTransactionIds: [stockOutTxn.id],
          lines: [
            {
              materialId: material.id,
              quantity: 6,
              warehouseId: warehouse.id,
            },
          ],
        }),
      })
    );

    expect(updateResponse.status).toBe(201);

    const allTransactions = await prisma.transaction.findMany({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
      },
      include: {
        batchesUsed: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const returnTransactions = allTransactions.filter((txn) => txn.type === 'RETURN');
    const survivingStockOuts = allTransactions.filter((txn) => txn.type === 'STOCK_OUT');
    const refreshedMaterial = await prisma.material.findUnique({ where: { id: material.id } });
    const refreshedWarehouseStock = await prisma.materialWarehouseStock.findUnique({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: warehouse.id,
        },
      },
    });
    const refreshedBatch = await prisma.stockBatch.findUnique({ where: { id: batch.id } });

    expect(returnTransactions).toHaveLength(0);
    expect(survivingStockOuts).toHaveLength(1);
    expect(decimalToNumberOrZero(survivingStockOuts[0].batchesUsed[0]?.quantityFromBatch)).toBe(6);
    expect(decimalToNumberOrZero(refreshedMaterial?.currentStock)).toBe(4);
    expect(decimalToNumberOrZero(refreshedWarehouseStock?.currentStock)).toBe(4);
    expect(decimalToNumberOrZero(refreshedBatch?.quantityAvailable)).toBe(4);
  });
});
