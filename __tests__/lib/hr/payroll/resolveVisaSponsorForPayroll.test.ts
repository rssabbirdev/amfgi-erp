import {
  resolveVisaSponsorForPayroll,
  type VisaPeriodSponsorSource,
} from '@/lib/hr/payroll/resolveVisaSponsorForPayroll';

function period(
  sponsorType: string,
  startDate: string,
  endDate: string,
  status: string
): VisaPeriodSponsorSource {
  return {
    sponsorType,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    status,
  };
}

describe('resolveVisaSponsorForPayroll', () => {
  const month = '2026-06';

  it('prefers active visa periods valid for the month with the longest validity', () => {
    expect(
      resolveVisaSponsorForPayroll(
        [
          period('Short Co', '2026-06-01', '2026-06-30', 'ACTIVE'),
          period('Long Co', '2026-01-01', '2026-12-31', 'ACTIVE'),
        ],
        month
      )
    ).toBe('Long Co');
  });

  it('prefers active status over draft when both overlap the month', () => {
    expect(
      resolveVisaSponsorForPayroll(
        [
          period('Draft Co', '2026-01-01', '2026-12-31', 'DRAFT'),
          period('Active Co', '2026-06-01', '2026-06-30', 'ACTIVE'),
        ],
        month
      )
    ).toBe('Active Co');
  });

  it('falls back to the latest expiry when no period overlaps the month', () => {
    expect(
      resolveVisaSponsorForPayroll(
        [
          period('Old Co', '2024-01-01', '2024-12-31', 'EXPIRED'),
          period('Recent Co', '2025-01-01', '2025-12-31', 'EXPIRED'),
        ],
        month
      )
    ).toBe('Recent Co');
  });

  it('returns null when no sponsor type is set', () => {
    expect(
      resolveVisaSponsorForPayroll(
        [{ sponsorType: null, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'), status: 'ACTIVE' }],
        month
      )
    ).toBeNull();
  });
});
