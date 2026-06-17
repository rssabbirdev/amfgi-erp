/** Tracks when profile status ON_LEAVE started (YYYY-MM-DD on profileExtension). */
export function readOnLeaveFrom(profileExtension: unknown): string | null {
  if (!profileExtension || typeof profileExtension !== 'object') return null;
  const raw = (profileExtension as Record<string, unknown>).onLeaveFrom;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function todayYmdLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True when this work date falls inside the employee's on-leave period (not before it was set). */
export function isEmployeeOnLeaveForWorkDate(
  employee: { status?: string; profileExtension?: unknown } | null | undefined,
  workDate: string
): boolean {
  if (!employee || employee.status !== 'ON_LEAVE') return false;
  const onLeaveFrom = readOnLeaveFrom(employee.profileExtension);
  if (!onLeaveFrom) return workDate >= todayYmdLocal();
  return workDate >= onLeaveFrom;
}

export function mergeProfileExtensionForStatusChange(
  existingExtension: unknown,
  incomingExtension: unknown | undefined | null,
  previousStatus: string,
  nextStatus: string
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...((existingExtension as Record<string, unknown> | null) ?? {}),
  };
  if (incomingExtension !== undefined && incomingExtension !== null) {
    Object.assign(merged, incomingExtension as Record<string, unknown>);
  }
  if (nextStatus === 'ON_LEAVE' && previousStatus !== 'ON_LEAVE') {
    merged.onLeaveFrom = todayYmdLocal();
  } else if (nextStatus === 'ACTIVE' && previousStatus === 'ON_LEAVE') {
    delete merged.onLeaveFrom;
  } else if (nextStatus !== 'ON_LEAVE') {
    delete merged.onLeaveFrom;
  }
  return merged;
}
