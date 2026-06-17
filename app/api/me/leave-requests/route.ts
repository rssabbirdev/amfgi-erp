import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { dateFromYmd, ymdFromInput } from '@/lib/hr/workDate';
import { loadLeaveTypeForRequest, resolveLeaveRequestFields } from '@/lib/hr/resolveLeaveTypeSelection';
import { isLeaveTypeHiddenFromEmployeePortal, parseLeaveTypeRules } from '@/lib/hr/leaveTypeRules';
import { ensureLeaveTypesReady } from '@/lib/hr/seedLeaveTypes';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { assertSufficientLeaveBalance, leaveDaysForRequest } from '@/lib/hr/leaveBalance';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(2000).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);

  const rows = await prisma.leaveRequest.findMany({
    where: { companyId: emp.companyId, employeeId: emp.id },
    include: {
      leaveTypeRef: { select: { id: true, name: true, code: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { submittedAt: 'desc' },
    take: 100,
  });
  return successResponse(rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  let startYmd: string;
  let endYmd: string;
  try {
    startYmd = ymdFromInput(parsed.data.startDate);
    endYmd = ymdFromInput(parsed.data.endDate);
  } catch {
    return errorResponse('Invalid date', 400);
  }
  const startDate = dateFromYmd(startYmd);
  const endDate = dateFromYmd(endYmd);
  if (endDate < startDate) return errorResponse('endDate must be on or after startDate', 400);

  await ensureLeaveTypesReady(prisma, emp.companyId);
  const leaveType = await loadLeaveTypeForRequest(prisma, emp.companyId, parsed.data.leaveTypeId);
  if (!leaveType) return errorResponse('Leave type not found', 404);
  if (isLeaveTypeHiddenFromEmployeePortal(parseLeaveTypeRules(leaveType.rules))) {
    return errorResponse('This leave type is not available for employee requests', 403);
  }

  const resolved = resolveLeaveRequestFields(leaveType);
  const daysNeeded = leaveDaysForRequest(
    resolved.leaveType,
    startDate,
    endDate,
    resolved.deductFromBalance
  );
  if (daysNeeded > 0) {
    const year = startDate.getUTCFullYear();
    const check = await assertSufficientLeaveBalance(prisma, {
      companyId: emp.companyId,
      employeeId: emp.id,
      year,
      daysNeeded,
    });
    if (!check.ok) return errorResponse(check.message, 422);
  }

  const row = await prisma.leaveRequest.create({
    data: {
      companyId: emp.companyId,
      employeeId: emp.id,
      leaveType: resolved.leaveType,
      leaveTypeId: resolved.leaveTypeId,
      startDate,
      endDate,
      reason: parsed.data.reason?.trim() || null,
      deductFromBalance: resolved.deductFromBalance,
      status: 'PENDING',
    },
    include: {
      leaveTypeRef: { select: { id: true, name: true, code: true } },
    },
  });
  return successResponse(row, 201);
}
