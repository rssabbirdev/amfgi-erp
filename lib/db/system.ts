/**
 * System database connection — stores Users, Companies, Roles.
 * Uses a dedicated DB name so it's completely separate from company data DBs.
 */
import mongoose from 'mongoose';

const BASE_URI  = process.env.MONGODB_BASE_URI!;
const SYSTEM_DB = process.env.SYSTEM_DB_NAME ?? 'amfgi_system';

if (!BASE_URI) throw new Error('MONGODB_BASE_URI is not defined');

/** Insert /dbName into a MongoDB URI before the query-string (if any). */
function buildUri(base: string, dbName: string): string {
  const qIdx = base.indexOf('?');
  if (qIdx === -1) return `${base}/${dbName}`;
  return `${base.slice(0, qIdx)}/${dbName}${base.slice(qIdx)}`;
}

const SYSTEM_URI = buildUri(BASE_URI, SYSTEM_DB);

interface SystemCache {
  conn:    typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _systemDbCache: SystemCache;
}

if (!global._systemDbCache) {
  global._systemDbCache = { conn: null, promise: null };
}

const cache = global._systemDbCache;

export async function connectSystemDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(SYSTEM_URI, { bufferCommands: false });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
