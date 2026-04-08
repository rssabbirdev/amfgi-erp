/**
 * Seed script — bootstraps the multi-DB architecture with comprehensive test data:
 *   • System DB:  Companies, Roles, Users
 *   • AMFGI DB:   Materials, Customers, Suppliers, Jobs, Stock Batches, Transactions, Logs
 *   • K&M DB:     Materials, Customers, Suppliers, Jobs
 *
 * Run with: npx tsx scripts/seed.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BASE_URI = process.env.MONGODB_BASE_URI!;
const SYSTEM_DB = process.env.SYSTEM_DB_NAME ?? 'amfgi_system';

if (!BASE_URI) {
  console.error('❌  MONGODB_BASE_URI is not set in .env.local');
  process.exit(1);
}

/** Insert /dbName into a MongoDB URI before the query-string (if any). */
function buildUri(base: string, dbName: string): string {
  const qIdx = base.indexOf('?');
  if (qIdx === -1) return `${base}/${dbName}`;
  return `${base.slice(0, qIdx)}/${dbName}${base.slice(qIdx)}`;
}

// ── Schemas (inline to avoid module resolution issues in tsx) ─────────────────
import { Schema } from 'mongoose';

const CompanySchema = new Schema({
  name: String,
  slug: String,
  dbName: String,
  description: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const RoleSchema = new Schema({
  name: String,
  slug: String,
  permissions: [String],
  isSystem: { type: Boolean, default: false },
}, { timestamps: true });

const UserSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  image: String,
  isSuperAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  companyAccess: [{ companyId: Schema.Types.ObjectId, roleId: Schema.Types.ObjectId }],
  activeCompanyId: Schema.Types.ObjectId,
}, { timestamps: true });

const UnitSchema = new Schema({
  name: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const CategorySchema = new Schema({
  name: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const WarehouseSchema = new Schema({
  name: { type: String, required: true },
  location: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const MaterialSchema = new Schema({
  name: { type: String, required: true },
  description: String,
  unit: { type: String, required: true },
  category: { type: String, required: true },
  warehouse: { type: String, required: true },
  stockType: { type: String, required: true },
  externalItemName: { type: String, required: true },
  currentStock: { type: Number, default: 0 },
  unitCost: Number,
  reorderLevel: Number,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const MaterialLogSchema = new Schema({
  materialId: { type: String, required: true, index: true },
  action: { type: String, enum: ['created', 'updated'], required: true },
  changes: { type: Schema.Types.Mixed, required: true },
  changedBy: { type: String, required: true },
  timestamp: { type: Date, default: () => new Date(), index: true },
}, { timestamps: false });

const PriceLogSchema = new Schema({
  materialId: { type: String, required: true, index: true },
  previousPrice: { type: Number, required: true },
  currentPrice: { type: Number, required: true },
  source: { type: String, enum: ['manual', 'bill'], required: true },
  changedBy: { type: String, required: true },
  billId: String,
  notes: String,
  timestamp: { type: Date, default: () => new Date(), index: true },
}, { timestamps: false });

const CustomerSchema = new Schema({
  name: { type: String, required: true },
  phone: String,
  email: String,
  address: String,
  city: String,
  country: String,
  notes: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const SupplierSchema = new Schema({
  name: { type: String, required: true },
  contactPerson: String,
  email: String,
  phone: String,
  address: String,
  city: String,
  country: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const JobSchema = new Schema({
  jobNumber: { type: String, required: true, unique: true },
  description: String,
  customerId: Schema.Types.ObjectId,
  quantity: Number,
  unit: String,
  deadline: Date,
  status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'PENDING' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const StockBatchSchema = new Schema({
  materialId: Schema.Types.ObjectId,
  batchNumber: { type: String, unique: true },
  quantityReceived: Number,
  quantityAvailable: Number,
  unitCost: Number,
  totalCost: Number,
  supplier: String,
  receiptNumber: String,
  receivedDate: Date,
  expiryDate: Date,
  notes: String,
}, { timestamps: true });

const TransactionSchema = new Schema({
  type: { type: String, enum: ['STOCK_IN', 'STOCK_OUT', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL'], required: true },
  materialId: Schema.Types.ObjectId,
  quantity: Number,
  jobId: Schema.Types.ObjectId,
  parentTransactionId: Schema.Types.ObjectId,
  notes: String,
  date: Date,
  performedBy: String,
  batchesUsed: [{
    batchId: Schema.Types.ObjectId,
    batchNumber: String,
    quantityFromBatch: Number,
    unitCost: Number,
    costAmount: Number,
  }],
  totalCost: Number,
  averageCost: Number,
}, { timestamps: true });

// ─────────────────────────────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  'company.view', 'company.create', 'company.edit',
  'user.view', 'user.create', 'user.edit', 'user.delete',
  'role.manage',
  'material.view', 'material.create', 'material.edit', 'material.delete',
  'job.view', 'job.create', 'job.edit',
  'customer.view', 'customer.create', 'customer.edit', 'customer.delete',
  'transaction.stock_in', 'transaction.stock_out', 'transaction.return', 'transaction.transfer',
  'report.view',
];

const MANAGER_PERMISSIONS = [
  'material.view', 'material.create', 'material.edit',
  'job.view', 'job.create', 'job.edit',
  'customer.view', 'customer.create', 'customer.edit',
  'transaction.stock_in', 'transaction.stock_out', 'transaction.return', 'transaction.transfer',
  'report.view',
  'user.view',
];

const STORE_KEEPER_PERMISSIONS = [
  'material.view',
  'job.view',
  'transaction.stock_out',
  'transaction.return',
];

// ─────────────────────────────────────────────────────────────────────────────

async function seedCompanyDB(
  dbName: string,
  companyName: string,
  materials: Array<{ name: string; description?: string; unit: string; category: string; warehouse: string; stockType: string; externalItemName: string; currentStock: number; unitCost: number; reorderLevel?: number }>,
  customers: Array<{ name: string; phone?: string; email?: string; address?: string; city?: string; country?: string; notes?: string }>,
  suppliers: Array<{ name: string; contactPerson?: string; phone?: string; email?: string; address?: string; city?: string; country?: string }>,
  jobs: Array<{ jobNumber: string; description?: string; quantity?: number; unit?: string }>,
) {
  const uri = buildUri(BASE_URI, dbName);
  const conn = await mongoose.createConnection(uri, { bufferCommands: false }).asPromise();

  const Unit = conn.models.Unit || conn.model('Unit', UnitSchema);
  const Category = conn.models.Category || conn.model('Category', CategorySchema);
  const Warehouse = conn.models.Warehouse || conn.model('Warehouse', WarehouseSchema);
  const Material = conn.models.Material || conn.model('Material', MaterialSchema);
  const Customer = conn.models.Customer || conn.model('Customer', CustomerSchema);
  const Supplier = conn.models.Supplier || conn.model('Supplier', SupplierSchema);
  const Job = conn.models.Job || conn.model('Job', JobSchema);
  const StockBatch = conn.models.StockBatch || conn.model('StockBatch', StockBatchSchema);
  const MaterialLog = conn.models.MaterialLog || conn.model('MaterialLog', MaterialLogSchema);
  const PriceLog = conn.models.PriceLog || conn.model('PriceLog', PriceLogSchema);

  // Create units
  const uniqueUnits = [...new Set(materials.map(m => m.unit))];
  for (const unitName of uniqueUnits) {
    await Unit.findOneAndUpdate({ name: unitName }, { isActive: true }, { upsert: true });
  }

  // Create categories
  const uniqueCategories = [...new Set(materials.map(m => m.category))];
  for (const catName of uniqueCategories) {
    await Category.findOneAndUpdate({ name: catName }, { isActive: true }, { upsert: true });
  }

  // Create warehouses
  const uniqueWarehouses = [...new Set(materials.map(m => m.warehouse))];
  for (const whName of uniqueWarehouses) {
    await Warehouse.findOneAndUpdate({ name: whName }, { isActive: true }, { upsert: true });
  }

  // Materials with batches and logs
  const materialIds: Record<string, any> = {};
  for (const m of materials) {
    const mat = await Material.findOneAndUpdate(
      { name: m.name },
      { ...m, isActive: true },
      { upsert: true, new: true }
    );
    materialIds[m.name] = mat._id;

    // Create MaterialLog for creation
    await MaterialLog.create({
      materialId: mat._id.toString(),
      action: 'created',
      changes: {
        name: { from: null, to: m.name },
        unit: { from: null, to: m.unit },
        category: { from: null, to: m.category },
        warehouse: { from: null, to: m.warehouse },
        stockType: { from: null, to: m.stockType },
        externalItemName: { from: null, to: m.externalItemName },
      },
      changedBy: 'System Seed',
      timestamp: new Date(),
    });

    // Create PriceLog for initial cost
    if (m.unitCost && m.unitCost > 0) {
      await PriceLog.create({
        materialId: mat._id.toString(),
        previousPrice: 0,
        currentPrice: m.unitCost,
        source: 'manual',
        changedBy: 'System Seed',
        notes: 'Initial opening stock price',
        timestamp: new Date(),
      });
    }

    // Create stock batch for each material
    const batchNum = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    await StockBatch.create({
      materialId: mat._id,
      batchNumber: batchNum,
      quantityReceived: m.currentStock,
      quantityAvailable: m.currentStock,
      unitCost: m.unitCost,
      totalCost: m.currentStock * m.unitCost,
      supplier: suppliers[0]?.name || 'Default Supplier',
      receiptNumber: `GRN-${Date.now()}`,
      receivedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      notes: `Opening stock for ${m.name}`,
    });
  }

  // Customers
  for (const c of customers) {
    await Customer.findOneAndUpdate({ name: c.name }, { ...c, isActive: true }, { upsert: true });
  }

  // Suppliers
  for (const s of suppliers) {
    await Supplier.findOneAndUpdate({ name: s.name }, { ...s, isActive: true }, { upsert: true });
  }

  // Jobs
  for (const j of jobs) {
    await Job.findOneAndUpdate(
      { jobNumber: j.jobNumber },
      { ...j, isActive: true, status: 'IN_PROGRESS' },
      { upsert: true }
    );
  }

  console.log(`  ✓ ${companyName}: ${materials.length} materials, ${customers.length} customers, ${suppliers.length} suppliers, ${jobs.length} jobs`);
  await conn.close();
}

// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  // ── Connect to system DB ────────────────────────────────────────────────────
  const systemUri = buildUri(BASE_URI, SYSTEM_DB);
  await mongoose.connect(systemUri);
  console.log('✓ Connected to system DB:', SYSTEM_DB);

  const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);
  const Role = mongoose.models.Role || mongoose.model('Role', RoleSchema);
  const User = mongoose.models.User || mongoose.model('User', UserSchema);

  // ── Companies ───────────────────────────────────────────────────────────────
  const [amfgi, km] = await Promise.all([
    Company.findOneAndUpdate(
      { slug: 'amfgi' },
      {
        name: 'Almuraqib Fiber Glass Industry LLC',
        slug: 'amfgi',
        dbName: 'company_amfgi',
        description: 'Fiberglass fabrication and moulding',
        isActive: true,
      },
      { upsert: true, new: true }
    ),
    Company.findOneAndUpdate(
      { slug: 'km' },
      {
        name: 'K&M Industries',
        slug: 'km',
        dbName: 'company_km',
        description: 'Steel fabrication and structural work',
        isActive: true,
      },
      { upsert: true, new: true }
    ),
  ]);
  console.log(`✓ Companies: ${amfgi.name}, ${km.name}`);

  // ── Roles ───────────────────────────────────────────────────────────────────
  const [managerRole, skRole] = await Promise.all([
    Role.findOneAndUpdate(
      { slug: 'manager' },
      { name: 'Manager', slug: 'manager', permissions: MANAGER_PERMISSIONS, isSystem: true },
      { upsert: true, new: true }
    ),
    Role.findOneAndUpdate(
      { slug: 'store-keeper' },
      { name: 'Store Keeper', slug: 'store-keeper', permissions: STORE_KEEPER_PERMISSIONS, isSystem: true },
      { upsert: true, new: true }
    ),
  ]);
  console.log(`✓ Roles: ${managerRole.name}, ${skRole.name}`);

  // ── Users ───────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@1234', 12);
  const admin = await User.findOneAndUpdate(
    { email: 'admin@almuraqib.com' },
    {
      name: 'System Admin',
      email: 'admin@almuraqib.com',
      password: adminHash,
      isSuperAdmin: true,
      isActive: true,
      companyAccess: [],
    },
    { upsert: true, new: true }
  );
  console.log(`✓ Super Admin: ${admin.email}`);

  // AMFGI manager
  const mgrHash = await bcrypt.hash('Manager@1234', 12);
  const mgr = await User.findOneAndUpdate(
    { email: 'manager@amfgi.com' },
    {
      name: 'AMFGI Manager',
      email: 'manager@amfgi.com',
      password: mgrHash,
      isSuperAdmin: false,
      isActive: true,
      companyAccess: [{ companyId: amfgi._id, roleId: managerRole._id }],
      activeCompanyId: amfgi._id,
    },
    { upsert: true, new: true }
  );
  console.log(`✓ AMFGI Manager: ${mgr.email}`);

  // Store keeper
  const skHash = await bcrypt.hash('Store@1234', 12);
  const sk = await User.findOneAndUpdate(
    { email: 'storekeeper@amfgi.com' },
    {
      name: 'AMFGI Store Keeper',
      email: 'storekeeper@amfgi.com',
      password: skHash,
      isSuperAdmin: false,
      isActive: true,
      companyAccess: [{ companyId: amfgi._id, roleId: skRole._id }],
      activeCompanyId: amfgi._id,
    },
    { upsert: true, new: true }
  );
  console.log(`✓ Store Keeper: ${sk.email}`);

  await mongoose.disconnect();

  // ── Seed AMFGI company DB ───────────────────────────────────────────────────
  console.log('\nSeeding AMFGI company DB (company_amfgi)…');
  await seedCompanyDB(
    'company_amfgi',
    'AMFGI',
    [
      { name: 'Fiberglass Mat 300gsm', description: 'High-quality fiberglass reinforcement mat', unit: 'kg', category: 'Reinforcement', warehouse: 'Main Warehouse', stockType: 'Raw Material', externalItemName: 'FGB-MAT-300', currentStock: 500, unitCost: 150, reorderLevel: 100 },
      { name: 'Unsaturated Polyester Resin', description: 'General-purpose polyester resin for composites', unit: 'kg', category: 'Resin', warehouse: 'Main Warehouse', stockType: 'Raw Material', externalItemName: 'RES-UPE-STD', currentStock: 1000, unitCost: 200, reorderLevel: 200 },
      { name: 'MEKP Catalyst', description: 'Methyl ethyl ketone peroxide catalyst', unit: 'liter', category: 'Catalyst', warehouse: 'Chemical Store', stockType: 'Consumable', externalItemName: 'CAT-MEKP-01', currentStock: 50, unitCost: 500, reorderLevel: 20 },
      { name: 'Gelcoat White', description: 'White polyester gelcoat for finish coating', unit: 'kg', category: 'Coating', warehouse: 'Main Warehouse', stockType: 'Raw Material', externalItemName: 'GEL-WH-001', currentStock: 200, unitCost: 350, reorderLevel: 50 },
      { name: 'Acetone', description: 'Acetone solvent for cleaning', unit: 'liter', category: 'Solvent', warehouse: 'Chemical Store', stockType: 'Consumable', externalItemName: 'SOL-ACE-001', currentStock: 100, unitCost: 100, reorderLevel: 30 },
      { name: 'Fiberglass Woven Roving', description: 'Woven fiberglass fabric for reinforcement', unit: 'kg', category: 'Reinforcement', warehouse: 'Main Warehouse', stockType: 'Raw Material', externalItemName: 'FGB-WRO-400', currentStock: 300, unitCost: 180, reorderLevel: 80 },
      { name: 'Polyester Putty', description: 'Two-part polyester putty filler', unit: 'kg', category: 'Filler', warehouse: 'Main Warehouse', stockType: 'Raw Material', externalItemName: 'PUT-POL-002', currentStock: 150, unitCost: 280, reorderLevel: 40 },
      { name: 'Hardener Powder', description: 'Hardening agent for resin systems', unit: 'kg', category: 'Additive', warehouse: 'Chemical Store', stockType: 'Consumable', externalItemName: 'HRD-POW-001', currentStock: 80, unitCost: 400, reorderLevel: 25 },
    ],
    [
      { name: 'Gulf Marine LLC', phone: '+971 50 123 4567', email: 'sales@gulfmarine.ae', city: 'Dubai' },
      { name: 'Abu Dhabi Ports', phone: '+971 2 500 0000', email: 'procurement@adports.ae', city: 'Abu Dhabi' },
      { name: 'Emirates Materials Trading', phone: '+971 4 298 5555', email: 'trade@ematerials.ae', city: 'Dubai' },
    ],
    [
      { name: 'Gulf Chemical Supply', contactPerson: 'Ali Ahmed', phone: '+971 4 555 6666', city: 'Dubai' },
      { name: 'Polymer Industries', contactPerson: 'Hassan Khan', phone: '+971 2 666 7777', city: 'Abu Dhabi' },
      { name: 'Reinforced Materials Co', contactPerson: 'Fatima Al-Mansoori', phone: '+971 6 888 9999', city: 'Sharjah' },
    ],
    [
      { jobNumber: 'JOB-2024-001', description: 'Fiberglass tank fabrication', quantity: 5, unit: 'pcs' },
      { jobNumber: 'JOB-2024-002', description: 'Marine hull repair', quantity: 2, unit: 'pcs' },
      { jobNumber: 'JOB-2024-003', description: 'Pipe covering assembly', quantity: 100, unit: 'meter' },
    ]
  );

  // ── Seed K&M company DB ─────────────────────────────────────────────────────
  console.log('Seeding K&M company DB (company_km)…');
  await seedCompanyDB(
    'company_km',
    'K&M',
    [
      { name: 'Steel Pipe 2"', description: 'Carbon steel pipe 2 inch diameter', unit: 'meter', category: 'Pipe', warehouse: 'Warehouse A', stockType: 'Raw Material', externalItemName: 'PIP-STL-2IN', currentStock: 200, unitCost: 45, reorderLevel: 50 },
      { name: 'Steel Plate 6mm', description: 'Mild steel plate 6mm thickness', unit: 'sheet', category: 'Plate', warehouse: 'Warehouse A', stockType: 'Raw Material', externalItemName: 'PL-STL-6MM', currentStock: 100, unitCost: 350, reorderLevel: 20 },
      { name: 'MS Angle 50x50', description: 'Mild steel angle bar 50x50mm', unit: 'meter', category: 'Structural', warehouse: 'Warehouse A', stockType: 'Raw Material', externalItemName: 'ANG-50-50', currentStock: 300, unitCost: 38, reorderLevel: 80 },
      { name: 'Welding Rods 3mm', description: '3mm welding electrodes for steel', unit: 'kg', category: 'Welding', warehouse: 'Warehouse B', stockType: 'Consumable', externalItemName: 'WELD-3MM', currentStock: 50, unitCost: 120, reorderLevel: 15 },
      { name: 'Grinding Disc', description: '100mm grinding wheel disc', unit: 'pcs', category: 'Tools', warehouse: 'Warehouse B', stockType: 'Consumable', externalItemName: 'GRIND-100', currentStock: 100, unitCost: 25, reorderLevel: 30 },
      { name: 'Steel Channel 100x50', description: 'Structural steel channel 100x50mm', unit: 'meter', category: 'Structural', warehouse: 'Warehouse A', stockType: 'Raw Material', externalItemName: 'CHN-100-50', currentStock: 150, unitCost: 55, reorderLevel: 40 },
      { name: 'Mild Steel Bar 16mm', description: 'Mild steel reinforcement bar 16mm', unit: 'meter', category: 'Bar', warehouse: 'Warehouse A', stockType: 'Raw Material', externalItemName: 'BAR-16MM', currentStock: 250, unitCost: 18, reorderLevel: 60 },
    ],
    [],
    [
      { name: 'Emirates Steel', phone: '+971 2 555 1234', email: 'sales@emiratessteel.ae', city: 'Abu Dhabi' },
      { name: 'Gulf Steel Trading', phone: '+971 4 333 4444', email: 'trade@gulfsteel.ae', city: 'Dubai' },
      { name: 'Industrial Metals LLC', phone: '+971 3 222 3333', email: 'supply@indmetals.ae', city: 'Ajman' },
    ],
    [
      { jobNumber: 'JOB-2024-101', description: 'Steel structure fabrication', quantity: 50, unit: 'ton' },
      { jobNumber: 'JOB-2024-102', description: 'Pipeline construction', quantity: 500, unit: 'meter' },
    ]
  );

  console.log('\n✅  Seed complete!');
  console.log('─────────────────────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Super Admin:   admin@almuraqib.com     / Admin@1234');
  console.log('  AMFGI Manager: manager@amfgi.com       / Manager@1234');
  console.log('  Store Keeper:  storekeeper@amfgi.com   / Store@1234');
  console.log('─────────────────────────────────────────────────────');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
