import { calculatePayLine } from '@/lib/hr/payroll/calculatePayLine';
import { resolveHolidayOtSettingsForEmployee } from '@/lib/hr/payroll/holidayPayTypeLinks';
import {
  buildPaidHolidayDayRow,
  holidayWorkedOtPay,
  resolveHolidayOtPercent,
  shouldPayHolidayWorkedOt,
} from '@/lib/hr/payroll/holidayWorkedOtPay';

describe('holidayWorkedOtPay', () => {
  const employeeConfig = { mode: 'DAILY_WAGE' as const, otPercent: 90 };

  it('returns zero when no worked hours on holiday', () => {
    expect(
      holidayWorkedOtPay(
        {
          workDate: '2026-06-05',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
          isHoliday: true,
          holidayPaid: true,
          holidayPayWorkedHoursAtOt: true,
        },
        10,
        employeeConfig
      ).otPay
    ).toBe(0);
  });

  it('uses holiday-specific OT percent when configured', () => {
    const line = {
      workDate: '2026-06-05',
      status: 'PRESENT',
      leaveType: null,
      basicHours: 9,
      workedMinutes: 600,
      isSunday: false,
      isHoliday: true,
      holidayPaid: true,
      holidayPayWorkedHoursAtOt: true,
      holidayOtPercent: 150,
    };
    expect(resolveHolidayOtPercent(line, employeeConfig)).toBe(150);
    const { otPay, otHours } = holidayWorkedOtPay(line, 10, employeeConfig);
    expect(otHours).toBe(1);
    expect(otPay).toBe(15);
  });

  it('daily wage holiday OT applies only to hours beyond standard shift', () => {
    const partialDay = holidayWorkedOtPay(
      {
        workDate: '2026-06-05',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 180,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
        holidayPayWorkedHoursAtOt: true,
        holidayOtPercent: 100,
      },
      120 / 9,
      employeeConfig
    );
    expect(partialDay.otHours).toBe(0);
    expect(partialDay.otPay).toBe(0);
  });

  it('builds holiday pay plus extra worked OT for daily wage employees', () => {
    const row = buildPaidHolidayDayRow({
      line: {
        workDate: '2026-06-05',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 600,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
        holidayPayWorkedHoursAtOt: true,
        holidayOtPercent: 100,
      },
      month: '2026-06',
      employeeDailyRate: 120,
      basicHourRate: 120 / 9,
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      employeeConfig,
    });
    expect(row.basicHourSalary).toBe(120);
    expect(row.otHourSalary).toBeCloseTo(13.33, 2);
    expect(row.totalSalary).toBeCloseTo(133.33, 2);
    expect(row.detail).toContain('1h at 100% OT');
  });

  it('includes per-day allowance on paid holidays for hourly split', () => {
    const row = buildPaidHolidayDayRow({
      line: {
        workDate: '2026-06-05',
        status: 'ABSENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
      },
      month: '2026-06',
      employeeDailyRate: 30,
      basicHourRate: 30 / 9,
      compensation: { monthlyBasic: 900, monthlyAllowance: 200, dailyRate: 0 },
      employeeConfig: { mode: 'HOURLY_SPLIT', excludedWeekdays: [0] },
    });
    expect(row.allowance).toBeCloseTo(200 / 26, 2);
    expect(row.totalSalary).toBeCloseTo(30 + 200 / 26, 2);
    expect(row.totalSalary).toBeCloseTo(row.basicHourSalary + row.otHourSalary + row.allowance, 2);
  });

  it('includes per-day allowance in total for fixed monthly calendar deduct holidays', () => {
    const row = buildPaidHolidayDayRow({
      line: {
        workDate: '2026-06-05',
        status: 'ABSENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 0,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
      },
      month: '2026-06',
      employeeDailyRate: 3000 / 26,
      basicHourRate: 3000 / 26 / 9,
      compensation: {
        monthlyBasic: 3000,
        monthlyAllowance: 0,
        dailyRate: 0,
        salaryComponents: {
          fixedEarnings: 0,
          fixedDeductions: 0,
          attendanceEarningPerDay: 260 / 26,
          attendanceDeductionPerDay: 0,
        },
      },
      employeeConfig: { mode: 'MONTHLY_CALENDAR_DEDUCT', excludedWeekdays: [0] },
    });
    expect(row.allowance).toBeCloseTo(10, 2);
    expect(row.totalSalary).toBeCloseTo(row.basicHourSalary + row.otHourSalary + row.allowance, 2);
  });
});

describe('calculatePayLine holiday work', () => {
  it('daily wage pays holiday plus extra worked hours at OT rate', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-05',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 600,
          isSunday: false,
          isHoliday: true,
          holidayPaid: true,
          holidayPayWorkedHoursAtOt: true,
          holidayOtPercent: 100,
        },
      ],
    });

    expect(result.gross).toBeCloseTo(133.33, 2);
    expect(result.days[0]?.basicHourSalary).toBe(120);
    expect(result.days[0]?.otHourSalary).toBeCloseTo(13.33, 2);
  });

  it('does not add worked OT when holiday setting is disabled', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-05',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 180,
          isSunday: false,
          isHoliday: true,
          holidayPaid: true,
          holidayPayWorkedHoursAtOt: false,
        },
      ],
    });

    expect(result.gross).toBe(120);
    expect(
      shouldPayHolidayWorkedOt({
        workDate: '2026-06-05',
        status: 'PRESENT',
        leaveType: null,
        basicHours: 9,
        workedMinutes: 180,
        isSunday: false,
        isHoliday: true,
        holidayPaid: true,
        holidayPayWorkedHoursAtOt: false,
      })
    ).toBe(false);
  });

  it('daily wage pays holiday OT when enabled on the employee holiday structure link', () => {
    const otSettings = resolveHolidayOtSettingsForEmployee({
      payTypeLinks: [
        { payTypeId: 'pt-office', payWorkedHoursAtOt: false, holidayOtPercent: null },
        { payTypeId: 'pt-daily', payWorkedHoursAtOt: true, holidayOtPercent: 100 },
      ],
      resolvedPayTypeId: 'pt-daily',
      employeePayTypeId: 'pt-daily',
      employeePayMode: 'DAILY_WAGE',
    });

    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-05',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 600,
          isSunday: false,
          isHoliday: true,
          holidayPaid: true,
          holidayPayWorkedHoursAtOt: otSettings.payWorkedHoursAtOt,
          holidayOtPercent: otSettings.holidayOtPercent,
        },
      ],
    });

    expect(result.gross).toBeCloseTo(133.33, 2);
    expect(result.days[0]?.otHourSalary).toBeCloseTo(13.33, 2);
  });
});
