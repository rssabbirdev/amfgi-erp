export const EMPLOYEE_META_KINDS = ['DESIGNATION', 'DEPARTMENT', 'EMPLOYMENT_TYPE', 'SIGNATURE_GROUP'] as const;

export type EmployeeMetaKind = (typeof EMPLOYEE_META_KINDS)[number];

export const EMPLOYEE_META_KIND_LABELS: Record<EmployeeMetaKind, string> = {
  DESIGNATION: 'Designation',
  DEPARTMENT: 'Department',
  EMPLOYMENT_TYPE: 'Employment type',
  SIGNATURE_GROUP: 'Signature group',
};

export type EmployeeMetaOptionRow = {
  id: string;
  kind: EmployeeMetaKind;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export function parseEmployeeMetaKind(value: string | null | undefined): EmployeeMetaKind | null {
  const upper = String(value ?? '').trim().toUpperCase();
  return EMPLOYEE_META_KINDS.includes(upper as EmployeeMetaKind) ? (upper as EmployeeMetaKind) : null;
}
