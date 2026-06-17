import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { deleteCompensationPackage } from '@/lib/hr/payroll/compensationPackages';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { resolveRouteEmployeeId } from '@/lib/hr/resolveRouteEmployeeId';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; packageId: string }> }
) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { companyId } = ctx;
  if (!requirePerm(ctx.session.user, P.HR_PAYROLL_COMPENSATION)) {
    return errorResponse('Forbidden', 403);
  }

  const employeeId = await resolveRouteEmployeeId(req, params);
  if (!employeeId) return errorResponse('Employee id required', 400);
  const { packageId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  try {
    await deleteCompensationPackage(prisma, companyId, employeeId, packageId);
    return successResponse({ deleted: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Delete failed', 400);
  }
}
