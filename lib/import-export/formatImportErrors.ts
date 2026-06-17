import type { ZodError } from 'zod';

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  contactPerson: 'Contact Person',
  phone: 'Primary Phone',
  email: 'Email',
  address: 'Address',
  isActive: 'Is Active',
  contacts: 'Contacts',
  contact_name: 'Contact Name',
  trade_license_number: 'Trade License Number',
  trade_license_authority: 'Trade License Authority',
  trade_license_expiry: 'Trade License Expiry',
  trn_number: 'TRN Number',
  trn_expiry: 'TRN Expiry',
  jobNumber: 'Job Number',
  customerId: 'Customer ID',
  customerName: 'Customer Name',
  employeeCode: 'Employee Code',
  fullName: 'Full Name',
  preferredName: 'Preferred Name',
  dateOfBirth: 'Date of Birth',
  employmentType: 'Employment Type',
  hireDate: 'Hire Date',
  terminationDate: 'Termination Date',
  emergencyContactName: 'Emergency Contact Name',
  emergencyContactPhone: 'Emergency Contact Phone',
  bloodGroup: 'Blood Group',
  portalEnabled: 'Portal Enabled',
  adminNotes: 'Admin Notes',
  employeeType: 'Employee Type',
  visaHolding: 'Visa Holding',
};

function labelForPathSegment(segment: string | number): string {
  if (typeof segment === 'number') return `item ${segment + 1}`;
  return FIELD_LABELS[segment] ?? segment;
}

function clarifyZodMessage(message: string, fieldLabel: string): string {
  const maxMatch = message.match(/at most (\d+) character/i);
  if (maxMatch) {
    return `maximum ${maxMatch[1]} characters allowed`;
  }
  const minMatch = message.match(/at least (\d+) character/i);
  if (minMatch) {
    return `minimum ${minMatch[1]} characters required`;
  }
  if (message.toLowerCase().includes('invalid email')) {
    return 'must be a valid email address';
  }
  if (message.toLowerCase().includes('required')) {
    return 'is required';
  }
  return message.replace(/^String /, `${fieldLabel} `);
}

/** Turn Zod bulk-import errors into row + field specific messages. */
export function formatZodImportError(error: ZodError, entityLabel = 'Import'): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path;
    const fieldKey = path.length > 0 ? path[path.length - 1] : 'value';
    const fieldLabel =
      typeof fieldKey === 'string' ? (FIELD_LABELS[fieldKey] ?? fieldKey) : String(fieldKey);

    let section = entityLabel;
    let sheetRow: number | undefined;

    if (path[0] === 'newRows' || path[0] === 'updateRows') {
      section = path[0] === 'newRows' ? 'New rows' : 'Update rows';
      if (typeof path[1] === 'number') {
        const index = path[1];
        sheetRow = index + 2;
      }
    }

    const contactIndex = path.findIndex((p) => p === 'contacts');
    if (contactIndex >= 0 && typeof path[contactIndex + 1] === 'number') {
      const contactNo = (path[contactIndex + 1] as number) + 1;
      const contactField = path[contactIndex + 2];
      const contactFieldLabel =
        typeof contactField === 'string'
          ? (FIELD_LABELS[contactField] ?? contactField)
          : 'Contact field';
      const rowPart = sheetRow != null ? `Sheet row ${sheetRow}` : section;
      const detail = clarifyZodMessage(issue.message, contactFieldLabel);
      return `${rowPart}, Contact ${contactNo}, ${contactFieldLabel}: ${detail}`;
    }

    const rowPart =
      sheetRow != null
        ? `Sheet row ${sheetRow}`
        : path.length
          ? `${section} → ${path.map((segment) => labelForPathSegment(segment as string | number)).join(' → ')}`
          : section;

    const detail = clarifyZodMessage(issue.message, fieldLabel);
    return `${rowPart}, ${fieldLabel}: ${detail}`;
  });

  return lines.length === 1 ? lines[0]! : lines.slice(0, 8).join('\n');
}
