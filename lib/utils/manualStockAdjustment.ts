const MANUAL_STOCK_ADJUSTMENT_ID_PREFIX = '[MANUAL_STOCK_ADJUSTMENT_APPROVAL:';
const MANUAL_STOCK_ADJUSTMENT_REASON_PREFIX = '[MANUAL_STOCK_ADJUSTMENT_REASON:';

export function buildManualStockAdjustmentNote(
  approvalId: string,
  reason: string,
  notes?: string | null
) {
  const trimmedNotes = notes?.trim() || '';
  const parts = [
    `${MANUAL_STOCK_ADJUSTMENT_ID_PREFIX}${approvalId}]`,
    `${MANUAL_STOCK_ADJUSTMENT_REASON_PREFIX}${reason.trim()}]`,
    trimmedNotes,
  ];

  return parts.filter(Boolean).join('\n');
}

export function parseManualStockAdjustmentMetadata(notes?: string | null) {
  const text = notes ?? '';
  const approvalIdMatch = text.match(/\[MANUAL_STOCK_ADJUSTMENT_APPROVAL:([^\]]+)\]/);
  const reasonMatch = text.match(/\[MANUAL_STOCK_ADJUSTMENT_REASON:([^\]]+)\]/);

  return {
    approvalId: approvalIdMatch?.[1] ?? null,
    reason: reasonMatch?.[1] ?? null,
  };
}
