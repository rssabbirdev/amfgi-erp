import {
  defaultUnpaidLeaveTypeId,
  findUnpaidLeaveTypeId,
  isDraftNonWorking,
  isLeaveManagedDraft,
  normalizeDraftStatusFromApi,
} from '@/lib/hr/attendanceDraftStatus';
import { payPercentForLeaveDay, resolveAttendanceFromLeaveType, UAE_SICK_LEAVE_RULES } from '@/lib/hr/leaveTypeRules';

const leaveTypes = [
  { id: 'lt-unpaid', code: 'UNPAID', name: 'Unpaid leave', isActive: true, rules: { countsAsPaidLeave: false } },
  { id: 'lt-sick', code: 'SICK', name: 'Sick leave', isActive: true, rules: UAE_SICK_LEAVE_RULES },
  { id: 'lt-annual', code: 'ANNUAL', name: 'Annual leave', isActive: true, rules: { countsAsPaidLeave: true } },
];

describe('attendanceDraftStatus', () => {
  it('maps stored paid leave to on-leave UI', () => {
    expect(
      normalizeDraftStatusFromApi('LEAVE', null, 'SICK', leaveTypes)
    ).toEqual({
      status: 'LEAVE',
      leaveTypeId: 'lt-sick',
    });
  });

  it('uses leaveTypeId when present for leave rows', () => {
    expect(
      normalizeDraftStatusFromApi('LEAVE', 'lt-annual', null, leaveTypes)
    ).toEqual({
      status: 'LEAVE',
      leaveTypeId: 'lt-annual',
    });
  });

  it('maps stored absent to unpaid leave only', () => {
    expect(
      normalizeDraftStatusFromApi('ABSENT', 'lt-sick', null, leaveTypes)
    ).toEqual({
      status: 'ABSENT',
      leaveTypeId: 'lt-unpaid',
    });
  });

  it('maps legacy half day to present UI', () => {
    expect(normalizeDraftStatusFromApi('HALF_DAY', null, null, leaveTypes)).toEqual({
      status: 'PRESENT',
      leaveTypeId: null,
    });
  });

  it('defaults unpaid leave type id', () => {
    expect(defaultUnpaidLeaveTypeId(leaveTypes)).toBe('lt-unpaid');
    expect(findUnpaidLeaveTypeId(leaveTypes)).toBe('lt-unpaid');
  });

  it('detects non-working draft rows', () => {
    expect(isDraftNonWorking({ status: 'ABSENT' })).toBe(true);
    expect(isDraftNonWorking({ status: 'LEAVE' })).toBe(true);
    expect(isDraftNonWorking({ status: 'PRESENT' })).toBe(false);
  });

  it('detects leave-managed draft rows', () => {
    expect(isLeaveManagedDraft({ status: 'LEAVE', leaveRequestId: null, attendanceSource: null })).toBe(true);
    expect(
      isLeaveManagedDraft({ status: 'PRESENT', leaveRequestId: 'lr-1', attendanceSource: 'LEAVE_REQUEST' })
    ).toBe(true);
  });
});

describe('leaveTypeRules', () => {
  it('applies UAE sick leave tiers', () => {
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 1)).toBe(100);
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 15)).toBe(100);
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 16)).toBe(50);
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 45)).toBe(50);
    expect(payPercentForLeaveDay(UAE_SICK_LEAVE_RULES, 46)).toBe(0);
  });

  it('resolves sick leave as paid LEAVE status', () => {
    expect(resolveAttendanceFromLeaveType({ id: '1', code: 'SICK', rules: UAE_SICK_LEAVE_RULES })).toEqual({
      status: 'LEAVE',
      legacyLeaveType: 'SICK',
    });
  });

  it('resolves unpaid leave as ABSENT status', () => {
    expect(
      resolveAttendanceFromLeaveType({
        id: '1',
        code: 'UNPAID',
        rules: { countsAsPaidLeave: false },
      })
    ).toEqual({
      status: 'ABSENT',
      legacyLeaveType: null,
    });
  });
});
