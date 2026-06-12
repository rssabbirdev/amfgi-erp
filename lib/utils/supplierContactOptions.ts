export type SupplierContactOption = {
  id: string;
  name: string;
  label: string;
  phone?: string;
  email?: string;
  searchText: string;
};

export type SupplierContactSource = {
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  contactsJson?: unknown;
};

/** Party-list / SupplierContact rows stored on supplier.contactsJson */
export function parseSupplierContactsJson(
  contacts: unknown
): Array<{ name: string; phone?: string; email?: string }> {
  if (!Array.isArray(contacts)) return [];
  const rows: Array<{ name: string; phone?: string; email?: string }> = [];
  for (const row of contacts) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name =
      (typeof r.contact_name === 'string' ? r.contact_name : '') ||
      (typeof r.name === 'string' ? r.name : '');
    const trimmed = name.trim();
    if (!trimmed) continue;
    rows.push({
      name: trimmed,
      phone: typeof r.phone === 'string' ? r.phone.trim() || undefined : undefined,
      email: typeof r.email === 'string' ? r.email.trim() || undefined : undefined,
    });
  }
  return rows;
}

export function getSupplierContactOptions(
  supplier: SupplierContactSource | null | undefined
): SupplierContactOption[] {
  if (!supplier) return [];

  const options: SupplierContactOption[] = [];
  const pushUnique = (
    name: string,
    details?: { extraLabel?: string; phone?: string; email?: string }
  ) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (options.some((x) => x.name.toLowerCase() === trimmed.toLowerCase())) return;
    const searchBits = [
      trimmed,
      details?.phone?.trim() || '',
      details?.email?.trim() || '',
      details?.extraLabel?.trim() || '',
    ].filter(Boolean);
    options.push({
      id: `supplier-contact-${options.length}`,
      name: trimmed,
      label: details?.extraLabel ? `${trimmed} (${details.extraLabel})` : trimmed,
      phone: details?.phone?.trim() || undefined,
      email: details?.email?.trim() || undefined,
      searchText: searchBits.join(' '),
    });
  };

  for (const row of parseSupplierContactsJson(supplier.contactsJson)) {
    pushUnique(row.name, { phone: row.phone, email: row.email });
  }

  if (supplier.contactPerson?.trim()) {
    pushUnique(supplier.contactPerson.trim(), {
      extraLabel: 'Primary',
      phone: supplier.phone?.trim() || undefined,
      email: supplier.email?.trim() || undefined,
    });
  }

  return options;
}

export function resolveSupplierContactIdByName(
  options: SupplierContactOption[],
  name: string
): string {
  const trimmed = name.trim();
  if (!trimmed) return options[0]?.id ?? '';
  const exact = options.find((contact) => contact.name === trimmed);
  if (exact) return exact.id;
  const caseInsensitive = options.find(
    (contact) => contact.name.toLowerCase() === trimmed.toLowerCase()
  );
  return caseInsensitive?.id ?? options[0]?.id ?? '';
}
