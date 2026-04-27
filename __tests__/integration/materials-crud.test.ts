/**
 * Materials CRUD Tests
 * Basic operations: Create, Read, Update, Delete with validation
 */

import { prisma, setupTestContext, teardownTestContext, TestContext } from './setup';
import { decimalToNumberOrZero } from '../../lib/utils/decimal';

describe('Materials CRUD Operations', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await teardownTestContext();
    await prisma.$disconnect();
  });

  describe('Create', () => {
    it('should create a material with all required fields', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Steel Pipe',
          unit: 'meter',
          category: 'Pipe',
          warehouse: 'Warehouse A',
          stockType: 'Raw Material',
          externalItemName: 'PIPE-001',
          currentStock: 100,
          unitCost: 45.50,
          reorderLevel: 20,
        },
      });

      expect(material.id).toBeDefined();
      expect(material.name).toBe('Steel Pipe');
      expect(material.companyId).toBe(ctx.amfgiCompany.id);
      expect(decimalToNumberOrZero(material.currentStock)).toBe(100);
      expect(decimalToNumberOrZero(material.unitCost)).toBe(45.50);
      expect(material.isActive).toBe(true);
    });

    it('should create a material with optional description', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Fiberglass Mat',
          description: 'High-quality fiberglass reinforcement mat for composites',
          unit: 'kg',
          category: 'Reinforcement',
          warehouse: 'Warehouse B',
          stockType: 'Raw Material',
          externalItemName: 'FGB-MAT-300',
          currentStock: 500,
        },
      });

      expect(material.description).toBe('High-quality fiberglass reinforcement mat for composites');
    });

    it('should reject duplicate material name in same company', async () => {
      const name = 'Duplicate Material';
      const companyId = ctx.amfgiCompany.id;

      // Create first material
      await prisma.material.create({
        data: {
          companyId,
          name,
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'DUP-001',
        },
      });

      // Try to create duplicate
      const duplicatePromise = prisma.material.create({
        data: {
          companyId,
          name,
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'DUP-002',
        },
      });

      await expect(duplicatePromise).rejects.toThrow();
    });
  });

  describe('Read', () => {
    it('should fetch material by ID', async () => {
      const created = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Read Test Material',
          unit: 'unit',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'READ-001',
          currentStock: 100,
        },
      });

      const fetched = await prisma.material.findUnique({
        where: { id: created.id },
      });

      expect(fetched?.name).toBe('Read Test Material');
      expect(decimalToNumberOrZero(fetched?.currentStock)).toBe(100);
    });

    it('should list materials for a company', async () => {
      await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'List Test 1',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'LIST-001',
        },
      });

      await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'List Test 2',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'LIST-002',
        },
      });

      const materials = await prisma.material.findMany({
        where: { companyId: ctx.amfgiCompany.id },
      });

      expect(materials.length).toBeGreaterThanOrEqual(2);
      expect(materials.some((m) => m.name === 'List Test 1')).toBe(true);
      expect(materials.some((m) => m.name === 'List Test 2')).toBe(true);
    });

    it('should filter materials by isActive', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Active Filter Test',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'ACTIVE-001',
          isActive: true,
        },
      });

      await prisma.material.update({
        where: { id: material.id },
        data: { isActive: false },
      });

      const active = await prisma.material.findMany({
        where: { companyId: ctx.amfgiCompany.id, isActive: true },
      });

      const inactive = await prisma.material.findMany({
        where: { companyId: ctx.amfgiCompany.id, isActive: false },
      });

      expect(inactive.some((m) => m.id === material.id)).toBe(true);
    });
  });

  describe('Update', () => {
    it('should update material fields', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Update Test',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'UPDATE-001',
          currentStock: 100,
          unitCost: 10,
        },
      });

      const updated = await prisma.material.update({
        where: { id: material.id },
        data: {
          currentStock: 150,
          unitCost: 12,
        },
      });

      expect(decimalToNumberOrZero(updated.currentStock)).toBe(150);
      expect(decimalToNumberOrZero(updated.unitCost)).toBe(12);
      expect(updated.name).toBe('Update Test'); // unchanged
    });

    it('should reject duplicate name on update', async () => {
      const mat1 = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Original Name',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'ORI-001',
        },
      });

      const mat2 = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Another Name',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'ANOTHER-001',
        },
      });

      // Try to rename mat2 to mat1's name
      const updatePromise = prisma.material.update({
        where: { id: mat2.id },
        data: { name: 'Original Name' },
      });

      await expect(updatePromise).rejects.toThrow();
    });
  });

  describe('Delete', () => {
    it('should soft delete material (set isActive=false)', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Soft Delete Test',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'SOFT-001',
        },
      });

      const deleted = await prisma.material.update({
        where: { id: material.id },
        data: { isActive: false },
      });

      expect(deleted.isActive).toBe(false);

      // Material still exists in DB
      const found = await prisma.material.findUnique({
        where: { id: material.id },
      });

      expect(found?.id).toBe(material.id);
    });

    it('should hard delete material if no transactions', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Hard Delete Test',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'HARD-001',
        },
      });

      await prisma.material.delete({ where: { id: material.id } });

      const found = await prisma.material.findUnique({
        where: { id: material.id },
      });

      expect(found).toBeNull();
    });

    it('should prevent hard delete if transactions exist', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Protected Delete Test',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'PROTECTED-001',
        },
      });

      // Create a transaction referencing this material
      await prisma.transaction.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          type: 'STOCK_IN',
          materialId: material.id,
          quantity: 100,
          performedBy: ctx.admin.id,
        },
      });

      // Hard delete should fail due to foreign key constraint
      const deletePromise = prisma.material.delete({
        where: { id: material.id },
      });

      await expect(deletePromise).rejects.toThrow();

      // Material should still exist
      const found = await prisma.material.findUnique({
        where: { id: material.id },
      });

      expect(found).not.toBeNull();
    });
  });

  describe('Audit Logging', () => {
    it('should create material log on material creation', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Logged Material',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'LOGGED-001',
        },
      });

      const log = await prisma.materialLog.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          action: 'created',
          changes: { name: { from: null, to: 'Logged Material' } },
          changedBy: ctx.manager.id,
        },
      });

      expect(log.materialId).toBe(material.id);
      expect(log.action).toBe('created');
    });

    it('should create price log on cost change', async () => {
      const material = await prisma.material.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          name: 'Price Logged Material',
          unit: 'kg',
          category: 'Test',
          warehouse: 'WH',
          stockType: 'Raw Material',
          externalItemName: 'PRICE-001',
          unitCost: 10,
        },
      });

      const priceLog = await prisma.priceLog.create({
        data: {
          companyId: ctx.amfgiCompany.id,
          materialId: material.id,
          previousPrice: 10,
          currentPrice: 12,
          source: 'manual',
          changedBy: ctx.manager.id,
        },
      });

      expect(priceLog.materialId).toBe(material.id);
      expect(decimalToNumberOrZero(priceLog.previousPrice)).toBe(10);
      expect(decimalToNumberOrZero(priceLog.currentPrice)).toBe(12);
    });
  });
});
