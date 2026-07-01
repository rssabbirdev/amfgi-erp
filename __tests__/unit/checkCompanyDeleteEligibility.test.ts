import { checkCompanyDeleteEligibility } from '@/lib/companies/checkCompanyDeleteEligibility';
import { GLOBAL_LIVE_UPDATE_COMPANY_ID } from '@/lib/live-updates/server';

function makePrisma(counts: Partial<Record<string, number>>) {
  const count = (value: number) => jest.fn().mockResolvedValue(counts[value] ?? 0);
  return {
    company: {
      findUnique: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Test Co' }),
    },
    customer: { count: count('customer') },
    supplier: { count: count('supplier') },
    job: { count: count('job') },
    material: { count: count('material') },
    employee: { count: count('employee') },
    transaction: { count: count('transaction') },
    dispatchEntryRevision: { count: count('dispatchEntryRevision') },
    deliveryNote: { count: count('deliveryNote') },
    stockBatch: { count: count('stockBatch') },
    stockCountSession: { count: count('stockCountSession') },
    category: { count: count('category') },
    unit: { count: count('unit') },
    warehouse: { count: count('warehouse') },
    user: { count: count('user') },
    userCompanyAccess: { count: count('userCompanyAccess') },
    mediaAsset: { count: count('mediaAsset') },
    payRun: { count: count('payRun') },
    workAssignment: { count: count('workAssignment') },
    workSchedule: { count: count('workSchedule') },
    employeeDocument: { count: count('employeeDocument') },
    integrationSyncLog: { count: count('integrationSyncLog') },
    formulaLibrary: { count: count('formulaLibrary') },
    companyHoliday: { count: count('companyHoliday') },
    workforceExpertise: { count: count('workforceExpertise') },
    quantityLogDaySubmission: { count: count('quantityLogDaySubmission') },
    quantityLogAdhocJob: { count: count('quantityLogAdhocJob') },
    apiCredential: { count: count('apiCredential') },
    productionStockPosting: { count: count('productionStockPosting') },
  };
}

describe('checkCompanyDeleteEligibility', () => {
  it('blocks the system live-updates company', async () => {
    const result = await checkCompanyDeleteEligibility(
      makePrisma({}) as never,
      GLOBAL_LIVE_UPDATE_COMPANY_ID,
    );
    expect(result.canDelete).toBe(false);
    expect(result.deleteBlockedReason).toBe('system_company');
  });

  it('allows delete when only default/bootstrap data would exist', async () => {
    const result = await checkCompanyDeleteEligibility(makePrisma({}) as never, 'co-1');
    expect(result.canDelete).toBe(true);
    expect(result.totalLinkedCount).toBe(0);
  });

  it('blocks delete when operational data exists', async () => {
    const result = await checkCompanyDeleteEligibility(
      makePrisma({ material: 1, transaction: 2 }) as never,
      'co-1',
    );
    expect(result.canDelete).toBe(false);
    expect(result.totalLinkedCount).toBe(3);
    expect(result.links.map((link) => link.label)).toEqual(
      expect.arrayContaining(['Material', 'Stock transaction']),
    );
  });
});
