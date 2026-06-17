import {
  defaultAnnualLeaveTypeId,
  defaultUnpaidLeaveTypeId,
  findUnpaidLeaveTypeId,
  isDraftNonWorking,
  isLeaveManagedDraft,
  normalizeDraftStatusFromApi,
} from '@/lib/hr/attendanceDraftStatus';
import { payPercentForLeaveDay, resolveAttendanceFromLeaveType, UAE_SICK_LEAVE_RULES } from '@/lib/hr/leaveTypeRules';
import { mergeApprovedLeaveIntoPayLines } from '@/lib/hr/payroll/approvedLeaveForPayroll';

const leaveTypes = [
  { id: 'lt-unpaid', code: 'UNPAID', name: 'Unpaid leave', isActive: true, rules: { countsAsPaidLeave: false } },
  { id: 'lt-sick', code: 'SICK', name: 'Sick leave', isActive: true, rules: UAE_SICK_LEAVE_RULES },
  { id: 'lt-annual', code: 'ANNUAL', name: 'Annual leave', isActive: true, rules: { countsAsPaidLeave: true } },
];

describe('attendanceDraftStatus', () => {
  it('maps stored legacy leave status to absent UI', () => {
    expect(normalizeDraftStatusFromApi('LEAVE', leaveTypes)).toEqual({
      status: 'ABSENT',
      leaveTypeId: 'lt-unpaid',
    });
  });

  it('maps stored absent to unpaid leave only', () => {
    expect(normalizeDraftStatusFromApi('ABSENT', leaveTypes)).toEqual({
      status: 'ABSENT',
      leaveTypeId: 'lt-unpaid',
    });
  });

  it('maps legacy half day to present UI', () => {
    expect(normalizeDraftStatusFromApi('HALF_DAY', leaveTypes)).toEqual({
      status: 'PRESENT',
      leaveTypeId: null,
    });
  });

  it('defaults unpaid leave type id', () => {
    expect(defaultUnpaidLeaveTypeId(leaveTypes)).toBe('lt-unpaid');
    expect(findUnpaidLeaveTypeId(leaveTypes)).toBe('lt-unpaid');
  });

  it('defaults annual leave type id for on-leave employees', () => {
    expect(defaultAnnualLeaveTypeId(leaveTypes)).toBe('lt-annual');
  });

  it('detects non-working draft rows', () => {
    expect(isDraftNonWorking({ status: 'ABSENT' })).toBe(true);
    expect(isDraftNonWorking({ status: 'PRESENT' })).toBe(false);
  });

  it('does not treat attendance drafts as leave-managed', () => {
    expect(isLeaveManagedDraft({ leaveRequestId: 'lr-1', attendanceSource: 'LEAVE_REQUEST' })).toBe(false);
  });
});

describe('leaveTypeRules', () => {
  it('applies UAE sick leave tiers', () => {
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 1)).toBe(100);
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 16)).toBe(50);
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 46)).toBe(0);
  });

  it('resolves sick leave as absent with legacy sick type', () => {
    expect(resolveAttendanceFromLeaveType({ id: '1', code: 'SICK', rules: UAE_SICK_LEAVE_RULES })).toEqual({
      status: 'ABSENT',
      legacyLeaveType: 'SICK',
    });
  });
});

describe('mergeApprovedLeaveIntoPayLines', () => {
  it('overlays approved leave onto an existing absent attendance line', () => {
    const merged = mergeApprovedLeaveIntoPayLines(
      [
        {
          workDate: '2026-06-03',
          status: 'ABSENT',
          leaveType: null,
          basicHours: 9,
          workedMinutes: 0,
          isSunday: false,
        },
      ],
      [
        {
          employeeId: 'emp-1',
          workDateYmd: '2026-06-03',
          leaveRequestId: 'lr-1',
          leaveTypeId: 'lt-sick',
          leaveType: 'SICK',
          leaveTypeLabel: 'Sick leave',
          leaveTypeCode: 'SICK',
          rules: UAE_SICK_LEAVE_RULES,
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].leaveRequestId).toBe('lr-1');
    expect(merged[0].leaveTypeLabel).toBe('Sick leave');
    expect(merged[0].status).toBe('ABSENT');
  });
});
