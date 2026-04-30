import { auth } from '@/auth';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { requireActiveCompanyInDb } from '@/lib/utils/requireActiveCompanyInDb';
import { syncExternalCustomersForCompany } from '@/lib/partyListSync';
import { publishLiveUpdate } from '@/lib/live-updates/server';

export async function POST() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.edit')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const companyError = await requireActiveCompanyInDb(companyId);
  if (companyError) return companyError;

  try {
    const result = await syncExternalCustomersForCompany(companyId);
    publishLiveUpdate({
      companyId,
      channel: 'customers',
      entity: 'customer',
      action: 'changed',
    });
    return successResponse(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    return errorResponse(msg, 502);
  }
}
