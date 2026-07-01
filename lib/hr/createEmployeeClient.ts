import { generateEmployeeCode } from '@/lib/hr/generateEmployeeCode';

export type WorkforceEmployeeType = 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER';
export type VisaHolding = 'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA';

export type CreateEmployeeClientInput = {
  fullName: string;
  preferredName?: string | null;
  phone?: string | null;
  nationality?: string | null;
  gender?: string | null;
  designation?: string | null;
  department?: string | null;
  employmentType?: string | null;
  signatureGroup?: string | null;
  hireDate?: string | null;
  employeeType?: WorkforceEmployeeType;
  visaHolding?: VisaHolding;
};

export type CreatedEmployeeClientRecord = {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  status?: string | null;
  profileExtension?: unknown;
};

export async function createEmployeeRecord(
  input: CreateEmployeeClientInput,
): Promise<CreatedEmployeeClientRecord> {
  const legalName = input.fullName.trim();
  if (!legalName) {
    throw new Error('Full name is required');
  }
  const displayName = input.preferredName?.trim() || legalName;

  const res = await fetch('/api/hr/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      employeeCode: generateEmployeeCode(),
      fullName: legalName,
      preferredName: displayName || null,
      nationality: input.nationality?.trim() || null,
      gender: input.gender?.trim() || null,
      phone: input.phone?.trim() || null,
      designation: input.designation?.trim() || null,
      department: input.department?.trim() || null,
      employmentType: input.employmentType?.trim() || null,
      signatureGroup: input.signatureGroup?.trim() || null,
      hireDate: input.hireDate?.trim() || null,
      profileExtension: {
        workforce: {
          employeeType: input.employeeType ?? 'LABOUR_WORKER',
          expertises: [],
          ...(input.visaHolding ? { visaHolding: input.visaHolding } : {}),
        },
      },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
    data?: CreatedEmployeeClientRecord;
  } | null;
  if (!res.ok || !json?.success || !json.data?.id) {
    throw new Error(json?.error ?? 'Save failed');
  }
  return json.data;
}
