import { formatPayDayStatus } from '@/lib/hr/payroll/payDayStatus';

const officeConfig = {
  mode: 'MONTHLY_CALENDAR_DEDUCT' as const,
  excludedWeekdays: [0],
};

describe('formatPayDayStatus', () => {
  it('shows Present - Sunday when worked on weekly off', () => {
    expect(
      formatPayDayStatus(
        {
          workDate: '2026-06-07',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: true,
        },
        officeConfig
      )
    ).toBe('Present - Sunday');
  });

  it('shows Sunday only when absent on weekly off', () => {
    expect(
      formatPayDayStatus(
        {
          workDate: '2026-06-07',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: true,
        },
        officeConfig
      )
    ).toBe('Sunday');
  });

  it('shows Present - Holiday when worked on paid holiday', () => {
    expect(
      formatPayDayStatus(
        {
          workDate: '2026-06-05',
          status: 'PRESENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 9 * 60,
          isSunday: false,
          isHoliday: true,
          holidayPaid: true,
          holidayName: 'Eid',
        },
        officeConfig
      )
    ).toBe('Present - Holiday (Eid)');
  });

  it('shows Holiday only when absent on paid holiday', () => {
    expect(
      formatPayDayStatus(
        {
          workDate: '2026-06-05',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
          isHoliday: true,
          holidayPaid: true,
          holidayName: 'Eid',
        },
        officeConfig
      )
    ).toBe('Holiday (Eid)');
  });
});
