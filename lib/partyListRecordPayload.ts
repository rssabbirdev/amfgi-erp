/**
 * Party lists API–aligned fields (snake_case) for customers & suppliers.
 * @see API-party-lists.md
 */

import { z } from 'zod';
import { parsePartyListDateInput } from '@/lib/partyListsApi';

export const partyListContactSchema = z.object({
  id: z.number().optional(),
  contact_name: z.string().max(200).default(''),
  email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  sort_order: z.number().optional(),
  created_at: z.string().max(80).optional(),
});

export type PartyListContactInput = z.infer<typeof partyListContactSchema>;

export const partyListPartyFieldsSchema = z.object({
  trade_license_number: z.string().max(255).nullable().optional(),
  trade_license_authority: z.string().max(255).nullable().optional(),
  trade_license_expiry: z.string().max(40).nullable().optional(),
  trn_number: z.string().max(255).nullable().optional(),
  trn_expiry: z.string().max(40).nullable().optional(),
  contacts: z.array(partyListContactSchema).optional(),
});

function strOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function sortContacts(contacts: PartyListContactInput[]): PartyListContactInput[] {
  return [...contacts].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Primary contact_name / phone from sorted contacts (party API convention). */
export function primaryFromPartyContacts(contacts: PartyListContactInput[] | undefined): {
  contactPerson: string | null;
  phone: string | null;
} {
  const sorted = sortContacts(contacts ?? []);
  const primary = sorted[0];
  return {
    contactPerson: primary?.contact_name?.trim() ? primary.contact_name.trim() : null,
    phone: primary?.phone?.trim() ? String(primary.phone).trim() : null,
  };
}

/** Storable JSON for contacts: same keys as party API. */
export function contactsToJson(
  contacts: PartyListContactInput[] | undefined
): object[] | undefined {
  if (!contacts?.length) return undefined;
  return contacts.map((c, i) => ({
    ...(c.id != null ? { id: c.id } : {}),
    contact_name: c.contact_name?.trim() ?? '',
    email: c.email === '' ? null : (c.email ?? null),
    phone: c.phone === '' || c.phone == null ? null : String(c.phone).trim(),
    sort_order: c.sort_order ?? i,
    ...(c.created_at ? { created_at: c.created_at } : {}),
  }));
}

export function prismaPartyFieldsFromBody(
  party: z.infer<typeof partyListPartyFieldsSchema>
): {
  tradeLicenseNumber: string | null;
  tradeLicenseAuthority: string | null;
  tradeLicenseExpiry: Date | null;
  trnNumber: string | null;
  trnExpiry: Date | null;
  contacts: PartyListContactInput[];
} {
  return {
    tradeLicenseNumber: strOrNull(party.trade_license_number ?? undefined),
    tradeLicenseAuthority: strOrNull(party.trade_license_authority ?? undefined),
    tradeLicenseExpiry: parsePartyListDateInput(party.trade_license_expiry ?? undefined),
    trnNumber: strOrNull(party.trn_number ?? undefined),
    trnExpiry: parsePartyListDateInput(party.trn_expiry ?? undefined),
    contacts: sortContacts(party.contacts ?? []),
  };
}

type PartyFieldsPartial = Partial<z.infer<typeof partyListPartyFieldsSchema>>;

/** Merge partial party API fields into a Prisma `data` object for PUT. */
export function applyPartialPartyFieldsToUpdate(
  d: PartyFieldsPartial,
  rawBody: Record<string, unknown>,
  updateData: Record<string, unknown>
) {
  if (d.trade_license_number !== undefined) {
    updateData.tradeLicenseNumber = strOrNull(d.trade_license_number ?? undefined);
  }
  if (d.trade_license_authority !== undefined) {
    updateData.tradeLicenseAuthority = strOrNull(d.trade_license_authority ?? undefined);
  }
  if (d.trade_license_expiry !== undefined) {
    updateData.tradeLicenseExpiry = parsePartyListDateInput(d.trade_license_expiry ?? undefined);
  }
  if (d.trn_number !== undefined) {
    updateData.trnNumber = strOrNull(d.trn_number ?? undefined);
  }
  if (d.trn_expiry !== undefined) {
    updateData.trnExpiry = parsePartyListDateInput(d.trn_expiry ?? undefined);
  }
  if (Object.prototype.hasOwnProperty.call(rawBody, 'contacts')) {
    const list = d.contacts;
    if (!list?.length) {
      updateData.contactPerson = null;
      updateData.phone = null;
    } else {
      const prim = primaryFromPartyContacts(list);
      updateData.contactPerson = prim.contactPerson;
      updateData.phone = prim.phone;
    }
  }
}
