import type { PrismaClient } from '@prisma/client';

export type PrismaTransactionOptions = NonNullable<Parameters<PrismaClient['$transaction']>[1]>;

function resolveTransactionTimeoutMs(): number {
  const fromEnv = process.env.DATABASE_TRANSACTION_TIMEOUT_MS?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  // Prisma defaults to 5s — too low for multi-step stock txs over remote Postgres.
  return 60_000;
}

function resolveHeavyTransactionTimeoutMs(): number {
  const fromEnv = process.env.DATABASE_HEAVY_TRANSACTION_TIMEOUT_MS?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  // Delivery notes / batch dispatch: many FIFO lines over remote Postgres.
  return 120_000;
}

function resolveTransactionMaxWaitMs(): number {
  const fromEnv = process.env.DATABASE_TRANSACTION_MAX_WAIT_MS?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return 15_000;
}

/** Applied automatically by the prisma singleton for every `$transaction` call. */
export const defaultTransactionOptions: PrismaTransactionOptions = {
  maxWait: resolveTransactionMaxWaitMs(),
  timeout: resolveTransactionTimeoutMs(),
};

/** Multi-line stock batch posts (dispatch notes, receipts with many FIFO lines). */
export const heavyTransactionOptions: PrismaTransactionOptions = {
  maxWait: resolveTransactionMaxWaitMs(),
  timeout: resolveHeavyTransactionTimeoutMs(),
};
