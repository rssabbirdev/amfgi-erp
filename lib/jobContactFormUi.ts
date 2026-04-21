/**
 * Job contacts UI ↔ `Job.contactsJson` (same shape as PM sync: label, name, number, email, designation).
 */

export type JobContactRow = {
  label: string;
  name: string;
  email: string;
  number: string;
  designation: string;
};

export function emptyJobContactRow(): JobContactRow {
  return { label: '', name: '', email: '', number: '', designation: '' };
}

/** Build rows for the form from stored JSON + optional primary `contactPerson`. */
export function jobContactsToRows(
  contactsJson: unknown,
  contactPersonFallback?: string | null
): JobContactRow[] {
  if (Array.isArray(contactsJson) && contactsJson.length > 0) {
    return contactsJson.map((row: Record<string, unknown>) => ({
      label: String(row.label ?? ''),
      name: String(row.name ?? row.contact_name ?? ''),
      email: row.email != null ? String(row.email) : '',
      number: String(row.number ?? row.phone ?? ''),
      designation: String(row.designation ?? ''),
    }));
  }
  if (contactPersonFallback?.trim()) {
    return [{ ...emptyJobContactRow(), name: contactPersonFallback.trim() }];
  }
  return [emptyJobContactRow()];
}

function rowHasContent(r: JobContactRow): boolean {
  return (
    r.label.trim() !== '' ||
    r.name.trim() !== '' ||
    r.email.trim() !== '' ||
    r.number.trim() !== '' ||
    r.designation.trim() !== ''
  );
}

/** Payload for `contactsJson` on create/update job (array of contact objects). */
export function rowsToJobContactsPayload(rows: JobContactRow[]): Array<Record<string, string>> {
  return rows.filter(rowHasContent).map((r) => {
    const o: Record<string, string> = {};
    if (r.label.trim()) o.label = r.label.trim();
    if (r.name.trim()) o.name = r.name.trim();
    if (r.email.trim()) o.email = r.email.trim();
    if (r.number.trim()) o.number = r.number.trim();
    if (r.designation.trim()) o.designation = r.designation.trim();
    return o;
  });
}

/** First contact name → `Job.contactPerson` (print templates / summaries). */
export function primaryJobContactPersonFromRows(rows: JobContactRow[]): string | undefined {
  const r = rows.find((x) => x.name.trim());
  const n = r?.name.trim();
  return n || undefined;
}
