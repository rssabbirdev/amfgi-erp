import 'dotenv/config';
import { auth } from '@/auth';
import { POST as postBatchTransaction } from '@/app/api/transactions/batch/route';
import { GET as getApprovalQueue } from '@/app/api/stock-exception-approvals/route';
import { PATCH as patchApproval } from '@/app/api/stock-exception-approvals/[id]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Stock exception approval queue', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('creates a pending approval for non-superadmin dispatch overrides and allows superadmin approval', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `APR-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Approval Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        allowNegativeConsumption: true,
        externalItemName: `APR-MAT-${Date.now().toString(36)}`,
        currentStock: 1,
        unitCost: 12,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 1,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `APR-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 1,
        quantityAvailable: 1,
        unitCost: 12,
        totalCost: 12,
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
        permissions: ['transaction.stock_out', 'report.view'],
        activeCompanyId: ctx.amfgiCompany.id,
      },
    });

    const postResponse = await postBatchTransaction(
      new Request('http://localhost/api/transactions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_OUT',
          date: '2026-04-29',
          overrideReason: 'Manager override pending final approval',
          lines: [
            {
              materialId: material.id,
              quantity: 3,
              warehouseId: warehouse.id,
            },
          ],
        }),
      })
    );

    expect(postResponse.status).toBe(201);
    const createdPayload = await postResponse.json();
    const createdId = createdPayload.data.ids[0] as string;

    let approval = await prisma.stockExceptionApproval.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'DISPATCH_OVERRIDE',
        referenceId: createdId,
      },
    });

    expect(approval.status).toBe('PENDING');
    expect(approval.createdById).toBe(ctx.manager.id);
    expect(approval.reason).toBe('Manager override pending final approval');

    const queueResponse = await getApprovalQueue(
      new Request('http://localhost/api/stock-exception-approvals?status=PENDING')
    );
    expect(queueResponse.status).toBe(200);
    const queuePayload = await queueResponse.json();
    expect(queuePayload.data.summary.pending).toBeGreaterThanOrEqual(1);
    expect(
      queuePayload.data.rows.some(
        (row: { id: string; referenceId: string; status: string }) =>
          row.referenceId === createdId && row.status === 'PENDING'
      )
    ).toBe(true);

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

    const patchResponse = await patchApproval(
      new Request(`http://localhost/api/stock-exception-approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          decisionNote: 'Reviewed and approved by super admin.',
        }),
      }),
      { params: Promise.resolve({ id: approval.id }) }
    );

    expect(patchResponse.status).toBe(200);

    approval = await prisma.stockExceptionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(approval.status).toBe('APPROVED');
    expect(approval.decidedById).toBe(ctx.admin.id);
    expect(approval.decisionNote).toBe('Reviewed and approved by super admin.');
  });

  it('returns enriched queue metadata for manual stock adjustments linked to count sessions', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `APRQ-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const approval = await prisma.stockExceptionApproval.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
        status: 'PENDING',
        referenceId: `APRQ-${Date.now().toString(36).toUpperCase()}`,
        referenceNumber: 'MSA-QUEUE-001',
        reason: 'Pending physical recount adjustment',
        createdById: ctx.manager.id,
        createdByName: 'Test Manager',
        createdAt: new Date('2026-04-28T08:00:00.000Z'),
        payload: {
          evidenceType: 'PHYSICAL_COUNT',
          evidenceReference: 'COUNT-Q-001',
          sourceSessionId: 'scs-001',
          sourceSessionTitle: 'Main warehouse weekly recount',
          policySummary: {
            requiresDecisionNote: true,
          },
          lines: [
            {
              warehouseId: warehouse.id,
              quantityDelta: -12,
            },
            {
              warehouseId: warehouse.id,
              quantityDelta: 3,
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

    const queueResponse = await getApprovalQueue(new Request('http://localhost/api/stock-exception-approvals'));
    expect(queueResponse.status).toBe(200);

    const queuePayload = await queueResponse.json();
    expect(queuePayload.data.summary.pending).toBeGreaterThanOrEqual(1);
    expect(queuePayload.data.summary.pendingOver24h).toBeGreaterThanOrEqual(1);
    expect(queuePayload.data.summary.manualAdjustmentPendingCount).toBeGreaterThanOrEqual(1);

    const row = (queuePayload.data.rows as Array<{
      id: string;
      warehouseNames: string[];
      lineCount: number;
      netQuantity: number | null;
      evidenceType: string | null;
      evidenceReference: string | null;
      sourceSessionTitle: string | null;
      requiresDecisionNote: boolean;
      ageHours: number;
    }>).find((item) => item.id === approval.id);

    expect(row).toBeTruthy();
    expect(row?.warehouseNames).toContain(warehouse.name);
    expect(row?.lineCount).toBe(2);
    expect(row?.netQuantity).toBe(-9);
    expect(row?.evidenceType).toBe('PHYSICAL_COUNT');
    expect(row?.evidenceReference).toBe('COUNT-Q-001');
    expect(row?.sourceSessionTitle).toBe('Main warehouse weekly recount');
    expect(row?.requiresDecisionNote).toBe(true);
    expect(row?.ageHours).toBeGreaterThan(24);
  });
});
