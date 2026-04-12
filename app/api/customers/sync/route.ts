import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { requireActiveCompanyInDb } from '@/lib/utils/requireActiveCompanyInDb';
import { fetchExternalClients, mapPartyToCustomerFields } from '@/lib/partyListsApi';

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

  const now = new Date();

  try {
    const parties = await fetchExternalClients();
    let created = 0;
    let updated = 0;

    for (const p of parties) {
      if (typeof p.id !== 'number' || !p.name?.trim()) continue;
      const fields = mapPartyToCustomerFields(p);

      const existing = await prisma.customer.findUnique({
        where: {
          companyId_externalPartyId: { companyId, externalPartyId: p.id },
        },
      });

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: {
            ...fields,
            externalSyncedAt: now,
          },
        });
        updated += 1;
      } else {
        await prisma.customer.create({
          data: {
            companyId,
            source: 'PARTY_API_SYNC',
            externalPartyId: p.id,
            externalSyncedAt: now,
            isActive: true,
            ...fields,
          },
        });
        created += 1;
      }
    }

    return successResponse({
      ok: true,
      totalFromApi: parties.length,
      created,
      updated,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Sync failed';
    return errorResponse(msg, 502);
  }
}
