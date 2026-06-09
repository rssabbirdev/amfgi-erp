/**
 * Backfill AttendanceEntry.basicHours from current employee type settings.
 * Run after schema migration: npx tsx scripts/backfill-attendance-basic-hours.ts
 */
import 'dotenv/config';
import { prisma } from '../lib/db/prisma';
import {
  basicHoursForProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '../lib/hr/employeeTypeSettings';

async function main() {

  const companies = await prisma.company.findMany({
    select: { id: true, hrEmployeeTypeSettings: true, printTemplates: true },
  });
  const settingsByCompany = new Map(
    companies.map((c) => [c.id, readEmployeeTypeSettingsFromCompanyData(c)])
  );

  const entries = await prisma.attendanceEntry.findMany({
    select: {
      id: true,
      companyId: true,
      employee: { select: { profileExtension: true } },
    },
  });

  let updated = 0;
  for (const entry of entries) {
    const typeSettings = settingsByCompany.get(entry.companyId);
    if (!typeSettings) continue;
    const basicHours = basicHoursForProfileExtension(entry.employee.profileExtension, typeSettings);
    await prisma.attendanceEntry.update({
      where: { id: entry.id },
      data: { basicHours },
    });
    updated += 1;
  }

  console.log(`Backfilled basicHours on ${updated} attendance entries.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
