import { prisma } from '@/lib/db/prisma';
import {
  fetchExternalClients,
  fetchExternalSuppliers,
  mapPartyToCustomerFields,
  type PartyListParty,
} from '@/lib/partyListsApi';
import {
  syncCustomerContacts,
  syncSupplierContacts,
} from '@/lib/partyContacts';

type PartyKind = 'customer' | 'supplier';

export type PartyListSyncResult = {
  ok: true;
  totalFromApi: number;
  created: number;
  updated: number;
};

async function upsertPartyListRows(companyId: string, kind: PartyKind, parties: PartyListParty[]): Promise<PartyListSyncResult> {
  const now = new Date();
  let created = 0;
  let updated = 0;

  for (const p of parties) {
    if (typeof p.id !== 'number' || !p.name?.trim()) continue;
    const { contacts, ...fields } = mapPartyToCustomerFields(p);

    if (kind === 'customer') {
      const existing = await prisma.customer.findUnique({
        where: { companyId_externalPartyId: { companyId, externalPartyId: p.id } },
      });

      await prisma.$transaction(async (tx) => {
        const customer = existing
          ? await tx.customer.update({
              where: { id: existing.id },
              data: { ...fields, externalSyncedAt: now, isActive: true },
            })
          : await tx.customer.create({
              data: {
                companyId,
                source: 'PARTY_API_SYNC',
                externalPartyId: p.id,
                externalSyncedAt: now,
                isActive: true,
                ...fields,
              },
            });
        await syncCustomerContacts(tx, {
          companyId,
          customerId: customer.id,
          contacts,
        });
      });
      if (existing) updated += 1;
      else created += 1;
      continue;
    }

    const existing = await prisma.supplier.findUnique({
      where: { companyId_externalPartyId: { companyId, externalPartyId: p.id } },
    });

    await prisma.$transaction(async (tx) => {
      const supplier = existing
        ? await tx.supplier.update({
            where: { id: existing.id },
            data: { ...fields, externalSyncedAt: now, isActive: true },
          })
        : await tx.supplier.create({
            data: {
              companyId,
              source: 'PARTY_API_SYNC',
              externalPartyId: p.id,
              externalSyncedAt: now,
              isActive: true,
              ...fields,
            },
          });
      await syncSupplierContacts(tx, {
        companyId,
        supplierId: supplier.id,
        contacts,
      });
    });
    if (existing) updated += 1;
    else created += 1;
  }

  return { ok: true, totalFromApi: parties.length, created, updated };
}

export async function syncExternalCustomersForCompany(companyId: string): Promise<PartyListSyncResult> {
  const parties = await fetchExternalClients();
  return upsertPartyListRows(companyId, 'customer', parties);
}

export async function syncExternalSuppliersForCompany(companyId: string): Promise<PartyListSyncResult> {
  const parties = await fetchExternalSuppliers();
  return upsertPartyListRows(companyId, 'supplier', parties);
}
