import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getReceiptAdjustmentImpact } from '@/app/api/materials/receipt-history-entries/[receiptNumber]/adjustment-impact/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Receipt adjustment impact', () => {
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

  it('shows downstream batch links, jobs, and customers for a consumed receipt', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-IMPACT-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Impact Customer ${Date.now().toString(36)}`,
      },
    });

    const job = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        customerId: customer.id,
        jobNumber: `JOB-IMPACT-${Date.now().toString(36).toUpperCase()}`,
        createdBy: ctx.admin.id,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Receipt Impact Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `REC-IMPACT-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 11,
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
        batchNumber: `REC-IMPACT-BATCH-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-IMPACT-001',
        quantityReceived: 10,
        quantityAvailable: 4,
        unitCost: 11,
        totalCost: 110,
        supplier: 'Impact Supplier',
        receivedDate: new Date('2026-04-14T00:00:00.000Z'),
      },
    });

    const stockOut = await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: 6,
        jobId: job.id,
        notes: 'Issued from receipt impact test',
        date: new Date('2026-04-15T00:00:00.000Z'),
        performedBy: ctx.admin.email,
      },
    });

    await prisma.transactionBatch.create({
      data: {
        transactionId: stockOut.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityFromBatch: 6,
        unitCost: 11,
        costAmount: 66,
      },
    });

    const response = await getReceiptAdjustmentImpact(
      new Request('http://localhost/api/materials/receipt-history-entries/RCPT-IMPACT-001/adjustment-impact'),
      { params: Promise.resolve({ receiptNumber: 'RCPT-IMPACT-001' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.canCancel).toBe(false);
    expect(payload.data.needsAdjustmentReview).toBe(true);
    expect(payload.data.summary.totalConsumed).toBe(6);
    expect(payload.data.summary.linkedJobsCount).toBe(1);
    expect(payload.data.summary.linkedCustomersCount).toBe(1);

    expect(payload.data.rows).toHaveLength(1);
    expect(payload.data.rows[0].quantityConsumed).toBe(6);
    expect(payload.data.rows[0].linkedTransactions).toHaveLength(1);
    expect(payload.data.rows[0].linkedTransactions[0].type).toBe('STOCK_OUT');
    expect(payload.data.rows[0].linkedTransactions[0].jobNumber).toBe(job.jobNumber);
    expect(payload.data.rows[0].linkedTransactions[0].customerName).toBe(customer.name);
    expect(payload.data.rows[0].linkedTransactions[0].quantityFromBatch).toBe(6);
  });
});
