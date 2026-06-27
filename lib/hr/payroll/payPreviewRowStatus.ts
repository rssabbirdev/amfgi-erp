export const PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON =
  'Attendance recorded but no active compensation set yet';

const NO_ACTIVE_COMPENSATION_REASONS = new Set([
  'No active compensation for this month',
  PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON,
]);

export type PayPreviewRowSkipState = {
  skipped: boolean;
  approvedAttendanceRows: number;
  skipReason: string | null;
};

export function isNoActiveCompensationSkipReason(skipReason: string | null): boolean {
  return skipReason != null && NO_ACTIVE_COMPENSATION_REASONS.has(skipReason);
}

/** Skipped for payroll but shown in preview when attendance exists for the month. */
export function isPayPreviewPendingCompensationRow(row: PayPreviewRowSkipState): boolean {
  return row.skipped && row.approvedAttendanceRows > 0 && isNoActiveCompensationSkipReason(row.skipReason);
}

export function resolveNoActiveCompensationSkipReason(attendanceRowCount: number): string {
  return attendanceRowCount > 0
    ? PAY_PREVIEW_NO_ACTIVE_COMPENSATION_REASON
    : 'No active compensation for this month';
}
