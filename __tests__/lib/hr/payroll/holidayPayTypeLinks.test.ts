import {
  normalizeHolidayPayTypeLinkInput,
  resolveHolidayOtSettingsForEmployee,
} from '@/lib/hr/payroll/holidayPayTypeLinks';

describe('holidayPayTypeLinks', () => {
  const links = [
    { payTypeId: 'pt-office', payWorkedHoursAtOt: true, holidayOtPercent: 125 },
    { payTypeId: 'pt-daily', payWorkedHoursAtOt: false, holidayOtPercent: null },
  ];

  it('normalizes link input with defaults', () => {
    expect(normalizeHolidayPayTypeLinkInput({ payTypeId: 'pt-office' })).toEqual({
      payTypeId: 'pt-office',
      payWorkedHoursAtOt: false,
      holidayOtPercent: null,
    });
  });

  it('resolves OT settings from employee matched pay type', () => {
    expect(
      resolveHolidayOtSettingsForEmployee({
        payTypeLinks: links,
        resolvedPayTypeId: 'pt-office',
        employeePayTypeId: 'pt-office',
      })
    ).toEqual({ payWorkedHoursAtOt: true, holidayOtPercent: 125 });
  });

  it('uses daily wage OT settings when employee is on daily wage even if office is also configured', () => {
    expect(
      resolveHolidayOtSettingsForEmployee({
        payTypeLinks: [
          { payTypeId: 'pt-office', payWorkedHoursAtOt: false, holidayOtPercent: null },
          { payTypeId: 'pt-daily', payWorkedHoursAtOt: true, holidayOtPercent: 125 },
        ],
        resolvedPayTypeId: 'pt-daily',
        employeePayTypeId: 'pt-daily',
        employeePayMode: 'DAILY_WAGE',
      })
    ).toEqual({ payWorkedHoursAtOt: true, holidayOtPercent: 125 });
  });

  it('does not inherit office holiday OT settings for daily wage employees', () => {
    expect(
      resolveHolidayOtSettingsForEmployee({
        payTypeLinks: [{ payTypeId: 'pt-office', payWorkedHoursAtOt: false, holidayOtPercent: null }],
        resolvedPayTypeId: 'pt-office',
        employeePayTypeId: 'pt-daily',
        employeePayMode: 'DAILY_WAGE',
      })
    ).toEqual({ payWorkedHoursAtOt: true, holidayOtPercent: null });
  });

  it('resolves OT settings when only one structure is configured', () => {
    expect(
      resolveHolidayOtSettingsForEmployee({
        payTypeLinks: [links[1]],
        resolvedPayTypeId: null,
        employeePayTypeId: 'pt-daily',
        employeePayMode: 'DAILY_WAGE',
      })
    ).toEqual({ payWorkedHoursAtOt: false, holidayOtPercent: null });
  });

  it('falls back to no holiday worked OT for fixed monthly employees', () => {
    expect(
      resolveHolidayOtSettingsForEmployee({
        payTypeLinks: links,
        resolvedPayTypeId: null,
        employeePayTypeId: 'pt-unknown',
        employeePayMode: 'MONTHLY_CALENDAR_DEDUCT',
      })
    ).toEqual({ payWorkedHoursAtOt: false, holidayOtPercent: null });
  });

  it('falls back to holiday worked OT for daily wage employees', () => {
    expect(
      resolveHolidayOtSettingsForEmployee({
        payTypeLinks: links,
        resolvedPayTypeId: null,
        employeePayTypeId: 'pt-unknown',
        employeePayMode: 'DAILY_WAGE',
      })
    ).toEqual({ payWorkedHoursAtOt: true, holidayOtPercent: null });
  });
});
