/**
 * Integration test setup
 * Seeds test data and provides utilities for API testing
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const prisma = new PrismaClient();

export interface TestUser {
  id: string;
  email: string;
  isSuperAdmin: boolean;
  activeCompanyId: string;
  password: string;
}

export interface TestCompany {
  id: string;
  name: string;
  slug: string;
}

export interface TestContext {
  admin: TestUser;
  manager: TestUser;
  storeKeeper: TestUser;
  amfgiCompany: TestCompany;
  kmCompany: TestCompany;
}

/**
 * Seeds test data and returns context for tests
 */
export async function setupTestContext(): Promise<TestContext> {
  // Create companies
  const amfgiCompany = await prisma.company.create({
    data: {
      name: 'Test AMFGI',
      slug: 'test-amfgi',
      isActive: true,
    },
  });

  const kmCompany = await prisma.company.create({
    data: {
      name: 'Test K&M',
      slug: 'test-km',
      isActive: true,
    },
  });

  // Create roles
  const adminRole = await prisma.role.create({
    data: {
      name: 'Test Admin',
      slug: 'test-admin',
      permissions: [
        'material.view',
        'material.create',
        'material.edit',
        'material.delete',
        'transaction.stock_in',
        'transaction.stock_out',
        'transaction.return',
        'transaction.transfer',
        'report.view',
      ],
      isSystem: false,
    },
  });

  const storeKeeperRole = await prisma.role.create({
    data: {
      name: 'Test Store Keeper',
      slug: 'test-store-keeper',
      permissions: [
        'material.view',
        'transaction.stock_out',
        'transaction.return',
      ],
      isSystem: false,
    },
  });

  // Create users
  const adminHash = await bcrypt.hash('TestAdmin@1234', 12);
  const admin = await prisma.user.create({
    data: {
      name: 'Test Admin',
      email: 'test-admin@example.com',
      password: adminHash,
      isSuperAdmin: true,
      isActive: true,
      activeCompanyId: amfgiCompany.id,
    },
  });

  const managerHash = await bcrypt.hash('TestManager@1234', 12);
  const manager = await prisma.user.create({
    data: {
      name: 'Test Manager',
      email: 'test-manager@example.com',
      password: managerHash,
      isSuperAdmin: false,
      isActive: true,
      activeCompanyId: amfgiCompany.id,
      companyAccess: {
        create: {
          companyId: amfgiCompany.id,
          roleId: adminRole.id,
        },
      },
    },
  });

  const skHash = await bcrypt.hash('TestSK@1234', 12);
  const storeKeeper = await prisma.user.create({
    data: {
      name: 'Test Store Keeper',
      email: 'test-sk@example.com',
      password: skHash,
      isSuperAdmin: false,
      isActive: true,
      activeCompanyId: amfgiCompany.id,
      companyAccess: {
        create: {
          companyId: amfgiCompany.id,
          roleId: storeKeeperRole.id,
        },
      },
    },
  });

  return {
    admin: {
      id: admin.id,
      email: admin.email,
      isSuperAdmin: admin.isSuperAdmin,
      activeCompanyId: admin.activeCompanyId!,
      password: 'TestAdmin@1234',
    },
    manager: {
      id: manager.id,
      email: manager.email,
      isSuperAdmin: manager.isSuperAdmin,
      activeCompanyId: manager.activeCompanyId!,
      password: 'TestManager@1234',
    },
    storeKeeper: {
      id: storeKeeper.id,
      email: storeKeeper.email,
      isSuperAdmin: storeKeeper.isSuperAdmin,
      activeCompanyId: storeKeeper.activeCompanyId!,
      password: 'TestSK@1234',
    },
    amfgiCompany: {
      id: amfgiCompany.id,
      name: amfgiCompany.name,
      slug: amfgiCompany.slug,
    },
    kmCompany: {
      id: kmCompany.id,
      name: kmCompany.name,
      slug: kmCompany.slug,
    },
  };
}

/**
 * Cleans up test data
 */
export async function teardownTestContext() {
  await prisma.transactionBatch.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.priceLog.deleteMany({});
  await prisma.materialLog.deleteMany({});
  await prisma.stockBatch.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.material.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.userCompanyAccess.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.company.deleteMany({});
}
