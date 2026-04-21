export const WORKFORCE_EXPERTISE_OPTIONS = [
  'Lamination',
  'Moulding',
  'Finishing',
  'Gelcoat',
  'Assembly',
  'Installation',
  'Scaffolding',
  'Rigging',
  'Quality Inspection',
  'Forklift',
  'Driving',
  'Welding',
] as const;

export const WORKFORCE_EMPLOYEE_TYPE_OPTIONS = [
  { value: 'OFFICE_STAFF', label: 'Office Staff (salary, no schedule assignment)' },
  { value: 'HYBRID_STAFF', label: 'Hybrid Staff (office + site assignment)' },
  { value: 'DRIVER', label: 'Driver (driver field + attendance)' },
  { value: 'LABOUR_WORKER', label: 'Labour / Worker (team leader + worker + attendance)' },
] as const;

export type WorkforceEmployeeType = (typeof WORKFORCE_EMPLOYEE_TYPE_OPTIONS)[number]['value'];
export const WORKFORCE_VISA_HOLDING_OPTIONS = [
  { value: 'COMPANY_PROVIDED', label: 'Company provided' },
  { value: 'SELF_OWN', label: 'Self own' },
  { value: 'NO_VISA', label: 'No visa' },
] as const;

export type WorkforceVisaHolding = (typeof WORKFORCE_VISA_HOLDING_OPTIONS)[number]['value'];

export type WorkforceProfile = {
  employeeType: WorkforceEmployeeType;
  visaHolding: WorkforceVisaHolding;
  expertises: string[];
};

const DEFAULT_WORKFORCE_PROFILE: WorkforceProfile = {
  employeeType: 'LABOUR_WORKER',
  visaHolding: 'COMPANY_PROVIDED',
  expertises: [],
};

function normalizeType(input: unknown): WorkforceEmployeeType {
  const v = String(input ?? '').trim().toUpperCase();
  if (v === 'OFFICE_STAFF' || v === 'HYBRID_STAFF' || v === 'DRIVER' || v === 'LABOUR_WORKER') return v;
  return DEFAULT_WORKFORCE_PROFILE.employeeType;
}

function normalizeExpertises(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((x) => String(x ?? '').trim()).filter(Boolean))];
}

function normalizeVisaHolding(input: unknown): WorkforceVisaHolding {
  const v = String(input ?? '').trim().toUpperCase();
  if (v === 'COMPANY_PROVIDED' || v === 'SELF_OWN' || v === 'NO_VISA') return v;
  return DEFAULT_WORKFORCE_PROFILE.visaHolding;
}

export function parseWorkforceProfile(raw: unknown): WorkforceProfile {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Support either flat shape or nested `workforce` block.
    const candidate =
      obj.workforce && typeof obj.workforce === 'object'
        ? (obj.workforce as Record<string, unknown>)
        : obj;
    return {
      employeeType: normalizeType(candidate.employeeType),
      visaHolding: normalizeVisaHolding(candidate.visaHolding),
      expertises: normalizeExpertises(candidate.expertises),
    };
  }
  return DEFAULT_WORKFORCE_PROFILE;
}

export function buildWorkforceProfileExtension(input: WorkforceProfile): Record<string, unknown> {
  return {
    workforce: {
      employeeType: normalizeType(input.employeeType),
      visaHolding: normalizeVisaHolding(input.visaHolding),
      expertises: normalizeExpertises(input.expertises),
    },
  };
}
