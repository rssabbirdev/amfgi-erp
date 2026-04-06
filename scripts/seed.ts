/**
 * Seed script — bootstraps the new multi-DB architecture:
 *   • System DB:  Companies, Roles, Super Admin user
 *   • AMFGI DB:   Sample materials, customers
 *   • K&M DB:     Sample materials, customers
 *
 * Run with: npx tsx scripts/seed.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import bcrypt   from 'bcryptjs';

const BASE_URI  = process.env.MONGODB_BASE_URI!;
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
  name: String, slug: String, dbName: String, description: String, isActive: { type: Boolean, default: true },
}, { timestamps: true });

const RoleSchema = new Schema({
  name:        String,
  slug:        String,
  permissions: [String],
  isSystem:    { type: Boolean, default: false },
}, { timestamps: true });

const UserSchema = new Schema({
  name:            String,
  email:           { type: String, unique: true },
  password:        String,
  image:           String,
  isSuperAdmin:    { type: Boolean, default: false },
  isActive:        { type: Boolean, default: true },
  companyAccess:   [{ companyId: Schema.Types.ObjectId, roleId: Schema.Types.ObjectId }],
  activeCompanyId: Schema.Types.ObjectId,
}, { timestamps: true });

const MaterialSchema = new Schema({
  name:         { type: String, required: true },
  unit:         { type: String, required: true },
  description:  String,
  currentStock: { type: Number, default: 0 },
  unitCost:     Number,
  minStock:     Number,
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

const CustomerSchema = new Schema({
  name:     { type: String, required: true },
  phone:    String,
  email:    String,
  address:  String,
  notes:    String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ── ALL_PERMISSIONS (must match lib/permissions.ts) ───────────────────────────
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
  dbName:     string,
  companyName: string,
  materials:  Array<{ name: string; unit: string; currentStock: number }>,
  customers:  Array<{ name: string; phone?: string }>,
) {
  const uri  = buildUri(BASE_URI, dbName);
  const conn = await mongoose.createConnection(uri, { bufferCommands: false }).asPromise();

  const Material = conn.models.Material || conn.model('Material', MaterialSchema);
  const Customer = conn.models.Customer || conn.model('Customer', CustomerSchema);

  for (const m of materials) {
    await Material.findOneAndUpdate({ name: m.name }, { ...m, isActive: true }, { upsert: true });
  }
  for (const c of customers) {
    await Customer.findOneAndUpdate({ name: c.name }, { ...c, isActive: true }, { upsert: true });
  }

  console.log(`  ✓ ${companyName}: ${materials.length} materials, ${customers.length} customers`);
  await conn.close();
}

async function seed() {
  // ── Connect to system DB ────────────────────────────────────────────────────
  const systemUri = buildUri(BASE_URI, SYSTEM_DB);
  await mongoose.connect(systemUri);
  console.log('✓ Connected to system DB:', SYSTEM_DB);

  const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema);
  const Role    = mongoose.models.Role    || mongoose.model('Role',    RoleSchema);
  const User    = mongoose.models.User    || mongoose.model('User',    UserSchema);

  // ── Companies ───────────────────────────────────────────────────────────────
  const [amfgi, km] = await Promise.all([
    Company.findOneAndUpdate(
      { slug: 'amfgi' },
      {
        name:        'Almuraqib Fiber Glass Industry LLC',
        slug:        'amfgi',
        dbName:      'company_amfgi',
        description: 'Fiberglass fabrication and moulding',
        isActive:    true,
      },
      { upsert: true, new: true }
    ),
    Company.findOneAndUpdate(
      { slug: 'km' },
      {
        name:        'K&M Industries',
        slug:        'km',
        dbName:      'company_km',
        description: 'Steel fabrication and structural work',
        isActive:    true,
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
      name:         'System Admin',
      email:        'admin@almuraqib.com',
      password:     adminHash,
      isSuperAdmin: true,
      isActive:     true,
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
      name:          'AMFGI Manager',
      email:         'manager@amfgi.com',
      password:      mgrHash,
      isSuperAdmin:  false,
      isActive:      true,
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
      name:          'AMFGI Store Keeper',
      email:         'storekeeper@amfgi.com',
      password:      skHash,
      isSuperAdmin:  false,
      isActive:      true,
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
      { name: 'Fiberglass Mat 300gsm',        unit: 'kg',    currentStock: 500  },
      { name: 'Unsaturated Polyester Resin',  unit: 'kg',    currentStock: 1000 },
      { name: 'MEKP Catalyst',                unit: 'liter', currentStock: 50   },
      { name: 'Gelcoat White',                unit: 'kg',    currentStock: 200  },
      { name: 'Acetone',                      unit: 'liter', currentStock: 100  },
      { name: 'Fiberglass Woven Roving',      unit: 'kg',    currentStock: 300  },
    ],
    [
      { name: 'Gulf Marine LLC',  phone: '+971 50 123 4567' },
      { name: 'Abu Dhabi Ports',  phone: '+971 2 500 0000'  },
    ]
  );

  // ── Seed K&M company DB ─────────────────────────────────────────────────────
  console.log('Seeding K&M company DB (company_km)…');
  await seedCompanyDB(
    'company_km',
    'K&M',
    [
      { name: 'Steel Pipe 2"',    unit: 'meter', currentStock: 200 },
      { name: 'Steel Plate 6mm',  unit: 'sheet', currentStock: 100 },
      { name: 'MS Angle 50x50',   unit: 'meter', currentStock: 300 },
      { name: 'Welding Rods 3mm', unit: 'kg',    currentStock: 50  },
      { name: 'Grinding Disc',    unit: 'pcs',   currentStock: 100 },
    ],
    [
      { name: 'Emirates Steel',   phone: '+971 2 555 1234' },
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
