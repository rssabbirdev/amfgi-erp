import 'dotenv/config';
import { auth } from '@/auth';
import { POST as createSession } from '@/app/api/stock-count-sessions/route';
import { GET as getSession, PUT as updateSession } from '@/app/api/stock-count-sessions/[id]/route';
import { POST as submitSession } from '@/app/api/stock-count-sessions/[id]/submit/route';
import { PATCH as patchApproval } from '@/app/api/stock-exception-approvals/[id]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Stock count session ledger', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('persists a count session, submits a linked adjustment request, and records approval history', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `CTS-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Count Session Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `CTS-MAT-${Date.now().toString(36)}`,
        currentStock: 20,
        unitCost: 8,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 20,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `CTS-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 20,
        quantityAvailable: 20,
        unitCost: 8,
        totalCost: 160,
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

    const createResponse = await createSession(
      new Request('http://localhost/api/stock-count-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          warehouseId: warehouse.id,
          title: 'Main warehouse recount',
          evidenceReference: 'COUNT-LEDGER-01',
          evidenceNotes: 'Initial count prepared by store team.',
          notes: 'Cycle count batch 1',
          lines: [
            {
              materialId: material.id,
              materialName: material.name,
              unit: 'kg',
              warehouseId: warehouse.id,
              systemQty: 20,
              countedQty: 18,
              varianceQty: -2,
              unitCost: 8,
              sortOrder: 0,
            },
          ],
        }),
      })
    );

    expect(createResponse.status).toBe(201);
    const createPayload = await createResponse.json();
    const sessionId = createPayload.data.id as string;

    const updateResponse = await updateSession(
      new Request(`http://localhost/api/stock-count-sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          warehouseId: warehouse.id,
          title: 'Main warehouse recount',
          evidenceReference: 'COUNT-LEDGER-01',
          evidenceNotes: 'Updated recount after shelf check.',
          notes: 'Cycle count batch 1 updated',
          lines: [
            {
              materialId: material.id,
              materialName: material.name,
              unit: 'kg',
              warehouseId: warehouse.id,
              systemQty: 20,
              countedQty: 17,
              varianceQty: -3,
              unitCost: 8,
              sortOrder: 0,
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: sessionId }) }
    );

    expect(updateResponse.status).toBe(200);

    const submitResponse = await submitSession(
      new Request(`http://localhost/api/stock-count-sessions/${sessionId}/submit`, { method: 'POST' }),
      { params: Promise.resolve({ id: sessionId }) }
    );

    const submitPayload = await submitResponse.json();
    if (submitResponse.status !== 200) {
      throw new Error(`Submit failed: ${JSON.stringify(submitPayload)}`);
    }
    expect(submitPayload.data.status).toBe('ADJUSTMENT_PENDING');

    const approvalId = submitPayload.data.linkedAdjustmentApprovalId as string;

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
      new Request(`http://localhost/api/stock-exception-approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          decisionNote: 'Count sheet reviewed and approved.',
        }),
      }),
      { params: Promise.resolve({ id: approvalId }) }
    );

    expect(approveResponse.status).toBe(200);

    const sessionResponse = await getSession(
      new Request(`http://localhost/api/stock-count-sessions/${sessionId}`),
      { params: Promise.resolve({ id: sessionId }) }
    );

    expect(sessionResponse.status).toBe(200);
    const sessionPayload = await sessionResponse.json();
    expect(sessionPayload.data.status).toBe('ADJUSTMENT_APPROVED');
    expect(sessionPayload.data.linkedAdjustmentApprovalId).toBe(approvalId);
    expect(sessionPayload.data.reviewedByName).toBe('Test Admin');
    expect(
      (sessionPayload.data.revisions as Array<{ action: string }>).map((revision) => revision.action)
    ).toEqual(expect.arrayContaining(['CREATED', 'SAVED', 'SUBMITTED', 'APPROVED']));
  });
});
