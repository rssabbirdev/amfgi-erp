import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getSupplierTraceability } from '@/app/api/reports/supplier-traceability/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Supplier traceability report', () => {
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

  it('traces supplier receipt batches into warehouse dispatch, jobs, and customers', async () => {
    const supplier = await prisma.supplier.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Trace Supplier ${Date.now().toString(36)}`,
      },
    });

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Trace Customer ${Date.now().toString(36)}`,
      },
    });

    const parentJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `TRACE-PARENT-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const variationJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `TRACE-VAR-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `TRACE-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Trace Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `TRACE-MAT-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 10,
      },
    });

    const batch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `TRACE-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 10,
        quantityAvailable: 6,
        unitCost: 10,
        totalCost: 100,
        supplier: supplier.name,
        supplierId: supplier.id,
        receiptNumber: `TRACE-RCPT-${Date.now().toString(36).toUpperCase()}`,
        receivedDate: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    const dispatch = await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: 4,
        totalCost: 40,
        averageCost: 10,
        jobId: variationJob.id,
        performedBy: ctx.admin.id,
        isDeliveryNote: true,
        date: new Date('2026-04-02T00:00:00.000Z'),
      },
    });

    await prisma.transactionBatch.create({
      data: {
        transactionId: dispatch.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityFromBatch: 4,
        unitCost: 10,
        costAmount: 40,
      },
    });

    const response = await getSupplierTraceability();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);

    const row = payload.data.rows.find((entry: { batchId: string }) => entry.batchId === batch.id);
    expect(row).toBeTruthy();
    expect(row.supplierId).toBe(supplier.id);
    expect(row.supplierName).toBe(supplier.name);
    expect(row.receiptNumber).toBe(batch.receiptNumber);
    expect(row.warehouseId).toBe(warehouse.id);
    expect(row.issuedQuantity).toBe(4);
    expect(row.netIssuedQuantity).toBe(4);
    expect(row.dispatchCount).toBe(1);
    expect(row.deliveryNoteCount).toBe(1);
    expect(row.jobCount).toBe(1);
    expect(row.customerCount).toBe(1);
    expect(row.jobs[0].id).toBe(variationJob.id);
    expect(row.customers[0].id).toBe(customer.id);

    expect(payload.data.summary.totalBatches).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.suppliersCovered).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.dispatchedBatchCount).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.receiptLinkedCount).toBeGreaterThanOrEqual(1);
  });
});
