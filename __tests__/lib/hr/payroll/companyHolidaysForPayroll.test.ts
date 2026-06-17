import {
  mergeCompanyHolidaysIntoPayLines,
  type CompanyHolidayDay,
} from '@/lib/hr/payroll/companyHolidaysForPayroll';
import { calculatePayLine } from '@/lib/hr/payroll/calculatePayLine';
import { mergeApprovedLeaveIntoPayLines } from '@/lib/hr/payroll/approvedLeaveForPayroll';

describe('mergeCompanyHolidaysIntoPayLines', () => {
  const holidays: CompanyHolidayDay[] = [
    {
      workDateYmd: '2026-06-05',
      name: 'Eid',
      isPaid: true,
      payTypeIds: [],
      payTypeLinks: [],
      employmentTypes: [],
      workforceRoleTypes: [],
      visaHoldings: [],
    },
  ];

  it('does not add holiday when attendance is missing', () => {
    const merged = mergeCompanyHolidaysIntoPayLines([], holidays, 8);
    expect(merged).toHaveLength(0);
  });

  it('marks absent attendance as paid holiday instead of deducting', () => {
    const merged = mergeCompanyHolidaysIntoPayLines(
      [
        {
          workDate: '2026-06-05',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 8,
          workedMinutes: 0,
          isSunday: false,
        },
      ],
      holidays,
      8
    );
    expect(merged[0].isHoliday).toBe(true);
    expect(merged[0].status).toBe('ABSENT');
  });

  it('does not override approved leave on the same day', () => {
    const withLeave = mergeApprovedLeaveIntoPayLines(
      [],
      [
        {
          employeeId: 'e1',
          workDateYmd: '2026-06-05',
          leaveRequestId: 'lr1',
          leaveTypeId: 'lt1',
          leaveType: 'ANNUAL',
          leaveTypeLabel: 'Annual leave',
          leaveTypeCode: 'ANNUAL',
          rules: { countsAsPaidLeave: true },
        },
      ],
      8
    );
    const merged = mergeCompanyHolidaysIntoPayLines(withLeave, holidays, 8);
    expect(merged[0].leaveRequestId).toBe('lr1');
    expect(merged[0].isHoliday).toBeUndefined();
  });

  it('attaches multiple holiday pay type ids to merged lines', () => {
    const merged = mergeCompanyHolidaysIntoPayLines(
      [
        {
          workDate: '2026-06-05',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 8,
          workedMinutes: 480,
          isSunday: false,
        },
      ],
      [{
        workDateYmd: '2026-06-05',
        name: 'Eid',
        isPaid: true,
        payTypeIds: ['pt-office', 'pt-daily'],
        payTypeLinks: [
          { payTypeId: 'pt-office', payWorkedHoursAtOt: true, holidayOtPercent: null },
          { payTypeId: 'pt-daily', payWorkedHoursAtOt: false, holidayOtPercent: 125 },
        ],
        employmentTypes: [],
        workforceRoleTypes: [],
        visaHoldings: [],
      }],
      8
    );
    expect(merged[0].holidayPayTypeIds).toEqual(['pt-office', 'pt-daily']);
  });

  it('does not mark holiday when attendance row is on leave', () => {
    const merged = mergeCompanyHolidaysIntoPayLines(
      [
        {
          workDate: '2026-06-05',
          status: 'LEAVE',
          leaveType: 'ANNUAL',
          leaveTypeId: 'lt1',
          leaveRequestId: 'lr1',
          basicHours: 8,
          workedMinutes: 0,
          isSunday: false,
        },
      ],
      holidays,
      8
    );
    expect(merged[0].isHoliday).toBeUndefined();
  });
});

describe('calculatePayLine holidays', () => {
  it('office calendar deduct pays holiday using employee structure by default', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 0 },
      lines: [
        {
          workDate: '2026-06-05',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 8,
          workedMinutes: 0,
          isSunday: false,
          isHoliday: true,
          holidayName: 'Eid',
          holidayPaid: true,
        },
      ],
    });

    expect(result.gross).toBeCloseTo(3000 / 26, 2);
  });

  it('office employee can use holiday salary structure override (daily wage)', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'MONTHLY_CALENDAR_DEDUCT', deductDenominator: 'WORKING_DAYS', excludedWeekdays: [0] },
      compensation: { monthlyBasic: 3000, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-05',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
          isHoliday: true,
          holidayName: 'Eid',
          holidayPaid: true,
          holidayPayTypeConfig: { mode: 'DAILY_WAGE', otPercent: 90 },
        },
      ],
    });

    expect(result.gross).toBe(120);
  });

  it('daily wage pays full rate on paid public holiday', () => {
    const result = calculatePayLine({
      month: '2026-06',
      config: { mode: 'DAILY_WAGE', otPercent: 90 },
      compensation: { monthlyBasic: 0, monthlyAllowance: 0, dailyRate: 120 },
      lines: [
        {
          workDate: '2026-06-05',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
          isHoliday: true,
          holidayName: 'Eid',
          holidayPaid: true,
        },
      ],
    });

    expect(result.gross).toBe(120);
    expect(result.days[0]?.detail).toBe('Paid public holiday');
  });
});
