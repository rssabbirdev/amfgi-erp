import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { session, companyId } = ctx;
    if (!requirePerm(session.user, P.HR_PAYROLL_COMPENSATION)) {
      return errorResponse('Forbidden', 403);
    }

    const { id } = await params;
    const [run, company] = await Promise.all([
      prisma.payRun.findFirst({
        where: { id, companyId },
        include: {
          lines: {
            orderBy: [{ employeeName: 'asc' }],
          },
        },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      }),
    ]);

    if (!run) return errorResponse('Pay run not found', 404);

    return successResponse({
      id: run.id,
      companyName: company?.name ?? 'Company',
      month: run.month,
      status: run.status,
      totalGross: Number(run.totalGross),
      employeeCount: run.employeeCount,
      includedCount: run.includedCount,
      note: run.note,
      createdAt: run.createdAt,
      createdByUserId: run.createdByUserId,
      lines: run.lines.map((line) => ({
        id: line.id,
        employeeId: line.employeeId,
        employeeCode: line.employeeCode,
        employeeName: line.employeeName,
        payTypeId: line.payTypeId,
        payTypeName: line.payTypeName,
        payTypeCode: line.payTypeCode,
        compensationEffectiveFrom: line.compensationEffectiveFrom,
        gross: Number(line.gross),
        breakdown: line.breakdown,
        dayDetails: line.dayDetails,
        approvedAttendanceRows: line.approvedAttendanceRows,
        draftAttendanceRows: line.draftAttendanceRows,
        skipped: line.skipped,
        skipReason: line.skipReason,
      })),
    });
  } catch (error) {
    console.error('[GET /api/hr/payroll/runs/[id]]', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load pay run',
      500
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { session, companyId } = ctx;
    if (!requirePerm(session.user, P.HR_PAYROLL_COMPENSATION)) {
      return errorResponse('Forbidden', 403);
    }

    const { id } = await params;
    const existing = await prisma.payRun.findFirst({
      where: { id, companyId },
      select: { id: true, month: true },
    });
    if (!existing) return errorResponse('Pay run not found', 404);

    await prisma.payRun.delete({ where: { id: existing.id } });
    return successResponse({ deleted: true, month: existing.month });
  } catch (error) {
    console.error('[DELETE /api/hr/payroll/runs/[id]]', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to delete pay run',
      500
    );
  }
}
