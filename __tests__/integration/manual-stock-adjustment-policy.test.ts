import 'dotenv/config';
import { auth } from '@/auth';
import { POST as createManualAdjustment } from '@/app/api/transactions/manual-adjustment/route';
import { PATCH as patchApproval } from '@/app/api/stock-exception-approvals/[id]/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';
import { mergeStockControlSettingsIntoCompanySettings } from '@/lib/stock-control/settings';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Manual stock adjustment policy', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('rejects positive lines without unit cost and large negative requests without strong evidence', async () => {
    await prisma.company.update({
      where: { id: ctx.amfgiCompany.id },
      data: {
        jobCostingSettings: mergeStockControlSettingsIntoCompanySettings(undefined, {
          negativeEvidenceQtyThreshold: 6,
          negativeDecisionNoteQtyThreshold: 18,
        }),
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `MSP-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Policy Material ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `MSP-MAT-${Date.now().toString(36)}`,
        currentStock: 50,
        unitCost: 9,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 50,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `MSP-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 50,
        quantityAvailable: 50,
        unitCost: 9,
        totalCost: 450,
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

    const missingCostResponse = await createManualAdjustment(
      new Request('http://localhost/api/transactions/manual-adjustment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              materialId: material.id,
              warehouseId: warehouse.id,
              quantityDelta: 5,
            },
          ],
          reason: 'Positive adjustment without cost',
          evidenceType: 'PHYSICAL_COUNT',
          evidenceReference: 'COUNT-POLICY-01',
          evidenceNotes: 'Stock gain verified by recount.',
        }),
      })
    );

    expect(missingCostResponse.status).toBe(400);
    const missingCostPayload = await missingCostResponse.json();
    expect(missingCostPayload.error).toBe('Positive stock adjustment lines require an explicit unit cost.');

    const weakEvidenceResponse = await createManualAdjustment(
      new Request('http://localhost/api/transactions/manual-adjustment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              materialId: material.id,
              warehouseId: warehouse.id,
              quantityDelta: -8,
            },
          ],
          reason: 'Large negative with weak evidence',
          evidenceType: 'OTHER',
          evidenceReference: 'COUNT-POLICY-02',
          evidenceNotes: 'Short',
        }),
      })
    );

    expect(weakEvidenceResponse.status).toBe(400);
    const weakEvidencePayload = await weakEvidenceResponse.json();
    expect(weakEvidencePayload.error).toBe(
      'Negative adjustments of 6 or more require a specific evidence type.'
    );
  });

  it('requires a decision note before approving very large negative adjustments', async () => {
    await prisma.company.update({
      where: { id: ctx.amfgiCompany.id },
      data: {
        jobCostingSettings: mergeStockControlSettingsIntoCompanySettings(undefined, {
          negativeEvidenceQtyThreshold: 6,
          negativeDecisionNoteQtyThreshold: 18,
        }),
      },
    });

    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `MSP2-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const material = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Policy Material B ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `MSP2-MAT-${Date.now().toString(36)}`,
        currentStock: 60,
        unitCost: 7,
      },
    });

    await prisma.materialWarehouseStock.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        currentStock: 60,
      },
    });

    await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        batchNumber: `MSP2-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 60,
        quantityAvailable: 60,
        unitCost: 7,
        totalCost: 420,
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
              materialId: material.id,
              warehouseId: warehouse.id,
              quantityDelta: -20,
            },
          ],
          reason: 'Large count loss pending approval',
          evidenceType: 'PHYSICAL_COUNT',
          evidenceReference: 'COUNT-POLICY-03',
          evidenceNotes: 'Supervisor and storekeeper recounted the line and signed the sheet.',
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

    const rejectNoNote = await patchApproval(
      new Request(`http://localhost/api/stock-exception-approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
        }),
      }),
      { params: Promise.resolve({ id: approval.id }) }
    );

    expect(rejectNoNote.status).toBe(500);
    const rejectNoNotePayload = await rejectNoNote.json();
    expect(rejectNoNotePayload.error).toBe('Negative adjustments of 18 or more require an approval decision note.');

    const approveWithNote = await patchApproval(
      new Request(`http://localhost/api/stock-exception-approvals/${approval.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'APPROVED',
          decisionNote: 'Count sheet reviewed against the signed variance report.',
        }),
      }),
      { params: Promise.resolve({ id: approval.id }) }
    );

    expect(approveWithNote.status).toBe(200);
  });
});
