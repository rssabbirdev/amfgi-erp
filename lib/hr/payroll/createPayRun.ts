import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildPayrollPreview } from '@/lib/hr/payroll/buildPayPreview';

export async function createPayRunFromPreview(params: {
  companyId: string;
  month: string;
  createdByUserId?: string | null;
  note?: string | null;
}) {
  const { companyId, month, createdByUserId, note } = params;

  const existing = await prisma.payRun.findUnique({
    where: { companyId_month: { companyId, month } },
    select: { id: true },
  });
  if (existing) {
    throw new Error(`A pay run already exists for ${month}`);
  }

  const preview = await buildPayrollPreview(companyId, month);
  const included = preview.employees.filter((e) => !e.skipped);
  const totalGross = Math.round(included.reduce((sum, e) => sum + e.gross, 0) * 100) / 100;

  return prisma.$transaction(async (tx) => {
    const run = await tx.payRun.create({
      data: {
        companyId,
        month,
        status: 'FINALIZED',
        totalGross,
        employeeCount: preview.employees.length,
        includedCount: included.length,
        note: note?.trim() || null,
        createdByUserId: createdByUserId ?? null,
      },
    });

    if (preview.employees.length > 0) {
      await tx.payRunLine.createMany({
        data: preview.employees.map((row) => ({
          companyId,
          payRunId: run.id,
          employeeId: row.employeeId,
          employeeCode: row.employeeCode,
          employeeName: row.employeeName,
          payTypeId: row.payTypeId,
          payTypeName: row.payTypeName,
          payTypeCode: row.payTypeCode,
          compensationEffectiveFrom: row.compensationEffectiveFrom
            ? new Date(`${row.compensationEffectiveFrom}T00:00:00.000Z`)
            : null,
          gross: row.skipped ? 0 : row.gross,
          breakdown: row.breakdown as Prisma.InputJsonValue,
          dayDetails:
            row.dayDetails.length > 0 ? (row.dayDetails as Prisma.InputJsonValue) : Prisma.JsonNull,
          approvedAttendanceRows: row.approvedAttendanceRows,
          draftAttendanceRows: row.draftAttendanceRows,
          skipped: row.skipped,
          skipReason: row.skipReason,
        })),
      });
    }

    return run;
  });
}
