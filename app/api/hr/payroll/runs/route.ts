import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { createPayRunFromPreview } from '@/lib/hr/payroll/createPayRun';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  note: z.string().max(2000).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { session, companyId } = ctx;
    if (!requirePerm(session.user, P.HR_PAYROLL_COMPENSATION)) {
      return errorResponse('Forbidden', 403);
    }

    const month = new URL(req.url).searchParams.get('month')?.trim();
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return errorResponse('month must be YYYY-MM', 400);
      }
      const run = await prisma.payRun.findUnique({
        where: { companyId_month: { companyId, month } },
        select: {
          id: true,
          month: true,
          status: true,
          totalGross: true,
          employeeCount: true,
          includedCount: true,
          note: true,
          createdAt: true,
          createdByUserId: true,
          _count: { select: { lines: true } },
        },
      });
      if (!run) return successResponse([]);
      return successResponse([
        {
          ...run,
          totalGross: Number(run.totalGross),
          lineCount: run._count.lines,
        },
      ]);
    }

    const runs = await prisma.payRun.findMany({
      where: { companyId },
      orderBy: { month: 'desc' },
      select: {
        id: true,
        month: true,
        status: true,
        totalGross: true,
        employeeCount: true,
        includedCount: true,
        note: true,
        createdAt: true,
        createdByUserId: true,
        _count: { select: { lines: true } },
      },
    });

    return successResponse(
      runs.map((run) => ({
        ...run,
        totalGross: Number(run.totalGross),
        lineCount: run._count.lines,
      }))
    );
  } catch (error) {
    console.error('[GET /api/hr/payroll/runs]', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to load pay runs',
      500
    );
  }
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_PAYROLL_COMPENSATION)) {
    return errorResponse('Forbidden', 403);
  }

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  try {
    const run = await createPayRunFromPreview({
      companyId,
      month: parsed.data.month,
      note: parsed.data.note,
      createdByUserId: session.user.id,
    });
    return successResponse(
      {
        id: run.id,
        month: run.month,
        totalGross: Number(run.totalGross),
        employeeCount: run.employeeCount,
        includedCount: run.includedCount,
      },
      201
    );
  } catch (error) {
    console.error('[POST /api/hr/payroll/runs]', error);
    const message = error instanceof Error ? error.message : 'Failed to create pay run';
    const status = message.includes('already exists') ? 409 : 500;
    return errorResponse(message, status);
  }
}
