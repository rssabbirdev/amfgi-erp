import {
  isEmployeeOnLeaveForWorkDate,
  mergeProfileExtensionForStatusChange,
  readOnLeaveFrom,
} from '@/lib/hr/employeeLeavePeriod';

describe('employeeLeavePeriod', () => {
  it('reads onLeaveFrom from profile extension', () => {
    expect(readOnLeaveFrom({ onLeaveFrom: '2026-06-01', workforce: {} })).toBe('2026-06-01');
    expect(readOnLeaveFrom({ workforce: {} })).toBeNull();
  });

  it('treats work dates before onLeaveFrom as not on leave for attendance sheet', () => {
    const employee = {
      status: 'ON_LEAVE' as const,
      profileExtension: { onLeaveFrom: '2026-06-10' },
    };
    expect(isEmployeeOnLeaveForWorkDate(employee, '2026-06-09')).toBe(false);
    expect(isEmployeeOnLeaveForWorkDate(employee, '2026-06-10')).toBe(true);
  });

  it('sets onLeaveFrom when status changes to ON_LEAVE', () => {
    const merged = mergeProfileExtensionForStatusChange(
      { workforce: { employeeType: 'DRIVER' } },
      { workforce: { employeeType: 'DRIVER' } },
      'ACTIVE',
      'ON_LEAVE'
    );
    expect(typeof merged.onLeaveFrom).toBe('string');
    expect(String(merged.onLeaveFrom)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('clears onLeaveFrom when employee returns to ACTIVE', () => {
    const merged = mergeProfileExtensionForStatusChange(
      { onLeaveFrom: '2026-06-01', workforce: {} },
      undefined,
      'ON_LEAVE',
      'ACTIVE'
    );
    expect(merged.onLeaveFrom).toBeUndefined();
  });
});
