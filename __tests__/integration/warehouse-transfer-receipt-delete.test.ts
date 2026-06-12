import 'dotenv/config';
import { auth } from '@/auth';
import { DELETE as deleteReceiptEntry } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/route';
import { POST as createWarehouseTransfer } from '@/app/api/transactions/warehouse-transfer/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Warehouse transfer receipt delete', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.stock_in', 'transaction.transfer'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('deletes an untouched WH-XFER receipt and reverses warehouse balances', async () => {
    const sourceWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `WH-XFER-SRC-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });
    const destinationWarehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `WH-XFER-DST-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `WH-XFER Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: sourceWarehouse.name,
        warehouseId: sourceWarehouse.id,
        stockType: 'Raw Material',
        externalItemName: `WH-XFER-${Date.now().toString(36)}`,
        currentStock: 8,
        unitCost: 5,
      },
    });

    await prisma.materialWarehouseStock.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: sourceWarehouse.id,
          currentStock: 8,
        },
        {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: destinationWarehouse.id,
          currentStock: 0,
        },
      ],
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: sourceWarehouse.id,
        batchNumber: `WH-XFER-SRC-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 8,
        quantityAvailable: 8,
        unitCost: 5,
        totalCost: 40,
        receivedDate: new Date('2026-05-01T00:00:00.000Z'),
      },
    });

    const transferResponse = await createWarehouseTransfer(
      new Request('http://localhost/api/transactions/warehouse-transfer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceWarehouseId: sourceWarehouse.id,
          destinationWarehouseId: destinationWarehouse.id,
          materialId: material.id,
          quantity: 3,
          notes: 'WH-XFER delete test',
        }),
      })
    );

    expect([200, 201]).toContain(transferResponse.status);
    const transferPayload = await transferResponse.json();
    expect(transferPayload.success).toBe(true);

    const inboundBatch = await prisma.stockBatch.findFirst({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: destinationWarehouse.id,
        receiptNumber: { startsWith: 'WH-XFER-' },
      },
    });
    expect(inboundBatch?.receiptNumber).toBeTruthy();

    const receiptNumber = inboundBatch!.receiptNumber!;

    const deleteResponse = await deleteReceiptEntry(
      new Request(`http://localhost/api/materials/receipt-history-entries/${receiptNumber}`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ receiptNumber }) }
    );

    expect(deleteResponse.status).toBe(200);
    const deletePayload = await deleteResponse.json();
    expect(deletePayload.success).toBe(true);

    const deletedBatch = await prisma.stockBatch.findFirst({
      where: { companyId: ctx.amfgiCompany.id, receiptNumber },
    });
    expect(deletedBatch).toBeNull();

    const sourceStock = await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: sourceWarehouse.id,
        },
      },
      select: { currentStock: true },
    });
    const destinationStock = await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: destinationWarehouse.id,
        },
      },
      select: { currentStock: true },
    });

    expect(decimalToNumberOrZero(sourceStock.currentStock)).toBe(8);
    expect(decimalToNumberOrZero(destinationStock.currentStock)).toBe(0);

    const remainingTransfers = await prisma.transaction.count({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] },
        notes: { contains: 'WH-XFER delete test' },
      },
    });
    expect(remainingTransfers).toBe(0);
  });
});
