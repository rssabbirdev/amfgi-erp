/**
 * Seed script — Prisma MySQL version
 * Bootstraps the shared database with comprehensive test data:
 *   • Companies: AMFGI, K&M (with profiles: address, phone, email)
 *   • Company Print Templates: Delivery note + work schedule layouts ready for print builder and daily schedule printing
 *   • Roles: Admin, Manager (with settings.manage), Store Keeper (with permissions)
 *   • Users: Super Admin, AMFGI Manager, Store Keeper
 *   • Per-company: Units, Categories, Warehouses
 *   • Per-company: Materials with stock batches, logs, transactions (STOCK_IN)
 *   • Per-company: Customers, Suppliers, Jobs (with variations, contactsJson + contactPerson, LPO/quotation demo)
 *   • Companies: externalCompanyId (SEED-AMFGI / SEED-KM) for integration playground smoke tests
 *   • Per-company: Sample dispatch entries and 3+ delivery notes (STOCK_OUT)
 *   • Delivery Notes: Structured with dynamic fields for template rendering
 *   • HR Workforce: typed employee profiles (driver, office staff, hybrid, worker)
 *   • Employee self-service demo logins linked to seeded employees
 *   • Schedule notes + driver trip plan demo data
 *
 * Features:
 *   - Print template builder ready (delivery note + work schedule templates pre-configured)
 *   - Delivery note and work schedule printing with company letterhead support
 *   - FIFO stock consumption tracking with batch costing
 *   - Job variations for complex projects
 *
 * Run with: npx tsx scripts/seed.ts
 */

import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { ensureDefaultEmployeeDocumentTypes } from '../lib/hr/defaultDocumentTypes';
import { DEFAULT_EMPLOYEE_TYPE_SETTINGS } from '../lib/hr/employeeTypeSettings';
import { buildWorkforceProfileExtension, type WorkforceEmployeeType } from '../lib/hr/workforceProfile';
import { ALL_PERMISSIONS, ROLE_PRESETS } from '../lib/permissions';
import { parsePartyListDateInput } from '../lib/partyListsApi';
import { companySeedPrintTemplates } from './seed-print-templates';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set for the seed script.');
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ['error', 'warn'],
});

const MANAGER_PERMISSIONS = ROLE_PRESETS.manager;

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

/** Matches party lists API `contacts[]` shape (API-party-lists.md) */
interface PartyContactSeed {
  contact_name: string;
  email?: string | null;
  phone?: string | null;
  sort_order?: number;
}

/** Party API–aligned customer seed (plus optional AMFGI `address`) */
interface CustomerDef {
  name: string;
  email?: string | null;
  address?: string | null;
  trade_license_number?: string | null;
  trade_license_authority?: string | null;
  trade_license_expiry?: string | null;
  trn_number?: string | null;
  trn_expiry?: string | null;
  contacts?: PartyContactSeed[];
}

/** Party API–aligned supplier seed + AMFGI city/country/address */
interface SupplierDef {
  name: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  trade_license_number?: string | null;
  trade_license_authority?: string | null;
  trade_license_expiry?: string | null;
  trn_number?: string | null;
  trn_expiry?: string | null;
  contacts?: PartyContactSeed[];
}

/** Same shape as job form / PM sync `contactsJson` (label, name, number, email, designation) */
interface JobContactSeed {
  label?: string;
  name: string;
  email?: string | null;
  number?: string | null;
  designation?: string | null;
}

interface JobDef {
  jobNumber: string;
  description?: string;
  site?: string;
  /** Stored on `Job.contactPerson` (first contact name used if omitted) */
  contactPerson?: string;
  salesPerson?: string;
  address?: string;
  projectName?: string;
  projectDetails?: string;
  quotationNumber?: string;
  lpoNumber?: string;
  lpoValue?: number;
  contacts?: JobContactSeed[];
  variations?: Array<{
    suffix: string;
    description?: string;
  }>;
}

function jobContactsToJson(contacts: JobContactSeed[] | undefined): object {
  if (!contacts?.length) return [] as object;
  const rows = contacts.map((c) => {
    const o: Record<string, string> = { name: c.name.trim() };
    if (c.label?.trim()) o.label = c.label.trim();
    if (c.email?.trim()) o.email = c.email.trim();
    if (c.number?.trim()) o.number = c.number.trim();
    if (c.designation?.trim()) o.designation = c.designation.trim();
    return o;
  });
  return JSON.parse(JSON.stringify(rows)) as object;
}

function primaryJobContactPersonFromSeed(j: JobDef): string | null {
  if (j.contactPerson?.trim()) return j.contactPerson.trim();
  const first = j.contacts?.find((c) => c.name?.trim());
  return first?.name?.trim() || null;
}

function buildJobUpsertPayload(
  j: JobDef,
  customerId: string,
  extras: { parentJobId?: string | null; jobNumberOverride?: string; isVariation?: boolean }
) {
  const jobNumber = extras.jobNumberOverride ?? j.jobNumber;
  const isVar = extras.isVariation ?? false;
  const contactsJson = isVar ? jobContactsToJson(undefined) : jobContactsToJson(j.contacts);
  return {
    jobNumber,
    customerId,
    description: j.description || '',
    site: j.site ?? null,
    address: isVar ? null : j.address?.trim() || null,
    status: 'ACTIVE' as const,
    contactPerson: isVar ? null : primaryJobContactPersonFromSeed(j),
    salesPerson: isVar ? null : j.salesPerson?.trim() || null,
    contactsJson,
    projectName: isVar ? null : j.projectName?.trim() || null,
    projectDetails: isVar ? null : j.projectDetails?.trim() || null,
    quotationNumber: isVar ? null : j.quotationNumber?.trim() || null,
    lpoNumber: isVar ? null : j.lpoNumber?.trim() || null,
    lpoValue: isVar ? null : (j.lpoValue ?? null),
    parentJobId: extras.parentJobId ?? null,
    createdBy: 'System Seed',
    createdAt: new Date(),
  };
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
    const existing = await prisma.customer.findFirst({
      where: { companyId, name: c.name },
    });
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { isActive: true },
        })
      : await prisma.customer.create({
          data: (() => {
            const sorted = [...(c.contacts ?? [])].sort(
              (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
            );
            const primary = sorted[0];
            const contactsJson =
              c.contacts?.map((x, i) => ({
                contact_name: x.contact_name,
                email: x.email ?? null,
                phone: x.phone ?? null,
                sort_order: x.sort_order ?? i,
              })) ?? [];
            return {
              companyId,
              name: c.name,
              email: c.email?.trim() || null,
              address: c.address?.trim() || null,
              contactPerson: primary?.contact_name?.trim() || null,
              phone: primary?.phone?.trim() || null,
              tradeLicenseNumber: c.trade_license_number?.trim() || null,
              tradeLicenseAuthority: c.trade_license_authority?.trim() || null,
              tradeLicenseExpiry: parsePartyListDateInput(c.trade_license_expiry ?? undefined),
              trnNumber: c.trn_number?.trim() || null,
              trnExpiry: parsePartyListDateInput(c.trn_expiry ?? undefined),
              contactsJson:
                contactsJson.length > 0
                  ? (JSON.parse(JSON.stringify(contactsJson)) as object)
                  : undefined,
              isActive: true,
              source: 'LOCAL' as const,
              externalPartyId: null,
            };
          })(),
        });
    if (!firstCustomerId) firstCustomerId = customer.id;
  }

  // Create units
  const unitNames = new Set<string>();
  materials.forEach((m) => unitNames.add(m.unit));
  if (companyName === 'AMFGI') {
    unitNames.add('drum');
    unitNames.add('pallet');
  }

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

  // Material UOM: base row per material + AMFGI Acetone drum/pallet demo chain
  for (const m of materials) {
    const mid = createdMaterials[m.name];
    const unitRow = await prisma.unit.findUnique({
      where: { companyId_name: { companyId, name: m.unit } },
    });
    if (mid && unitRow) {
      const hasBase = await prisma.materialUom.findFirst({
        where: { materialId: mid, isBase: true },
      });
      if (!hasBase) {
        await prisma.materialUom.create({
          data: {
            companyId,
            materialId: mid,
            unitId: unitRow.id,
            isBase: true,
            parentUomId: null,
            factorToParent: 1,
          },
        });
      }
    }
  }

  if (companyName === 'AMFGI') {
    const acetoneId = createdMaterials['Acetone'];
    if (acetoneId) {
      const base = await prisma.materialUom.findFirst({
        where: { materialId: acetoneId, isBase: true },
      });
      const drumU = await prisma.unit.findUnique({
        where: { companyId_name: { companyId, name: 'drum' } },
      });
      const palletU = await prisma.unit.findUnique({
        where: { companyId_name: { companyId, name: 'pallet' } },
      });
      if (base && drumU && palletU) {
        const existingDrum = await prisma.materialUom.findFirst({
          where: { materialId: acetoneId, unitId: drumU.id },
        });
        if (!existingDrum) {
          const drum = await prisma.materialUom.create({
            data: {
              companyId,
              materialId: acetoneId,
              unitId: drumU.id,
              isBase: false,
              parentUomId: base.id,
              factorToParent: 190,
            },
          });
          await prisma.materialUom.create({
            data: {
              companyId,
              materialId: acetoneId,
              unitId: palletU.id,
              isBase: false,
              parentUomId: drum.id,
              factorToParent: 6,
            },
          });
        }
      }
    }
  }

  // Create suppliers
  for (const s of suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { companyId, name: s.name },
    });
    if (existing) {
      await prisma.supplier.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    } else {
      await prisma.supplier.create({
        data: (() => {
          const sorted = [...(s.contacts ?? [])].sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          );
          const primary = sorted[0];
          const contactsJson =
            s.contacts?.map((x, i) => ({
              contact_name: x.contact_name,
              email: x.email ?? null,
              phone: x.phone ?? null,
              sort_order: x.sort_order ?? i,
            })) ?? [];
          return {
            companyId,
            name: s.name,
            email: s.email?.trim() || null,
            address: s.address?.trim() || null,
            city: s.city?.trim() || null,
            country: s.country?.trim() || null,
            contactPerson: primary?.contact_name?.trim() || null,
            phone: primary?.phone?.trim() || null,
            tradeLicenseNumber: s.trade_license_number?.trim() || null,
            tradeLicenseAuthority: s.trade_license_authority?.trim() || null,
            tradeLicenseExpiry: parsePartyListDateInput(s.trade_license_expiry ?? undefined),
            trnNumber: s.trn_number?.trim() || null,
            trnExpiry: parsePartyListDateInput(s.trn_expiry ?? undefined),
            contactsJson:
              contactsJson.length > 0
                ? (JSON.parse(JSON.stringify(contactsJson)) as object)
                : undefined,
            isActive: true,
            source: 'LOCAL' as const,
            externalPartyId: null,
          };
        })(),
      });
    }
  }

  // Create jobs with variations (if customer exists)
  let firstJobId: string | null = null;
  if (firstCustomerId) {
    for (const j of jobs) {
      const mainPayload = buildJobUpsertPayload(j, firstCustomerId, {});
      const mainJob = await prisma.job.upsert({
        where: { companyId_jobNumber: { companyId, jobNumber: j.jobNumber } },
        update: {
          status: 'ACTIVE',
          description: mainPayload.description,
          site: mainPayload.site,
          address: mainPayload.address,
          contactPerson: mainPayload.contactPerson,
          salesPerson: mainPayload.salesPerson,
          contactsJson: mainPayload.contactsJson,
          projectName: mainPayload.projectName,
          projectDetails: mainPayload.projectDetails,
          quotationNumber: mainPayload.quotationNumber,
          lpoNumber: mainPayload.lpoNumber,
          lpoValue: mainPayload.lpoValue,
        },
        create: {
          companyId,
          ...mainPayload,
        },
      });

      if (!firstJobId) firstJobId = mainJob.id;

      // Create variations if specified
      if (j.variations && j.variations.length > 0) {
        for (const variation of j.variations) {
          const variationNumber = `${j.jobNumber}-${variation.suffix}`;
          const varPayload = buildJobUpsertPayload(
            {
              ...j,
              description: variation.description || `${j.description} - ${variation.suffix}`,
            },
            firstCustomerId,
            {
              jobNumberOverride: variationNumber,
              parentJobId: mainJob.id,
              isVariation: true,
            }
          );
          await prisma.job.upsert({
            where: { companyId_jobNumber: { companyId, jobNumber: variationNumber } },
            update: {
              status: 'ACTIVE',
              description: varPayload.description,
              site: varPayload.site,
              parentJobId: mainJob.id,
            },
            create: {
              companyId,
              ...varPayload,
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

      const seedContactName =
        jobs[0]?.contactPerson?.trim() ||
        jobs[0]?.contacts?.find((c) => c.name?.trim())?.name?.trim() ||
        '';
      let dnNotes = `--- DELIVERY NOTE #${dnNum}`;
      if (seedContactName) {
        dnNotes += `\n--- DELIVERY CONTACT PERSON: ${seedContactName}`;
      }
      dnNotes += `\n--- DELIVERY NOTE ITEMS (For Printing) ---\n`;

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

function atTime(dateOnly: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return new Date(
    dateOnly.getFullYear(),
    dateOnly.getMonth(),
    dateOnly.getDate(),
    Number.isFinite(h) ? h : 0,
    Number.isFinite(m) ? m : 0,
    0,
    0
  );
}

function isMissingWorkScheduleNotesColumn(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2022' &&
    String(error.meta?.column ?? '').toLowerCase().includes('notes')
  );
}

async function upsertWorkScheduleCompat(args: {
  companyId: string;
  workDate: Date;
  title: string;
  notes: string | null;
  createdById: string;
}) {
  const withNotes = {
    where: { companyId_workDate: { companyId: args.companyId, workDate: args.workDate } },
    update: {
      title: args.title,
      notes: args.notes,
      status: 'PUBLISHED' as const,
      publishedAt: new Date(),
      createdById: args.createdById,
    },
    create: {
      companyId: args.companyId,
      workDate: args.workDate,
      title: args.title,
      notes: args.notes,
      status: 'PUBLISHED' as const,
      publishedAt: new Date(),
      createdById: args.createdById,
    },
  };

  try {
    return await prisma.workSchedule.upsert(withNotes as never);
  } catch (error) {
    if (!isMissingWorkScheduleNotesColumn(error)) throw error;
    const existingRows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM WorkSchedule
      WHERE companyId = ${args.companyId} AND workDate = ${args.workDate}
      LIMIT 1
    `;
    const publishedAt = new Date();

    if (existingRows[0]?.id) {
      await prisma.$executeRaw`
        UPDATE WorkSchedule
        SET
          title = ${args.title},
          status = ${'PUBLISHED'},
          publishedAt = ${publishedAt},
          createdById = ${args.createdById},
          updatedAt = NOW()
        WHERE id = ${existingRows[0].id}
      `;
      return { id: existingRows[0].id };
    }

    const scheduleId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO WorkSchedule (
        id,
        companyId,
        workDate,
        title,
        status,
        publishedAt,
        createdById,
        createdAt,
        updatedAt
      )
      VALUES (
        ${scheduleId},
        ${args.companyId},
        ${args.workDate},
        ${args.title},
        ${'PUBLISHED'},
        ${publishedAt},
        ${args.createdById},
        NOW(),
        NOW()
      )
    `;

    return { id: scheduleId };
  }
}

async function seedHrWorkforceDemo(
  companyId: string,
  createdById: string,
  employeeSelfRoleId: string,
  emailDomain: string,
) {
  console.log('\nSeeding HR workforce demo data…');

  const employeeTypeSequence: WorkforceEmployeeType[] = [
    'DRIVER', 'DRIVER', 'DRIVER', 'DRIVER', 'DRIVER', 'DRIVER',
    'OFFICE_STAFF', 'OFFICE_STAFF', 'OFFICE_STAFF', 'OFFICE_STAFF', 'OFFICE_STAFF', 'OFFICE_STAFF',
    'HYBRID_STAFF', 'HYBRID_STAFF', 'HYBRID_STAFF', 'HYBRID_STAFF', 'HYBRID_STAFF', 'HYBRID_STAFF',
    'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER',
    'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER', 'LABOUR_WORKER',
  ];
  const firstNames = [
    'Ahmed', 'Ali', 'Hassan', 'Omar', 'Yousef', 'Khalid', 'Nasser', 'Saeed', 'Salman', 'Fahad',
    'Rahim', 'Karim', 'Imran', 'Bilal', 'Tariq', 'Javed', 'Rashid', 'Majid', 'Amir', 'Farhan',
    'Sameer', 'Hamza', 'Irfan', 'Shahid', 'Nawaz', 'Rehan', 'Anas', 'Waqar', 'Adnan', 'Sajid',
  ];
  const lastNames = [
    'Khan', 'Hussain', 'Rahman', 'Qureshi', 'Ansari', 'Iqbal', 'Shaikh', 'Mirza', 'Nadeem', 'Saleem',
  ];

  for (let i = 1; i <= 30; i++) {
    const f = firstNames[(i - 1) % firstNames.length];
    const l = lastNames[(i - 1) % lastNames.length];
    const fullName = `${f} ${l}`;
    const preferredName = f;
    const code = `EMP${String(i).padStart(3, '0')}`;
    const employeeType = employeeTypeSequence[i - 1] ?? 'LABOUR_WORKER';
    const designation =
      employeeType === 'DRIVER'
        ? 'Driver'
        : employeeType === 'OFFICE_STAFF'
          ? 'Office Staff'
          : employeeType === 'HYBRID_STAFF'
            ? 'Hybrid Staff'
            : i % 5 === 0
              ? 'Team Lead'
              : i % 2 === 0
                ? 'Skilled Worker'
                : 'Worker';
    const department =
      employeeType === 'DRIVER'
        ? 'Transport'
        : employeeType === 'OFFICE_STAFF'
          ? 'Administration'
          : employeeType === 'HYBRID_STAFF'
            ? 'Operations'
            : i % 3 === 0
              ? 'Lamination'
              : i % 3 === 1
                ? 'Production'
                : 'Site Ops';
    const expertises =
      employeeType === 'DRIVER'
        ? ['Driving']
        : employeeType === 'OFFICE_STAFF'
          ? ['Quality Inspection']
          : employeeType === 'HYBRID_STAFF'
            ? ['Installation', 'Quality Inspection']
            : i % 4 === 0
              ? ['Lamination', 'Assembly']
              : i % 4 === 1
                ? ['Moulding', 'Finishing']
                : i % 4 === 2
                  ? ['Gelcoat', 'Assembly']
                  : ['Installation', 'Scaffolding'];
    await prisma.employee.upsert({
      where: { companyId_employeeCode: { companyId, employeeCode: code } },
      update: {
        fullName,
        preferredName,
        department,
        designation,
        status: 'ACTIVE',
        profileExtension: buildWorkforceProfileExtension({
          employeeType,
          visaHolding: i % 7 === 0 ? 'SELF_OWN' : i % 11 === 0 ? 'NO_VISA' : 'COMPANY_PROVIDED',
          expertises,
        }) as Prisma.InputJsonValue,
      },
      create: {
        companyId,
        employeeCode: code,
        fullName,
        preferredName,
        email: `employee${i}@${emailDomain}`,
        phone: `+97150000${String(i).padStart(4, '0')}`,
        department,
        designation,
        employmentType: 'Full-time',
        hireDate: new Date(2024, (i % 12), ((i % 27) + 1)),
        status: 'ACTIVE',
        portalEnabled: i <= 8,
        nationality: i % 5 === 0 ? 'India' : i % 5 === 1 ? 'Pakistan' : i % 5 === 2 ? 'Bangladesh' : i % 5 === 3 ? 'Nepal' : 'UAE',
        profileExtension: buildWorkforceProfileExtension({
          employeeType,
          visaHolding: i % 7 === 0 ? 'SELF_OWN' : i % 11 === 0 ? 'NO_VISA' : 'COMPANY_PROVIDED',
          expertises,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  const employees = await prisma.employee.findMany({
    where: { companyId, status: 'ACTIVE' },
    orderBy: { employeeCode: 'asc' },
    take: 30,
  });
  const drivers = employees.filter((employee) => {
    const workforce = (employee.profileExtension as Record<string, unknown> | null)?.workforce as Record<string, unknown> | undefined;
    return String(workforce?.employeeType ?? '').toUpperCase() === 'DRIVER';
  });
  const schedulableEmployees = employees.filter((employee) => {
    const workforce = (employee.profileExtension as Record<string, unknown> | null)?.workforce as Record<string, unknown> | undefined;
    const employeeType = String(workforce?.employeeType ?? '').toUpperCase();
    return employeeType === 'LABOUR_WORKER' || employeeType === 'HYBRID_STAFF';
  });
  const jobs = await prisma.job.findMany({
    where: { companyId, status: 'ACTIVE' },
    orderBy: { jobNumber: 'asc' },
    take: 8,
  });
  if (!jobs.length || !employees.length) {
    console.log('  ! Skipped schedule/attendance demo (missing jobs/employees)');
    return;
  }

  const portalEmployees = employees.filter((employee) => employee.portalEnabled).slice(0, 4);
  const employeePortalHash = await bcrypt.hash('Employee@1234', 12);
  for (const employee of portalEmployees) {
    const email = `me.${employee.employeeCode.toLowerCase()}@${emailDomain}`;
    await prisma.user.upsert({
      where: { email },
      update: {
        name: employee.preferredName || employee.fullName,
        password: employeePortalHash,
        isSuperAdmin: false,
        isActive: true,
        activeCompanyId: companyId,
        linkedEmployeeId: employee.id,
      },
      create: {
        name: employee.preferredName || employee.fullName,
        email,
        password: employeePortalHash,
        isSuperAdmin: false,
        isActive: true,
        activeCompanyId: companyId,
        linkedEmployeeId: employee.id,
        companyAccess: {
          create: {
            companyId,
            roleId: employeeSelfRoleId,
          },
        },
      },
    });
  }

  // Create several published schedules (recent 6 days)
  for (let day = 0; day < 6; day++) {
    const workDate = new Date();
    workDate.setDate(workDate.getDate() - day);
    workDate.setHours(0, 0, 0, 0);

    const schedule = await upsertWorkScheduleCompat({
      companyId,
      workDate,
      title: `Daily Workforce Plan D-${day}`,
      notes:
        day % 2 === 0
          ? 'General notes: prioritize site safety briefing before deployment.'
          : 'General notes: align transport and factory dispatch before 8 AM.',
      createdById,
    });

    // Refresh assignment/attendance for deterministic seed
    await prisma.attendanceEntry.deleteMany({
      where: { companyId, workDate },
    });
    await prisma.workAssignment.deleteMany({
      where: { workScheduleId: schedule.id },
    });

    const groupSize = 6;
    const assignmentMap = new Map<string, string>();

    for (let g = 0; g < 5; g++) {
      const start = g * groupSize;
      const teamMembers = schedulableEmployees.slice(start, start + groupSize);
      if (!teamMembers.length) continue;
      const dayDrivers = drivers.slice(g % Math.max(drivers.length, 1), (g % Math.max(drivers.length, 1)) + 2);
      const driver1 = dayDrivers[0] ?? null;
      const driver2 = dayDrivers[1] ?? null;

      const job = jobs[g % jobs.length];
      const isFactory = g % 2 === 1;
      const dutyStart = g % 2 === 0 ? '08:00' : '08:30';
      const dutyEnd = g % 2 === 0 ? '17:00' : '17:30';
      const brk = g % 2 === 0 ? '12:00 - 12:30' : '12:30 - 13:00';

      const assignment = await prisma.workAssignment.create({
        data: {
          workScheduleId: schedule.id,
          columnIndex: g + 1,
          label: `Team#${g + 1}`,
          locationType: isFactory ? 'FACTORY' : 'SITE_JOB',
          jobId: job.id,
          factoryCode: isFactory ? job.jobNumber : null,
          factoryLabel: isFactory ? 'Factory Line' : null,
          jobNumberSnapshot: job.jobNumber,
          teamLeaderEmployeeId: teamMembers[0]?.id ?? null,
          driver1EmployeeId: driver1?.id ?? null,
          driver2EmployeeId: driver2?.id ?? null,
          shiftStart: dutyStart,
          shiftEnd: dutyEnd,
          breakWindow: brk,
          targetQty: isFactory ? 120 + g * 15 : 8 + g * 2,
          unit: isFactory ? 'pcs' : 'jobs',
          remarks: isFactory ? 'Factory batch production' : 'Site deployment',
        },
      });

      for (let m = 0; m < teamMembers.length; m++) {
        const emp = teamMembers[m];
        await prisma.workAssignmentMember.create({
          data: {
            workAssignmentId: assignment.id,
            employeeId: emp.id,
            role: m === 0 ? 'TEAM_LEADER' : 'WORKER',
            slot: m + 1,
          },
        });
        assignmentMap.set(emp.id, assignment.id);
      }

      if (driver1) {
        await prisma.driverRunLog.create({
          data: {
            workScheduleId: schedule.id,
            driverEmployeeId: driver1.id,
            routeText: isFactory ? `Trip 1 - Factory line support for ${job.jobNumber}` : `Trip 1 - Site team drop for ${job.jobNumber}`,
            sequence: g * 2,
          },
        });
      }
      if (driver2) {
        await prisma.driverRunLog.create({
          data: {
            workScheduleId: schedule.id,
            driverEmployeeId: driver2.id,
            routeText: isFactory ? `Trip 2 - Material shuttle for ${job.jobNumber}` : `Trip 2 - Recovery / standby for ${job.jobNumber}`,
            sequence: g * 2 + 1,
          },
        });
      }
    }

    for (let i = 0; i < schedulableEmployees.length; i++) {
      const emp = schedulableEmployees[i];
      const assignmentId = assignmentMap.get(emp.id) ?? null;
      const absent = (i + day) % 11 === 0;
      const halfDay = !absent && (i + day) % 13 === 0;
      const checkIn = absent ? null : atTime(workDate, halfDay ? '09:30' : '08:00');
      const checkOut = absent ? null : atTime(workDate, halfDay ? '13:00' : '17:00');
      await prisma.attendanceEntry.createMany({
        data: [
          {
            companyId,
            employeeId: emp.id,
            workDate,
            workAssignmentId: assignmentId,
            expectedShiftStart: atTime(workDate, '08:00'),
            expectedShiftEnd: atTime(workDate, '17:00'),
            checkInAt: checkIn,
            checkOutAt: checkOut,
            status: absent ? 'ABSENT' : halfDay ? 'HALF_DAY' : 'PRESENT',
            workflowStatus: 'APPROVED',
            source: 'SCHEDULE_BOILERPLATE',
            lateMinutes: absent ? 0 : halfDay ? 30 : 0,
            earlyLeaveMinutes: absent ? 0 : halfDay ? 240 : 0,
            overtimeMinutes: absent ? 0 : i % 7 === 0 ? 30 : 0,
            approvedById: createdById,
            approvedAt: new Date(),
          },
        ],
      });
    }
  }

  console.log('  ✓ 30 employees seeded with workforce profiles');
  console.log('    - 6 drivers');
  console.log('    - 6 office staff');
  console.log('    - 6 hybrid staff');
  console.log('    - 12 labour / worker');
  console.log('  ✓ 4 employee self-service logins linked to employees');
  console.log('  ✓ 6 schedules with schedule-level notes and driver trip logs');
  console.log('  ✓ Attendance entries generated for schedulable employees');
}

async function seed() {
  console.log('🌱 Starting Prisma seed…\n');

  // ── Delete old data (clean slate) ────────────────────────────────────────────
  console.log('Clearing old data…');
  await prisma.user.updateMany({ data: { linkedEmployeeId: null } });
  await prisma.attendanceEntry.deleteMany({});
  await prisma.workAssignmentMember.deleteMany({});
  await prisma.driverRunLog.deleteMany({});
  await prisma.scheduleAbsence.deleteMany({});
  await prisma.workAssignment.deleteMany({});
  await prisma.workSchedule.deleteMany({});
  await prisma.employeeDocument.deleteMany({});
  await prisma.visaPeriod.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.employeeDocumentType.deleteMany({});
  await prisma.transactionBatch.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.priceLog.deleteMany({});
  await prisma.materialLog.deleteMany({});
  await prisma.materialUom.updateMany({ data: { parentUomId: null } });
  await prisma.materialUom.deleteMany({});
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

  const amfgi = await prisma.company.create({
    data: {
      name: 'Almuraqib Fiber Glass Industry LLC',
      slug: 'amfgi',
      externalCompanyId: 'SEED-AMFGI',
      jobSourceMode: 'HYBRID',
      description: 'Fiberglass fabrication and moulding',
      address: 'P.O. Box 123456, Dubai, UAE\nJebel Ali Industrial Area 1\nDubai, United Arab Emirates',
      phone: '+971 4 885 1234',
      email: 'info@almuraqib.ae',
      isActive: true,
      hrEmployeeTypeSettings: DEFAULT_EMPLOYEE_TYPE_SETTINGS as unknown as Prisma.InputJsonValue,
      printTemplates: companySeedPrintTemplates as unknown as Prisma.InputJsonValue,
    },
  });

  const km = await prisma.company.create({
    data: {
      name: 'K&M Industries',
      slug: 'km',
      externalCompanyId: 'SEED-KM',
      jobSourceMode: 'HYBRID',
      description: 'Steel fabrication and structural work',
      address: 'P.O. Box 654321, Abu Dhabi, UAE\nIndustrial Zone 3\nAbu Dhabi, United Arab Emirates',
      phone: '+971 2 555 8888',
      email: 'info@kandm.ae',
      isActive: true,
      hrEmployeeTypeSettings: DEFAULT_EMPLOYEE_TYPE_SETTINGS as unknown as Prisma.InputJsonValue,
      printTemplates: companySeedPrintTemplates as unknown as Prisma.InputJsonValue,
    },
  });

  console.log(`  ✓ ${amfgi.name}`);
  console.log(`  ✓ ${km.name}`);

  await ensureDefaultEmployeeDocumentTypes(prisma, amfgi.id);
  await ensureDefaultEmployeeDocumentTypes(prisma, km.id);
  console.log('  ✓ Default HR document types (both companies)');

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

  const employeeSelfRole = await prisma.role.create({
    data: {
      name: 'Employee (self-service)',
      slug: 'employee-self',
      permissions: [
        'self.employee.view',
        'self.employee.documents',
        'self.employee.schedule',
        'self.employee.attendance',
      ],
      isSystem: true,
    },
  });

  console.log(`  ✓ ${adminRole.name}`);
  console.log(`  ✓ ${managerRole.name}`);
  console.log(`  ✓ ${skRole.name}`);
  console.log(`  ✓ ${employeeSelfRole.name}`);

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

  const kmMgr = await prisma.user.create({
    data: {
      name: 'K&M Manager',
      email: 'manager@kandm.com',
      password: mgrHash,
      isSuperAdmin: false,
      isActive: true,
      activeCompanyId: km.id,
      companyAccess: {
        create: {
          companyId: km.id,
          roleId: managerRole.id,
        },
      },
    },
  });
  console.log(`  ✓ K&M Manager: ${kmMgr.email}`);

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
        description: 'Acetone solvent for cleaning (demo UOM: kg base, drum=190 kg, pallet=6 drums)',
        unit: 'kg',
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
        email: 'sales@gulfmarine.ae',
        trade_license_number: 'TL-784512',
        trade_license_authority: 'DED Dubai',
        trade_license_expiry: '2027-06-30',
        trn_number: 'TRN-100200300',
        trn_expiry: '2028-01-15',
        contacts: [
          {
            contact_name: 'Operations Desk',
            email: 'ops@gulfmarine.ae',
            phone: '+971 50 123 4567',
            sort_order: 0,
          },
        ],
      },
      {
        name: 'Abu Dhabi Ports',
        email: 'procurement@adports.ae',
        trade_license_number: 'TL-991122',
        trade_license_authority: 'ADGM',
        contacts: [
          {
            contact_name: 'Procurement',
            email: 'procurement@adports.ae',
            phone: '+971 2 500 0000',
            sort_order: 0,
          },
        ],
      },
    ],
    [
      {
        name: 'Gulf Chemical Supply',
        city: 'Dubai',
        trade_license_number: 'TL-CHEM-01',
        contacts: [
          { contact_name: 'Ali Ahmed', phone: '+971 4 555 6666', sort_order: 0 },
        ],
      },
      {
        name: 'Polymer Industries',
        city: 'Abu Dhabi',
        contacts: [
          { contact_name: 'Hassan Khan', phone: '+971 2 666 7777', sort_order: 0 },
        ],
      },
    ],
    [
      {
        jobNumber: 'JOB-2024-001',
        description: 'Fiberglass tank fabrication',
        site: 'Jebel Ali Port',
        address: 'Gate 4, Jebel Ali Free Zone South',
        projectName: 'Gulf Marine Tank Retrofit',
        projectDetails: 'Multi-phase fabrication; see variations for scope splits.',
        quotationNumber: 'QTN-SEED-AMFGI-001',
        lpoNumber: 'LPO-SEED-AMFGI-001',
        lpoValue: 485_000,
        contactPerson: 'Ahmed Al-Mazrouei',
        salesPerson: 'Omar Hassan',
        contacts: [
          {
            label: 'site',
            name: 'Ahmed Al-Mazrouei',
            number: '+971 50 111 2233',
            email: 'ahmed.site@example.com',
            designation: 'Site Supervisor',
          },
          {
            label: 'billing',
            name: 'Sara Khalil',
            email: 'billing@gulfmarine.ae',
            designation: 'Accounts',
          },
        ],
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
        quotationNumber: 'QTN-SEED-AMFGI-002',
        lpoNumber: 'LPO-SEED-AMFGI-002',
        lpoValue: 128_000,
        contactPerson: 'James Porter',
        salesPerson: 'Layla Ahmad',
        contacts: [
          {
            label: 'site',
            name: 'James Porter',
            number: '+971 55 000 1001',
            email: 'j.porter@example.com',
            designation: 'Vessel liaison',
          },
        ],
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
        email: 'projects@alfardan.ae',
        trade_license_number: 'TL-FDX-4400',
        contacts: [
          { contact_name: 'Projects', email: 'projects@alfardan.ae', phone: '+971 4 222 5555', sort_order: 0 },
        ],
      },
    ],
    [
      {
        name: 'Emirates Steel',
        email: 'sales@emiratessteel.ae',
        city: 'Abu Dhabi',
        trade_license_number: 'TL-ES-2001',
        contacts: [
          {
            contact_name: 'Sales',
            email: 'sales@emiratessteel.ae',
            phone: '+971 2 555 1234',
            sort_order: 0,
          },
        ],
      },
      {
        name: 'Gulf Steel Trading',
        email: 'trade@gulfsteel.ae',
        city: 'Dubai',
        contacts: [
          {
            contact_name: 'Trading Desk',
            email: 'trade@gulfsteel.ae',
            phone: '+971 4 333 4444',
            sort_order: 0,
          },
        ],
      },
    ],
    [
      {
        jobNumber: 'JOB-2024-101',
        description: 'Steel structure fabrication',
        site: 'Business Bay',
        address: 'Bay Square, Building 12',
        projectName: 'Al Fardan canopy works',
        quotationNumber: 'QTN-SEED-KM-101',
        lpoNumber: 'LPO-SEED-KM-101',
        lpoValue: 310_000,
        contactPerson: 'Faisal Rahman',
        salesPerson: 'Nadia Saleh',
        contacts: [
          {
            label: 'site',
            name: 'Faisal Rahman',
            number: '+971 52 444 8899',
            email: 'f.rahman@example.com',
            designation: 'Project Engineer',
          },
          {
            label: 'PMC',
            name: 'Rita Dsouza',
            number: '+971 4 201 0000',
            designation: 'Clerk of works',
          },
        ],
        variations: [
          { suffix: 'stage1', description: 'Cutting and preparation' },
          { suffix: 'stage2', description: 'Welding and assembly' },
        ],
      },
    ]
  );

  // HR demo data for workforce module (both companies)
  await seedHrWorkforceDemo(amfgi.id, mgr.id, employeeSelfRole.id, 'amfgi.com');
  await seedHrWorkforceDemo(km.id, kmMgr.id, employeeSelfRole.id, 'kandm.com');

  console.log('\n✅ Seed complete!');
  console.log('─────────────────────────────────────────────────────');
  console.log('Login credentials:');
  console.log('  Super Admin:   admin@almuraqib.com     / Admin@1234');
  console.log('  AMFGI Manager: manager@amfgi.com       / Manager@1234');
  console.log('  K&M Manager:   manager@kandm.com       / Manager@1234');
  console.log('  Store Keeper:  storekeeper@amfgi.com   / Store@1234');
  console.log('  Employee Demo: me.emp001@amfgi.com     / Employee@1234');
  console.log('─────────────────────────────────────────────────────');
  console.log('\n📋 New Features:');
  console.log('  ✓ Print Template Builder - Customize delivery note and work schedule layouts');
  console.log('  ✓ Company Profiles - Address, phone, email configured');
  console.log('  ✓ Print templates - Delivery note set plus 3 seeded schedule print formats per company');
  console.log('  ✓ Sample Delivery Notes - 3 DNs per company for testing');
  console.log('  ✓ Schedule printing - Landscape A4 work schedule formats ready for Print / Download');
  console.log('  ✓ Workforce employee types - Driver, Office Staff, Hybrid Staff, Labour / Worker');
  console.log('  ✓ Employee self-service - Linked portal users seeded for /me profile and attendance');
  console.log('  ✓ Schedule notes + driver trips - Ready for schedule page and print builder fields');
  console.log('  ✓ Manager Permissions - Full access to settings.manage');
  console.log('\n🚀 Next steps:');
  console.log('  1. Log in as AMFGI Manager');
  console.log('  2. Go to Settings → Print Template');
  console.log('  3. Review the seeded delivery note and work schedule formats');
  console.log('  4. Go to HR → Schedule or Dispatch to print with those templates');
  console.log('─────────────────────────────────────────────────────');

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
