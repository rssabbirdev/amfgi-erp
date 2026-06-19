export const SCHEDULE_VIEW_PREFS_DB_KEY = 'hr-schedule-view-prefs';

/** Legacy browser key — read once when migrating to database storage. */
export const SCHEDULE_VIEW_PREFS_LEGACY_STORAGE_KEY = 'hr-schedule-view-prefs';

export const DEFAULT_SCHEDULE_TABLE_ROW_ORDER = [
  'locationType',
  'job',
  'jobCompany',
  'siteName',
  'workProcessDetails',
  'projectType',
  'projectQtyArea',
  'dutyRange',
  'breakRange',
  'workers',
  'workerCount',
  'suggestedWorkers',
  'targetQty',
  'driver1EmployeeId',
  'driver2EmployeeId',
  'remarks',
] as const;

const KNOWN_SCHEDULE_TABLE_ROW_KEYS = new Set<string>(DEFAULT_SCHEDULE_TABLE_ROW_ORDER);

export type ScheduleRowSettings = {
  order: string[];
  hidden: string[];
};

export type ScheduleViewPrefs = {
  showWorkerRail: boolean;
  showRowLabels: boolean;
  viewScale: number;
  useLightGridTheme: boolean;
  rowSettings: ScheduleRowSettings;
};

export function defaultScheduleRowSettings(): ScheduleRowSettings {
  return {
    order: [...DEFAULT_SCHEDULE_TABLE_ROW_ORDER],
    hidden: [],
  };
}

export function normalizeScheduleRowSettings(raw: unknown): ScheduleRowSettings {
  const defaults = defaultScheduleRowSettings();
  if (!raw || typeof raw !== 'object') return defaults;
  const parsed = raw as { order?: unknown; hidden?: unknown };
  const orderFromStorage = Array.isArray(parsed.order)
    ? parsed.order.filter((key): key is string => typeof key === 'string' && KNOWN_SCHEDULE_TABLE_ROW_KEYS.has(key))
    : [];
  const order = [
    ...orderFromStorage,
    ...defaults.order.filter((key) => !orderFromStorage.includes(key)),
  ];
  const hidden = Array.isArray(parsed.hidden)
    ? parsed.hidden.filter((key): key is string => typeof key === 'string' && KNOWN_SCHEDULE_TABLE_ROW_KEYS.has(key))
    : [];
  return { order, hidden };
}

export function defaultScheduleViewPrefs(): ScheduleViewPrefs {
  return {
    showWorkerRail: true,
    showRowLabels: true,
    viewScale: 1,
    useLightGridTheme: false,
    rowSettings: defaultScheduleRowSettings(),
  };
}

export function normalizeScheduleViewPrefs(raw: unknown): ScheduleViewPrefs {
  const defaults = defaultScheduleViewPrefs();
  if (!raw || typeof raw !== 'object') return defaults;
  const parsed = raw as Partial<ScheduleViewPrefs>;
  const viewScale =
    typeof parsed.viewScale === 'number' && parsed.viewScale >= 0.8 && parsed.viewScale <= 1.35
      ? parsed.viewScale
      : defaults.viewScale;
  return {
    showWorkerRail: typeof parsed.showWorkerRail === 'boolean' ? parsed.showWorkerRail : defaults.showWorkerRail,
    showRowLabels: typeof parsed.showRowLabels === 'boolean' ? parsed.showRowLabels : defaults.showRowLabels,
    viewScale,
    useLightGridTheme:
      typeof parsed.useLightGridTheme === 'boolean' ? parsed.useLightGridTheme : defaults.useLightGridTheme,
    rowSettings: normalizeScheduleRowSettings(parsed.rowSettings),
  };
}

export function readLegacyScheduleViewPrefsFromLocalStorage(): ScheduleViewPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SCHEDULE_VIEW_PREFS_LEGACY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeScheduleViewPrefs(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearLegacyScheduleViewPrefsLocalStorage() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SCHEDULE_VIEW_PREFS_LEGACY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
