import {
  isPayPreviewPendingCompensationRow,
  PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON,
  resolveNoActiveCompensationSkipReason,
} from '@/lib/hr/payroll/payPreviewRowStatus';

describe('payPreviewRowStatus', () => {
  it('uses attendance message when attendance exists but compensation is missing', () => {
    expect(resolveNoActiveCompensationSkipReason(3)).toBe(PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON);
    expect(resolveNoActiveCompensationSkipReason(0)).toBe('No active compensation for this month');
  });

  it('flags pending compensation rows for preview table display', () => {
    expect(
      isPayPreviewPendingCompensationRow({
        skipped: true,
        approvedAttendanceRows: 2,
        skipReason: PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON,
      })
    ).toBe(true);
    expect(
      isPayPreviewPendingCompensationRow({
        skipped: true,
        approvedAttendanceRows: 2,
        skipReason: 'No active compensation for this month',
      })
    ).toBe(true);
    expect(
      isPayPreviewPendingCompensationRow({
        skipped: true,
        approvedAttendanceRows: 0,
        skipReason: PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON,
      })
    ).toBe(false);
    expect(
      isPayPreviewPendingCompensationRow({
        skipped: true,
        approvedAttendanceRows: 2,
        skipReason: 'Invalid pay type configuration',
      })
    ).toBe(false);
  });
});
