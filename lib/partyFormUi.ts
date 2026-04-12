/**
 * UI helpers: party lists API field names & contacts[] for customer/supplier forms.
 */

import type { Customer } from '@/store/api/endpoints/customers';
import type { Supplier } from '@/store/api/endpoints/suppliers';

export type PartyContactRow = {
  id?: number;
  contact_name: string;
  email: string;
  phone: string;
  sort_order: number;
};

export function formatPartyDateInput(d: string | Date | null | undefined): string {
  if (d == null || d === '') return '';
  const x = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return '';
  return x.toISOString().slice(0, 10);
}

function rowsFromContactsJson(
  contactsJson: unknown,
  fallback: { contactPerson?: string | null; phone?: string | null; email?: string | null }
): PartyContactRow[] {
  if (Array.isArray(contactsJson) && contactsJson.length > 0) {
    return contactsJson.map((row: Record<string, unknown>, i: number) => ({
      id: typeof row.id === 'number' ? row.id : undefined,
      contact_name: String(row.contact_name ?? ''),
      email: row.email != null ? String(row.email) : '',
      phone: row.phone != null ? String(row.phone) : '',
      sort_order: typeof row.sort_order === 'number' ? row.sort_order : i,
    }));
  }
  if (fallback.contactPerson || fallback.phone || fallback.email) {
    return [
      {
        contact_name: fallback.contactPerson?.trim() ?? '',
        email: fallback.email?.trim() ?? '',
        phone: fallback.phone?.trim() ?? '',
        sort_order: 0,
      },
    ];
  }
  return [{ contact_name: '', email: '', phone: '', sort_order: 0 }];
}

export type CustomerPartyFormState = {
  name: string;
  email: string;
  address: string;
  trade_license_number: string;
  trade_license_authority: string;
  trade_license_expiry: string;
  trn_number: string;
  trn_expiry: string;
  contacts: PartyContactRow[];
};

export function customerToPartyFormState(c: Customer): CustomerPartyFormState {
  return {
    name: c.name,
    email: c.email ?? '',
    address: c.address ?? '',
    trade_license_number: c.tradeLicenseNumber ?? '',
    trade_license_authority: c.tradeLicenseAuthority ?? '',
    trade_license_expiry: formatPartyDateInput(c.tradeLicenseExpiry),
    trn_number: c.trnNumber ?? '',
    trn_expiry: formatPartyDateInput(c.trnExpiry),
    contacts: rowsFromContactsJson(c.contactsJson, {
      contactPerson: c.contactPerson,
      phone: c.phone,
      email: c.email,
    }),
  };
}

export function emptyCustomerPartyFormState(): CustomerPartyFormState {
  return {
    name: '',
    email: '',
    address: '',
    trade_license_number: '',
    trade_license_authority: '',
    trade_license_expiry: '',
    trn_number: '',
    trn_expiry: '',
    contacts: [{ contact_name: '', email: '', phone: '', sort_order: 0 }],
  };
}

export function customerPartyFormToApiBody(s: CustomerPartyFormState): Record<string, unknown> {
  const contacts = s.contacts
    .filter(
      (row) =>
        row.contact_name.trim() !== '' ||
        row.email.trim() !== '' ||
        row.phone.trim() !== ''
    )
    .map((row, i) => ({
    ...(row.id != null ? { id: row.id } : {}),
    contact_name: row.contact_name.trim(),
    email: row.email.trim() === '' ? '' : row.email.trim(),
    phone: row.phone.trim() === '' ? null : row.phone.trim(),
    sort_order: row.sort_order ?? i,
  }));
  return {
    name: s.name.trim(),
    email: s.email.trim(),
    address: s.address.trim() || undefined,
    trade_license_number: s.trade_license_number.trim() || null,
    trade_license_authority: s.trade_license_authority.trim() || null,
    trade_license_expiry: s.trade_license_expiry.trim() || null,
    trn_number: s.trn_number.trim() || null,
    trn_expiry: s.trn_expiry.trim() || null,
    contacts,
  };
}

export type SupplierPartyFormState = CustomerPartyFormState & {
  city: string;
  country: string;
};

export function supplierToPartyFormState(s: Supplier): SupplierPartyFormState {
  return {
    name: s.name,
    email: s.email ?? '',
    address: s.address ?? '',
    trade_license_number: s.tradeLicenseNumber ?? '',
    trade_license_authority: s.tradeLicenseAuthority ?? '',
    trade_license_expiry: formatPartyDateInput(s.tradeLicenseExpiry),
    trn_number: s.trnNumber ?? '',
    trn_expiry: formatPartyDateInput(s.trnExpiry),
    contacts: rowsFromContactsJson(s.contactsJson, {
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
    }),
    city: s.city ?? '',
    country: s.country ?? '',
  };
}

export function emptySupplierPartyFormState(): SupplierPartyFormState {
  return {
    ...emptyCustomerPartyFormState(),
    city: '',
    country: '',
  };
}

export function supplierPartyFormToApiBody(s: SupplierPartyFormState): Record<string, unknown> {
  return {
    ...customerPartyFormToApiBody(s),
    city: s.city.trim() || undefined,
    country: s.country.trim() || undefined,
  };
}
