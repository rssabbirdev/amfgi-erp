import type { PrismaClient } from '@prisma/client';

const DEFAULT_TYPES: Array<{
  name: string;
  slug: string;
  requiresVisaPeriod: boolean;
  requiresExpiry: boolean;
  defaultAlertDaysBeforeExpiry: number;
  sortOrder: number;
}> = [
  { name: 'Passport', slug: 'passport', requiresVisaPeriod: false, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 60, sortOrder: 10 },
  { name: 'Emirates ID', slug: 'emirates-id', requiresVisaPeriod: false, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 30, sortOrder: 20 },
  { name: 'Residence Visa', slug: 'residence-visa', requiresVisaPeriod: true, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 30, sortOrder: 30 },
  { name: 'Medical Insurance', slug: 'medical-insurance', requiresVisaPeriod: false, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 30, sortOrder: 40 },
  { name: 'Driving Licence', slug: 'driving-licence', requiresVisaPeriod: false, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 30, sortOrder: 50 },
  { name: 'Labour Card / Work Permit', slug: 'labour-card', requiresVisaPeriod: true, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 30, sortOrder: 60 },
  { name: 'Tenancy', slug: 'tenancy', requiresVisaPeriod: false, requiresExpiry: true, defaultAlertDaysBeforeExpiry: 30, sortOrder: 70 },
  { name: 'Other', slug: 'other', requiresVisaPeriod: false, requiresExpiry: false, defaultAlertDaysBeforeExpiry: 30, sortOrder: 999 },
];

export async function ensureDefaultEmployeeDocumentTypes(
  prisma: PrismaClient,
  companyId: string
) {
  for (const row of DEFAULT_TYPES) {
    await prisma.employeeDocumentType.upsert({
      where: { companyId_slug: { companyId, slug: row.slug } },
      create: { companyId, ...row, isActive: true },
      update: {
        name: row.name,
        requiresVisaPeriod: row.requiresVisaPeriod,
        requiresExpiry: row.requiresExpiry,
        defaultAlertDaysBeforeExpiry: row.defaultAlertDaysBeforeExpiry,
        sortOrder: row.sortOrder,
        isActive: true,
      },
    });
  }
}
