import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getStockAdjustments } from '@/app/api/reports/stock-adjustments/route';
import { POST as createManualAdjustment } from '@/app/api/transactions/manual-adjustment/route';
import { PATCH as patchApproval } from '@/app/api/stock-exception-approvals/[id]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Stock adjustments report', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('summarizes approved bulk manual adjustments with evidence, warehouses, and applied value', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `SAR-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const materialA = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Adjustment Report Material A ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `SAR-MAT-A-${Date.now().toString(36)}`,
        currentStock: 12,
        unitCost: 8,
      },
    });

    const materialB = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Adjustment Report Material B ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `SAR-MAT-B-${Date.now().toString(36)}`,
        currentStock: 4,
        unitCost: 5,
      },
    });

    await prisma.materialWarehouseStock.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          materialId: materialA.id,
          warehouseId: warehouse.id,
          currentStock: 12,
        },
        {
          companyId: ctx.amfgiCompany.id,
          materialId: materialB.id,
          warehouseId: warehouse.id,
          currentStock: 4,
        },
      ],
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: materialA.id,
        warehouseId: warehouse.id,
        batchNumber: `SAR-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 12,
        quantityAvailable: 12,
        unitCost: 8,
        totalCost: 96,
        supplier: 'Opening Balance',
        receivedDate: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.manager.id,
        name: 'Test Manager',
        email: ctx.manager.email,
        isSuperAdmin: false,
        permissions: ['transaction.adjust', 'report.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });

    const requestResponse = await createManualAdjustment(
      new Request('http://localhost/api/transactions/manual-adjustment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              materialId: materialA.id,
              warehouseId: warehouse.id,
              quantityDelta: -3,
            },
            {
              materialId: materialB.id,
              warehouseId: warehouse.id,
              quantityDelta: 4,
              unitCost: 6.5,
            },
          ],
          reason: 'Cycle count cleanup',
          evidenceType: 'PHYSICAL_COUNT',
          evidenceReference: 'COUNT-REP-01',
          evidenceNotes: 'Shift recount and supervisor sign-off.',
          notes: 'Bulk recount fix.',
        }),
      })
    );

    expect(requestResponse.status).toBe(201);
    const requestPayload = await requestResponse.json();

    const approval = await prisma.stockExceptionApproval.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
        referenceId: requestPayload.data.referenceId,
      },
    });

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

    const approveResponse = await patchApproval(
      new Request(`http://localhost/api/stock-exception-approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          decisionNote: 'Count variance accepted.',
        }),
      }),
      { params: Promise.resolve({ id: approval.id }) }
    );

    expect(approveResponse.status).toBe(200);

    const reportResponse = await getStockAdjustments();
    expect(reportResponse.status).toBe(200);

    const reportPayload = await reportResponse.json();
    expect(reportPayload.success).toBe(true);
    expect(reportPayload.data.summary.total).toBeGreaterThanOrEqual(1);
    expect(reportPayload.data.summary.approved).toBeGreaterThanOrEqual(1);

    const row = (reportPayload.data.rows as Array<{
      status: string;
      reason: string;
      evidenceReference: string | null;
      materialNames: string[];
      warehouseNames: string[];
      grossIncreaseQty: number;
      grossDecreaseQty: number;
      netQty: number;
      estimatedNetValue: number;
      appliedNetValue: number | null;
      createdByName: string | null;
      decidedByName: string | null;
    }>).find(
      (item) => item.reason === 'Cycle count cleanup' && item.evidenceReference === 'COUNT-REP-01'
    );

    expect(row).toBeTruthy();
    expect(row?.status).toBe('APPROVED');
    expect(row?.materialNames).toContain(materialA.name);
    expect(row?.materialNames).toContain(materialB.name);
    expect(row?.warehouseNames).toContain(warehouse.name);
    expect(row?.grossIncreaseQty).toBe(4);
    expect(row?.grossDecreaseQty).toBe(3);
    expect(row?.netQty).toBe(1);
    expect(row?.estimatedNetValue).toBe(2);
    expect(row?.appliedNetValue).toBe(2);
    expect(row?.createdByName).toBe('Test Manager');
    expect(row?.decidedByName).toBe('Test Admin');
  });
});
