import type { Prisma } from '@prisma/client';
import {
  basicHoursForProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
  type EmployeeTypeSettingsMap,
} from '@/lib/hr/employeeTypeSettings';

export function basicHoursToMinutes(basicHours: number | Prisma.Decimal): number {
  const n = typeof basicHours === 'number' ? basicHours : Number(basicHours);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 60);
}

export function resolveBasicHoursForEmployee(
  profileExtension: unknown,
  typeSettings: EmployeeTypeSettingsMap
): number {
  return basicHoursForProfileExtension(profileExtension, typeSettings);
}

export function resolveBasicHoursFromCompany(
  profileExtension: unknown,
  company: { hrEmployeeTypeSettings?: unknown; printTemplates?: unknown } | null | undefined
): number {
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);
  return resolveBasicHoursForEmployee(profileExtension, typeSettings);
}

/** OT minutes after basic duty threshold (uses snapshotted basic hours on the row). */
export function calculateOvertimeMinutes(
  workedMinutes: number,
  basicHours: number | Prisma.Decimal,
  status: string
): number {
  if (status === 'ABSENT' || status === 'LEAVE') return 0;
  const basicMinutes = basicHoursToMinutes(basicHours);
  return Math.max(0, workedMinutes - basicMinutes);
}
