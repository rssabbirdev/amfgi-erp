import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee', 403);
  const { id } = await params;

  const existing = await prisma.leaveRequest.findFirst({
    where: { id, companyId: emp.companyId, employeeId: emp.id },
  });
  if (!existing) return errorResponse('Not found', 404);
  if (existing.status !== 'PENDING') return errorResponse('Only pending requests can be cancelled', 400);

  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'cancel') return errorResponse('Unsupported action', 400);

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: { status: 'CANCELLED' },
  });
  return successResponse(row);
}
