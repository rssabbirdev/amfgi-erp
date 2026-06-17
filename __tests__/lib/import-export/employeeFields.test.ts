import {
  mergeWorkforceIntoProfileExtension,
  profileExtensionForEmployeeImport,
} from '@/lib/hr/employeeImportProfile';
import { readOnLeaveFrom } from '@/lib/hr/employeeLeavePeriod';
import { parseWorkforceProfile } from '@/lib/hr/workforceProfile';
import {
  employeeImportRowToPayload,
  mapEmployeeImportRow,
} from '@/lib/import-export/employeeFields';

describe('employee import/export fields', () => {
  it('maps workforce short type labels on import', () => {
    const mapped = mapEmployeeImportRow(
      ['EMP-1', 'Jane Doe', 'Driver'],
      ['Employee Code', 'Full Name', 'Employee Type'],
      { 0: 'employee_code', 1: 'full_name', 2: 'employee_type' },
      2
    );
    expect(mapped.__errors).toEqual([]);
    expect(mapped.employeeType).toBe('DRIVER');
  });

  it('builds partial update payloads from mapped columns only', () => {
    const mapped = mapEmployeeImportRow(
      ['EMP-1', 'Jane Doe', 'Production'],
      ['Employee Code', 'Full Name', 'Department'],
      { 0: 'employee_code', 1: 'full_name', 2: 'department' },
      2
    );
    const payload = employeeImportRowToPayload(mapped);
    expect(payload.department).toBe('Production');
    expect(payload.email).toBeUndefined();
    expect(payload.employeeType).toBeUndefined();
  });

  it('merges workforce without wiping onLeaveFrom on status change back to active', () => {
    const existing = {
      onLeaveFrom: '2026-05-01',
      workforce: {
        employeeType: 'OFFICE_STAFF',
        visaHolding: 'COMPANY_PROVIDED',
        expertises: ['Lamination'],
      },
    };
    const merged = profileExtensionForEmployeeImport({
      existingExtension: existing,
      previousStatus: 'ON_LEAVE',
      nextStatus: 'ACTIVE',
      workforcePatch: { employeeType: 'DRIVER' },
      isCreate: false,
    });
    expect(parseWorkforceProfile(merged).employeeType).toBe('DRIVER');
    expect(parseWorkforceProfile(merged).expertises).toEqual(['Lamination']);
    expect(readOnLeaveFrom(merged)).toBeNull();
  });

  it('preserves non-workforce profile keys when patching workforce', () => {
    const existing = { customFlag: true, workforce: { employeeType: 'DRIVER', visaHolding: 'SELF_OWN', expertises: [] } };
    const merged = mergeWorkforceIntoProfileExtension(existing, { visaHolding: 'NO_VISA' });
    expect((merged as { customFlag?: boolean }).customFlag).toBe(true);
    expect(parseWorkforceProfile(merged).visaHolding).toBe('NO_VISA');
  });
});
