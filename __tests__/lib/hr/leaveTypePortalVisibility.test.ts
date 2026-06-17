import {
  filterLeaveTypesForEmployeePortal,
  isLeaveTypeHiddenFromEmployeePortal,
} from '@/lib/hr/leaveTypeRules';

describe('leaveType portal visibility', () => {
  it('detects hidden leave types from rules', () => {
    expect(isLeaveTypeHiddenFromEmployeePortal({ hideFromEmployeePortal: true })).toBe(true);
    expect(isLeaveTypeHiddenFromEmployeePortal({})).toBe(false);
  });

  it('filters hidden types for employee portal', () => {
    const rows = [
      { id: '1', rules: { hideFromEmployeePortal: true } },
      { id: '2', rules: {} },
    ];
    expect(filterLeaveTypesForEmployeePortal(rows)).toEqual([{ id: '2', rules: {} }]);
  });
});
