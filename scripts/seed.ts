/**
 * Seed script — Prisma MySQL version
 * Bootstraps the shared database with comprehensive test data:
 *   • Companies: AMFGI, K&M (with profiles: address, phone, email)
 *   • Company Print Templates: Default A4 delivery note layout pre-configured
 *   • Roles: Admin, Manager (with settings.manage), Store Keeper (with permissions)
 *   • Users: Super Admin, AMFGI Manager, Store Keeper
 *   • Per-company: Units, Categories, Warehouses
 *   • Per-company: Materials with stock batches, logs, transactions (STOCK_IN)
 *   • Per-company: Customers, Suppliers, Jobs (with variations)
 *   • Per-company: Sample dispatch entries and 3+ delivery notes (STOCK_OUT)
 *   • Delivery Notes: Structured with dynamic fields for template rendering
 *
 * Features:
 *   - Print template builder ready (templates pre-configured)
 *   - Delivery note printing with company letterhead support
 *   - FIFO stock consumption tracking with batch costing
 *   - Job variations for complex projects
 *
 * Run with: npx tsx scripts/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
  'settings.manage',
];

const STORE_KEEPER_PERMISSIONS = [
  'material.view',
  'job.view',
  'transaction.stock_out',
  'transaction.return',
];

interface MaterialDef {
  name: string;
  description?: string;
  unit: string;
  category: string;
  warehouse: string;
  stockType: string;
  externalItemName: string;
  currentStock: number;
  unitCost: number;
  reorderLevel?: number;
}

interface CustomerDef {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface SupplierDef {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
}

interface JobDef {
  jobNumber: string;
  description?: string;
  site?: string;
  variations?: Array<{
    suffix: string;
    description?: string;
  }>;
}

async function seedCompanyData(
  companyId: string,
  companyName: string,
  materials: MaterialDef[],
  customers: CustomerDef[],
  suppliers: SupplierDef[],
  jobs: JobDef[],
) {
  console.log(`\n  Seeding ${companyName} company data…`);

  // Create customers first (so jobs can reference them)
  let firstCustomerId: string | null = null;
  for (const c of customers) {
    const customer = await prisma.customer.upsert({
      where: { companyId_name: { companyId, name: c.name } },
      update: { isActive: true },
      create: {
        companyId,
        name: c.name,
        contactPerson: c.contactPerson,
        phone: c.phone,
        email: c.email,
        address: c.address,
        isActive: true,
      },
    });
    if (!firstCustomerId) firstCustomerId = customer.id;
  }

  // Create units
  const unitNames = new Set<string>();
  materials.forEach((m) => unitNames.add(m.unit));

  const createdUnits: Record<string, string> = {};
  for (const unitName of unitNames) {
    const unit = await prisma.unit.upsert({
      where: { companyId_name: { companyId, name: unitName } },
      update: { isActive: true },
      create: { companyId, name: unitName, isActive: true },
    });
    createdUnits[unitName] = unit.id;
  }

  // Create materials with stock batches and logs
  const createdMaterials: Record<string, string> = {};
  for (const m of materials) {
    const material = await prisma.material.upsert({
      where: { companyId_name: { companyId, name: m.name } },
      update: {
        unit: m.unit,
        currentStock: m.currentStock,
        unitCost: m.unitCost,
        isActive: true,
      },
      create: {
        companyId,
        name: m.name,
        description: m.description,
        unit: m.unit,
        category: m.category,
        warehouse: m.warehouse,
        stockType: m.stockType,
        externalItemName: m.externalItemName,
        currentStock: m.currentStock,
        unitCost: m.unitCost,
        reorderLevel: m.reorderLevel ?? 0,
        isActive: true,
      },
    });

    createdMaterials[m.name] = material.id;

    // Create material log
    await prisma.materialLog.create({
      data: {
        companyId,
        materialId: material.id,
        action: 'created',
        changes: {
          name: { from: null, to: m.name },
          unit: { from: null, to: m.unit },
        },
        changedBy: 'System Seed',
        timestamp: new Date(),
      },
    });

    // Create price log
    if (m.unitCost && m.unitCost > 0) {
      await prisma.priceLog.create({
        data: {
          companyId,
          materialId: material.id,
          previousPrice: 0,
          currentPrice: m.unitCost,
          source: 'manual',
          changedBy: 'System Seed',
          notes: 'Initial opening stock price',
          timestamp: new Date(),
        },
      });
    }

    // Create stock batch
    const batchNumber = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const batch = await prisma.stockBatch.create({
      data: {
        companyId,
        materialId: material.id,
        batchNumber,
        quantityReceived: m.currentStock,
        quantityAvailable: m.currentStock,
        unitCost: m.unitCost,
        totalCost: m.currentStock * m.unitCost,
        receivedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        receiptNumber: `GRN-${Date.now()}`,
        notes: `Opening stock for ${m.name}`,
      },
    });

    // Create STOCK_IN transaction for the opening stock
    await prisma.transaction.create({
      data: {
        companyId,
        type: 'STOCK_IN',
        materialId: material.id,
        quantity: m.currentStock,
        totalCost: m.currentStock * m.unitCost,
        averageCost: m.unitCost,
        performedBy: 'System Seed',
        date: batch.receivedDate,
        notes: `Opening stock: ${batchNumber}`,
      },
    });
  }

  // Create suppliers
  for (const s of suppliers) {
    await prisma.supplier.upsert({
      where: { companyId_name: { companyId, name: s.name } },
      update: { isActive: true },
      create: {
        companyId,
        name: s.name,
        contactPerson: s.contactPerson,
        email: s.email,
        phone: s.phone,
        address: s.address,
        isActive: true,
      },
    });
  }

  // Create jobs with variations (if customer exists)
  let firstJobId: string | null = null;
  if (firstCustomerId) {
    for (const j of jobs) {
      // Create main job
      const mainJob = await prisma.job.upsert({
        where: { companyId_jobNumber: { companyId, jobNumber: j.jobNumber } },
        update: { status: 'ACTIVE' },
        create: {
          companyId,
          jobNumber: j.jobNumber,
          customerId: firstCustomerId,
          description: j.description || '',
          site: j.site,
          status: 'ACTIVE',
          createdAt: new Date(),
          createdBy: 'System Seed',
        },
      });

      if (!firstJobId) firstJobId = mainJob.id;

      // Create variations if specified
      if (j.variations && j.variations.length > 0) {
        for (const variation of j.variations) {
          const variationNumber = `${j.jobNumber}-${variation.suffix}`;
          await prisma.job.upsert({
            where: { companyId_jobNumber: { companyId, jobNumber: variationNumber } },
            update: { status: 'ACTIVE' },
            create: {
              companyId,
              jobNumber: variationNumber,
              customerId: firstCustomerId,
              description: variation.description || `${j.description} - ${variation.suffix}`,
              site: j.site,
              status: 'ACTIVE',
              parentJobId: mainJob.id,
              createdAt: new Date(),
              createdBy: 'System Seed',
            },
          });
        }
      }
    }
  }

  // Create sample dispatch and delivery note transactions
  if (firstJobId && Object.keys(createdMaterials).length > 0) {
    const materialIds = Object.values(createdMaterials);
    const firstMaterialId = materialIds[0];
    const systemUserId = 'System Seed';

    // Create sample dispatch transaction
    await prisma.transaction.create({
      data: {
        companyId,
        type: 'STOCK_OUT',
        materialId: firstMaterialId,
        quantity: 50,
        jobId: firstJobId,
        totalCost: 50 * materials[0].unitCost,
        averageCost: materials[0].unitCost,
        performedBy: systemUserId,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        notes: 'Sample dispatch for job',
        isDeliveryNote: false,
      },
    });

    // Create sample delivery note transactions (multiple to showcase templates)
    for (let dnNum = 1; dnNum <= 3; dnNum++) {
      const dnDate = new Date(Date.now() - (5 - dnNum) * 24 * 60 * 60 * 1000);
      const dnQuantity = 10 + dnNum * 5;

      let dnNotes = `--- DELIVERY NOTE #${dnNum}\n--- DELIVERY NOTE ITEMS (For Printing) ---\n`;

      if (companyName === 'AMFGI') {
        dnNotes += `• ${materials[0].name} | ${dnQuantity}kg\n`;
        dnNotes += `• ${materials[1]?.name || 'Polyester Resin'} | ${Math.floor(dnQuantity / 2)} kg`;
      } else {
        dnNotes += `• ${materials[0].name} | ${dnQuantity}m\n`;
        dnNotes += `• ${materials[1]?.name || 'Steel Plate'} | ${Math.floor(dnQuantity / 3)} sheets`;
      }

      await prisma.transaction.create({
        data: {
          companyId,
          type: 'STOCK_OUT',
          materialId: firstMaterialId,
          quantity: dnQuantity,
          jobId: firstJobId,
          totalCost: dnQuantity * materials[0].unitCost,
          averageCost: materials[0].unitCost,
          performedBy: systemUserId,
          date: dnDate,
          notes: dnNotes,
          isDeliveryNote: true,
        },
      });
    }
  }

  console.log(
    `    ✓ ${materials.length} materials, ${customers.length} customers, ${suppliers.length} suppliers, ${jobs.length} jobs (+ sample dispatch & delivery notes)`
  );
}

async function seed() {
  console.log('🌱 Starting Prisma seed…\n');

  // ── Delete old data (clean slate) ────────────────────────────────────────────
  console.log('Clearing old data…');
  await prisma.transactionBatch.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.priceLog.deleteMany({});
  await prisma.materialLog.deleteMany({});
  await prisma.stockBatch.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.material.deleteMany({});
  await prisma.warehouse.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.userCompanyAccess.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.company.deleteMany({});

  // ── Companies ───────────────────────────────────────────────────────────────
  console.log('\nCreating companies…');

  // Default print template (matches hardcoded layout)
  const defaultPrintTemplate = {
    id: 'default-delivery-note',
    name: 'Delivery Note - Standard',
    itemType: 'delivery-note',
    isDefault: true,
    version: 1,
    pageMargins: { top: 15, right: 15, bottom: 15, left: 15 },
    elements: [
      {
        id: 'letterhead-bg',
        type: 'letterhead',
        x: 0,
        y: 0,
        width: 210,
        height: 100,
        zIndex: 0,
        style: { opacity: 0.15 },
        objectFit: 'contain',
      },
      {
        id: 'header-title',
        type: 'text',
        x: 15,
        y: 102,
        width: 100,
        height: 12,
        zIndex: 1,
        content: 'DELIVERY NOTE',
        style: { fontSize: 20, fontWeight: 'bold', color: '#000' },
      },
      {
        id: 'header-dn-number',
        type: 'field',
        x: 130,
        y: 102,
        width: 65,
        height: 8,
        zIndex: 1,
        field: 'dn.number',
        label: 'NO:',
        format: 'text',
        style: { fontSize: 11, color: '#d32f2f', textAlign: 'right' },
      },
      {
        id: 'header-date',
        type: 'field',
        x: 130,
        y: 112,
        width: 65,
        height: 6,
        zIndex: 1,
        field: 'dn.date',
        label: 'DATE:',
        format: 'date',
        style: { fontSize: 10, textAlign: 'right' },
      },
      {
        id: 'ms-box',
        type: 'box',
        x: 15,
        y: 125,
        width: 82,
        height: 25,
        zIndex: 1,
        style: { borderWidth: 2, borderColor: '#000' },
      },
      {
        id: 'ms-label',
        type: 'text',
        x: 17,
        y: 127,
        width: 30,
        height: 6,
        zIndex: 2,
        content: 'M/S',
        style: { fontSize: 10, fontWeight: 'bold' },
      },
      {
        id: 'ms-content',
        type: 'field',
        x: 17,
        y: 133,
        width: 78,
        height: 15,
        zIndex: 2,
        field: 'job.description',
        style: { fontSize: 9 },
      },
      {
        id: 'project-box',
        type: 'box',
        x: 113,
        y: 125,
        width: 82,
        height: 25,
        zIndex: 1,
        style: { borderWidth: 2, borderColor: '#000' },
      },
      {
        id: 'project-label',
        type: 'text',
        x: 115,
        y: 127,
        width: 30,
        height: 6,
        zIndex: 2,
        content: 'PROJECT:',
        style: { fontSize: 10, fontWeight: 'bold' },
      },
      {
        id: 'project-job-number',
        type: 'field',
        x: 115,
        y: 133,
        width: 78,
        height: 6,
        zIndex: 2,
        field: 'job.jobNumber',
        style: { fontSize: 10, fontWeight: 'bold' },
      },
      {
        id: 'project-description',
        type: 'field',
        x: 115,
        y: 139,
        width: 78,
        height: 10,
        zIndex: 2,
        field: 'job.description',
        style: { fontSize: 9 },
      },
      {
        id: 'items-table',
        type: 'table',
        x: 15,
        y: 155,
        width: 180,
        height: 60,
        zIndex: 1,
        dataSource: 'customItems',
        columns: [
          { header: 'SL.NO.', field: 'slno', width: 10, align: 'center' },
          { header: 'DESCRIPTION', field: 'name', width: 55 },
          { header: 'UNIT', field: 'unit', width: 15, align: 'center' },
          { header: 'QTY', field: 'qty', width: 20, align: 'right' },
        ],
      },
      {
        id: 'footer-received',
        type: 'text',
        x: 15,
        y: 220,
        width: 180,
        height: 10,
        zIndex: 1,
        content: 'Received above goods in perfect condition.',
        style: { fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
      },
      {
        id: 'signature-prepared',
        type: 'signature',
        x: 15,
        y: 235,
        width: 50,
        height: 25,
        zIndex: 1,
        label: 'PREPARED BY',
      },
      {
        id: 'signature-delivered',
        type: 'signature',
        x: 80,
        y: 235,
        width: 50,
        height: 25,
        zIndex: 1,
        label: 'DELIVERED BY',
      },
      {
        id: 'signature-received',
        type: 'signature',
        x: 145,
        y: 235,
        width: 50,
        height: 25,
        zIndex: 1,
        label: 'RECEIVED BY',
      },
    ],
  };

  const amfgi = await prisma.company.create({
    data: {
      name: 'Almuraqib Fiber Glass Industry LLC',
      slug: 'amfgi',
      description: 'Fiberglass fabrication and moulding',
      address: 'P.O. Box 123456, Dubai, UAE\nJebel Ali Industrial Area 1\nDubai, United Arab Emirates',
      phone: '+971 4 885 1234',
      email: 'info@almuraqib.ae',
      isActive: true,
      printTemplates: [defaultPrintTemplate],
    },
  });

  const km = await prisma.company.create({
    data: {
      name: 'K&M Industries',
      slug: 'km',
      description: 'Steel fabrication and structural work',
      address: 'P.O. Box 654321, Abu Dhabi, UAE\nIndustrial Zone 3\nAbu Dhabi, United Arab Emirates',
      phone: '+971 2 555 8888',
      email: 'info@kandm.ae',
      isActive: true,
      printTemplates: [defaultPrintTemplate],
    },
  });

  console.log(`  ✓ ${amfgi.name}`);
  console.log(`  ✓ ${km.name}`);

  // ── Roles ───────────────────────────────────────────────────────────────────
  console.log('\nCreating roles…');
  const adminRole = await prisma.role.create({
    data: {
      name: 'Admin',
      slug: 'admin',
      permissions: ALL_PERMISSIONS,
      isSystem: true,
    },
  });

  const managerRole = await prisma.role.create({
    data: {
      name: 'Manager',
      slug: 'manager',
      permissions: MANAGER_PERMISSIONS,
      isSystem: true,
    },
  });

  const skRole = await prisma.role.create({
    data: {
      name: 'Store Keeper',
      slug: 'store-keeper',
      permissions: STORE_KEEPER_PERMISSIONS,
      isSystem: true,
    },
  });

  console.log(`  ✓ ${adminRole.name}`);
  console.log(`  ✓ ${managerRole.name}`);
  console.log(`  ✓ ${skRole.name}`);

  // ── Users ───────────────────────────────────────────────────────────────────
  console.log('\nCreating users…');

  const adminHash = await bcrypt.hash('Admin@1234', 12);
  const admin = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@almuraqib.com',
      password: adminHash,
      isSuperAdmin: true,
      isActive: true,
      activeCompanyId: amfgi.id,
    },
  });
  console.log(`  ✓ Super Admin: ${admin.email}`);

  // AMFGI Manager
  const mgrHash = await bcrypt.hash('Manager@1234', 12);
  const mgr = await prisma.user.create({
    data: {
      name: 'AMFGI Manager',
      email: 'manager@amfgi.com',
      password: mgrHash,
      isSuperAdmin: false,
      isActive: true,
      activeCompanyId: amfgi.id,
      companyAccess: {
        create: {
          companyId: amfgi.id,
          roleId: managerRole.id,
        },
      },
    },
  });
  console.log(`  ✓ AMFGI Manager: ${mgr.email}`);

  // AMFGI Store Keeper
  const skHash = await bcrypt.hash('Store@1234', 12);
  const sk = await prisma.user.create({
    data: {
      name: 'AMFGI Store Keeper',
      email: 'storekeeper@amfgi.com',
      password: skHash,
      isSuperAdmin: false,
      isActive: true,
      activeCompanyId: amfgi.id,
      companyAccess: {
        create: {
          companyId: amfgi.id,
          roleId: skRole.id,
        },
      },
    },
  });
  console.log(`  ✓ Store Keeper: ${sk.email}`);

  // ── Seed company data ───────────────────────────────────────────────────────
  await seedCompanyData(
    amfgi.id,
    'AMFGI',
    [
      {
        name: 'Fiberglass Mat 300gsm',
        description: 'High-quality fiberglass reinforcement mat',
        unit: 'kg',
        category: 'Reinforcement',
        warehouse: 'Main Warehouse',
        stockType: 'Raw Material',
        externalItemName: 'FGB-MAT-300',
        currentStock: 500,
        unitCost: 150,
        reorderLevel: 100,
      },
      {
        name: 'Unsaturated Polyester Resin',
        description: 'General-purpose polyester resin for composites',
        unit: 'kg',
        category: 'Resin',
        warehouse: 'Main Warehouse',
        stockType: 'Raw Material',
        externalItemName: 'RES-UPE-STD',
        currentStock: 1000,
        unitCost: 200,
        reorderLevel: 200,
      },
      {
        name: 'MEKP Catalyst',
        description: 'Methyl ethyl ketone peroxide catalyst',
        unit: 'liter',
        category: 'Catalyst',
        warehouse: 'Chemical Store',
        stockType: 'Consumable',
        externalItemName: 'CAT-MEKP-01',
        currentStock: 50,
        unitCost: 500,
        reorderLevel: 20,
      },
      {
        name: 'Gelcoat White',
        description: 'White polyester gelcoat for finish coating',
        unit: 'kg',
        category: 'Coating',
        warehouse: 'Main Warehouse',
        stockType: 'Raw Material',
        externalItemName: 'GEL-WH-001',
        currentStock: 200,
        unitCost: 350,
        reorderLevel: 50,
      },
      {
        name: 'Acetone',
        description: 'Acetone solvent for cleaning',
        unit: 'liter',
        category: 'Solvent',
        warehouse: 'Chemical Store',
        stockType: 'Consumable',
        externalItemName: 'SOL-ACE-001',
        currentStock: 100,
        unitCost: 100,
        reorderLevel: 30,
      },
    ],
    [
      {
        name: 'Gulf Marine LLC',
        phone: '+971 50 123 4567',
        email: 'sales@gulfmarine.ae',
      },
      {
        name: 'Abu Dhabi Ports',
        phone: '+971 2 500 0000',
        email: 'procurement@adports.ae',
      },
    ],
    [
      { name: 'Gulf Chemical Supply', contactPerson: 'Ali Ahmed', phone: '+971 4 555 6666', city: 'Dubai' },
      { name: 'Polymer Industries', contactPerson: 'Hassan Khan', phone: '+971 2 666 7777', city: 'Abu Dhabi' },
    ],
    [
      {
        jobNumber: 'JOB-2024-001',
        description: 'Fiberglass tank fabrication',
        site: 'Jebel Ali Port',
        variations: [
          { suffix: 'v1', description: 'Phase 1 - Foundation and base structure' },
          { suffix: 'v2', description: 'Phase 2 - Walls and reinforcement' },
          { suffix: 'v3', description: 'Phase 3 - Coating and finishing' },
        ],
      },
      {
        jobNumber: 'JOB-2024-002',
        description: 'Marine hull repair',
        site: 'Mina Rashid',
        variations: [
          { suffix: 'assessment', description: 'Initial damage assessment' },
          { suffix: 'repair', description: 'Repair and restoration work' },
        ],
      },
    ]
  );

  await seedCompanyData(
    km.id,
    'K&M',
    [
      {
        name: 'Steel Pipe 2"',
        description: 'Carbon steel pipe 2 inch diameter',
        unit: 'meter',
        category: 'Pipe',
        warehouse: 'Warehouse A',
        stockType: 'Raw Material',
        externalItemName: 'PIP-STL-2IN',
        currentStock: 200,
        unitCost: 45,
        reorderLevel: 50,
      },
      {
        name: 'Steel Plate 6mm',
        description: 'Mild steel plate 6mm thickness',
        unit: 'sheet',
        category: 'Plate',
        warehouse: 'Warehouse A',
        stockType: 'Raw Material',
        externalItemName: 'PL-STL-6MM',
        currentStock: 100,
        unitCost: 350,
        reorderLevel: 20,
      },
      {
        name: 'MS Angle 50x50',
        description: 'Mild steel angle bar 50x50mm',
        unit: 'meter',
        category: 'Structural',
        warehouse: 'Warehouse A',
        stockType: 'Raw Material',
        externalItemName: 'ANG-50-50',
        currentStock: 300,
        unitCost: 38,
        reorderLevel: 80,
      },
      {
        name: 'Welding Rods 3mm',
        description: '3mm welding electrodes for steel',
        unit: 'kg',
        category: 'Welding',
        warehouse: 'Warehouse B',
        stockType: 'Consumable',
        externalItemName: 'WELD-3MM',
        currentStock: 50,
        unitCost: 120,
        reorderLevel: 15,
      },
    ],
    [
      {
        name: 'Al Fardan Exchange',
        phone: '+971 4 222 5555',
        email: 'projects@alfardan.ae',
      },
    ],
    [
      { name: 'Emirates Steel', phone: '+971 2 555 1234', email: 'sales@emiratessteel.ae', city: 'Abu Dhabi' },
      { name: 'Gulf Steel Trading', phone: '+971 4 333 4444', email: 'trade@gulfsteel.ae', city: 'Dubai' },
    ],
    [
      {
        jobNumber: 'JOB-2024-101',
        description: 'Steel structure fabrication',
        site: 'Business Bay',
        variations: [
          { suffix: 'stage1', description: 'Cutting and preparation' },
          { suffix: 'stage2', description: 'Welding and assembly' },
        ],
      },
    ]
  );

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Super Admin:   admin@almuraqib.com     / Admin@1234');
  console.log('  AMFGI Manager: manager@amfgi.com       / Manager@1234');
  console.log('  Store Keeper:  storekeeper@amfgi.com   / Store@1234');
  console.log('─────────────────────────────────────────────────────');
  console.log('\n📋 New Features:');
  console.log('  ✓ Print Template Builder - Customize delivery note layouts');
  console.log('  ✓ Company Profiles - Address, phone, email configured');
  console.log('  ✓ Default Templates - Pre-configured A4 delivery note format');
  console.log('  ✓ Sample Delivery Notes - 3 DNs per company for testing');
  console.log('  ✓ Manager Permissions - Full access to settings.manage');
  console.log('\n🚀 Next steps:');
  console.log('  1. Log in as AMFGI Manager');
  console.log('  2. Go to Settings → Print Template');
  console.log('  3. Customize the delivery note format');
  console.log('  4. Go to Dispatch to print delivery notes');
  console.log('─────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
