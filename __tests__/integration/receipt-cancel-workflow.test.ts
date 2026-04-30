import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getReceiptEntry } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/route';
import { POST as cancelReceiptEntry } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/cancel/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Receipt cancel workflow', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.stock_in'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('cancels an untouched receipt with reversal entries and keeps it visible as cancelled', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-CANCEL-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Cancel Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-CANCEL-${Date.now().toString(36)}`,
        currentStock: 7,
        unitCost: 9,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 7,
      },
    });

    const batch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-CANCEL-BATCH-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-CANCEL-OK',
        quantityReceived: 7,
        quantityAvailable: 7,
        unitCost: 9,
        totalCost: 63,
        supplier: 'Receipt Cancel Supplier',
        receivedDate: new Date('2026-04-12T00:00:00.000Z'),
      },
    });

    const response = await cancelReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-CANCEL-OK/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Wrong supplier bill was attached' }),
      }),
      { params: Promise.resolve({ receiptNumber: 'RCPT-CANCEL-OK' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.cancelled).toBe(true);

    const refreshedBatch = await prisma.stockBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: {
        quantityAvailable: true,
        notes: true,
      },
    });
    expect(Number(refreshedBatch.quantityAvailable)).toBe(0);
    expect(refreshedBatch.notes || '').toContain('[RECEIPT_CANCELLED_AT:');
    expect(refreshedBatch.notes || '').toContain('[RECEIPT_CANCEL_REASON:Wrong supplier bill was attached]');

    const refreshedMaterial = await prisma.material.findUniqueOrThrow({
      where: { id: material.id },
      select: { currentStock: true },
    });
    expect(Number(refreshedMaterial.currentStock)).toBe(0);

    const warehouseStock = await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          warehouseId: warehouse.id,
        },
      },
      select: { currentStock: true },
    });
    expect(Number(warehouseStock.currentStock)).toBe(0);

    const reversal = await prisma.transaction.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        type: 'REVERSAL',
        materialId: material.id,
        notes: { contains: 'Receipt cancellation for RCPT-CANCEL-OK' },
      },
      include: {
        batchesUsed: true,
      },
    });
    expect(Number(reversal.quantity)).toBe(7);
    expect(reversal.notes || '').toContain('Wrong supplier bill was attached');
    expect(reversal.batchesUsed).toHaveLength(1);
    expect(Number(reversal.batchesUsed[0]?.quantityFromBatch)).toBe(7);

    const detailResponse = await getReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-CANCEL-OK'),
      { params: Promise.resolve({ receiptNumber: 'RCPT-CANCEL-OK' }) }
    );
    expect(detailResponse.status).toBe(200);
    const detailPayload = await detailResponse.json();
    expect(detailPayload.data.status).toBe('cancelled');
    expect(detailPayload.data.cancellationReason).toBe('Wrong supplier bill was attached');
  });

  it('rejects cancellation after any receipt quantity has already been consumed', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-CANCEL-BLOCK-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Cancel Blocked ${Date.now().toString(36)}`,
        unit: 'pcs',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-CANCEL-BLOCK-${Date.now().toString(36)}`,
        currentStock: 8,
        unitCost: 4,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 8,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-CANCEL-BLOCK-BATCH-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-CANCEL-BLOCKED',
        quantityReceived: 8,
        quantityAvailable: 3,
        unitCost: 4,
        totalCost: 32,
        supplier: 'Receipt Cancel Supplier',
        receivedDate: new Date('2026-04-13T00:00:00.000Z'),
      },
    });

    const response = await cancelReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-CANCEL-BLOCKED/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Too late to cancel' }),
      }),
      { params: Promise.resolve({ receiptNumber: 'RCPT-CANCEL-BLOCKED' }) }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(String(payload.error)).toContain('Receipt cannot be cancelled because some quantity has already been consumed');
  });
});
