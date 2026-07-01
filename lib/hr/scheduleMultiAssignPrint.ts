export type SchedulePrintTeamAssignment = {
  label: string;
  employeeIds: string[];
};

/** `Team#1` → `T1`; falls back to the original label. */
export function scheduleTeamLabelToPrintShort(label: string): string {
  const trimmed = String(label ?? '').trim();
  const teamMatch = trimmed.match(/Team#(\d+)/i);
  if (teamMatch) return `T${teamMatch[1]}`;
  const groupMatch = trimmed.match(/Group\s+(\d+)/i);
  if (groupMatch) return `T${groupMatch[1]}`;
  return trimmed;
}

function comparePrintTeamLabels(a: string, b: string): number {
  const numA = /^T(\d+)$/.exec(a)?.[1];
  const numB = /^T(\d+)$/.exec(b)?.[1];
  if (numA && numB) return Number(numA) - Number(numB);
  return a.localeCompare(b);
}

export function buildEmployeeTeamAssignmentMap(
  teams: SchedulePrintTeamAssignment[],
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const team of teams) {
    const shortLabel = scheduleTeamLabelToPrintShort(team.label);
    for (const employeeId of team.employeeIds) {
      const id = String(employeeId ?? '').trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id)!.add(shortLabel);
    }
  }
  return new Map(
    [...map.entries()].map(([id, labels]) => [id, [...labels].sort(comparePrintTeamLabels)]),
  );
}

export function formatScheduleWorkerNameForPrint(
  fullName: string,
  employeeId: string | null | undefined,
  teamAssignments: Map<string, string[]>,
): string {
  const name = String(fullName ?? '').trim();
  if (!name) return '';
  const id = String(employeeId ?? '').trim();
  if (!id) return name;
  const teams = teamAssignments.get(id);
  if (!teams || teams.length <= 1) return name;
  return `${name} - [${teams.join(',')}]`;
}

export function formatNumberedScheduleWorkerNameForPrint(
  index: number,
  fullName: string,
  employeeId: string | null | undefined,
  teamAssignments: Map<string, string[]>,
): string {
  const formatted = formatScheduleWorkerNameForPrint(fullName, employeeId, teamAssignments);
  return formatted ? `${index}. ${formatted}` : '';
}

export function buildMultiAssignedWorkerSummary(
  teamAssignments: Map<string, string[]>,
  resolveName: (employeeId: string) => string,
): string {
  const entries: Array<{ name: string; teams: string[] }> = [];
  for (const [employeeId, teams] of teamAssignments) {
    if (teams.length <= 1) continue;
    const name = resolveName(employeeId).trim();
    if (!name) continue;
    entries.push({ name, teams });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries
    .map(({ name, teams }) => `${name} - [${teams.join(',')}]`)
    .join(', ');
}

export function collectDraftPrintTeamAssignments(
  drafts: Array<{
    label: string;
    driver1EmployeeId?: string | null;
    driver2EmployeeId?: string | null;
    splitMode?: boolean;
    members?: Array<{ employeeId?: string | null }>;
    subTeams?: Array<{ members?: Array<{ employeeId?: string | null }> }>;
  }>,
): SchedulePrintTeamAssignment[] {
  return drafts.map((draft) => {
    const employeeIds = new Set<string>();
    const add = (id?: string | null) => {
      const value = String(id ?? '').trim();
      if (value) employeeIds.add(value);
    };
    add(draft.driver1EmployeeId);
    add(draft.driver2EmployeeId);
    if (draft.splitMode) {
      for (const subTeam of draft.subTeams ?? []) {
        for (const member of subTeam.members ?? []) add(member.employeeId);
      }
    } else {
      for (const member of draft.members ?? []) add(member.employeeId);
    }
    return { label: draft.label, employeeIds: [...employeeIds] };
  });
}

export function collectApiAssignmentEmployeeIds(assignment: {
  teamLeader?: { id?: string | null } | null;
  driver1?: { id?: string | null } | null;
  driver2?: { id?: string | null } | null;
  members?: Array<{ employee?: { id?: string | null } | null }> | null;
}): string[] {
  const employeeIds = new Set<string>();
  const add = (id?: string | null) => {
    const value = String(id ?? '').trim();
    if (value) employeeIds.add(value);
  };
  add(assignment.teamLeader?.id);
  add(assignment.driver1?.id);
  add(assignment.driver2?.id);
  for (const member of assignment.members ?? []) {
    add(member.employee?.id);
  }
  return [...employeeIds];
}
