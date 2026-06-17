import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  parseWorkforceProfile,
  type WorkforceEmployeeType,
  type WorkforceVisaHolding,
} from '@/lib/hr/workforceProfile';

export type HolidayEmployeeCriteria = {
  employmentTypes: string[];
  workforceRoleTypes: WorkforceEmployeeType[];
  visaHoldings: WorkforceVisaHolding[];
};

export type EmployeeHolidayProfile = {
  employmentType: string | null;
  workforceRoleType: WorkforceEmployeeType;
  visaHolding: WorkforceVisaHolding;
};

const WORKFORCE_ROLE_VALUES = new Set(
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => option.value)
);
const VISA_HOLDING_VALUES = new Set(WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => option.value));

export function normalizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

export function normalizeHolidayEmployeeCriteria(raw: {
  employmentTypes?: unknown;
  workforceRoleTypes?: unknown;
  visaHoldings?: unknown;
}): HolidayEmployeeCriteria {
  const employmentTypes = normalizeStringArray(raw.employmentTypes);
  const workforceRoleTypes = normalizeStringArray(raw.workforceRoleTypes).filter((value): value is WorkforceEmployeeType =>
    WORKFORCE_ROLE_VALUES.has(value as WorkforceEmployeeType)
  );
  const visaHoldings = normalizeStringArray(raw.visaHoldings).filter((value): value is WorkforceVisaHolding =>
    VISA_HOLDING_VALUES.has(value as WorkforceVisaHolding)
  );

  return { employmentTypes, workforceRoleTypes, visaHoldings };
}

export function parseHolidayEmployeeCriteriaInput(input: {
  employmentTypes?: string[] | null;
  workforceRoleTypes?: string[] | null;
  visaHoldings?: string[] | null;
}): HolidayEmployeeCriteria {
  const employmentTypes = normalizeStringArray(input.employmentTypes);
  const workforceRoleTypes: WorkforceEmployeeType[] = [];
  for (const value of normalizeStringArray(input.workforceRoleTypes)) {
    const upper = value.toUpperCase();
    if (!WORKFORCE_ROLE_VALUES.has(upper as WorkforceEmployeeType)) {
      throw new Error(`Invalid workforce role type: ${value}`);
    }
    workforceRoleTypes.push(upper as WorkforceEmployeeType);
  }

  const visaHoldings: WorkforceVisaHolding[] = [];
  for (const value of normalizeStringArray(input.visaHoldings)) {
    const upper = value.toUpperCase();
    if (!VISA_HOLDING_VALUES.has(upper as WorkforceVisaHolding)) {
      throw new Error(`Invalid visa holding: ${value}`);
    }
    visaHoldings.push(upper as WorkforceVisaHolding);
  }

  return {
    employmentTypes,
    workforceRoleTypes: [...new Set(workforceRoleTypes)],
    visaHoldings: [...new Set(visaHoldings)],
  };
}

export function employeeHolidayProfileFromEmployee(employee: {
  employmentType: string | null;
  profileExtension: unknown;
}): EmployeeHolidayProfile {
  const workforce = parseWorkforceProfile(employee.profileExtension);
  return {
    employmentType: employee.employmentType?.trim() || null,
    workforceRoleType: workforce.employeeType,
    visaHolding: workforce.visaHolding,
  };
}

function matchesEmploymentType(employeeType: string | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!employeeType) return false;
  const normalized = employeeType.trim().toLowerCase();
  return allowed.some((value) => value.trim().toLowerCase() === normalized);
}

/** True when an employee matches all configured holiday eligibility filters. */
export function employeeMatchesHolidayCriteria(
  employee: EmployeeHolidayProfile,
  criteria: HolidayEmployeeCriteria
): boolean {
  if (!matchesEmploymentType(employee.employmentType, criteria.employmentTypes)) return false;
  if (
    criteria.workforceRoleTypes.length > 0 &&
    !criteria.workforceRoleTypes.includes(employee.workforceRoleType)
  ) {
    return false;
  }
  if (criteria.visaHoldings.length > 0 && !criteria.visaHoldings.includes(employee.visaHolding)) {
    return false;
  }
  return true;
}

export function filterCompanyHolidaysForEmployee<
  T extends HolidayEmployeeCriteria,
>(holidays: T[], employee: EmployeeHolidayProfile): T[] {
  return holidays.filter((holiday) => employeeMatchesHolidayCriteria(employee, holiday));
}

export function formatHolidayCriteriaSummary(criteria: HolidayEmployeeCriteria): string {
  const parts: string[] = [];
  if (criteria.employmentTypes.length > 0) {
    parts.push(`Employment: ${criteria.employmentTypes.join(', ')}`);
  }
  if (criteria.workforceRoleTypes.length > 0) {
    const labels = criteria.workforceRoleTypes.map((value) => {
      return WORKFORCE_EMPLOYEE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
    });
    parts.push(`Role: ${labels.join(', ')}`);
  }
  if (criteria.visaHoldings.length > 0) {
    const labels = criteria.visaHoldings.map((value) => {
      return WORKFORCE_VISA_HOLDING_OPTIONS.find((option) => option.value === value)?.label ?? value;
    });
    parts.push(`Visa: ${labels.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'All employees';
}
