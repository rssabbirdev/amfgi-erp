import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const VisaSchema = z.object({
  label: z.string().min(1).max(200),
  sponsorType: z.string().max(80).optional().nullable(),
  visaType: z.string().max(80).optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_VIEW)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const list = await prisma.visaPeriod.findMany({
    where: { employeeId, companyId },
    orderBy: { endDate: 'desc' },
  });
  return successResponse(list);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  const body = await req.json();
  const parsed = VisaSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const row = await prisma.visaPeriod.create({
    data: {
      companyId,
      employeeId,
      label: d.label.trim(),
      sponsorType: d.sponsorType?.trim() || null,
      visaType: d.visaType?.trim() || null,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      status: d.status ?? 'DRAFT',
      notes: d.notes?.trim() || null,
    },
  });
  return successResponse(row, 201);
}
