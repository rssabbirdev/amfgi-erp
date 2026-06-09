import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { resolvePostgresPoolConfig } from './postgresPoolConfig';

declare global {
  var _pgPool: Pool | undefined;
}

export type PostgresPrismaAdapter = PrismaPg;

/** One pg pool per Node process — avoids duplicate pools on HMR / client refresh. */
export function getSharedPgPool(connectionString: string): Pool {
  if (!global._pgPool) {
    global._pgPool = new Pool(resolvePostgresPoolConfig(connectionString));
  }
  return global._pgPool;
}

export async function endSharedPgPool(): Promise<void> {
  const pool = global._pgPool;
  global._pgPool = undefined;
  if (pool) {
    await pool.end();
  }
}

export function createPostgresAdapter(connectionString: string): PostgresPrismaAdapter {
  return new PrismaPg(getSharedPgPool(connectionString));
}
