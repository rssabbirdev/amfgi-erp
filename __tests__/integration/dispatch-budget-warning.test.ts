import 'dotenv/config';
import { auth } from '@/auth';
import { POST as getDispatchBudgetWarning } from '@/app/api/jobs/[id]/dispatch-budget-warning/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Dispatch budget warning', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['transaction.stock_out', 'job.view', 'material.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('warns for projected budget overruns and unbudgeted materials on variation jobs', async () => {
    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Budget Customer ${Date.now().toString(36)}`,
      },
    });

    const parentJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `JOB-PARENT-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const variationJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `JOB-VAR-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const budgetedMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Budgeted Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        stockType: 'Raw Material',
        externalItemName: `BUD-${Date.now().toString(36)}`,
        currentStock: 100,
        unitCost: 10,
      },
    });

    const unbudgetedMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Unbudgeted Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        stockType: 'Raw Material',
        externalItemName: `UNB-${Date.now().toString(36)}`,
        currentStock: 100,
        unitCost: 12,
      },
    });

    const formula = await prisma.formulaLibrary.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Dispatch Warning Formula',
        slug: `dispatch-warning-${Date.now().toString(36)}`,
        fabricationType: 'Test',
        formulaConfig: {
          version: 1,
          areas: [
            {
              key: 'main',
              label: 'Main',
              materials: [
                {
                  materialId: budgetedMaterial.id,
                  quantityExpression: 'specs.global.qty',
                },
              ],
              labor: [],
            },
          ],
        },
        specificationSchema: {
          globalFields: [
            { key: 'qty', label: 'Qty', inputType: 'number', required: true },
          ],
          areas: [],
        },
        isActive: true,
        createdBy: ctx.admin.id,
      },
    });

    await prisma.jobItem.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobId: variationJob.id,
        formulaLibraryId: formula.id,
        name: 'Main budget item',
        specifications: {
          global: {
            qty: 5,
          },
          areas: {},
        },
        createdBy: ctx.admin.id,
      },
    });

    await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_OUT',
        materialId: budgetedMaterial.id,
        quantity: 4,
        totalCost: 40,
        averageCost: 10,
        jobId: variationJob.id,
        performedBy: ctx.admin.id,
        date: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    const response = await getDispatchBudgetWarning(
      new Request(`http://localhost/api/jobs/${variationJob.id}/dispatch-budget-warning`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postingDate: '2026-04-29',
          lines: [
            {
              materialId: budgetedMaterial.id,
              quantity: 3,
            },
            {
              materialId: unbudgetedMaterial.id,
              quantity: 2,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: variationJob.id }) }
    );

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.applicable).toBe(true);
    expect(payload.data.warningCount).toBe(2);

    const budgetedRow = payload.data.rows.find((row: { materialId: string }) => row.materialId === budgetedMaterial.id);
    const unbudgetedRow = payload.data.rows.find((row: { materialId: string }) => row.materialId === unbudgetedMaterial.id);

    expect(budgetedRow.kind).toBe('quantity_overrun');
    expect(budgetedRow.estimatedBaseQuantity).toBe(5);
    expect(budgetedRow.currentIssuedBaseQuantity).toBe(4);
    expect(budgetedRow.pendingBaseQuantity).toBe(3);
    expect(budgetedRow.projectedIssuedBaseQuantity).toBe(7);
    expect(budgetedRow.quantityOverrun).toBe(2);

    expect(unbudgetedRow.kind).toBe('unbudgeted_material');
    expect(unbudgetedRow.estimatedBaseQuantity).toBe(0);
    expect(unbudgetedRow.pendingBaseQuantity).toBe(2);
    expect(unbudgetedRow.quantityOverrun).toBe(2);
  });
});
