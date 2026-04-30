import 'dotenv/config';
import { auth } from '@/auth';
import { POST as postBatchTransaction } from '@/app/api/transactions/batch/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Dispatch override reason', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.stock_out'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('rejects negative-consumption shortfall dispatches without an override reason and accepts them with one', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `OVR-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Override Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        allowNegativeConsumption: true,
        externalItemName: `OVR-MAT-${Date.now().toString(36)}`,
        currentStock: 1,
        unitCost: 10,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 1,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `OVR-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 1,
        quantityAvailable: 1,
        unitCost: 10,
        totalCost: 10,
        supplier: 'Opening Balance',
        receivedDate: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    const withoutReason = await postBatchTransaction(
      new Request('http://localhost/api/transactions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_OUT',
          date: '2026-04-15',
          lines: [
            {
              materialId: material.id,
              quantity: 3,
              warehouseId: warehouse.id,
            },
          ],
        }),
      })
    );

    expect(withoutReason.status).toBe(400);
    const withoutReasonPayload = await withoutReason.json();
    expect(withoutReasonPayload.success).toBe(false);
    expect(String(withoutReasonPayload.error)).toContain('Override reason is required');

    const withReason = await postBatchTransaction(
      new Request('http://localhost/api/transactions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_OUT',
          date: '2026-04-15',
          overrideReason: 'Emergency issue while supplier stock is pending receipt',
          lines: [
            {
              materialId: material.id,
              quantity: 3,
              warehouseId: warehouse.id,
            },
          ],
        }),
      })
    );

    expect(withReason.status).toBe(201);
    const withReasonPayload = await withReason.json();
    expect(withReasonPayload.success).toBe(true);

    const createdId = withReasonPayload.data.ids[0];
    const createdTransaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: createdId },
      select: {
        notes: true,
        quantity: true,
      },
    });

    expect(Number(createdTransaction.quantity)).toBe(3);
    expect(createdTransaction.notes || '').toContain('[OVERRIDE_REASON:Emergency issue while supplier stock is pending receipt]');
  });
});
