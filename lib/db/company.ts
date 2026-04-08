/**
 * Per-company database connection manager.
 * Each company has its own MongoDB database; models are registered per-connection.
 */
import mongoose from 'mongoose';
import { MaterialSchema }   from './schemas/Material';
import { JobSchema }        from './schemas/Job';
import { CustomerSchema }   from './schemas/Customer';
import { TransactionSchema } from './schemas/Transaction';
import { StockBatchSchema } from './schemas/StockBatch';
import { UnitSchema }       from './schemas/Unit';
import { CategorySchema }   from './schemas/Category';
import { WarehouseSchema }  from './schemas/Warehouse';
import { MaterialLogSchema } from './schemas/MaterialLog';
import { PriceLogSchema }   from './schemas/PriceLog';

const BASE_URI = process.env.MONGODB_BASE_URI!;

/** Insert /dbName into a MongoDB URI before the query-string (if any). */
function buildUri(base: string, dbName: string): string {
  const qIdx = base.indexOf('?');
  if (qIdx === -1) return `${base}/${dbName}`;
  return `${base.slice(0, qIdx)}/${dbName}${base.slice(qIdx)}`;
}

declare global {
  // eslint-disable-next-line no-var
  var _companyConnections: Map<string, mongoose.Connection>;
}

if (!global._companyConnections) {
  global._companyConnections = new Map();
}

export async function getCompanyDB(dbName: string): Promise<mongoose.Connection> {
  if (global._companyConnections.has(dbName)) {
    return global._companyConnections.get(dbName)!;
  }

  const uri  = buildUri(BASE_URI, dbName);
  const conn = await mongoose.createConnection(uri, { bufferCommands: false }).asPromise();

  global._companyConnections.set(dbName, conn);
  return conn;
}

/** Returns Mongoose models bound to the given company's database connection. */
export function getModels(conn: mongoose.Connection) {
  return {
    Material:    conn.models.Material    || conn.model('Material',    MaterialSchema),
    Job:         conn.models.Job         || conn.model('Job',         JobSchema),
    Customer:    conn.models.Customer    || conn.model('Customer',    CustomerSchema),
    Transaction: conn.models.Transaction || conn.model('Transaction', TransactionSchema),
    StockBatch:  conn.models.StockBatch  || conn.model('StockBatch',  StockBatchSchema),
    Unit:        conn.models.Unit        || conn.model('Unit',        UnitSchema),
    Category:    conn.models.Category    || conn.model('Category',    CategorySchema),
    Warehouse:   conn.models.Warehouse   || conn.model('Warehouse',   WarehouseSchema),
    MaterialLog: conn.models.MaterialLog || conn.model('MaterialLog', MaterialLogSchema),
    PriceLog:    conn.models.PriceLog    || conn.model('PriceLog',    PriceLogSchema),
  };
}

/** Convenience: connect + return models in one call. */
export async function getCompanyModels(dbName: string) {
  const conn = await getCompanyDB(dbName);
  return getModels(conn);
}
