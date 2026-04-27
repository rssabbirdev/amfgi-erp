export type JobCostingSettings = {
  nonWorkingWeekdays: number[];
};

const DEFAULT_SETTINGS: JobCostingSettings = {
  nonWorkingWeekdays: [0],
};

export function normalizeJobCostingSettings(input: unknown): JobCostingSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return DEFAULT_SETTINGS;
  }

  const candidate = input as { nonWorkingWeekdays?: unknown };
  const nonWorkingWeekdays = Array.isArray(candidate.nonWorkingWeekdays)
    ? candidate.nonWorkingWeekdays
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : DEFAULT_SETTINGS.nonWorkingWeekdays;

  return {
    nonWorkingWeekdays: nonWorkingWeekdays.length > 0 ? nonWorkingWeekdays : DEFAULT_SETTINGS.nonWorkingWeekdays,
  };
}
