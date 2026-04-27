import type { Prisma, PrismaClient } from '@prisma/client';

import type { PartyListContactInput } from '@/lib/partyListRecordPayload';

type PartyContactRecord = {
  externalContactId: number | null;
  contactName: string;
  email: string | null;
  phone: string | null;
  sortOrder: number;
  externalCreatedAt: string | null;
};

type CustomerWithContacts = Prisma.CustomerGetPayload<{
  include: { contacts: { orderBy: { sortOrder: 'asc' } } };
}>;

type SupplierWithContacts = Prisma.SupplierGetPayload<{
  include: { contacts: { orderBy: { sortOrder: 'asc' } } };
}>;

type PrismaDbLike =
  | PrismaClient
  | Prisma.TransactionClient;

function normalizeStringOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizePartyContactsInput(
  contacts: PartyListContactInput[] | undefined
): PartyContactRecord[] {
  if (!contacts?.length) return [];
  return contacts
    .map((contact, index) => ({
      externalContactId: typeof contact.id === 'number' ? contact.id : null,
      contactName: String(contact.contact_name ?? '').trim(),
      email: normalizeStringOrNull(contact.email ?? null),
      phone: normalizeStringOrNull(contact.phone ?? null),
      sortOrder: typeof contact.sort_order === 'number' ? contact.sort_order : index,
      externalCreatedAt: normalizeStringOrNull(contact.created_at ?? null),
    }))
    .filter(
      (contact) =>
        contact.contactName !== '' ||
        contact.email != null ||
        contact.phone != null
    );
}

export function serializePartyContacts(
  contacts: PartyContactRecord[] | undefined
): Array<Record<string, unknown>> {
  if (!contacts?.length) return [];
  return contacts.map((contact) => ({
    ...(contact.externalContactId != null ? { id: contact.externalContactId } : {}),
    contact_name: contact.contactName,
    email: contact.email,
    phone: contact.phone,
    sort_order: contact.sortOrder,
    ...(contact.externalCreatedAt ? { created_at: contact.externalCreatedAt } : {}),
  }));
}

export function serializeCustomerWithContacts(customer: CustomerWithContacts) {
  const { contacts, ...rest } = customer;
  return {
    ...rest,
    contactsJson: serializePartyContacts(contacts),
  };
}

export function serializeSupplierWithContacts(supplier: SupplierWithContacts) {
  const { contacts, ...rest } = supplier;
  return {
    ...rest,
    contactsJson: serializePartyContacts(contacts),
  };
}

export async function syncCustomerContacts(
  db: PrismaDbLike,
  params: {
    companyId: string;
    customerId: string;
    contacts: PartyListContactInput[] | undefined;
  }
) {
  const rows = normalizePartyContactsInput(params.contacts);
  await db.customerContact.deleteMany({
    where: {
      companyId: params.companyId,
      customerId: params.customerId,
    },
  });
  if (!rows.length) return;
  await db.customerContact.createMany({
    data: rows.map((contact) => ({
      companyId: params.companyId,
      customerId: params.customerId,
      externalContactId: contact.externalContactId,
      contactName: contact.contactName,
      email: contact.email,
      phone: contact.phone,
      sortOrder: contact.sortOrder,
      externalCreatedAt: contact.externalCreatedAt,
    })),
  });
}

export async function syncSupplierContacts(
  db: PrismaDbLike,
  params: {
    companyId: string;
    supplierId: string;
    contacts: PartyListContactInput[] | undefined;
  }
) {
  const rows = normalizePartyContactsInput(params.contacts);
  await db.supplierContact.deleteMany({
    where: {
      companyId: params.companyId,
      supplierId: params.supplierId,
    },
  });
  if (!rows.length) return;
  await db.supplierContact.createMany({
    data: rows.map((contact) => ({
      companyId: params.companyId,
      supplierId: params.supplierId,
      externalContactId: contact.externalContactId,
      contactName: contact.contactName,
      email: contact.email,
      phone: contact.phone,
      sortOrder: contact.sortOrder,
      externalCreatedAt: contact.externalCreatedAt,
    })),
  });
}
