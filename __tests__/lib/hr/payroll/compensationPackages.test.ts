import {
  allowanceTotal,
  formatPackageForApi,
  type CompensationPackageRow,
} from '@/lib/hr/payroll/compensationPackageFormat';

function mockPackage(overrides: Partial<CompensationPackageRow> = {}): CompensationPackageRow {
  return {
    id: 'c1',
    companyId: 'co',
    employeeId: 'e1',
    payTypeId: 'pt1',
    visaPeriodId: null,
    monthlyBasic: 3000 as never,
    monthlyAllowance: null,
    dailyRate: null,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    payType: { id: 'pt1', name: 'Office', code: 'OFFICE', config: {} },
    visaPeriod: null,
    allowances: [
      {
        id: 'a1',
        companyId: 'co',
        employeeId: 'e1',
        employeeCompensationId: 'c1',
        allowanceTypeId: 'at1',
        amount: 500 as never,
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        allowanceType: { id: 'at1', name: 'Housing', code: 'HOUSING' },
      },
    ],
    ...overrides,
  } as CompensationPackageRow;
}

describe('compensationPackages', () => {
  it('sums allowance lines', () => {
    expect(allowanceTotal(mockPackage())).toBe(500);
  });

  it('computes increase deltas vs previous package', () => {
    const current = mockPackage({ monthlyBasic: 3500 as never });
    const previous = mockPackage({ monthlyBasic: 3000 as never });
    const formatted = formatPackageForApi(current, previous);
    const basicChange = formatted.changes.find((c) => c.label === 'Monthly basic');
    expect(basicChange?.delta).toBe(500);
  });
});
