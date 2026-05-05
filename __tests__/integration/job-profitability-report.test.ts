import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getJobProfitability } from '@/app/api/reports/job-profitability/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Job profitability report', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.admin.id,
        name: 'Test Admin',
        email: ctx.admin.email,
        isSuperAdmin: true,
        permissions: ['report.view', 'job.view', 'material.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('rolls up budget, actual, returns, unbudgeted, and reconcile consumption by variation job', async () => {
    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Profit Customer ${Date.now().toString(36)}`,
      },
    });

    const parentJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `PROFIT-PARENT-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        status: 'ACTIVE',
        jobWorkValue: 1000,
        createdBy: ctx.admin.id,
      },
    });

    const variationJob = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: `PROFIT-VAR-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        parentJobId: parentJob.id,
        status: 'ACTIVE',
        jobWorkValue: 500,
        createdBy: ctx.admin.id,
      },
    });

    const budgetedMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Profit Budgeted ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        stockType: 'Raw Material',
        externalItemName: `PROFIT-BUD-${Date.now().toString(36)}`,
        currentStock: 100,
        unitCost: 10,
      },
    });

    const unbudgetedMaterial = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Profit Unbudgeted ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        stockType: 'Raw Material',
        externalItemName: `PROFIT-UNB-${Date.now().toString(36)}`,
        currentStock: 100,
        unitCost: 12,
      },
    });

    const formula = await prisma.formulaLibrary.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Profit Formula',
        slug: `profit-formula-${Date.now().toString(36)}`,
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
          globalFields: [{ key: 'qty', label: 'Qty', inputType: 'number', required: true }],
          areas: [],
        },
        isActive: true,
        createdBy: ctx.admin.id,
      },
    });

    await prisma.jobItem.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobId: parentJob.id,
        formulaLibraryId: formula.id,
        name: 'Profit item',
        specifications: {
          global: {
            qty: 5,
          },
          areas: {},
        },
        createdBy: ctx.admin.id,
      },
    });

    await prisma.transaction.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: budgetedMaterial.id,
          quantity: 6,
          totalCost: 60,
          averageCost: 10,
          jobId: variationJob.id,
          performedBy: ctx.admin.id,
          notes: 'Dispatch note',
          date: new Date('2026-04-01T00:00:00.000Z'),
        },
        {
          companyId: ctx.amfgiCompany.id,
          type: 'RETURN',
          materialId: budgetedMaterial.id,
          quantity: 1,
          totalCost: 10,
          averageCost: 10,
          jobId: variationJob.id,
          performedBy: ctx.admin.id,
          notes: 'Return note',
          date: new Date('2026-04-02T00:00:00.000Z'),
        },
        {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_OUT',
          materialId: unbudgetedMaterial.id,
          quantity: 2,
          totalCost: 24,
          averageCost: 12,
          jobId: variationJob.id,
          performedBy: ctx.admin.id,
          notes: 'Non-stock reconcile',
          date: new Date('2026-04-03T00:00:00.000Z'),
        },
      ],
    });

    const response = await getJobProfitability();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);

    const row = payload.data.rows.find((entry: { variationJobId: string }) => entry.variationJobId === variationJob.id);
    expect(row).toBeTruthy();
    expect(row.customerName).toBe(customer.name);
    expect(row.parentJobNumber).toBe(parentJob.jobNumber);
    expect(row.variationJobNumber).toBe(variationJob.jobNumber);
    expect(row.budgetMaterialCost).toBe(50);
    expect(row.budgetMaterialQuantity).toBe(5);
    expect(row.issuedMaterialCost).toBe(84);
    expect(row.returnedMaterialCost).toBe(10);
    expect(row.netMaterialCost).toBe(74);
    expect(row.netMaterialQuantity).toBe(7);
    expect(row.unbudgetedMaterialCount).toBe(1);
    expect(row.unbudgetedMaterialCost).toBe(24);
    expect(row.reconcileCost).toBe(24);
    expect(row.materialCostVariance).toBe(24);
    expect(row.materialMarginAgainstVariationValue).toBe(426);

    expect(payload.data.summary.totalVariations).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.overBudgetCount).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.withUnbudgetedMaterialCount).toBeGreaterThanOrEqual(1);
    expect(payload.data.summary.reconcileLinkedCount).toBeGreaterThanOrEqual(1);
  });
});
