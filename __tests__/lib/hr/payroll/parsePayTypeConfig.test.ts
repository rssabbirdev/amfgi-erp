import { parsePayTypeConfig } from '@/lib/hr/payroll/parsePayTypeConfig';

describe('parsePayTypeConfig', () => {
  it('parses daily wage config with OT percent', () => {
    const config = parsePayTypeConfig({
      mode: 'DAILY_WAGE',
      otPercent: 125,
    });
    expect(config).toMatchObject({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [],
    });
  });

  it('persists empty excluded weekdays for daily wage', () => {
    const config = parsePayTypeConfig({
      mode: 'DAILY_WAGE',
      otPercent: 125,
      excludedWeekdays: [],
    });
    expect(config.excludedWeekdays).toEqual([]);
  });

  it('parses hourly split with excluded weekdays', () => {
    const config = parsePayTypeConfig({
      mode: 'HOURLY_SPLIT',
      excludedWeekdays: [5, 6],
    });
    expect(config.excludedWeekdays).toEqual([5, 6]);
  });

  it('throws on invalid mode', () => {
    expect(() => parsePayTypeConfig({ mode: 'INVALID' })).toThrow(/Invalid pay type config/);
  });
});
