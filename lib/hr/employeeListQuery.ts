import type { Employee, Prisma } from '@prisma/client';

import { employeeTypeFromProfileExtension } from '@/lib/hr/employeeTypeSettings';

export type EmployeeListFilterParams = {
  q?: string;
  status?: string | null;
  employeeType?: string | null;
  portal?: string | null;
};

export function buildEmployeeListWhere(
  companyId: string,
  filters: EmployeeListFilterParams
): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = { companyId };
  const status = filters.status?.trim();
  const portal = filters.portal?.trim();
  const q = filters.q?.trim();

  if (status && status !== 'ALL') {
    where.status = status as Prisma.EnumEmployeeStatusFilter;
  }
  if (portal === 'enabled') where.portalEnabled = true;
  if (portal === 'disabled') where.portalEnabled = false;
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { employeeCode: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function filterEmployeesByWorkforceType<T extends { profileExtension: unknown }>(
  rows: T[],
  employeeType: string | null | undefined
): T[] {
  const filter = employeeType?.trim();
  if (!filter || filter === 'ALL') return rows;
  return rows.filter((employee) => {
    const type = employeeTypeFromProfileExtension(employee.profileExtension);
    if (filter === '__none__') return !type || type.trim() === '';
    return type === filter;
  });
}

export function sortEmployeesByName<T extends Pick<Employee, 'fullName'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName));
}
