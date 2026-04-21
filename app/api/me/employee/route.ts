import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee for this company', 403);

  const full = await prisma.employee.findFirst({
    where: { id: emp.id },
    include: {
      visaPeriods: { orderBy: { endDate: 'desc' }, take: 20 },
      documents: {
        include: { documentType: { select: { name: true, slug: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      },
    },
  });
  return successResponse(full);
}
