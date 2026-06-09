import type { PrismaClient } from '@prisma/client';

import {
  deductFromBalanceFromRules,
  legacyLeaveRequestTypeFromCode,
  parseLeaveTypeRules,
  resolveAttendanceFromLeaveType,
} from '@/lib/hr/leaveTypeRules';

export async function loadLeaveTypeForRequest(
  prisma: PrismaClient,
  companyId: string,
  leaveTypeId: string
) {
  return prisma.leaveType.findFirst({
    where: { id: leaveTypeId, companyId, isActive: true },
    select: { id: true, code: true, name: true, rules: true },
  });
}

export function resolveLeaveRequestFields(leaveType: {
  id: string;
  code: string;
  rules: unknown;
}) {
  const rules = parseLeaveTypeRules(leaveType.rules);
  return {
    leaveTypeId: leaveType.id,
    leaveType: legacyLeaveRequestTypeFromCode(leaveType.code),
    deductFromBalance: deductFromBalanceFromRules(rules),
  };
}

export function resolveAttendanceFieldsFromLeaveType(leaveType: {
  id: string;
  code: string;
  rules: unknown;
}) {
  const resolved = resolveAttendanceFromLeaveType(leaveType);
  return {
    leaveTypeId: leaveType.id,
    status: resolved.status,
    leaveType: resolved.legacyLeaveType,
  };
}
