import { z } from 'zod';

export const LeavePayTierSchema = z.object({
  fromDay: z.number().int().min(1),
  toDay: z.number().int().min(1),
  payPercent: z.number().min(0).max(100),
});

export const LeaveAllocationBasisSchema = z.enum(['HIRE_DATE', 'OLDEST_VISA_OR_HIRE']);
export type LeaveAllocationBasis = z.infer<typeof LeaveAllocationBasisSchema>;

export const LEAVE_ALLOCATION_BASIS_OPTIONS: Array<{ value: LeaveAllocationBasis; label: string }> = [
  { value: 'HIRE_DATE', label: 'Hire date' },
  {
    value: 'OLDEST_VISA_OR_HIRE',
    label: 'Oldest company visa start (if company-provided visa, else hire date)',
  },
];

export const LeaveTypeRulesSchema = z.object({
  /** Rolling entitlement window in days (e.g. 90 for UAE sick leave). */
  entitlementDays: z.number().int().min(1).optional(),
  /** Calendar-year entitlement proration anchor (annual leave). */
  allocationBasis: LeaveAllocationBasisSchema.optional(),
  /** Paid tiers apply only after probation is complete. */
  requiresProbationComplete: z.boolean().optional(),
  /** When true, payroll treats this as paid leave (no calendar deduction). */
  countsAsPaidLeave: z.boolean().optional(),
  /** Deduct usage from employee leave balance (annual leave). */
  deductFromBalance: z.boolean().optional(),
  /** When true, employees cannot select this type in the self-service portal. */
  hideFromEmployeePortal: z.boolean().optional(),
  /** Tiered pay within the entitlement period (day 1 = first day of this leave type in period). */
  payTiers: z.array(LeavePayTierSchema).optional(),
});

export type LeavePayTier = z.infer<typeof LeavePayTierSchema>;
export type LeaveTypeRules = z.infer<typeof LeaveTypeRulesSchema>;

export function parseLeaveTypeRules(raw: unknown): LeaveTypeRules {
  const parsed = LeaveTypeRulesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function defaultLeaveTypeRules(): LeaveTypeRules {
  return {};
}

/** UAE-style sick leave: 15 full + 30 half + 45 unpaid within 90 days (post-probation). */
export const UAE_SICK_LEAVE_RULES: LeaveTypeRules = {
  entitlementDays: 90,
  requiresProbationComplete: true,
  countsAsPaidLeave: true,
  payTiers: [
    { fromDay: 1, toDay: 15, payPercent: 100 },
    { fromDay: 16, toDay: 45, payPercent: 50 },
    { fromDay: 46, toDay: 90, payPercent: 0 },
  ],
};

export const DEFAULT_ANNUAL_LEAVE_RULES: LeaveTypeRules = {
  entitlementDays: 30,
  allocationBasis: 'OLDEST_VISA_OR_HIRE',
  countsAsPaidLeave: true,
  deductFromBalance: true,
  payTiers: [{ fromDay: 1, toDay: 365, payPercent: 100 }],
};

export const DEFAULT_PAID_LEAVE_RULES: LeaveTypeRules = {
  countsAsPaidLeave: true,
  payTiers: [{ fromDay: 1, toDay: 365, payPercent: 100 }],
};

export const DEFAULT_UNPAID_LEAVE_RULES: LeaveTypeRules = {
  countsAsPaidLeave: false,
  hideFromEmployeePortal: true,
  payTiers: [{ fromDay: 1, toDay: 365, payPercent: 0 }],
};

export function isPaidLeaveFromRules(rules: LeaveTypeRules): boolean {
  return rules.countsAsPaidLeave === true;
}

/** Pay percent for the Nth day of this leave type within the entitlement period (1-based). */
export function payPercentForLeaveDay(rules: LeaveTypeRules, dayIndex: number): number {
  const tiers = rules.payTiers ?? [];
  if (tiers.length === 0) {
    return isPaidLeaveFromRules(rules) ? 100 : 0;
  }
  for (const tier of tiers) {
    if (dayIndex >= tier.fromDay && dayIndex <= tier.toDay) {
      return tier.payPercent;
    }
  }
  return 0;
}

export function summarizeLeaveRules(rules: LeaveTypeRules): string {
  const parts: string[] = [];
  if (rules.entitlementDays) parts.push(`${rules.entitlementDays}-day entitlement`);
  if (rules.allocationBasis === 'OLDEST_VISA_OR_HIRE') {
    parts.push('alloc: oldest visa or hire');
  } else if (rules.allocationBasis === 'HIRE_DATE') {
    parts.push('alloc: hire date');
  }
  if (rules.requiresProbationComplete) parts.push('after probation');
  if (rules.deductFromBalance) parts.push('deducts balance');
  if (rules.hideFromEmployeePortal) parts.push('hidden from portal');
  if (rules.payTiers?.length) {
    const tierText = rules.payTiers
      .map((t) => `days ${t.fromDay}–${t.toDay}: ${t.payPercent}%`)
      .join('; ');
    parts.push(tierText);
  } else if (rules.countsAsPaidLeave === false) {
    parts.push('unpaid');
  } else if (rules.countsAsPaidLeave) {
    parts.push('full pay');
  }
  return parts.join(' · ') || 'No rules configured';
}

export type LeaveTypeRecord = {
  id: string;
  code: string;
  rules: unknown;
};

/** Resolve attendance row status from configured leave type rules. */
export function resolveAttendanceFromLeaveType(leaveType: LeaveTypeRecord | null | undefined): {
  status: 'PRESENT' | 'ABSENT' | 'LEAVE';
  legacyLeaveType: 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY' | null;
} {
  if (!leaveType) {
    return { status: 'ABSENT', legacyLeaveType: null };
  }
  const rules = parseLeaveTypeRules(leaveType.rules);
  const code = leaveType.code.toUpperCase();
  const legacyMap: Record<string, 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY'> = {
    ANNUAL: 'ANNUAL',
    SICK: 'SICK',
    PAID: 'EMERGENCY',
    EMERGENCY: 'EMERGENCY',
    ONE_DAY: 'ONE_DAY',
  };
  const legacyLeaveType = legacyMap[code] ?? (isPaidLeaveFromRules(rules) ? 'EMERGENCY' : null);
  return {
    status: 'ABSENT',
    legacyLeaveType,
  };
}

/** Map configured leave type code to legacy leave-request enum (backward compat). */
export function legacyLeaveRequestTypeFromCode(
  code: string
): 'ANNUAL' | 'SICK' | 'EMERGENCY' | 'ONE_DAY' {
  const upper = code.toUpperCase();
  if (upper === 'ANNUAL') return 'ANNUAL';
  if (upper === 'SICK') return 'SICK';
  if (upper === 'ONE_DAY') return 'ONE_DAY';
  return 'EMERGENCY';
}

export function deductFromBalanceFromRules(rules: LeaveTypeRules): boolean {
  return rules.deductFromBalance === true;
}

export function isLeaveTypeHiddenFromEmployeePortal(rules: LeaveTypeRules): boolean {
  return rules.hideFromEmployeePortal === true;
}

export function filterLeaveTypesForEmployeePortal<T extends { rules: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => !isLeaveTypeHiddenFromEmployeePortal(parseLeaveTypeRules(row.rules)));
}
