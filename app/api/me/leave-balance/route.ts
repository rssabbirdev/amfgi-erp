import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { getOrCreateLeaveBalance, remainingLeaveDays } from '@/lib/hr/leaveBalance';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year') ?? new Date().getFullYear());

  const balance = await getOrCreateLeaveBalance(prisma, emp.companyId, emp.id, year);
  return successResponse({
    year,
    entitlementDays: Number(balance.entitlementDays),
    usedDays: Number(balance.usedDays),
    adjustedDays: Number(balance.adjustedDays),
    remainingDays: remainingLeaveDays(balance),
  });
}
