/**
 * Prisma client singleton.
 *
 * In dev, Next.js hot-reloads modules which would normally cause a new
 * PrismaClient to be instantiated on every save. We cache it on `globalThis`
 * to keep a single connection pool across HMR cycles.
 *
 * After `prisma generate`, a Proxy ensures stale cached clients (missing new
 * model delegates) are replaced on the next access.
 *
 * Usage:
 *   import { prisma } from '@/lib/db/prisma';
 *   const materials = await prisma.material.findMany({ where: { companyId } });
 */
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter, type PostgresPrismaAdapter } from './postgresAdapter';
import { defaultTransactionOptions, type PrismaTransactionOptions } from './transactionOptions';

declare global {
  var _prisma: PrismaClient | undefined;
  var _prismaAdapter: PostgresPrismaAdapter | undefined;
}

const prismaLog =
  process.env.NODE_ENV === 'development' ? (['error', 'warn'] as const) : (['error'] as const);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.');
}

/** Model delegates that must exist; extend when adding new Prisma models. */
const REQUIRED_PRISMA_DELEGATES = ['mediaAsset', 'globalSetting', 'payRun', 'payRunLine'] as const;

function prismaClientHasExpectedModels(client: PrismaClient): boolean {
  return REQUIRED_PRISMA_DELEGATES.every(
    (modelName) => modelName in (client as PrismaClient & Record<string, unknown>)
  );
}

function resolvePrismaClient(): PrismaClient {
  const existing = global._prisma;
  if (existing && prismaClientHasExpectedModels(existing)) {
    return existing;
  }

  // Drop stale client only — do not $disconnect(); that would close the shared pg pool
  // while global._prismaAdapter is still cached, leaking slots on the next access.
  global._prisma = undefined;

  const adapter = global._prismaAdapter ?? createPostgresAdapter(databaseUrl!);
  const client = new PrismaClient({
    log: [...prismaLog],
    adapter,
  });

  // Always cache on globalThis. In dev this survives HMR; in production the Proxy
  // resolves the client on every property access, so without caching each access
  // would spawn a new pg pool and exhaust hosted DB connection limits.
  global._prisma = client;
  global._prismaAdapter = adapter;

  return client;
}

type TransactionArg = Parameters<PrismaClient['$transaction']>[0];
type TransactionOptionsArg = Parameters<PrismaClient['$transaction']>[1];

function runTransaction(
  client: PrismaClient,
  arg: TransactionArg,
  options?: TransactionOptionsArg
) {
  const merged: PrismaTransactionOptions = { ...defaultTransactionOptions, ...options };
  return client.$transaction(arg, merged);
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = resolvePrismaClient();
    if (prop === '$transaction') {
      return (arg: TransactionArg, options?: TransactionOptionsArg) =>
        runTransaction(client, arg, options);
    }
    const value = (client as PrismaClient & Record<string | symbol, unknown>)[prop];
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
