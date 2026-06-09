import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  formatPackageForApi,
  packageInclude,
} from '@/lib/hr/payroll/compensationPackageFormat';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';

export {
  allowanceTotal,
  formatPackageForApi,
  packageInclude,
  type CompensationChangeLine,
  type CompensationPackageRow,
} from '@/lib/hr/payroll/compensationPackageFormat';

export type AllowanceInput = { allowanceTypeId: string; amount: number };

export type CreateCompensationPackageInput = {
  companyId: string;
  employeeId: string;
  payTypeId: string;
  monthlyBasic?: number | null;
  dailyRate?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  visaPeriodId?: string | null;
  notes?: string | null;
  allowances: AllowanceInput[];
};

export async function closeOpenCompensationPackages(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string,
  beforeDate: Date
) {
  const open = await tx.employeeCompensation.findMany({
    where: { companyId, employeeId, effectiveTo: null, effectiveFrom: { lt: beforeDate } },
    select: { id: true },
  });
  if (open.length === 0) return;

  const closeDate = new Date(beforeDate);
  closeDate.setUTCDate(closeDate.getUTCDate() - 1);

  const ids = open.map((r) => r.id);
  await tx.employeeCompensation.updateMany({
    where: { id: { in: ids } },
    data: { effectiveTo: closeDate },
  });
  await tx.employeeAllowance.updateMany({
    where: { companyId, employeeCompensationId: { in: ids }, effectiveTo: null },
    data: { effectiveTo: closeDate },
  });
}

export async function createCompensationPackage(
  prisma: PrismaClient,
  input: CreateCompensationPackageInput
) {
  let effectiveFrom: Date;
  let effectiveTo: Date | null = null;
  try {
    effectiveFrom = dateFromYmd(ymdFromInput(input.effectiveFrom));
    if (input.effectiveTo) effectiveTo = dateFromYmd(ymdFromInput(input.effectiveTo));
  } catch {
    throw new Error('Invalid date');
  }

  if (input.visaPeriodId) {
    const visa = await prisma.visaPeriod.findFirst({
      where: { id: input.visaPeriodId, companyId: input.companyId, employeeId: input.employeeId },
    });
    if (!visa) throw new Error('Visa period not found for this employee');
  }

  const payType = await prisma.payType.findFirst({
    where: { id: input.payTypeId, companyId: input.companyId },
  });
  if (!payType) throw new Error('Pay type not found');

  const allowanceTypeIds = [...new Set(input.allowances.map((a) => a.allowanceTypeId))];
  if (allowanceTypeIds.length > 0) {
    const count = await prisma.allowanceType.count({
      where: { companyId: input.companyId, id: { in: allowanceTypeIds }, isActive: true },
    });
    if (count !== allowanceTypeIds.length) throw new Error('One or more allowance types are invalid');
  }

  const filteredAllowances = input.allowances.filter((a) => a.amount > 0);

  return prisma.$transaction(async (tx) => {
    await closeOpenCompensationPackages(tx, input.companyId, input.employeeId, effectiveFrom);

    const compensation = await tx.employeeCompensation.create({
      data: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        payTypeId: payType.id,
        visaPeriodId: input.visaPeriodId ?? null,
        monthlyBasic: input.monthlyBasic ?? null,
        monthlyAllowance: null,
        dailyRate: input.dailyRate ?? null,
        effectiveFrom,
        effectiveTo,
        notes: input.notes?.trim() || null,
      },
    });

    if (filteredAllowances.length > 0) {
      await tx.employeeAllowance.createMany({
        data: filteredAllowances.map((a) => ({
          companyId: input.companyId,
          employeeId: input.employeeId,
          employeeCompensationId: compensation.id,
          allowanceTypeId: a.allowanceTypeId,
          amount: a.amount,
          effectiveFrom,
          effectiveTo,
        })),
      });
    }

    return tx.employeeCompensation.findFirstOrThrow({
      where: { id: compensation.id },
      include: packageInclude,
    });
  });
}

export async function listCompensationPackages(companyId: string, employeeId: string) {
  const rows = await prisma.employeeCompensation.findMany({
    where: { companyId, employeeId },
    include: packageInclude,
    orderBy: { effectiveFrom: 'desc' },
  });

  return rows.map((row, index) => formatPackageForApi(row, rows[index + 1] ?? null));
}

function dayBefore(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

/** Re-link effectiveTo dates after a package is removed from the middle of history. */
export async function repairCompensationTimeline(
  tx: Prisma.TransactionClient,
  companyId: string,
  employeeId: string
) {
  const rows = await tx.employeeCompensation.findMany({
    where: { companyId, employeeId },
    orderBy: { effectiveFrom: 'asc' },
    select: { id: true, effectiveFrom: true },
  });

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    const effectiveTo = next ? dayBefore(next.effectiveFrom) : null;

    await tx.employeeCompensation.update({
      where: { id: row.id },
      data: { effectiveTo },
    });
    await tx.employeeAllowance.updateMany({
      where: { companyId, employeeCompensationId: row.id },
      data: { effectiveTo },
    });
  }
}

export async function deleteCompensationPackage(
  db: PrismaClient,
  companyId: string,
  employeeId: string,
  packageId: string
) {
  const existing = await db.employeeCompensation.findFirst({
    where: { id: packageId, companyId, employeeId },
    select: { id: true },
  });
  if (!existing) throw new Error('Compensation package not found');

  await db.$transaction(async (tx) => {
    await tx.employeeCompensation.delete({ where: { id: packageId } });
    await repairCompensationTimeline(tx, companyId, employeeId);
  });
}
