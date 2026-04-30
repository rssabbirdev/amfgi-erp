import type { ManualStockAdjustmentLinePayload } from '@/lib/utils/manualStockAdjustmentExecution';
import {
  DEFAULT_STOCK_CONTROL_SETTINGS,
  type StockControlSettings,
} from '@/lib/stock-control/settings';

export const MANUAL_ADJUSTMENT_NEGATIVE_EVIDENCE_QTY_THRESHOLD =
  DEFAULT_STOCK_CONTROL_SETTINGS.negativeEvidenceQtyThreshold;
export const MANUAL_ADJUSTMENT_NEGATIVE_DECISION_NOTE_QTY_THRESHOLD =
  DEFAULT_STOCK_CONTROL_SETTINGS.negativeDecisionNoteQtyThreshold;

type EvidenceType = 'PHYSICAL_COUNT' | 'DAMAGE_REPORT' | 'SUPPLIER_CLAIM' | 'CUSTOMER_RETURN' | 'OTHER';

export function summarizeManualStockAdjustmentPolicy(
  lines: ManualStockAdjustmentLinePayload[],
  settings: StockControlSettings = DEFAULT_STOCK_CONTROL_SETTINGS
) {
  const positiveLines = lines.filter((line) => Number(line.quantityDelta) > 0);
  const negativeLines = lines.filter((line) => Number(line.quantityDelta) < 0);
  const largestNegativeQty = negativeLines.reduce(
    (max, line) => Math.max(max, Math.abs(Number(line.quantityDelta) || 0)),
    0
  );

  return {
    positiveLineCount: positiveLines.length,
    negativeLineCount: negativeLines.length,
    highEvidenceNegativeLineCount: negativeLines.filter(
      (line) => Math.abs(Number(line.quantityDelta) || 0) >= settings.negativeEvidenceQtyThreshold
    ).length,
    largestNegativeQty,
    requiresEnhancedEvidence:
      largestNegativeQty >= settings.negativeEvidenceQtyThreshold,
    requiresDecisionNote:
      largestNegativeQty >= settings.negativeDecisionNoteQtyThreshold,
  };
}

export function validateManualStockAdjustmentRequest(args: {
  lines: ManualStockAdjustmentLinePayload[];
  evidenceType: EvidenceType;
  evidenceNotes?: string | null;
  settings?: StockControlSettings;
}) {
  const settings = args.settings ?? DEFAULT_STOCK_CONTROL_SETTINGS;
  const summary = summarizeManualStockAdjustmentPolicy(args.lines, settings);

  const missingPositiveUnitCost = args.lines.find(
    (line) =>
      Number(line.quantityDelta) > 0 &&
      (!Number.isFinite(Number(line.unitCost)) || Number(line.unitCost) <= 0)
  );
  if (missingPositiveUnitCost) {
    throw new Error('Positive stock adjustment lines require an explicit unit cost.');
  }

  if (summary.requiresEnhancedEvidence) {
    if (args.evidenceType === 'OTHER') {
      throw new Error(
        `Negative adjustments of ${settings.negativeEvidenceQtyThreshold.toFixed(0)} or more require a specific evidence type.`
      );
    }
    if (!args.evidenceNotes?.trim() || args.evidenceNotes.trim().length < 12) {
      throw new Error(
        `Negative adjustments of ${settings.negativeEvidenceQtyThreshold.toFixed(0)} or more require detailed evidence notes.`
      );
    }
  }

  return summary;
}
