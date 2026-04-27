import type { Prisma, PrismaClient } from '@prisma/client';

type JobContactInput = {
  label?: string | null;
  name?: string | null;
  email?: string | null;
  number?: string | null;
  designation?: string | null;
};

type JobContactRecord = {
  label: string | null;
  name: string;
  email: string | null;
  number: string | null;
  designation: string | null;
  sortOrder: number;
};

type PrismaDbLike = PrismaClient | Prisma.TransactionClient;

function normalizeStringOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeJobContactsInput(
  contacts: JobContactInput[] | undefined
): JobContactRecord[] {
  if (!contacts?.length) return [];
  return contacts
    .map((contact, index) => ({
      label: normalizeStringOrNull(contact.label),
      name: String(contact.name ?? '').trim(),
      email: normalizeStringOrNull(contact.email),
      number: normalizeStringOrNull(contact.number),
      designation: normalizeStringOrNull(contact.designation),
      sortOrder: index,
    }))
    .filter(
      (contact) =>
        contact.name !== '' ||
        contact.label != null ||
        contact.email != null ||
        contact.number != null ||
        contact.designation != null
    )
    .map((contact) => ({
      ...contact,
      name: contact.name || '',
    }))
    .filter((contact) => contact.name !== '');
}

export function serializeJobContacts(
  contacts: JobContactRecord[] | undefined
): Array<Record<string, string>> {
  if (!contacts?.length) return [];
  return contacts.map((contact) => {
    const row: Record<string, string> = {};
    if (contact.label) row.label = contact.label;
    if (contact.name) row.name = contact.name;
    if (contact.email) row.email = contact.email;
    if (contact.number) row.number = contact.number;
    if (contact.designation) row.designation = contact.designation;
    return row;
  });
}

type ContactLike = {
  label: string | null;
  name: string;
  email: string | null;
  number: string | null;
  designation: string | null;
  sortOrder: number;
};

export function serializeJobWithContacts<T extends { contacts: ContactLike[] }>(job: T) {
  const { contacts, ...rest } = job;
  return {
    ...rest,
    contactsJson: serializeJobContacts(contacts),
  };
}

export async function syncJobContacts(
  db: PrismaDbLike,
  params: {
    companyId: string;
    jobId: string;
    contacts: JobContactInput[] | undefined;
  }
) {
  const rows = normalizeJobContactsInput(params.contacts);
  await db.jobContact.deleteMany({
    where: {
      companyId: params.companyId,
      jobId: params.jobId,
    },
  });
  if (!rows.length) return;
  await db.jobContact.createMany({
    data: rows.map((contact) => ({
      companyId: params.companyId,
      jobId: params.jobId,
      label: contact.label,
      name: contact.name,
      email: contact.email,
      number: contact.number,
      designation: contact.designation,
      sortOrder: contact.sortOrder,
    })),
  });
}
