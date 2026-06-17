import type { PayLineInput } from '@/lib/hr/payroll/types';

/** True when payroll should treat the day as a paid public holiday. */
export function isPayrollHolidayLine(line: PayLineInput): boolean {
  return line.isHoliday === true && line.holidayPaid !== false;
}
