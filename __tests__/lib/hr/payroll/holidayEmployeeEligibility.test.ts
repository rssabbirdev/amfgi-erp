import {
  employeeHolidayProfileFromEmployee,
  employeeMatchesHolidayCriteria,
  filterCompanyHolidaysForEmployee,
  parseHolidayEmployeeCriteriaInput,
} from '@/lib/hr/payroll/holidayEmployeeEligibility';

describe('holidayEmployeeEligibility', () => {
  const officeEmployee = employeeHolidayProfileFromEmployee({
    employmentType: 'Full-time',
    profileExtension: { workforce: { employeeType: 'OFFICE_STAFF', visaHolding: 'COMPANY_PROVIDED' } },
  });

  const labourEmployee = employeeHolidayProfileFromEmployee({
    employmentType: 'Contract',
    profileExtension: { workforce: { employeeType: 'LABOUR_WORKER', visaHolding: 'SELF_OWN' } },
  });

  it('matches all employees when criteria arrays are empty', () => {
    expect(
      employeeMatchesHolidayCriteria(officeEmployee, {
        employmentTypes: [],
        workforceRoleTypes: [],
        visaHoldings: [],
      })
    ).toBe(true);
  });

  it('filters by employment type', () => {
    const criteria = parseHolidayEmployeeCriteriaInput({
      employmentTypes: ['Full-time'],
      workforceRoleTypes: [],
      visaHoldings: [],
    });
    expect(employeeMatchesHolidayCriteria(officeEmployee, criteria)).toBe(true);
    expect(employeeMatchesHolidayCriteria(labourEmployee, criteria)).toBe(false);
  });

  it('filters by workforce role and visa holding together', () => {
    const criteria = parseHolidayEmployeeCriteriaInput({
      employmentTypes: [],
      workforceRoleTypes: ['LABOUR_WORKER'],
      visaHoldings: ['SELF_OWN'],
    });
    expect(employeeMatchesHolidayCriteria(labourEmployee, criteria)).toBe(true);
    expect(employeeMatchesHolidayCriteria(officeEmployee, criteria)).toBe(false);
  });

  it('filters holidays for a specific employee profile', () => {
    const holidays = [
      {
        workDateYmd: '2026-06-05',
        name: 'Eid',
        isPaid: true,
        payTypeIds: [],
        employmentTypes: ['Full-time'],
        workforceRoleTypes: [],
        visaHoldings: [],
      },
      {
        workDateYmd: '2026-06-06',
        name: 'Eid holiday',
        isPaid: true,
        payTypeIds: [],
        employmentTypes: [],
        workforceRoleTypes: ['LABOUR_WORKER'],
        visaHoldings: [],
      },
    ];

    const forOffice = filterCompanyHolidaysForEmployee(holidays, officeEmployee);
    expect(forOffice.map((holiday) => holiday.workDateYmd)).toEqual(['2026-06-05']);

    const forLabour = filterCompanyHolidaysForEmployee(holidays, labourEmployee);
    expect(forLabour.map((holiday) => holiday.workDateYmd)).toEqual(['2026-06-06']);
  });
});
