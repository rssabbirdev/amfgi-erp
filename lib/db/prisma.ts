/**
 * Prisma client singleton.
 *
 * In dev, Next.js hot-reloads modules which would normally cause a new
 * PrismaClient to be instantiated on every save. We cache it on `globalThis`
 * to keep a single connection pool across HMR cycles.
 *
 * In production, this module is imported once and `prisma` is created once.
 *
 * Usage:
 *   import { prisma } from '@/lib/db/prisma';
 *   const materials = await prisma.material.findMany({ where: { companyId } });
 *
 * Transactions:
 *   await prisma.$transaction(async (tx) => {
 *     await tx.material.update(...);
 *     await tx.transaction.create(...);
 *   });
 *   // Throws inside the callback → automatic rollback.
 */
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter } from './postgresAdapter';

declare global {
  var _prisma: PrismaClient | undefined;
}

const prismaLog =
  process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.');
}

const prismaAdapter = createPostgresAdapter(databaseUrl);

// After `prisma generate`, Next dev can still hold a pre-generate client on `global._prisma` (no `mediaAsset`).
const existingPrisma: PrismaClient | undefined = global._prisma;
if (
  process.env.NODE_ENV !== 'production' &&
  existingPrisma &&
  !('mediaAsset' in (existingPrisma as PrismaClient & Record<string, unknown>))
) {
  global._prisma = undefined;
}

export const prisma =
  global._prisma ??
  new PrismaClient({
    log: [...prismaLog],
    adapter: prismaAdapter,
  });

if (process.env.NODE_ENV !== 'production') {
  global._prisma = prisma;
}
