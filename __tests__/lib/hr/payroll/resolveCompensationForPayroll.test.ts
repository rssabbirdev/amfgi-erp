import {
  compareCompensationPackages,
  countCompensationPackageDaysInMonth,
  fixedMonthlyProrationFactor,
  resolveCompensationPackageForDate,
  sortCompensationPackagesForDisplay,
} from '@/lib/hr/payroll/resolveCompensationForPayroll';

function pkg(
  id: string,
  effectiveFrom: string,
  createdAt: string,
  effectiveTo: string | null = null
) {
  return {
    id,
    effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
    effectiveTo: effectiveTo ? new Date(`${effectiveTo}T00:00:00.000Z`) : null,
    createdAt: new Date(createdAt),
  };
}

describe('resolveCompensationPackageForDate', () => {
  it('uses the later effectiveFrom package after a mid-month change', () => {
    const packages = [
      pkg('a', '2026-06-01', '2026-05-20T10:00:00.000Z', '2026-06-14'),
      pkg('b', '2026-06-15', '2026-06-10T10:00:00.000Z'),
    ];

    expect(resolveCompensationPackageForDate(packages, '2026-06-10')?.id).toBe('a');
    expect(resolveCompensationPackageForDate(packages, '2026-06-15')?.id).toBe('b');
    expect(resolveCompensationPackageForDate(packages, '2026-06-20')?.id).toBe('b');
  });

  it('prefers the latest recorded package when effectiveFrom is the same', () => {
    const packages = [
      pkg('old', '2026-06-01', '2026-05-20T10:00:00.000Z', '2026-05-31'),
      pkg('new', '2026-06-01', '2026-06-05T12:00:00.000Z'),
    ];

    expect(resolveCompensationPackageForDate(packages, '2026-06-10')?.id).toBe('new');
  });
});

describe('fixedMonthlyProrationFactor', () => {
  it('splits working days between mid-month packages', () => {
    const packages = [
      pkg('a', '2026-06-01', '2026-05-20T10:00:00.000Z'),
      pkg('b', '2026-06-15', '2026-06-10T10:00:00.000Z'),
    ];
    const factorA = fixedMonthlyProrationFactor(packages, 'a', '2026-06', [0]);
    const factorB = fixedMonthlyProrationFactor(packages, 'b', '2026-06', [0]);
    expect(factorA).toBeCloseTo(12 / 26, 5);
    expect(factorB).toBeCloseTo(14 / 26, 5);
    expect(countCompensationPackageDaysInMonth(packages, 'a', '2026-06', [0])).toBe(12);
    expect(countCompensationPackageDaysInMonth(packages, 'b', '2026-06', [0])).toBe(14);
  });
});

describe('sortCompensationPackagesForDisplay', () => {
  it('orders by effectiveFrom desc then createdAt desc', () => {
    const sorted = sortCompensationPackagesForDisplay([
      pkg('a', '2026-06-01', '2026-05-01T00:00:00.000Z'),
      pkg('b', '2026-06-15', '2026-06-10T00:00:00.000Z'),
      pkg('c', '2026-06-01', '2026-06-05T00:00:00.000Z'),
    ]);

    expect(sorted.map((row) => row.id)).toEqual(['b', 'c', 'a']);
    expect(compareCompensationPackages(sorted[0], sorted[1], 'desc')).toBeLessThan(0);
  });
});
