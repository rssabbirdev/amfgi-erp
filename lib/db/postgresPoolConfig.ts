import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';
import { normalizePostgresUrl } from './resolveDatabaseUrl';

function parseDatabaseUrl(connectionString: string): URL {
  return new URL(connectionString.replace(/^postgres(ql)?:\/\//, 'https://'));
}

function sslModeRequiresTls(sslmode: string | null): boolean {
  if (!sslmode) return false;
  const mode = sslmode.toLowerCase();
  return mode !== 'disable' && mode !== 'allow';
}

function poolConfigFromUrl(connectionString: string): PoolConfig {
  const url = parseDatabaseUrl(connectionString);
  const database = url.pathname.replace(/^\//, '');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    database: database || undefined,
  };
}

function resolvePoolMax(): number {
  const fromEnv = process.env.DATABASE_POOL_MAX?.trim();
  if (fromEnv) {
    const parsed = Number(fromEnv);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  // Hosted Postgres (e.g. Aiven) has low max_connections. Each Node process (dev
  // server, Vercel lambda, script) gets its own pool — keep defaults tiny.
  if (process.env.VERCEL) return 1;
  return process.env.NODE_ENV === 'development' ? 2 : 1;
}

const POOL_IDLE_TIMEOUT_MS = 10_000;
const POOL_CONNECT_TIMEOUT_MS = 10_000;

function withPoolTimeouts(config: PoolConfig): PoolConfig {
  return {
    ...config,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    allowExitOnIdle: true,
  };
}

/**
 * Pool config for @prisma/adapter-pg. Prisma Migrate uses its own TLS stack; the pg
 * driver needs explicit `ssl` when connecting to managed Postgres (e.g. Aiven).
 *
 * `sslmode` in the URL is not passed through: pg v8+ maps require/verify-ca to
 * verify-full, which breaks Aiven on Windows without the provider CA in trust store.
 */
export function resolvePostgresPoolConfig(connectionString: string): PoolConfig {
  const max = resolvePoolMax();
  const normalized = normalizePostgresUrl(connectionString);
  const url = parseDatabaseUrl(normalized);
  const sslmode = url.searchParams.get('sslmode');
  const isLocalHost =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';

  const caEnv = process.env.DATABASE_SSL_CA?.trim();
  const rejectUnauthorizedEnv = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase();

  const wantsTls =
    sslModeRequiresTls(sslmode) ||
    Boolean(caEnv) ||
    rejectUnauthorizedEnv === 'true' ||
    rejectUnauthorizedEnv === 'false';

  if (!wantsTls || (isLocalHost && !sslModeRequiresTls(sslmode) && !caEnv)) {
    return withPoolTimeouts({ connectionString: normalized, max });
  }

  const config = poolConfigFromUrl(normalized);
  config.max = max;

  if (caEnv) {
    const ca = caEnv.includes('-----BEGIN') ? caEnv : readFileSync(caEnv, 'utf8');
    config.ssl = { ca, rejectUnauthorized: rejectUnauthorizedEnv !== 'false' };
    return withPoolTimeouts(config);
  }

  config.ssl = { rejectUnauthorized: rejectUnauthorizedEnv === 'true' };
  return withPoolTimeouts(config);
}
