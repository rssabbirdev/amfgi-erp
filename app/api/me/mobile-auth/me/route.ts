import { prisma } from '@/lib/db/prisma';
import { requireEmployeeApiAuth } from '@/lib/hr/mobileAccess';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const authCtx = await requireEmployeeApiAuth(req);
  if (!authCtx.ok) return errorResponse(authCtx.error, authCtx.status);

  const company = await prisma.company.findFirst({
    where: { id: authCtx.companyId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!company) return errorResponse('Company not found', 404);

  return successResponse({
    authMode: authCtx.source,
    employee: authCtx.employee,
    company,
  });
}
