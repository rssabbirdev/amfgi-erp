import {
  buildPayTypeConfigFromFields,
  payTypeConfigFields,
} from '@/lib/hr/payroll/payTypeForm';

describe('payTypeForm daily wage exclusions', () => {
  it('saves empty excluded weekdays for daily wage', () => {
    const config = buildPayTypeConfigFromFields({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [],
    });
    expect(config.excludedWeekdays).toEqual([]);
  });

  it('round-trips daily wage with no weekly off days', () => {
    const saved = buildPayTypeConfigFromFields({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [],
    });
    const fields = payTypeConfigFields(saved as Record<string, unknown>);
    expect(fields.excludedWeekdays).toEqual([]);
  });

  it('saves selected weekly off days for daily wage when configured', () => {
    const config = buildPayTypeConfigFromFields({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [0],
    });
    expect(config.excludedWeekdays).toEqual([0]);
  });
});
