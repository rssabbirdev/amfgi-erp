import {
  normalizeHolidayEmployeeCriteria,
  type HolidayEmployeeCriteria,
} from '@/lib/hr/payroll/holidayEmployeeEligibility';
import type { HolidayPayTypeLink } from '@/lib/hr/payroll/holidayPayTypeLinks';

export const holidayPayTypeInclude = {
  payTypes: {
    orderBy: { payType: { sortOrder: 'asc' as const } },
    include: {
      payType: { select: { id: true, name: true, code: true } },
    },
  },
} as const;

type HolidayPayTypeRow = {
  payTypeId: string;
  payWorkedHoursAtOt: boolean;
  holidayOtPercent: number | null;
  payType: { id: string; name: string; code: string };
};

export function serializeHolidayPayTypeLinks(payTypes: HolidayPayTypeRow[]): HolidayPayTypeLink[] {
  return payTypes.map((link) => ({
    payTypeId: link.payTypeId,
    payWorkedHoursAtOt: link.payWorkedHoursAtOt,
    holidayOtPercent: link.holidayOtPercent,
  }));
}

export function serializeCompanyHoliday<
  T extends {
    employmentTypes: unknown;
    workforceRoleTypes: unknown;
    visaHoldings: unknown;
    payTypes: HolidayPayTypeRow[];
  },
>(row: T) {
  const criteria = normalizeHolidayEmployeeCriteria(row);
  const payTypeLinks = serializeHolidayPayTypeLinks(row.payTypes);
  return {
    ...row,
    ...criteria,
    payTypes: row.payTypes.map((link) => link.payType),
    payTypeIds: row.payTypes.map((link) => link.payType.id),
    payTypeLinks,
  };
}

export function holidayCriteriaCreateInput(criteria: HolidayEmployeeCriteria) {
  return {
    employmentTypes: criteria.employmentTypes,
    workforceRoleTypes: criteria.workforceRoleTypes,
    visaHoldings: criteria.visaHoldings,
  };
}
