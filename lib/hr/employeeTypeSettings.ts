import { parseWorkforceProfile, type WorkforceEmployeeType } from '@/lib/hr/workforceProfile';

export type EmployeeTypeTimingSetting = {
  basicHoursPerDay: number;
  dutyStart: string;
  dutyEnd: string;
  breakStart: string;
  breakEnd: string;
};

export type EmployeeTypeSettingsMap = Record<WorkforceEmployeeType, EmployeeTypeTimingSetting>;

export const DEFAULT_EMPLOYEE_TYPE_SETTINGS: EmployeeTypeSettingsMap = {
  OFFICE_STAFF: { basicHoursPerDay: 8, dutyStart: '09:00', dutyEnd: '18:00', breakStart: '13:00', breakEnd: '14:00' },
  HYBRID_STAFF: { basicHoursPerDay: 8, dutyStart: '08:00', dutyEnd: '17:00', breakStart: '13:00', breakEnd: '14:00' },
  DRIVER: { basicHoursPerDay: 10, dutyStart: '07:00', dutyEnd: '17:00', breakStart: '12:00', breakEnd: '13:00' },
  LABOUR_WORKER: { basicHoursPerDay: 8, dutyStart: '08:00', dutyEnd: '17:00', breakStart: '13:00', breakEnd: '14:00' },
};

function normalizeTime(input: unknown, fallback: string): string {
  const raw = String(input ?? '').trim();
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

function normalizeBasicHours(input: unknown, fallback: number): number {
  const num = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(num) || num <= 0 || num > 24) return fallback;
  return Math.round(num * 100) / 100;
}

function normalizeEmployeeTypeSettings(raw: unknown): EmployeeTypeSettingsMap {
  const result: EmployeeTypeSettingsMap = JSON.parse(
    JSON.stringify(DEFAULT_EMPLOYEE_TYPE_SETTINGS)
  ) as EmployeeTypeSettingsMap;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;

  const rec = raw as Record<string, unknown>;
  for (const type of Object.keys(DEFAULT_EMPLOYEE_TYPE_SETTINGS) as WorkforceEmployeeType[]) {
    const entry = rec[type];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    result[type] = {
      basicHoursPerDay: normalizeBasicHours(
        e.basicHoursPerDay,
        DEFAULT_EMPLOYEE_TYPE_SETTINGS[type].basicHoursPerDay
      ),
      dutyStart: normalizeTime(e.dutyStart, DEFAULT_EMPLOYEE_TYPE_SETTINGS[type].dutyStart),
      dutyEnd: normalizeTime(e.dutyEnd, DEFAULT_EMPLOYEE_TYPE_SETTINGS[type].dutyEnd),
      breakStart: normalizeTime(e.breakStart, DEFAULT_EMPLOYEE_TYPE_SETTINGS[type].breakStart),
      breakEnd: normalizeTime(e.breakEnd, DEFAULT_EMPLOYEE_TYPE_SETTINGS[type].breakEnd),
    };
  }

  return result;
}

export function readEmployeeTypeSettingsFromCompanyData(input: {
  hrEmployeeTypeSettings?: unknown;
  printTemplates?: unknown;
} | null | undefined): EmployeeTypeSettingsMap {
  if (!input || typeof input !== 'object') {
    return normalizeEmployeeTypeSettings(null);
  }

  const direct = normalizeEmployeeTypeSettings(input.hrEmployeeTypeSettings);
  const hasDirect =
    input.hrEmployeeTypeSettings &&
    typeof input.hrEmployeeTypeSettings === 'object' &&
    !Array.isArray(input.hrEmployeeTypeSettings);
  if (hasDirect) return direct;

  const legacyRoot =
    input.printTemplates && typeof input.printTemplates === 'object' && !Array.isArray(input.printTemplates)
      ? (input.printTemplates as Record<string, unknown>)
      : null;

  return normalizeEmployeeTypeSettings(legacyRoot?.hrEmployeeTypeSettings);
}

export function writeEmployeeTypeSettingsIntoCompanyField(
  nextSettings: EmployeeTypeSettingsMap
): EmployeeTypeSettingsMap {
  return normalizeEmployeeTypeSettings(nextSettings);
}

export function employeeTypeFromProfileExtension(profileExtension: unknown): WorkforceEmployeeType {
  return parseWorkforceProfile(profileExtension).employeeType;
}

export function basicHoursForProfileExtension(
  profileExtension: unknown,
  settings: EmployeeTypeSettingsMap
): number {
  const type = employeeTypeFromProfileExtension(profileExtension);
  return settings[type]?.basicHoursPerDay ?? DEFAULT_EMPLOYEE_TYPE_SETTINGS[type].basicHoursPerDay;
}
