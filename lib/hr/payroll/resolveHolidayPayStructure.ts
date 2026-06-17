import { isPayrollHolidayLine } from '@/lib/hr/payroll/holidayPayLine';
import { denomDaysExcludingWeekdays, roundMoney } from '@/lib/hr/payroll/calendar';
import {
  resolveCalendarDeductDayCount,
  resolveExcludedWeekdays,
} from '@/lib/hr/payroll/payTypeConfigHelpers';
import type { CompensationInput, PayLineInput, PayTypeConfig } from '@/lib/hr/payroll/types';

export function resolveHolidayPayTypeConfigForEmployee(params: {
  holidayPayTypeIds: string[];
  employeePayTypeId: string | null;
  configById: Map<string, PayTypeConfig>;
}): { payTypeId: string | null; config: PayTypeConfig | null } {
  const { holidayPayTypeIds, employeePayTypeId, configById } = params;
  if (holidayPayTypeIds.length === 0) {
    return { payTypeId: null, config: null };
  }

  if (employeePayTypeId && holidayPayTypeIds.includes(employeePayTypeId)) {
    return {
      payTypeId: employeePayTypeId,
      config: configById.get(employeePayTypeId) ?? null,
    };
  }

  return { payTypeId: null, config: null };
}

/** Pay amount for one paid public holiday row. */
export function holidayDayPayAmount(params: {
  line: PayLineInput;
  month: string;
  employeeDailyRate: number;
  compensation: CompensationInput;
}): number {
  const { line, month, employeeDailyRate, compensation } = params;
  if (!isPayrollHolidayLine(line)) return roundMoney(employeeDailyRate);

  const holidayConfig = line.holidayPayTypeConfig;
  if (!holidayConfig) return roundMoney(employeeDailyRate);

  if (holidayConfig.mode === 'DAILY_WAGE') {
    return roundMoney(compensation.dailyRate);
  }

  if (holidayConfig.mode === 'MONTHLY_CALENDAR_DEDUCT' || holidayConfig.mode === 'MONTHLY_FIXED') {
    const denom = resolveCalendarDeductDayCount(month, holidayConfig);
    if (compensation.monthlyBasic <= 0 || denom <= 0) return 0;
    return roundMoney(compensation.monthlyBasic / denom);
  }

  if (holidayConfig.mode === 'HOURLY_SPLIT') {
    const denom = denomDaysExcludingWeekdays(month, resolveExcludedWeekdays(holidayConfig));
    if (compensation.monthlyBasic <= 0 || denom <= 0) return 0;
    return roundMoney(compensation.monthlyBasic / denom);
  }

  return roundMoney(employeeDailyRate);
}

export function usesHolidayPayStructureOverride(line: PayLineInput): boolean {
  return isPayrollHolidayLine(line) && Boolean(line.holidayPayTypeConfig);
}
