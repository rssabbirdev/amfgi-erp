/**
 * Integration test setup
 * Seeds test data and provides utilities for API testing
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createPostgresAdapter } from '../../lib/db/postgresAdapter';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set for integration tests.');
}

export const prisma = new PrismaClient({
  adapter: createPostgresAdapter(databaseUrl),
  log: ['error', 'warn'],
});

const TEST_COMPANY_SLUG_PREFIXES = ['test-amfgi-', 'test-km-'] as const;
const TEST_ROLE_SLUG_PREFIX = 'test-';
const TEST_USER_EMAIL_PREFIX = 'test-';

function createTestToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

async function listTestCompanyIds() {
  const companies = await prisma.company.findMany({
    where: {
      OR: TEST_COMPANY_SLUG_PREFIXES.map((prefix) => ({
        slug: { startsWith: prefix },
      })),
    },
    select: { id: true },
  });

  return companies.map((company) => company.id);
}

/**
 * Seeds test data and returns context for tests
 */
export async function setupTestContext(): Promise<TestContext> {
  // Keep integration runs idempotent when a prior run exits before teardown.
  await teardownTestContext().catch(() => undefined);

  const token = createTestToken();

  // Create companies
  const amfgiCompany = await prisma.company.create({
    data: {
      name: `Test AMFGI ${token}`,
      slug: `test-amfgi-${token}`,
      isActive: true,
    },
  });

  const kmCompany = await prisma.company.create({
    data: {
      name: `Test K&M ${token}`,
      slug: `test-km-${token}`,
      isActive: true,
    },
  });

  // Create roles
  const adminRole = await prisma.role.create({
    data: {
      name: `Test Admin ${token}`,
      slug: `test-admin-${token}`,
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
      name: `Test Store Keeper ${token}`,
      slug: `test-store-keeper-${token}`,
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
      email: `test-admin-${token}@example.com`,
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
      email: `test-manager-${token}@example.com`,
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
      email: `test-sk-${token}@example.com`,
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
  const companyIds = await listTestCompanyIds();
  const users = await prisma.user.findMany({
    where: {
      email: {
        startsWith: TEST_USER_EMAIL_PREFIX,
      },
    },
    select: { id: true },
  });
  const roles = await prisma.role.findMany({
    where: {
      slug: {
        startsWith: TEST_ROLE_SLUG_PREFIX,
      },
    },
    select: { id: true },
  });

  const userIds = users.map((user) => user.id);
  const roleIds = roles.map((role) => role.id);

  if (companyIds.length > 0) {
    await prisma.stockCountSessionRevision.deleteMany({
      where: {
        session: {
          companyId: { in: companyIds },
        },
      },
    });
    await prisma.stockCountSessionLine.deleteMany({
      where: {
        session: {
          companyId: { in: companyIds },
        },
      },
    });
    await prisma.stockCountSession.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.transactionBatch.deleteMany({
      where: {
        transaction: {
          companyId: { in: companyIds },
        },
      },
    });
    await prisma.stockExceptionApproval.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.transaction.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.priceLog.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.materialLog.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.stockBatch.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.jobItemAssignment.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.jobItem.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.jobRequiredExpertise.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.jobContact.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.jobLpoValueHistory.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.job.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.supplierContact.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.supplier.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customerContact.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.customer.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.materialUom.updateMany({
      where: { companyId: { in: companyIds } },
      data: { parentUomId: null },
    });
    await prisma.materialUom.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.material.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.warehouse.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.category.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.unit.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.userCompanyAccess.deleteMany({ where: { companyId: { in: companyIds } } });
  }

  if (userIds.length > 0) {
    await prisma.userCompanyAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  if (roleIds.length > 0) {
    await prisma.userCompanyAccess.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  }

  if (companyIds.length > 0) {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  }
}
