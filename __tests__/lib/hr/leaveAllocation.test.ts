import {
  prorateAnnualEntitlement,
  resolveLeaveAllocationStartDate,
} from '@/lib/hr/leaveAllocation';

describe('leaveAllocation', () => {
  it('uses hire date when basis is HIRE_DATE', () => {
    const hireDate = new Date('2024-03-15T00:00:00.000Z');
    const start = resolveLeaveAllocationStartDate(
      {
        hireDate,
        profileExtension: { workforce: { visaHolding: 'COMPANY_PROVIDED' } },
        visaPeriods: [{ startDate: new Date('2023-01-01T00:00:00.000Z') }],
      },
      'HIRE_DATE',
    );
    expect(start?.toISOString().slice(0, 10)).toBe('2024-03-15');
  });

  it('uses oldest visa start for company-provided visa when basis is OLDEST_VISA_OR_HIRE', () => {
    const start = resolveLeaveAllocationStartDate(
      {
        hireDate: new Date('2024-06-01T00:00:00.000Z'),
        profileExtension: { workforce: { visaHolding: 'COMPANY_PROVIDED' } },
        visaPeriods: [
          { startDate: new Date('2022-08-01T00:00:00.000Z') },
          { startDate: new Date('2020-05-10T00:00:00.000Z') },
        ],
      },
      'OLDEST_VISA_OR_HIRE',
    );
    expect(start?.toISOString().slice(0, 10)).toBe('2020-05-10');
  });

  it('falls back to hire date when visa is not company-provided', () => {
    const hireDate = new Date('2024-01-20T00:00:00.000Z');
    const start = resolveLeaveAllocationStartDate(
      {
        hireDate,
        profileExtension: { workforce: { visaHolding: 'SELF_OWN' } },
        visaPeriods: [{ startDate: new Date('2020-05-10T00:00:00.000Z') }],
      },
      'OLDEST_VISA_OR_HIRE',
    );
    expect(start?.toISOString().slice(0, 10)).toBe('2024-01-20');
  });

  it('returns full entitlement when anchor is before the year', () => {
    expect(
      prorateAnnualEntitlement(30, new Date('2023-01-01T00:00:00.000Z'), 2026),
    ).toBe(30);
  });

  it('prorates from July through December', () => {
    expect(
      prorateAnnualEntitlement(30, new Date('2026-07-01T00:00:00.000Z'), 2026),
    ).toBe(15);
  });

  it('returns zero when anchor is after the year', () => {
    expect(
      prorateAnnualEntitlement(30, new Date('2027-02-01T00:00:00.000Z'), 2026),
    ).toBe(0);
  });
});
