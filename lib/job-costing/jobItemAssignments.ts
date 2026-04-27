import { prisma } from '@/lib/db/prisma';

type AssignedEmployeeRow = {
  employeeId: string;
  sortOrder: number;
};

export function normalizeAssignedEmployeeIds(input: string[] | undefined) {
  if (!input) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of input) {
    const employeeId = String(value ?? '').trim();
    if (!employeeId || seen.has(employeeId)) continue;
    seen.add(employeeId);
    normalized.push(employeeId);
  }
  return normalized;
}

export async function assertCompanyEmployeesExist(companyId: string, employeeIds: string[]) {
  if (employeeIds.length === 0) return true;
  const count = await prisma.employee.count({
    where: {
      companyId,
      id: { in: employeeIds },
    },
  });
  return count === employeeIds.length;
}

export function serializeAssignedEmployeeIds<T extends { assignedEmployees?: AssignedEmployeeRow[] }>(row: T) {
  const assignedEmployeeIds = (row.assignedEmployees ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.employeeId);

  const nextRow = { ...row, assignedEmployeeIds };
  delete (nextRow as { assignedEmployees?: AssignedEmployeeRow[] }).assignedEmployees;
  return nextRow;
}
