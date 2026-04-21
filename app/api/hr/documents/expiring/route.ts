import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

/** Documents with expiryDate within the next `days` (inclusive of today). */
export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_DOCUMENT_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10) || 30));

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);

  const docs = await prisma.employeeDocument.findMany({
    where: {
      companyId,
      expiryDate: { not: null, gte: start, lte: end },
    },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      documentType: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { expiryDate: 'asc' },
    take: 500,
  });
  return successResponse(docs);
}
