import { prisma } from '@/lib/db/prisma';
import {
  dedupeAllowancesByType,
  resolveMonthlyAllowanceTotal,
  sumAllowanceAmounts,
} from '@/lib/hr/payroll/allowanceTotals';
import { monthBounds, monthEndDate } from '@/lib/hr/payroll/calendar';

export type EmployeeAllowanceItem = {
  id: string;
  allowanceTypeId: string;
  allowanceTypeName: string;
  allowanceTypeCode: string;
  componentKind: 'EARNING' | 'DEDUCTION';
  applicationMode: 'FIXED_MONTHLY' | 'ATTENDANCE_PRESENT';
  amount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
};

export { dedupeAllowancesByType, resolveMonthlyAllowanceTotal, sumAllowanceAmounts };

function overlapsMonth(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  monthStart: Date,
  monthEnd: Date
) {
  if (effectiveFrom > monthEnd) return false;
  if (effectiveTo && effectiveTo < monthStart) return false;
  return true;
}

function mapAllowanceRow(row: {
  id: string;
  allowanceTypeId: string;
  amount: { toString(): string } | number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
  allowanceType: {
    id: string;
    name: string;
    code: string;
    componentKind?: 'EARNING' | 'DEDUCTION';
    applicationMode?: 'FIXED_MONTHLY' | 'ATTENDANCE_PRESENT';
  };
}): EmployeeAllowanceItem {
  return {
    id: row.id,
    allowanceTypeId: row.allowanceTypeId,
    allowanceTypeName: row.allowanceType.name,
    allowanceTypeCode: row.allowanceType.code,
    componentKind: row.allowanceType.componentKind ?? 'EARNING',
    applicationMode: row.allowanceType.applicationMode ?? 'ATTENDANCE_PRESENT',
    amount: Number(row.amount),
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    notes: row.notes,
  };
}

export async function fetchAllowancesForCompensationPackage(
  companyId: string,
  employeeId: string,
  compensation: { id: string; effectiveFrom: Date; effectiveTo: Date | null },
  month: string
): Promise<EmployeeAllowanceItem[]> {
  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const packageRows = await prisma.employeeAllowance.findMany({
    where: {
      companyId,
      employeeId,
      employeeCompensationId: compensation.id,
      allowanceType: { isActive: true },
    },
    include: {
      allowanceType: {
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          componentKind: true,
          applicationMode: true,
        },
      },
    },
    orderBy: [{ allowanceType: { sortOrder: 'asc' } }],
  });

  const linked = packageRows
    .filter((row) => overlapsMonth(row.effectiveFrom, row.effectiveTo, monthStart, monthEnd))
    .map(mapAllowanceRow);

  if (linked.length > 0) return linked;

  return fetchEmployeeAllowancesForMonth(companyId, employeeId, month);
}

export async function fetchAllowancesByCompensationIdsForMonth(
  companyId: string,
  compensations: Array<{ id: string; employeeId: string; effectiveFrom: Date; effectiveTo: Date | null }>,
  month: string
): Promise<Map<string, EmployeeAllowanceItem[]>> {
  const map = new Map<string, EmployeeAllowanceItem[]>();
  if (compensations.length === 0) return map;

  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);
  const compIds = compensations.map((c) => c.id);
  const compById = new Map(compensations.map((c) => [c.id, c]));

  const packageRows = await prisma.employeeAllowance.findMany({
    where: {
      companyId,
      employeeCompensationId: { in: compIds },
      allowanceType: { isActive: true },
    },
    include: {
      allowanceType: {
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          componentKind: true,
          applicationMode: true,
        },
      },
    },
    orderBy: [{ employeeCompensationId: 'asc' }, { allowanceType: { sortOrder: 'asc' } }],
  });

  const linkedByEmployee = new Map<string, EmployeeAllowanceItem[]>();
  for (const row of packageRows) {
    if (!row.employeeCompensationId) continue;
    const comp = compById.get(row.employeeCompensationId);
    if (!comp) continue;
    if (!overlapsMonth(row.effectiveFrom, row.effectiveTo, monthStart, monthEnd)) continue;
    const list = linkedByEmployee.get(comp.employeeId) ?? [];
    list.push(mapAllowanceRow(row));
    linkedByEmployee.set(comp.employeeId, list);
  }

  const needsLegacy: typeof compensations = [];
  for (const comp of compensations) {
    const linked = linkedByEmployee.get(comp.employeeId) ?? [];
    if (linked.length > 0) {
      map.set(comp.employeeId, linked);
    } else {
      needsLegacy.push(comp);
    }
  }

  if (needsLegacy.length > 0) {
    const legacyMap = await fetchEmployeeAllowancesByEmployeeIdsForMonth(
      companyId,
      needsLegacy.map((c) => c.employeeId),
      month
    );
    for (const comp of needsLegacy) {
      map.set(comp.employeeId, legacyMap.get(comp.employeeId) ?? []);
    }
  }

  return map;
}

export async function fetchEmployeeAllowancesForMonth(
  companyId: string,
  employeeId: string,
  month: string
): Promise<EmployeeAllowanceItem[]> {
  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const rows = await prisma.employeeAllowance.findMany({
    where: {
      companyId,
      employeeId,
      effectiveFrom: { lte: monthEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
      allowanceType: { isActive: true },
    },
    include: {
      allowanceType: {
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          componentKind: true,
          applicationMode: true,
        },
      },
    },
    orderBy: [{ effectiveFrom: 'desc' }, { allowanceType: { sortOrder: 'asc' } }],
  });

  const items = rows
    .filter((row) => overlapsMonth(row.effectiveFrom, row.effectiveTo, monthStart, monthEnd))
    .map(mapAllowanceRow);

  return dedupeAllowancesByType(items);
}

export async function fetchEmployeeAllowancesByEmployeeIdsForMonth(
  companyId: string,
  employeeIds: string[],
  month: string
): Promise<Map<string, EmployeeAllowanceItem[]>> {
  const map = new Map<string, EmployeeAllowanceItem[]>();
  if (employeeIds.length === 0) return map;

  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);

  const rows = await prisma.employeeAllowance.findMany({
    where: {
      companyId,
      employeeId: { in: employeeIds },
      effectiveFrom: { lte: monthEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
      allowanceType: { isActive: true },
    },
    include: {
      allowanceType: {
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          componentKind: true,
          applicationMode: true,
        },
      },
    },
    orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
  });

  const grouped = new Map<string, EmployeeAllowanceItem[]>();
  for (const row of rows) {
    if (!overlapsMonth(row.effectiveFrom, row.effectiveTo, monthStart, monthEnd)) continue;
    const list = grouped.get(row.employeeId) ?? [];
    list.push(mapAllowanceRow(row));
    grouped.set(row.employeeId, list);
  }

  for (const employeeId of employeeIds) {
    map.set(employeeId, dedupeAllowancesByType(grouped.get(employeeId) ?? []));
  }

  return map;
}
