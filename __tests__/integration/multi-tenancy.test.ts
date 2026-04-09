/**
 * Multi-Tenancy Isolation Tests
 * Critical path: Ensure data is properly isolated between companies
 */

import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';

describe('Multi-Tenancy Data Isolation', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
  });

  it('should allow same material name in different companies', async () => {
    const materialName = 'Steel Plate';

    // Create same material in both companies
    const mat1 = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: materialName,
        unit: 'sheet',
        category: 'Plate',
        warehouse: 'Warehouse A',
        stockType: 'Raw Material',
        externalItemName: 'MAT-001',
        currentStock: 100,
      },
    });

    const mat2 = await prisma.material.create({
      data: {
        companyId: ctx.kmCompany.id,
        name: materialName,
        unit: 'sheet',
        category: 'Plate',
        warehouse: 'Warehouse B',
        stockType: 'Raw Material',
        externalItemName: 'MAT-002',
        currentStock: 200,
      },
    });

    expect(mat1.id).not.toBe(mat2.id);
    expect(mat1.companyId).toBe(ctx.amfgiCompany.id);
    expect(mat2.companyId).toBe(ctx.kmCompany.id);
    expect(mat1.currentStock).toBe(100);
    expect(mat2.currentStock).toBe(200);
  });

  it('should prevent duplicate material names within same company', async () => {
    const companyId = ctx.amfgiCompany.id;
    const materialName = 'Unique Material';

    // Create first material
    await prisma.material.create({
      data: {
        companyId,
        name: materialName,
        unit: 'kg',
        category: 'Raw',
        warehouse: 'WH1',
        stockType: 'Raw Material',
        externalItemName: 'UNIQ-001',
        currentStock: 100,
      },
    });

    // Try to create duplicate in same company
    const duplicatePromise = prisma.material.create({
      data: {
        companyId,
        name: materialName,
        unit: 'kg',
        category: 'Raw',
        warehouse: 'WH1',
        stockType: 'Raw Material',
        externalItemName: 'UNIQ-002',
        currentStock: 200,
      },
    });

    // Should fail due to composite unique constraint
    await expect(duplicatePromise).rejects.toThrow();
  });

  it('should isolate materials query by companyId', async () => {
    // Create materials in both companies
    const mat1 = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'AMFGI Only Material',
        unit: 'kg',
        category: 'Test',
        warehouse: 'WH',
        stockType: 'Raw Material',
        externalItemName: 'AMFGI-001',
        currentStock: 100,
      },
    });

    const mat2 = await prisma.material.create({
      data: {
        companyId: ctx.kmCompany.id,
        name: 'KM Only Material',
        unit: 'kg',
        category: 'Test',
        warehouse: 'WH',
        stockType: 'Raw Material',
        externalItemName: 'KM-001',
        currentStock: 200,
      },
    });

    // Query materials for AMFGI company
    const amfgiMaterials = await prisma.material.findMany({
      where: { companyId: ctx.amfgiCompany.id },
    });

    // Query materials for K&M company
    const kmMaterials = await prisma.material.findMany({
      where: { companyId: ctx.kmCompany.id },
    });

    // Filter by name to avoid other seed data
    const amfgiMatForComp = amfgiMaterials.find((m) => m.id === mat1.id);
    const kmMatForComp = kmMaterials.find((m) => m.id === mat2.id);

    expect(amfgiMatForComp?.name).toBe('AMFGI Only Material');
    expect(kmMatForComp?.name).toBe('KM Only Material');

    // AMFGI should not see K&M's material
    const amfgiSeeingKMPromise = prisma.material.findUnique({
      where: { id: mat2.id },
    });
    const result = await amfgiSeeingKMPromise;
    expect(result?.companyId).toBe(ctx.kmCompany.id); // Anyone can find by ID, but API should check companyId

    // Jobs should be isolated by company
    const customer1 = await prisma.customer.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'AMFGI Customer',
      },
    });

    const job1 = await prisma.job.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        jobNumber: 'JOB-ISO-001',
        customerId: customer1.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const customer2 = await prisma.customer.create({
      data: {
        companyId: ctx.kmCompany.id,
        name: 'KM Customer',
      },
    });

    const job2 = await prisma.job.create({
      data: {
        companyId: ctx.kmCompany.id,
        jobNumber: 'JOB-ISO-002',
        customerId: customer2.id,
        status: 'ACTIVE',
        createdBy: ctx.admin.id,
      },
    });

    const amfgiJobs = await prisma.job.findMany({
      where: { companyId: ctx.amfgiCompany.id },
    });

    const kmJobs = await prisma.job.findMany({
      where: { companyId: ctx.kmCompany.id },
    });

    expect(amfgiJobs.some((j) => j.id === job1.id)).toBe(true);
    expect(kmJobs.some((j) => j.id === job2.id)).toBe(true);
    expect(amfgiJobs.some((j) => j.id === job2.id)).toBe(false);
    expect(kmJobs.some((j) => j.id === job1.id)).toBe(false);
  });

  it('should isolate transactions by company', async () => {
    // Create materials and transactions in different companies
    const mat1 = await prisma.material.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        name: 'Trans ISO Material 1',
        unit: 'kg',
        category: 'Test',
        warehouse: 'WH',
        stockType: 'Raw Material',
        externalItemName: 'TX-ISO-001',
        currentStock: 100,
      },
    });

    const mat2 = await prisma.material.create({
      data: {
        companyId: ctx.kmCompany.id,
        name: 'Trans ISO Material 2',
        unit: 'kg',
        category: 'Test',
        warehouse: 'WH',
        stockType: 'Raw Material',
        externalItemName: 'TX-ISO-002',
        currentStock: 100,
      },
    });

    const tx1 = await prisma.transaction.create({
      data: {
        companyId: ctx.amfgiCompany.id,
        type: 'STOCK_IN',
        materialId: mat1.id,
        quantity: 50,
        performedBy: ctx.admin.id,
        date: new Date(),
      },
    });

    const tx2 = await prisma.transaction.create({
      data: {
        companyId: ctx.kmCompany.id,
        type: 'STOCK_IN',
        materialId: mat2.id,
        quantity: 75,
        performedBy: ctx.admin.id,
        date: new Date(),
      },
    });

    // Query transactions by company
    const amfgiTx = await prisma.transaction.findMany({
      where: { companyId: ctx.amfgiCompany.id },
    });

    const kmTx = await prisma.transaction.findMany({
      where: { companyId: ctx.kmCompany.id },
    });

    expect(amfgiTx.some((t) => t.id === tx1.id)).toBe(true);
    expect(kmTx.some((t) => t.id === tx2.id)).toBe(true);
    expect(amfgiTx.some((t) => t.id === tx2.id)).toBe(false);
    expect(kmTx.some((t) => t.id === tx1.id)).toBe(false);
  });

  it('should enforce companyId on user access', async () => {
    // Manager only has access to AMFGI company
    const managerAccess = await prisma.userCompanyAccess.findMany({
      where: { userId: ctx.manager.id },
    });

    expect(managerAccess).toHaveLength(1);
    expect(managerAccess[0].companyId).toBe(ctx.amfgiCompany.id);

    // Super admin should have no company access records (unlimited)
    const adminAccess = await prisma.userCompanyAccess.findMany({
      where: { userId: ctx.admin.id },
    });

    expect(adminAccess).toHaveLength(0); // Super admin has no restrictions
  });
});
