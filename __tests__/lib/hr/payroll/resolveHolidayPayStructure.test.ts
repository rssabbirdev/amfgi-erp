import {
  holidayDayPayAmount,
  resolveHolidayPayTypeConfigForEmployee,
} from '@/lib/hr/payroll/resolveHolidayPayStructure';
import type { PayTypeConfig } from '@/lib/hr/payroll/types';

describe('resolveHolidayPayTypeConfigForEmployee', () => {
  const officeConfig: PayTypeConfig = {
    mode: 'MONTHLY_CALENDAR_DEDUCT',
    deductDenominator: 'WORKING_DAYS',
    excludedWeekdays: [0],
  };
  const dailyConfig: PayTypeConfig = { mode: 'DAILY_WAGE', otPercent: 90 };
  const configById = new Map<string, PayTypeConfig>([
    ['pt-office', officeConfig],
    ['pt-daily', dailyConfig],
  ]);

  it('returns null when no holiday structures are configured', () => {
    expect(
      resolveHolidayPayTypeConfigForEmployee({
        holidayPayTypeIds: [],
        employeePayTypeId: 'pt-office',
        configById,
      })
    ).toEqual({ payTypeId: null, config: null });
  });

  it('matches employee compensation structure when listed on the holiday', () => {
    expect(
      resolveHolidayPayTypeConfigForEmployee({
        holidayPayTypeIds: ['pt-office', 'pt-daily'],
        employeePayTypeId: 'pt-daily',
        configById,
      })
    ).toEqual({ payTypeId: 'pt-daily', config: dailyConfig });
  });

  it('does not apply a different sole structure to employees on another pay type', () => {
    expect(
      resolveHolidayPayTypeConfigForEmployee({
        holidayPayTypeIds: ['pt-daily'],
        employeePayTypeId: 'pt-office',
        configById,
      })
    ).toEqual({ payTypeId: null, config: null });
  });

  it('falls back to employee default when multiple structures exist but none match', () => {
    expect(
      resolveHolidayPayTypeConfigForEmployee({
        holidayPayTypeIds: ['pt-office', 'pt-daily'],
        employeePayTypeId: 'pt-fixed',
        configById,
      })
    ).toEqual({ payTypeId: null, config: null });
  });
});

describe('holidayDayPayAmount', () => {
  it('uses employee daily rate when no holiday structure override', () => {
    const amount = holidayDayPayAmount({
      line: {
        workDate: '2026-06-05',
        status: 'ABSENT',
        leaveType: null,
        basicHours: 8,
        workedMinutes: 0,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
      },
      month: '2026-06',
      employeeDailyRate: 50,
      compensation: { monthlyBasic: 1500, monthlyAllowance: 0, dailyRate: 120 },
    });
    expect(amount).toBe(50);
  });

  it('uses daily wage from compensation when holiday structure is daily wage', () => {
    const amount = holidayDayPayAmount({
      line: {
        workDate: '2026-06-05',
        status: 'ABSENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
        holidayPayTypeConfig: { mode: 'DAILY_WAGE', otPercent: 90 },
      },
      month: '2026-06',
      employeeDailyRate: 50,
      compensation: { monthlyBasic: 1500, monthlyAllowance: 0, dailyRate: 120 },
    });
    expect(amount).toBe(120);
  });
});
