import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { filterLeaveTypesForEmployeePortal } from '@/lib/hr/leaveTypeRules';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { requireCompanySession } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

/** Active leave types for employee self-service or HR attendance editors. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  let companyId: string | null = null;
  const portalEmp = await getPortalEmployeeForSession(session.user);
  if (portalEmp) {
    companyId = portalEmp.companyId;
  } else {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    companyId = ctx.companyId;
  }

  await ensureLeaveTypesReady(prisma, companyId);

  const rows = await prisma.leaveType.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, code: true, description: true, rules: true },
  });
  return successResponse(portalEmp ? filterLeaveTypesForEmployeePortal(rows) : rows);
}
