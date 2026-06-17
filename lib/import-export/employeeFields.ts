import { cellToString, downloadWorkbook, parseOptionalBoolean } from '@/lib/import-export/xlsx';
import type { ImportFieldDef, MappedImportRow } from '@/lib/import-export/types';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_EMPLOYEE_TYPE_SHORT_LABELS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  type WorkforceEmployeeType,
  type WorkforceVisaHolding,
  parseWorkforceProfile,
} from '@/lib/hr/workforceProfile';
import { parsePartyListDateInput } from '@/lib/partyListsApi';
import { normalizeNationalityCountryName } from '@/lib/hr/countryNames';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

export const EMPLOYEE_IMPORT_FIELDS: ImportFieldDef[] = [
  { key: 'id', label: 'ID', aliases: ['employee id'] },
  { key: 'employee_code', label: 'Employee Code', required: true, aliases: ['code', 'emp code'] },
  { key: 'full_name', label: 'Full Name', required: true, aliases: ['name', 'employee name'] },
  { key: 'preferred_name', label: 'Preferred Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone', aliases: ['mobile', 'mobile number'] },
  { key: 'nationality', label: 'Nationality', aliases: ['country', 'country name'] },
  { key: 'date_of_birth', label: 'Date of Birth', aliases: ['dob', 'birth date'] },
  { key: 'gender', label: 'Gender' },
  { key: 'designation', label: 'Designation' },
  { key: 'department', label: 'Department' },
  { key: 'employment_type', label: 'Employment Type' },
  { key: 'hire_date', label: 'Hire Date' },
  { key: 'termination_date', label: 'Termination Date' },
  { key: 'status', label: 'Status', aliases: ['employee status'] },
  { key: 'emergency_contact_name', label: 'Emergency Contact Name' },
  { key: 'emergency_contact_phone', label: 'Emergency Contact Phone' },
  { key: 'blood_group', label: 'Blood Group' },
  { key: 'portal_enabled', label: 'Portal Enabled', aliases: ['portal'] },
  { key: 'admin_notes', label: 'Admin Notes', aliases: ['hr notes', 'internal notes'] },
  { key: 'employee_type', label: 'Employee Type', aliases: ['workforce type', 'workforce role'] },
  { key: 'visa_holding', label: 'Visa Holding' },
  { key: 'expertises', label: 'Expertises', aliases: ['skills', 'expertise'] },
  { key: '__skip__', label: 'Skip Column' },
];

const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED'] as const;

export type EmployeeImportRow = {
  id?: string;
  employeeCode: string;
  fullName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  designation?: string | null;
  department?: string | null;
  employmentType?: string | null;
  hireDate?: string | null;
  terminationDate?: string | null;
  status?: (typeof EMPLOYEE_STATUSES)[number];
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  bloodGroup?: string | null;
  portalEnabled?: boolean;
  adminNotes?: string | null;
  employeeType?: WorkforceEmployeeType;
  visaHolding?: WorkforceVisaHolding;
  expertises?: string[];
};

function formatDateExport(value?: string | Date | null) {
  if (!value) return '';
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function employeeTypeLabel(value: string) {
  return WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function visaHoldingLabel(value: string) {
  return WORKFORCE_VISA_HOLDING_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function employeeToExportRow(employee: HrEmployeeExportRecord): Record<string, string | boolean> {
  const profile = parseWorkforceProfile(employee.profileExtension);
  return {
    ID: employee.id,
    'Employee Code': employee.employeeCode,
    'Full Name': employee.fullName,
    'Preferred Name': employee.preferredName ?? '',
    Email: employee.email ?? '',
    Phone: employee.phone ?? '',
    Nationality: employee.nationality ?? '',
    'Date of Birth': formatDateExport(employee.dateOfBirth),
    Gender: employee.gender ?? '',
    Designation: employee.designation ?? '',
    Department: employee.department ?? '',
    'Employment Type': employee.employmentType ?? '',
    'Hire Date': formatDateExport(employee.hireDate),
    'Termination Date': formatDateExport(employee.terminationDate),
    Status: employee.status,
    'Emergency Contact Name': employee.emergencyContactName ?? '',
    'Emergency Contact Phone': employee.emergencyContactPhone ?? '',
    'Blood Group': employee.bloodGroup ?? '',
    'Portal Enabled': employee.portalEnabled ? 'TRUE' : 'FALSE',
    'Admin Notes': employee.adminNotes ?? '',
    'Employee Type': employeeTypeLabel(profile.employeeType),
    'Workforce Role Short': WORKFORCE_EMPLOYEE_TYPE_SHORT_LABELS[profile.employeeType] ?? profile.employeeType,
    'Visa Holding': visaHoldingLabel(profile.visaHolding),
    Expertises: profile.expertises.join(', '),
  };
}

function parseDateField(value: string, label: string, errors: string[]) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = parsePartyListDateInput(trimmed);
  if (!date) errors.push(`Invalid date for ${label} (use YYYY-MM-DD)`);
  return trimmed;
}

function parseEmployeeStatus(value: string, errors: string[]): (typeof EMPLOYEE_STATUSES)[number] | undefined {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  if (normalized === 'ONHOLD') return 'ON_LEAVE';
  const match = EMPLOYEE_STATUSES.find((s) => s === normalized);
  if (!match) {
    errors.push(`Invalid status "${value}" (use Active, On Leave, Suspended, or Exited)`);
    return undefined;
  }
  return match;
}

function parseEmployeeTypeInput(value: string, errors: string[]): WorkforceEmployeeType | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  const byValue = WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find((o) => o.value === upper);
  if (byValue) return byValue.value;
  const byShort = Object.entries(WORKFORCE_EMPLOYEE_TYPE_SHORT_LABELS).find(
    ([, label]) => label.toLowerCase() === trimmed.toLowerCase()
  );
  if (byShort) return byShort[0] as WorkforceEmployeeType;
  const byLabel = WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.label.toLowerCase().startsWith(trimmed.toLowerCase())
  );
  if (byLabel) return byLabel.value;
  errors.push(
    `Invalid employee type "${value}" (use Office Staff, Hybrid Staff, Driver, or Labour / Worker)`
  );
  return undefined;
}

function parseVisaHoldingInput(value: string, errors: string[]): WorkforceVisaHolding | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  const byValue = WORKFORCE_VISA_HOLDING_OPTIONS.find((o) => o.value === upper);
  if (byValue) return byValue.value;
  const byLabel = WORKFORCE_VISA_HOLDING_OPTIONS.find(
    (o) => o.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (byLabel) return byLabel.value;
  errors.push(`Invalid visa holding "${value}"`);
  return undefined;
}

function parseExpertisesInput(value: string): string[] {
  if (!value.trim()) return [];
  return [...new Set(value.split(/[,;|]/).map((part) => part.trim()).filter(Boolean))];
}

function optionalMappedString(row: MappedImportRow, key: string): string | null | undefined {
  if (!(key in row)) return undefined;
  return cellToString(row[key] as string | undefined) || null;
}

export function mapEmployeeImportRow(
  row: (string | number | boolean | null)[],
  headers: string[],
  mapping: Record<number, string>,
  rowIndex: number
): MappedImportRow {
  const parsed: MappedImportRow & Record<string, unknown> = { __rowIndex: rowIndex, __errors: [] };

  headers.forEach((_, colIndex) => {
    const fieldKey = mapping[colIndex];
    if (!fieldKey || fieldKey === '__skip__') return;
    const value = row[colIndex];
    if (value === null || value === undefined || value === '') return;
    parsed[fieldKey] = cellToString(value);
  });

  const employeeCode = cellToString(parsed.employee_code as string | undefined);
  if (!employeeCode) parsed.__errors.push('Missing required field: Employee Code');

  const fullName = cellToString(parsed.full_name as string | undefined);
  if (!fullName) parsed.__errors.push('Missing required field: Full Name');

  if (employeeCode.length > 80) {
    parsed.__errors.push(`Employee Code: maximum 80 characters (your value has ${employeeCode.length})`);
  }
  if (fullName.length > 200) {
    parsed.__errors.push(`Full Name: maximum 200 characters (your value has ${fullName.length})`);
  }

  const email = cellToString(parsed.email as string | undefined);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    parsed.__errors.push('Email must be a valid email address');
  }

  const nationalityRaw = cellToString(parsed.nationality as string | undefined);
  if (nationalityRaw) {
    const normalized = normalizeNationalityCountryName(nationalityRaw);
    if (!normalized.value) {
      parsed.__errors.push(normalized.error ?? 'Invalid nationality');
    } else {
      parsed.nationality = normalized.value;
    }
  }

  const phone = cellToString(parsed.phone as string | undefined);
  if (phone.length > 50) {
    parsed.__errors.push(`Phone: maximum 50 characters (your value has ${phone.length})`);
  }

  for (const [key, label] of [
    ['date_of_birth', 'Date of Birth'],
    ['hire_date', 'Hire Date'],
    ['termination_date', 'Termination Date'],
  ] as const) {
    const raw = cellToString(parsed[key] as string | undefined);
    if (raw) parseDateField(raw, label, parsed.__errors);
  }

  const statusRaw = cellToString(parsed.status as string | undefined);
  if (statusRaw) {
    const status = parseEmployeeStatus(statusRaw, parsed.__errors);
    if (status) parsed.status = status;
  }

  const portalRaw = parsed.portal_enabled;
  if (portalRaw !== undefined && portalRaw !== '') {
    const portal = parseOptionalBoolean(portalRaw as string | number | boolean);
    if (portal === undefined) {
      parsed.__errors.push('Invalid value for Portal Enabled (use TRUE/FALSE or Yes/No)');
    } else {
      parsed.portalEnabled = portal;
    }
  }

  const typeRaw = cellToString(parsed.employee_type as string | undefined);
  if (typeRaw) {
    const employeeType = parseEmployeeTypeInput(typeRaw, parsed.__errors);
    if (employeeType) parsed.employeeType = employeeType;
  }

  const visaRaw = cellToString(parsed.visa_holding as string | undefined);
  if (visaRaw) {
    const visaHolding = parseVisaHoldingInput(visaRaw, parsed.__errors);
    if (visaHolding) parsed.visaHolding = visaHolding;
  }

  const expertisesRaw = cellToString(parsed.expertises as string | undefined);
  if (expertisesRaw !== undefined && expertisesRaw !== '') {
    parsed.expertisesList = parseExpertisesInput(expertisesRaw);
  } else if ('expertises' in parsed) {
    parsed.expertisesList = [];
  }

  return parsed;
}

export function employeeImportRowToPayload(row: MappedImportRow): EmployeeImportRow {
  const payload: EmployeeImportRow = {
    employeeCode: cellToString(row.employee_code as string),
    fullName: cellToString(row.full_name as string),
  };

  const id = optionalMappedString(row, 'id');
  if (id !== undefined) payload.id = id || undefined;
  if ('preferred_name' in row) payload.preferredName = optionalMappedString(row, 'preferred_name') ?? null;
  if ('email' in row) payload.email = optionalMappedString(row, 'email') ?? null;
  if ('phone' in row) payload.phone = optionalMappedString(row, 'phone') ?? null;
  if ('nationality' in row) payload.nationality = optionalMappedString(row, 'nationality') ?? null;
  if ('date_of_birth' in row) payload.dateOfBirth = optionalMappedString(row, 'date_of_birth') ?? null;
  if ('gender' in row) payload.gender = optionalMappedString(row, 'gender') ?? null;
  if ('designation' in row) payload.designation = optionalMappedString(row, 'designation') ?? null;
  if ('department' in row) payload.department = optionalMappedString(row, 'department') ?? null;
  if ('employment_type' in row) payload.employmentType = optionalMappedString(row, 'employment_type') ?? null;
  if ('hire_date' in row) payload.hireDate = optionalMappedString(row, 'hire_date') ?? null;
  if ('termination_date' in row) payload.terminationDate = optionalMappedString(row, 'termination_date') ?? null;
  if (row.status !== undefined) payload.status = row.status as EmployeeImportRow['status'];
  if ('emergency_contact_name' in row) {
    payload.emergencyContactName = optionalMappedString(row, 'emergency_contact_name') ?? null;
  }
  if ('emergency_contact_phone' in row) {
    payload.emergencyContactPhone = optionalMappedString(row, 'emergency_contact_phone') ?? null;
  }
  if ('blood_group' in row) payload.bloodGroup = optionalMappedString(row, 'blood_group') ?? null;
  if ('admin_notes' in row) payload.adminNotes = optionalMappedString(row, 'admin_notes') ?? null;
  if (row.portalEnabled !== undefined) payload.portalEnabled = Boolean(row.portalEnabled);
  if (row.employeeType !== undefined) payload.employeeType = row.employeeType as WorkforceEmployeeType;
  if (row.visaHolding !== undefined) payload.visaHolding = row.visaHolding as WorkforceVisaHolding;
  if (row.expertisesList !== undefined) payload.expertises = row.expertisesList as string[];

  return payload;
}

export function downloadEmployeeImportTemplate() {
  const instructions = [
    ['Field', 'Required', 'Instructions'],
    ['ID', 'No', 'Leave blank for new employees. Use existing ID to update.'],
    ['Employee Code', 'Yes', 'Unique per company. Used to match duplicates on update.'],
    ['Full Name', 'Yes', 'Legal / display name.'],
    ['Status', 'No', 'ACTIVE, ON_LEAVE, SUSPENDED, or EXITED. New rows default to ACTIVE when blank.'],
    ['Portal Enabled', 'No', 'TRUE/FALSE. Does not auto-create login accounts on import.'],
    ['Admin Notes', 'No', 'HR-only internal notes from the employee profile.'],
    ['Employee Type', 'No', 'Office Staff, Hybrid Staff, Driver, Labour / Worker, or short names (Office, Hybrid, Driver, Labour).'],
    ['Visa Holding', 'No', 'Company provided, Self own, or No visa.'],
    ['Expertises', 'No', 'Comma-separated names from HR → Expertise catalog.'],
    ['Nationality', 'No', 'Use country names (e.g. India, United Arab Emirates). Legacy demonyms like Indian or Emirati are accepted on import.'],
    ['Designation / Department / Employment Type', 'No', 'Free text or values from HR → Employment options.'],
    ['Dates', 'No', 'Use YYYY-MM-DD.'],
    ['Updates', '—', 'Only mapped columns with values are changed; blank cells keep existing data.'],
  ];
  const template = [
    {
      ID: '',
      'Employee Code': 'EMP-001',
      'Full Name': 'Sample Employee',
      'Preferred Name': '',
      Email: 'employee@example.com',
      Phone: '+971500000000',
      Nationality: 'United Arab Emirates',
      'Date of Birth': '1990-01-15',
      Gender: '',
      Designation: 'Technician',
      Department: 'Production',
      'Employment Type': 'Permanent',
      'Hire Date': '2024-01-01',
      'Termination Date': '',
      Status: 'ACTIVE',
      'Emergency Contact Name': '',
      'Emergency Contact Phone': '',
      'Blood Group': '',
      'Portal Enabled': 'FALSE',
      'Admin Notes': '',
      'Employee Type': 'Labour / Worker',
      'Visa Holding': 'Company provided',
      Expertises: 'Lamination, Finishing',
    },
  ];
  downloadWorkbook('employees-import-template.xlsx', [
    { name: 'Instructions', rows: instructions },
    { name: 'Template', rows: template },
  ]);
}
