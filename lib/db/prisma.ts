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

declare global {
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
}

export const prisma =
  global._prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global._prisma = prisma;
}
