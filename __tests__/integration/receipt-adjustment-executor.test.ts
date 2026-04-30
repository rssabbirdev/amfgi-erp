import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getReceiptAdjustmentImpact } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/adjustment-impact/route';
import { POST as adjustReceiptEntry } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/adjust/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Receipt adjustment executor', () => {
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

  it('posts a reasoned adjustment that reverses only the remaining available stock on a consumed receipt', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-ADJ-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Adjustment Customer ${Date.now().toString(36)}`,
      },
    });

    const job = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        customerId: customer.id,
        jobNumber: `JOB-ADJ-${Date.now().toString(36).toUpperCase()}`,
        createdBy: ctx.admin.id,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Adjust Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-ADJ-${Date.now().toString(36)}`,
        currentStock: 9,
        unitCost: 13,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 9,
      },
    });

    const batch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-ADJ-BATCH-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-ADJUST-001',
        quantityReceived: 9,
        quantityAvailable: 4,
        unitCost: 13,
        totalCost: 117,
        supplier: 'Adjust Supplier',
        receivedDate: new Date('2026-04-16T00:00:00.000Z'),
      },
    });

    const stockOut = await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: 5,
        jobId: job.id,
        notes: 'Consumed before adjustment',
        date: new Date('2026-04-17T00:00:00.000Z'),
        performedBy: ctx.admin.email,
      },
    });

    await prisma.transactionBatch.create({
      data: {
        transactionId: stockOut.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityFromBatch: 5,
        unitCost: 13,
        costAmount: 65,
      },
    });

    const response = await adjustReceiptEntry(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-ADJUST-001/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Received quantity must be removed from on-hand after supplier dispute' }),
      }),
      { params: Promise.resolve({ receiptNumber: 'RCPT-ADJUST-001' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.adjusted).toBe(true);
    expect(payload.data.remainingAdjustedQty).toBe(4);

    const refreshedBatch = await prisma.stockBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: {
        quantityAvailable: true,
        notes: true,
      },
    });
    expect(Number(refreshedBatch.quantityAvailable)).toBe(0);
    expect(refreshedBatch.notes || '').toContain('[RECEIPT_ADJUSTED_AT:');
    expect(refreshedBatch.notes || '').toContain('[RECEIPT_ADJUST_REASON:Received quantity must be removed from on-hand after supplier dispute]');

    const refreshedMaterial = await prisma.material.findUniqueOrThrow({
      where: { id: material.id },
      select: { currentStock: true },
    });
    expect(Number(refreshedMaterial.currentStock)).toBe(5);

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
    expect(Number(warehouseStock.currentStock)).toBe(5);

    const reversal = await prisma.transaction.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        type: 'REVERSAL',
        materialId: material.id,
        notes: { contains: 'Receipt adjustment for RCPT-ADJUST-001' },
      },
      include: {
        batchesUsed: true,
      },
    });
    expect(Number(reversal.quantity)).toBe(4);
    expect(reversal.notes || '').toContain('supplier dispute');
    expect(reversal.batchesUsed).toHaveLength(1);
    expect(Number(reversal.batchesUsed[0]?.quantityFromBatch)).toBe(4);

    const approval = await prisma.stockExceptionApproval.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'RECEIPT_ADJUSTMENT',
        referenceId: 'RCPT-ADJUST-001',
      },
    });
    expect(approval.status).toBe('APPROVED');
    expect(approval.reason).toContain('supplier dispute');
    expect(approval.decidedById).toBe(ctx.admin.id);

    const impactResponse = await getReceiptAdjustmentImpact(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-ADJUST-001/adjustment-impact'),
      { params: Promise.resolve({ receiptNumber: 'RCPT-ADJUST-001' }) }
    );
    expect(impactResponse.status).toBe(200);
    const impactPayload = await impactResponse.json();
    expect(impactPayload.data.canAdjustRemaining).toBe(false);
    expect(impactPayload.data.adjustmentReason).toBe(
      'Received quantity must be removed from on-hand after supplier dispute'
    );
    expect(impactPayload.data.summary.totalAvailable).toBe(0);
    expect(impactPayload.data.summary.totalConsumed).toBe(5);
    expect(impactPayload.data.summary.totalAdjusted).toBe(4);
  });
});
