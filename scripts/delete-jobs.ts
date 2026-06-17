import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createPostgresAdapter } from '../lib/db/postgresAdapter';
import { resolveDatabaseUrlForScripts } from '../lib/db/resolveDatabaseUrl';

const databaseUrl = resolveDatabaseUrlForScripts('seed');

const prisma = new PrismaClient({
  adapter: createPostgresAdapter(databaseUrl),
  log: ['error', 'warn'],
});

async function seed() {
  console.log('🌱 Starting Prisma seed…\n');

  // ── Delete old data (clean slate) ────────────────────────────────────────────
  console.log('Clearing old data…');
 
  
  // await prisma.stockBatch.updateMany({ data: { businessDocumentId: null } });
  // await prisma.transaction.updateMany({ data: { businessDocumentId: null } });
  // await prisma.materialAssemblyComponent.deleteMany({});
  // await prisma.stockCountSessionRevision.deleteMany({});
  // await prisma.stockCountSessionLine.deleteMany({});
  // await prisma.stockCountSession.deleteMany({});
  // await prisma.stockExceptionApproval.deleteMany({});
  // await prisma.transactionBatch.deleteMany({});
  // await prisma.transaction.deleteMany({});
  // await prisma.deliveryNote.deleteMany({});
  // await prisma.priceLog.deleteMany({});
  // await prisma.materialLog.deleteMany({});
  // await prisma.materialUom.updateMany({ data: { parentUomId: null } });
  // await prisma.materialUom.deleteMany({});
  // await prisma.stockBatch.deleteMany({});
  // await prisma.materialWarehouseStock.deleteMany({});
  // await prisma.material.deleteMany({});
  // await prisma.category.deleteMany({});
  // await prisma.unit.deleteMany({});
  await prisma.employee.deleteMany({});

}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
