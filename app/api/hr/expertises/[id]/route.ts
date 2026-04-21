import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import { z } from 'zod';

const PatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function jobUsesExpertise(job: { requiredExpertises: unknown }, name: string): boolean {
  if (!Array.isArray(job.requiredExpertises)) return false;
  return job.requiredExpertises.some((x) => String(x ?? '').trim().toLowerCase() === name.toLowerCase());
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const { id } = await params;
  const existing = await prisma.workforceExpertise.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const data: Prisma.WorkforceExpertiseUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

  try {
    const row = await prisma.workforceExpertise.update({ where: { id }, data });
    return successResponse(row);
  } catch (e) {
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Expertise already exists', 409);
    }
    throw e;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const { id } = await params;
  const existing = await prisma.workforceExpertise.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);
  const name = existing.name.trim();

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, profileExtension: true },
  });
  const employeeLinked = employees.some((e) =>
    parseWorkforceProfile(e.profileExtension).expertises.some((x) => x.toLowerCase() === name.toLowerCase())
  );
  if (employeeLinked) {
    return errorResponse('Cannot delete: expertise is linked to one or more employees.', 409);
  }

  const jobs = await prisma.job.findMany({
    where: { companyId },
    select: { id: true, requiredExpertises: true },
  });
  const jobLinked = jobs.some((j) => jobUsesExpertise(j, name));
  if (jobLinked) {
    return errorResponse('Cannot delete: expertise is linked to one or more jobs.', 409);
  }

  await prisma.workforceExpertise.delete({ where: { id } });
  return successResponse({ ok: true });
}
