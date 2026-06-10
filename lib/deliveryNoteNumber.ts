import type { Prisma } from '@prisma/client';

/** Resolve numeric delivery note # from structured row or legacy `notes` header. */
export function resolveDeliveryNoteNumber(
  notes: string | null | undefined,
  deliveryNote?: { number: number } | null
): number {
  if (deliveryNote != null && Number.isFinite(deliveryNote.number)) {
    return deliveryNote.number;
  }
  const m = notes?.match(/--- DELIVERY NOTE #(\d+)/);
  return m?.[1] ? parseInt(m[1], 10) : 0;
}

/** Label segment for Drive filenames, e.g. `DN001`. */
export function formatDeliveryNoteDriveLabel(number: number): string {
  const raw = Number.isFinite(number) && number > 0 ? String(Math.trunc(number)) : '0';
  return `DN${raw.padStart(3, '0')}`;
}

export async function getNextDeliveryNoteNumber(
  tx: Prisma.TransactionClient,
  companyId: string
): Promise<number> {
  const agg = await tx.deliveryNote.aggregate({
    where: { companyId },
    _max: { number: true },
  });
  return (agg._max.number ?? 0) + 1;
}

export async function assertDeliveryNoteNumberAvailable(
  tx: Prisma.TransactionClient,
  companyId: string,
  number: number,
  excludeDeliveryNoteId?: string
): Promise<void> {
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error('Delivery note number must be a positive whole number');
  }

  const existing = await tx.deliveryNote.findFirst({
    where: {
      companyId,
      number,
      ...(excludeDeliveryNoteId ? { NOT: { id: excludeDeliveryNoteId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Delivery note number ${number} is already in use`);
  }
}

export function parseDeliveryContactPerson(notes?: string | null): string {
  if (!notes) return '';
  const match = notes.match(/--- DELIVERY CONTACT PERSON:([^\n\r]+)/);
  return match?.[1]?.trim() ?? '';
}

export function resolveDeliveryContactPerson(
  notes?: string | null,
  deliveryNote?: { contactPerson?: string | null } | null
): string {
  if (deliveryNote?.contactPerson?.trim()) {
    return deliveryNote.contactPerson.trim();
  }
  return parseDeliveryContactPerson(notes);
}

/** Keep transaction notes aligned with the persisted delivery-note contact. */
export function replaceDeliveryNoteContactInNotes(
  notes: string | undefined,
  contactPerson?: string | null
): string {
  const trimmed = contactPerson?.trim() ?? '';
  const withoutContact = (notes?.trim() ?? '').replace(
    /--- DELIVERY CONTACT PERSON:[^\n\r]*\r?\n?/g,
    ''
  ).trim();

  if (!trimmed) {
    return withoutContact;
  }

  const contactLine = `--- DELIVERY CONTACT PERSON: ${trimmed}`;
  if (/--- DELIVERY NOTE #\d+/.test(withoutContact)) {
    return withoutContact.replace(/(--- DELIVERY NOTE #\d+)/, `$1\n${contactLine}`);
  }
  return withoutContact ? `${contactLine}\n${withoutContact}` : contactLine;
}

/** Keep transaction notes aligned with the persisted DeliveryNote.number. */
export function replaceDeliveryNoteNumberInNotes(notes: string | undefined, number: number): string {
  const trimmed = notes?.trim() ?? '';
  const header = `--- DELIVERY NOTE #${number}`;
  if (/--- DELIVERY NOTE #\d+/.test(trimmed)) {
    return trimmed.replace(/--- DELIVERY NOTE #\d+/, header);
  }
  return trimmed ? `${header}\n${trimmed}` : header;
}
