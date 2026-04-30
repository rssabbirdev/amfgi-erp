import 'dotenv/config';
import { auth } from '@/auth';
import { GET as getStockCountSessionsReport } from '@/app/api/reports/stock-count-sessions/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Stock count sessions report', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('summarizes count sessions, linked adjustment statuses, and recurring variance materials', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `SCR-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const materialA = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Count Report Material A ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `SCR-MAT-A-${Date.now().toString(36)}`,
        currentStock: 50,
        unitCost: 8,
      },
    });

    const materialB = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Count Report Material B ${Date.now().toString(36)}`,
        unit: 'pcs',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `SCR-MAT-B-${Date.now().toString(36)}`,
        currentStock: 12,
        unitCost: 5,
      },
    });

    const approvedDecisionAt = new Date('2026-04-29T12:00:00.000Z');
    const approvedCreatedAt = new Date('2026-04-29T09:00:00.000Z');
    const rejectedDecisionAt = new Date('2026-04-29T14:30:00.000Z');
    const rejectedCreatedAt = new Date('2026-04-29T13:00:00.000Z');

    const approvedApproval = await prisma.stockExceptionApproval.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
        status: 'APPROVED',
        referenceId: `SCR-APP-${Date.now().toString(36).toUpperCase()}`,
        referenceNumber: 'MSA-COUNT-001',
        reason: 'Approved count adjustment',
        createdById: ctx.manager.id,
        createdByName: 'Test Manager',
        decidedById: ctx.admin.id,
        decidedByName: 'Test Admin',
        decidedAt: approvedDecisionAt,
        decisionNote: 'Count sheet reviewed.',
      },
    });

    const rejectedApproval = await prisma.stockExceptionApproval.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
        status: 'REJECTED',
        referenceId: `SCR-REJ-${Date.now().toString(36).toUpperCase()}`,
        referenceNumber: 'MSA-COUNT-002',
        reason: 'Rejected count adjustment',
        createdById: ctx.manager.id,
        createdByName: 'Test Manager',
        decidedById: ctx.admin.id,
        decidedByName: 'Test Admin',
        decidedAt: rejectedDecisionAt,
        decisionNote: 'Need recount evidence.',
      },
    });

    await prisma.stockCountSession.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        warehouseId: warehouse.id,
        title: 'Main warehouse approved count',
        status: 'ADJUSTMENT_APPROVED',
        evidenceReference: 'COUNT-001',
        currentRevision: 2,
        linkedAdjustmentApprovalId: approvedApproval.id,
        linkedAdjustmentReferenceNumber: approvedApproval.referenceNumber,
        createdById: ctx.manager.id,
        createdByName: 'Test Manager',
        reviewedById: ctx.admin.id,
        reviewedByName: 'Test Admin',
        reviewedAt: approvedDecisionAt,
        createdAt: approvedCreatedAt,
        updatedAt: approvedDecisionAt,
        lines: {
          create: [
            {
              materialId: materialA.id,
              materialName: materialA.name,
              unit: 'kg',
              warehouseId: warehouse.id,
              systemQty: 20,
              countedQty: 18,
              varianceQty: -2,
              unitCost: 8,
              sortOrder: 0,
            },
            {
              materialId: materialB.id,
              materialName: materialB.name,
              unit: 'pcs',
              warehouseId: warehouse.id,
              systemQty: 5,
              countedQty: 7,
              varianceQty: 2,
              unitCost: 5,
              sortOrder: 1,
            },
          ],
        },
      },
    });

    await prisma.stockCountSession.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        warehouseId: warehouse.id,
        title: 'Main warehouse draft count',
        status: 'DRAFT',
        evidenceReference: 'COUNT-002',
        currentRevision: 1,
        createdById: ctx.manager.id,
        createdByName: 'Test Manager',
        createdAt: new Date('2026-04-29T15:00:00.000Z'),
        updatedAt: new Date('2026-04-29T15:10:00.000Z'),
        lines: {
          create: [
            {
              materialId: materialA.id,
              materialName: materialA.name,
              unit: 'kg',
              warehouseId: warehouse.id,
              systemQty: 20,
              countedQty: 20,
              varianceQty: 0,
              unitCost: 8,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    await prisma.stockCountSession.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        warehouseId: warehouse.id,
        title: 'Main warehouse rejected count',
        status: 'ADJUSTMENT_REJECTED',
        evidenceReference: 'COUNT-003',
        currentRevision: 3,
        linkedAdjustmentApprovalId: rejectedApproval.id,
        linkedAdjustmentReferenceNumber: rejectedApproval.referenceNumber,
        createdById: ctx.manager.id,
        createdByName: 'Test Manager',
        reviewedById: ctx.admin.id,
        reviewedByName: 'Test Admin',
        reviewedAt: rejectedDecisionAt,
        createdAt: rejectedCreatedAt,
        updatedAt: rejectedDecisionAt,
        lines: {
          create: [
            {
              materialId: materialA.id,
              materialName: materialA.name,
              unit: 'kg',
              warehouseId: warehouse.id,
              systemQty: 10,
              countedQty: 9,
              varianceQty: -1,
              unitCost: 8,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    (auth as unknown as jest.Mock).mockResolvedValue({
      user: {
        id: ctx.manager.id,
        name: 'Test Manager',
        email: ctx.manager.email,
        isSuperAdmin: false,
        permissions: ['report.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });

    const response = await getStockCountSessionsReport();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.summary.totalSessions).toBe(3);
    expect(payload.data.summary.draftCount).toBe(1);
    expect(payload.data.summary.approvedAdjustmentCount).toBe(1);
    expect(payload.data.summary.rejectedAdjustmentCount).toBe(1);
    expect(payload.data.summary.recountCount).toBe(2);
    expect(payload.data.summary.totalVarianceLines).toBe(3);
    expect(payload.data.summary.grossExcessQty).toBe(2);
    expect(payload.data.summary.grossShortageQty).toBe(3);
    expect(payload.data.summary.netVarianceQty).toBe(-1);
    expect(payload.data.summary.estimatedNetValue).toBe(-14);
    expect(payload.data.summary.avgApprovalHours).toBe(2.25);

    const approvedRow = (payload.data.rows as Array<{
      title: string;
      linkedAdjustmentStatus: string | null;
      linkedAdjustmentReferenceNumber: string | null;
      varianceLineCount: number;
      grossExcessQty: number;
      grossShortageQty: number;
      approvalHours: number | null;
    }>).find((row) => row.title === 'Main warehouse approved count');

    expect(approvedRow).toBeTruthy();
    expect(approvedRow?.linkedAdjustmentStatus).toBe('APPROVED');
    expect(approvedRow?.linkedAdjustmentReferenceNumber).toBe('MSA-COUNT-001');
    expect(approvedRow?.varianceLineCount).toBe(2);
    expect(approvedRow?.grossExcessQty).toBe(2);
    expect(approvedRow?.grossShortageQty).toBe(2);
    expect(approvedRow?.approvalHours).toBe(3);

    const materialRow = (payload.data.materialRows as Array<{
      materialName: string;
      sessionCount: number;
      grossShortageQty: number;
      netVarianceQty: number;
    }>).find((row) => row.materialName === materialA.name);

    expect(materialRow).toBeTruthy();
    expect(materialRow?.sessionCount).toBe(2);
    expect(materialRow?.grossShortageQty).toBe(3);
    expect(materialRow?.netVarianceQty).toBe(-3);

    const warehouseRow = (payload.data.warehouseRows as Array<{
      warehouseName: string;
      totalSessions: number;
      varianceSessionCount: number;
      approvedCount: number;
      rejectedCount: number;
      grossExcessQty: number;
      grossShortageQty: number;
      netVarianceQty: number;
      estimatedNetValue: number;
      avgApprovalHours: number | null;
    }>).find((row) => row.warehouseName === warehouse.name);

    expect(warehouseRow).toBeTruthy();
    expect(warehouseRow?.totalSessions).toBe(3);
    expect(warehouseRow?.varianceSessionCount).toBe(2);
    expect(warehouseRow?.approvedCount).toBe(1);
    expect(warehouseRow?.rejectedCount).toBe(1);
    expect(warehouseRow?.grossExcessQty).toBe(2);
    expect(warehouseRow?.grossShortageQty).toBe(3);
    expect(warehouseRow?.netVarianceQty).toBe(-1);
    expect(warehouseRow?.estimatedNetValue).toBe(-14);
    expect(warehouseRow?.avgApprovalHours).toBe(2.25);
  });
});
