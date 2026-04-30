import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getStockExceptions } from '@/app/api/reports/stock-exceptions/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Stock exceptions report', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['report.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('aggregates dispatch overrides plus receipt adjustments and cancellations', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `EXC-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Exception Customer ${Date.now().toString(36)}`,
      },
    });

    const job = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        customerId: customer.id,
        jobNumber: `JOB-EXC-${Date.now().toString(36).toUpperCase()}`,
        createdBy: ctx.admin.id,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Exception Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `EXC-MAT-${Date.now().toString(36)}`,
        currentStock: 5,
        unitCost: 10,
      },
    });

    await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: 3,
        jobId: job.id,
        notes: '[OVERRIDE_REASON:Urgent dispatch exceeded planned allowance]',
        date: new Date('2026-04-20T00:00:00.000Z'),
        performedBy: ctx.admin.email,
      },
    });

    const adjustedBatch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `EXC-ADJ-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-EXC-ADJ',
        quantityReceived: 5,
        quantityAvailable: 0,
        unitCost: 10,
        totalCost: 50,
        supplier: 'Exception Supplier',
        receivedDate: new Date('2026-04-18T00:00:00.000Z'),
        notes: '[RECEIPT_ADJUSTED_AT:2026-04-21T09:00:00.000Z]\n[RECEIPT_ADJUST_REASON:Approved remaining stock adjustment]',
      },
    });

    await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: 5,
        jobId: job.id,
        notes: 'Consumed from adjusted receipt',
        date: new Date('2026-04-19T00:00:00.000Z'),
        performedBy: ctx.admin.email,
        batchesUsed: {
          create: {
            batchId: adjustedBatch.id,
            batchNumber: adjustedBatch.batchNumber,
            quantityFromBatch: 5,
            unitCost: 10,
            costAmount: 50,
          },
        },
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `EXC-CAN-${Date.now().toString(36).toUpperCase()}`,
        receiptNumber: 'RCPT-EXC-CAN',
        quantityReceived: 2,
        quantityAvailable: 0,
        unitCost: 10,
        totalCost: 20,
        supplier: 'Exception Supplier',
        receivedDate: new Date('2026-04-17T00:00:00.000Z'),
        notes: '[RECEIPT_CANCELLED_AT:2026-04-22T10:00:00.000Z]\n[RECEIPT_CANCEL_REASON:Wrong receipt posted]',
      },
    });

    const response = await getStockExceptions();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.summary.totalEvents).toBe(3);
    expect(payload.data.summary.dispatchOverrideCount).toBe(1);
    expect(payload.data.summary.receiptAdjustmentCount).toBe(1);
    expect(payload.data.summary.receiptCancellationCount).toBe(1);
    expect(payload.data.summary.linkedJobsCount).toBe(1);
    expect(payload.data.summary.linkedCustomersCount).toBe(1);

    const rows = payload.data.rows as Array<{
      category: string;
      referenceNumber: string;
      reason: string | null;
      jobNumbers: string[];
      customerNames: string[];
    }>;

    const overrideRow = rows.find((row) => row.category === 'dispatch_override');
    const adjustmentRow = rows.find((row) => row.category === 'receipt_adjustment');
    const cancellationRow = rows.find((row) => row.category === 'receipt_cancellation');

    expect(overrideRow?.reason).toBe('Urgent dispatch exceeded planned allowance');
    expect(overrideRow?.jobNumbers).toContain(job.jobNumber);
    expect(overrideRow?.customerNames).toContain(customer.name);

    expect(adjustmentRow?.referenceNumber).toBe('RCPT-EXC-ADJ');
    expect(adjustmentRow?.reason).toBe('Approved remaining stock adjustment');
    expect(adjustmentRow?.jobNumbers).toContain(job.jobNumber);

    expect(cancellationRow?.referenceNumber).toBe('RCPT-EXC-CAN');
    expect(cancellationRow?.reason).toBe('Wrong receipt posted');
  });
});
