import { prisma } from '@/lib/db/prisma';
import { requireEmployeeApiAuth } from '@/lib/hr/mobileAccess';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(req: Request) {
  const authCtx = await requireEmployeeApiAuth(req);
  if (!authCtx.ok) return errorResponse(authCtx.error, authCtx.status);

  if (authCtx.source !== 'token' || !authCtx.tokenId) {
    return successResponse({ ok: true, mode: 'session' });
  }

  await prisma.employeeMobileAccessToken.update({
    where: { id: authCtx.tokenId },
    data: { revokedAt: new Date() },
  });

  return successResponse({ ok: true, mode: 'token' });
}
