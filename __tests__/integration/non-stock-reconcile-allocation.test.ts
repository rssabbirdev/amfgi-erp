import 'dotenv/config';
import { auth } from '@/auth';
import { POST as reconcileNonStock } from '@/app/api/transactions/non-stock-reconcile/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Non-stock reconcile allocation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.reconcile'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('creates reconcile transactions using explicit per-job allocations instead of equal split', async () => {
    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Reconcile Customer ${Date.now().toString(36)}`,
      },
    });

    const parentJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `REC-PARENT-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const jobA = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `REC-A-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const jobB = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `REC-B-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `REC-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Reconcile Non Stock ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Non-Stock',
        allowNegativeConsumption: false,
        externalItemName: `REC-NS-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 10,
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

    const seedDispatchDate = new Date('2026-04-01T00:00:00.000Z');
    await prisma.transaction.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: material.id,
          warehouseId: warehouse.id,
          quantity: 1,
          totalCost: 10,
          averageCost: 10,
          jobId: jobA.id,
          performedBy: ctx.admin.id,
          date: seedDispatchDate,
        },
        {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: material.id,
          warehouseId: warehouse.id,
          quantity: 1,
          totalCost: 10,
          averageCost: 10,
          jobId: jobB.id,
          performedBy: ctx.admin.id,
          date: seedDispatchDate,
        },
      ],
    });

    const batch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `REC-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 10,
        quantityAvailable: 10,
        unitCost: 10,
        totalCost: 100,
        supplier: 'Opening Balance',
        receivedDate: new Date('2026-03-01T00:00:00.000Z'),
      },
    });

    const response = await reconcileNonStock(
      new Request('http://localhost/api/transactions/non-stock-reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jobIds: [jobA.id, jobB.id],
          lines: [
            {
              materialId: material.id,
              quantity: 6,
              warehouseId: warehouse.id,
            },
          ],
          allocations: [
            {
              jobId: jobA.id,
              materialId: material.id,
              quantity: 4,
            },
            {
              jobId: jobB.id,
              materialId: material.id,
              quantity: 2,
            },
          ],
          date: '2026-04-15',
          notes: 'Explicit allocation test',
        }),
      })
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.created).toBe(2);

    const reconcileRows = await prisma.transaction.findMany({
      where: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        notes: {
          contains: 'Non-stock reconcile',
        },
        materialId: material.id,
      },
      select: {
        jobId: true,
        quantity: true,
        totalCost: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const rowA = reconcileRows.find((row) => row.jobId === jobA.id);
    const rowB = reconcileRows.find((row) => row.jobId === jobB.id);

    expect(Number(rowA?.quantity)).toBe(4);
    expect(Number(rowB?.quantity)).toBe(2);
    expect(Number(rowA?.totalCost)).toBe(40);
    expect(Number(rowB?.totalCost)).toBe(20);

    const updatedBatch = await prisma.stockBatch.findUniqueOrThrow({
      where: { id: batch.id },
    });
    expect(Number(updatedBatch.quantityAvailable)).toBe(4);
  });
});
