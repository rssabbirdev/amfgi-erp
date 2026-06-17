import type { PrismaClient } from '@prisma/client';

import { isPayrollLeaveLine } from '@/lib/hr/attendanceLeavePay';
import { monthBounds } from '@/lib/hr/payroll/calendar';

import { holidayPayTypeInclude, serializeHolidayPayTypeLinks } from '@/lib/hr/payroll/companyHolidayQueries';

import {

  normalizeHolidayEmployeeCriteria,

  type HolidayEmployeeCriteria,

} from '@/lib/hr/payroll/holidayEmployeeEligibility';

import type { HolidayPayTypeLink } from '@/lib/hr/payroll/holidayPayTypeLinks';

import type { PayLineInput } from '@/lib/hr/payroll/types';



export { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';



export type CompanyHolidayDay = {

  workDateYmd: string;

  name: string;

  isPaid: boolean;

  payTypeIds: string[];

  payTypeLinks: HolidayPayTypeLink[];

} & HolidayEmployeeCriteria;



function ymdFromDate(d: Date): string {

  return d.toISOString().slice(0, 10);

}



export async function fetchCompanyHolidaysForPayroll(

  prisma: PrismaClient,

  companyId: string,

  month: string

): Promise<CompanyHolidayDay[]> {

  const { start, end } = monthBounds(month);

  const monthEnd = new Date(end);

  monthEnd.setUTCDate(monthEnd.getUTCDate() - 1);



  const rows = await prisma.companyHoliday.findMany({

    where: {

      companyId,

      holidayDate: { gte: start, lte: monthEnd },

    },

    orderBy: { holidayDate: 'asc' },

    include: holidayPayTypeInclude,

  });



  return rows.map((row) => {

    const payTypeLinks = serializeHolidayPayTypeLinks(row.payTypes);

    return {

      workDateYmd: ymdFromDate(row.holidayDate),

      name: row.name,

      isPaid: row.isPaid,

      payTypeIds: payTypeLinks.map((link) => link.payTypeId),

      payTypeLinks,

      ...normalizeHolidayEmployeeCriteria(row),

    };

  });

}



/**
 * Marks company holidays on pay lines that already have saved attendance.
 * Approved leave takes precedence — holidays are not applied on leave days.
 */
export function mergeCompanyHolidaysIntoPayLines(
  lines: PayLineInput[],
  holidays: CompanyHolidayDay[],
  _defaultBasicHours = 8
): PayLineInput[] {
  const byDate = new Map(lines.map((line) => [line.workDate, { ...line }]));

  for (const holiday of holidays) {
    if (!holiday.workDateYmd) continue;

    const existing = byDate.get(holiday.workDateYmd);
    if (!existing) continue;
    if (isPayrollLeaveLine(existing)) continue;

    byDate.set(holiday.workDateYmd, {
      ...existing,
      isHoliday: true,
      holidayName: holiday.name,
      holidayPaid: holiday.isPaid,
      holidayPayTypeIds: holiday.payTypeIds,
      holidayPayTypeLinks: holiday.payTypeLinks,
    });
  }

  return [...byDate.values()].sort((a, b) => a.workDate.localeCompare(b.workDate));
}

