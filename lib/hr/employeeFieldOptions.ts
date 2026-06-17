import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_EMPLOYEE_TYPE_SHORT_LABELS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
} from '@/lib/hr/workforceProfile';

export type CatalogOption = {
  value: string;
  label: string;
  searchText?: string;
};

export const GENDER_OPTIONS: CatalogOption[] = [
  { value: 'M', label: 'Male', searchText: 'Male M' },
  { value: 'F', label: 'Female', searchText: 'Female F' },
  { value: 'X', label: 'Prefer not to say', searchText: 'Prefer not to say X' },
];

export const EMPLOYMENT_STATUS_OPTIONS: CatalogOption[] = [
  { value: 'ACTIVE', label: 'Active', searchText: 'Active' },
  { value: 'ON_LEAVE', label: 'On leave', searchText: 'On leave ON_LEAVE' },
  { value: 'SUSPENDED', label: 'Suspended', searchText: 'Suspended' },
  { value: 'EXITED', label: 'Exited', searchText: 'Exited' },
];

export function workforceRoleTypeOptions(): CatalogOption[] {
  return WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    searchText: `${option.label} ${WORKFORCE_EMPLOYEE_TYPE_SHORT_LABELS[option.value]} ${option.value}`,
  }));
}

export function visaHoldingOptions(): CatalogOption[] {
  return WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    searchText: `${option.label} ${option.value}`,
  }));
}

export function catalogLabelForValue(options: CatalogOption[], value: string): string {
  const match = options.find((option) => option.value === value);
  return match?.label ?? value;
}
