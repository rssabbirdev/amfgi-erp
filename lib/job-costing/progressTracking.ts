export type TrackableJobProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';

export type TrackableItem = {
  id: string;
  label: string;
  unit?: string | null;
  targetValue: number;
  sourceKey?: string | null;
};

export type TrackableProgressEntry = {
  trackerId?: string | null;
  entryDate: Date | string;
  quantity: number;
};

export type TrackableAttendanceEntry = {
  employeeId: string;
  workDate: Date | string;
  workedMinutes: number;
};

type TrackingConfigLike = {
  progressStatus?: TrackableJobProgressStatus | null;
  progressPercent?: number | null;
};

function startOfDayIso(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseTrackableItems(value: unknown): TrackableItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TrackableItem[] => {
    if (!isRecord(item)) return [];
    const id = String(item.id ?? '').trim();
    const label = String(item.label ?? '').trim();
    const targetValue = Number(item.targetValue ?? 0);
    if (!id || !label || !Number.isFinite(targetValue) || targetValue <= 0) return [];
    return [{
      id,
      label,
      unit: typeof item.unit === 'string' ? item.unit.trim() || null : null,
      sourceKey: typeof item.sourceKey === 'string' ? item.sourceKey.trim() || null : null,
      targetValue,
    }];
  });
}

export function calculateTrackedProgress(
  trackers: TrackableItem[],
  rawEntries: TrackableProgressEntry[],
  config: TrackingConfigLike,
  rawAttendanceEntries: TrackableAttendanceEntry[] = []
) {
  const normalizedEntries = rawEntries
    .map((entry) => ({
      trackerId: entry.trackerId ? String(entry.trackerId).trim() : '',
      entryDate: entry.entryDate instanceof Date ? entry.entryDate : new Date(entry.entryDate),
      quantity: Number(entry.quantity) || 0,
    }))
    .filter((entry) => !Number.isNaN(entry.entryDate.getTime()) && entry.quantity > 0)
    .sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());

  const trackingItems = trackers.map((tracker) => {
    const entries = normalizedEntries.filter((entry) => entry.trackerId === tracker.id);
    const completedValue = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    const uniqueEntryDates = Array.from(
      new Set(entries.map((entry) => startOfDayIso(entry.entryDate)).filter((value): value is string => Boolean(value)))
    );
    const trackedDayCount = uniqueEntryDates.length;
    const averagePerDay = trackedDayCount > 0 ? completedValue / trackedDayCount : 0;
    const remainingValue = Math.max(tracker.targetValue - completedValue, 0);
    const percentComplete = tracker.targetValue > 0
      ? Math.max(0, Math.min(100, (completedValue / tracker.targetValue) * 100))
      : 0;
    return {
      ...tracker,
      completedValue,
      remainingValue,
      percentComplete,
      averagePerDay,
      projectedRemainingDays: averagePerDay > 0 && remainingValue > 0 ? remainingValue / averagePerDay : null,
      entryCount: entries.length,
      trackedDayCount,
      firstEntryDate: entries[0]?.entryDate ?? null,
      lastEntryDate: entries.at(-1)?.entryDate ?? null,
    };
  });

  const enabled = trackingItems.length > 0;
  const allUniqueDays = Array.from(
    new Set(
      normalizedEntries
        .map((entry) => startOfDayIso(entry.entryDate))
        .filter((value): value is string => Boolean(value))
      )
  );
  const normalizedAttendanceEntries = rawAttendanceEntries
    .map((entry) => ({
      employeeId: String(entry.employeeId ?? '').trim(),
      workDate: entry.workDate instanceof Date ? entry.workDate : new Date(entry.workDate),
      workedMinutes: Number(entry.workedMinutes) || 0,
    }))
    .filter((entry) => entry.employeeId && !Number.isNaN(entry.workDate.getTime()) && entry.workedMinutes > 0)
    .sort((a, b) => a.workDate.getTime() - b.workDate.getTime());
  const attendanceDays = Array.from(
    new Set(
      normalizedAttendanceEntries
        .map((entry) => startOfDayIso(entry.workDate))
        .filter((value): value is string => Boolean(value))
    )
  );
  // Tracked pace is always denominated on HR attendance work days for the assigned team — never on progress-entry dates.
  const paceDayCount = enabled ? attendanceDays.length : allUniqueDays.length;
  const totalWorkedMinutes = normalizedAttendanceEntries.reduce((sum, entry) => sum + entry.workedMinutes, 0);
  const uniqueWorkerCount = new Set(normalizedAttendanceEntries.map((entry) => entry.employeeId)).size;
  const dailyWorkerCounts = Array.from(
    new Map(
      attendanceDays.map((day) => [
        day,
        new Set(
          normalizedAttendanceEntries
            .filter((entry) => startOfDayIso(entry.workDate) === day)
            .map((entry) => entry.employeeId)
        ).size,
      ])
    ).values()
  );
  const totalTargetValue = trackingItems.reduce((sum, item) => sum + item.targetValue, 0);
  const totalCompletedValue = trackingItems.reduce((sum, item) => sum + item.completedValue, 0);
  const totalRemainingValue = trackingItems.reduce((sum, item) => sum + item.remainingValue, 0);
  const overallAveragePerDay = paceDayCount > 0 ? totalCompletedValue / paceDayCount : 0;
  const itemsWithPace = trackingItems.map((item) => {
    const averagePerDay = paceDayCount > 0 ? item.completedValue / paceDayCount : 0;
    return {
      ...item,
      averagePerDay,
      projectedRemainingDays: averagePerDay > 0 && item.remainingValue > 0 ? item.remainingValue / averagePerDay : null,
    };
  });
  const percentComplete = enabled && totalTargetValue > 0
    ? Math.max(0, Math.min(100, (totalCompletedValue / totalTargetValue) * 100))
    : Math.max(0, Math.min(100, config.progressPercent ?? 0));
  const firstEntryDate = normalizedEntries[0]?.entryDate ?? null;
  const lastEntryDate = normalizedEntries.at(-1)?.entryDate ?? null;
  const derivedStatus: TrackableJobProgressStatus =
    config.progressStatus === 'ON_HOLD'
      ? 'ON_HOLD'
      : enabled
        ? percentComplete >= 100
          ? 'COMPLETED'
          : totalCompletedValue > 0
            ? 'IN_PROGRESS'
            : 'NOT_STARTED'
        : (config.progressStatus ?? 'NOT_STARTED');

  const awaitingAttendanceForPace =
    enabled && attendanceDays.length === 0 && totalCompletedValue > 0;

  return {
    enabled,
    items: itemsWithPace,
    totalTargetValue,
    totalCompletedValue,
    totalRemainingValue,
    overallAveragePerDay,
    overallProjectedRemainingDays:
      overallAveragePerDay > 0 && totalRemainingValue > 0 ? totalRemainingValue / overallAveragePerDay : null,
    percentComplete,
    trackedDayCount: allUniqueDays.length,
    entryCount: normalizedEntries.length,
    firstEntryDate,
    lastEntryDate,
    paceDenominator: (enabled ? 'attendance_work_days' : 'progress_entry_days') as
      | 'attendance_work_days'
      | 'progress_entry_days',
    awaitingAttendanceForPace,
    attendance: {
      workedDayCount: attendanceDays.length,
      totalWorkedMinutes,
      totalWorkedHours: totalWorkedMinutes / 60,
      uniqueWorkerCount,
      averageWorkersPerDay:
        dailyWorkerCounts.length > 0
          ? dailyWorkerCounts.reduce((sum, count) => sum + count, 0) / dailyWorkerCounts.length
          : 0,
      lastAttendanceDate: normalizedAttendanceEntries.at(-1)?.workDate ?? null,
    },
    derivedStatus,
  };
}
