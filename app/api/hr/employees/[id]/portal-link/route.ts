import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const BodySchema = z.object({
  userId: z.string().min(1),
});

/** Links `User.linkedEmployeeId` when login email matches employee email (case-insensitive). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);
  if (!emp.email?.trim()) return errorResponse('Employee must have an email to link a login', 422);

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    include: { companyAccess: true },
  });
  if (!user) return errorResponse('User not found', 404);

  if (user.email.trim().toLowerCase() !== emp.email.trim().toLowerCase()) {
    return errorResponse('User email must match the employee email', 422);
  }

  const hasCompany = user.isSuperAdmin || user.companyAccess.some((a) => a.companyId === companyId);
  if (!hasCompany) return errorResponse('User has no access to this company', 422);

  const other = await prisma.user.findFirst({
    where: { linkedEmployeeId: employeeId, NOT: { id: user.id } },
    select: { id: true },
  });
  if (other) return errorResponse('Another user is already linked to this employee', 409);

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { linkedEmployeeId: employeeId },
      data: { linkedEmployeeId: null },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { linkedEmployeeId: employeeId },
    }),
    prisma.employee.update({
      where: { id: employeeId },
      data: { portalEnabled: true },
    }),
  ]);

  return successResponse({ linked: true, userId: user.id, employeeId });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  await prisma.user.updateMany({
    where: { linkedEmployeeId: employeeId },
    data: { linkedEmployeeId: null },
  });
  await prisma.employee.update({
    where: { id: employeeId },
    data: { portalEnabled: false },
  });
  return successResponse({ linked: false });
}
