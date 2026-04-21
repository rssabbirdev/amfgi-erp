import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  sponsorType: z.string().max(80).optional().nullable(),
  visaType: z.string().max(80).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  notes: z.string().max(5000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.visaPeriod.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const data: Prisma.VisaPeriodUpdateInput = {};
  if (d.label !== undefined) data.label = d.label.trim();
  if (d.sponsorType !== undefined) data.sponsorType = d.sponsorType?.trim() || null;
  if (d.visaType !== undefined) data.visaType = d.visaType?.trim() || null;
  if (d.startDate !== undefined) data.startDate = new Date(d.startDate);
  if (d.endDate !== undefined) data.endDate = new Date(d.endDate);
  if (d.status !== undefined) data.status = d.status;
  if (d.notes !== undefined) data.notes = d.notes?.trim() || null;

  const row = await prisma.visaPeriod.update({ where: { id }, data });
  return successResponse(row);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.visaPeriod.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  await prisma.visaPeriod.delete({ where: { id } });
  return successResponse({ ok: true });
}
