import 'dotenv/config';
import { auth } from '@/auth';
import { POST as createManualAdjustment } from '@/app/api/transactions/manual-adjustment/route';
import { PATCH as patchApproval } from '@/app/api/stock-exception-approvals/[id]/route';
import { GET as getStockExceptions } from '@/app/api/reports/stock-exceptions/route';
import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

describe('Manual stock adjustment approval flow', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
    (auth as unknown as jest.Mock).mockReset();
  });

  it('keeps a bulk stock adjustment pending until approval, then applies every line safely', async () => {
    const warehouse = await prisma.warehouse.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `MSA-WH-${Date.now().toString(36).toUpperCase()}`,
        isActive: true,
      },
    });

    const materialDecrease = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Manual Adjustment Material A ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `MSA-MAT-A-${Date.now().toString(36)}`,
        currentStock: 10,
        unitCost: 8,
      },
    });

    const materialIncrease = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: `Manual Adjustment Material B ${Date.now().toString(36)}`,
        unit: 'kg',
        category: 'Test',
        warehouse: warehouse.name,
        warehouseId: warehouse.id,
        stockType: 'Raw Material',
        externalItemName: `MSA-MAT-B-${Date.now().toString(36)}`,
        currentStock: 2,
        unitCost: 5,
      },
    });

    await prisma.materialWarehouseStock.createMany({
      data: [
        {
          companyId: ctx.amfgiCompany.id,
          materialId: materialDecrease.id,
          warehouseId: warehouse.id,
          currentStock: 10,
        },
        {
          companyId: ctx.amfgiCompany.id,
          materialId: materialIncrease.id,
          warehouseId: warehouse.id,
          currentStock: 2,
        },
      ],
    });

    const batch = await prisma.stockBatch.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        materialId: materialDecrease.id,
        warehouseId: warehouse.id,
        batchNumber: `MSA-BATCH-${Date.now().toString(36).toUpperCase()}`,
        quantityReceived: 10,
        quantityAvailable: 10,
        unitCost: 8,
        totalCost: 80,
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
              materialId: materialDecrease.id,
              warehouseId: warehouse.id,
              quantityDelta: -3,
            },
            {
              materialId: materialIncrease.id,
              warehouseId: warehouse.id,
              quantityDelta: 4,
              unitCost: 6.5,
            },
          ],
          reason: 'Physical count variance and recovery posting',
          evidenceType: 'PHYSICAL_COUNT',
          evidenceReference: 'COUNT-APR-29',
          evidenceNotes: 'Team leader recount signed on shift close.',
          notes: 'Warehouse recount batch request',
        }),
      })
    );

    expect(requestResponse.status).toBe(201);
    const requestPayload = await requestResponse.json();
    expect(requestPayload.data.status).toBe('PENDING');
    expect(requestPayload.data.lineCount).toBe(2);

    let approval = await prisma.stockExceptionApproval.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        exceptionType: 'MANUAL_STOCK_ADJUSTMENT',
        referenceId: requestPayload.data.referenceId,
      },
    });
    expect(approval.status).toBe('PENDING');
    expect((approval.payload as { evidenceType?: string })?.evidenceType).toBe('PHYSICAL_COUNT');
    expect((approval.payload as { evidenceReference?: string })?.evidenceReference).toBe('COUNT-APR-29');

    let refreshedMaterialDecrease = await prisma.material.findUniqueOrThrow({
      where: { id: materialDecrease.id },
      select: { currentStock: true },
    });
    let refreshedMaterialIncrease = await prisma.material.findUniqueOrThrow({
      where: { id: materialIncrease.id },
      select: { currentStock: true },
    });
    expect(Number(refreshedMaterialDecrease.currentStock)).toBe(10);
    expect(Number(refreshedMaterialIncrease.currentStock)).toBe(2);

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
          decisionNote: 'Warehouse recount approved.',
        }),
      }),
      { params: Promise.resolve({ id: approval.id }) }
    );

    expect(approveResponse.status).toBe(200);

    approval = await prisma.stockExceptionApproval.findUniqueOrThrow({
      where: { id: approval.id },
    });
    expect(approval.status).toBe('APPROVED');
    expect(approval.decidedById).toBe(ctx.admin.id);

    refreshedMaterialDecrease = await prisma.material.findUniqueOrThrow({
      where: { id: materialDecrease.id },
      select: { currentStock: true },
    });
    refreshedMaterialIncrease = await prisma.material.findUniqueOrThrow({
      where: { id: materialIncrease.id },
      select: { currentStock: true },
    });
    expect(Number(refreshedMaterialDecrease.currentStock)).toBe(7);
    expect(Number(refreshedMaterialIncrease.currentStock)).toBe(6);

    const warehouseStockDecrease = await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: materialDecrease.id,
          warehouseId: warehouse.id,
        },
      },
      select: { currentStock: true },
    });
    const warehouseStockIncrease = await prisma.materialWarehouseStock.findUniqueOrThrow({
      where: {
        companyId_materialId_warehouseId: {
          companyId: ctx.amfgiCompany.id,
          materialId: materialIncrease.id,
          warehouseId: warehouse.id,
        },
      },
      select: { currentStock: true },
    });
    expect(Number(warehouseStockDecrease.currentStock)).toBe(7);
    expect(Number(warehouseStockIncrease.currentStock)).toBe(6);

    const refreshedBatch = await prisma.stockBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { quantityAvailable: true },
    });
    expect(Number(refreshedBatch.quantityAvailable)).toBe(7);

    const adjustmentTransactions = await prisma.transaction.findMany({
      where: {
        companyId: ctx.amfgiCompany.id,
        type: 'ADJUSTMENT',
        notes: { contains: '[MANUAL_STOCK_ADJUSTMENT_APPROVAL:' },
      },
      include: {
        batchesUsed: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    expect(adjustmentTransactions).toHaveLength(2);

    const decreaseTxn = adjustmentTransactions.find((txn) => txn.materialId === materialDecrease.id);
    const increaseTxn = adjustmentTransactions.find((txn) => txn.materialId === materialIncrease.id);

    expect(Number(decreaseTxn?.quantity)).toBe(-3);
    expect(decreaseTxn?.batchesUsed).toHaveLength(1);
    expect(Number(decreaseTxn?.batchesUsed[0]?.quantityFromBatch)).toBe(3);

    expect(Number(increaseTxn?.quantity)).toBe(4);
    expect(increaseTxn?.batchesUsed).toHaveLength(0);

    const createdAdjustmentBatch = await prisma.stockBatch.findFirstOrThrow({
      where: {
        companyId: ctx.amfgiCompany.id,
        materialId: materialIncrease.id,
        supplier: 'Manual Adjustment',
      },
    });
    expect(Number(createdAdjustmentBatch.quantityReceived)).toBe(4);
    expect(Number(createdAdjustmentBatch.quantityAvailable)).toBe(4);

    const reportResponse = await getStockExceptions();
    expect(reportResponse.status).toBe(200);
    const reportPayload = await reportResponse.json();
    expect(reportPayload.data.summary.manualStockAdjustmentCount).toBeGreaterThanOrEqual(1);
    expect(
      reportPayload.data.rows.some(
        (row: { category: string; reason: string | null; materialNames: string[]; details: string }) =>
          row.category === 'manual_stock_adjustment' &&
          row.reason === 'Physical count variance and recovery posting' &&
          row.materialNames.includes(materialDecrease.name) &&
          row.materialNames.includes(materialIncrease.name) &&
          row.details.includes('COUNT-APR-29')
      )
    ).toBe(true);
  });
});
