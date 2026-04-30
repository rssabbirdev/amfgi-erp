export type StockControlSettings = {
  negativeEvidenceQtyThreshold: number;
  negativeDecisionNoteQtyThreshold: number;
};

export const DEFAULT_STOCK_CONTROL_SETTINGS: StockControlSettings = {
  negativeEvidenceQtyThreshold: 10,
  negativeDecisionNoteQtyThreshold: 25,
};

export function normalizeStockControlSettings(input: unknown): StockControlSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return DEFAULT_STOCK_CONTROL_SETTINGS;
  }

  const candidate = input as {
    negativeEvidenceQtyThreshold?: unknown;
    negativeDecisionNoteQtyThreshold?: unknown;
  };

  const negativeEvidenceQtyThreshold = Number(candidate.negativeEvidenceQtyThreshold);
  const negativeDecisionNoteQtyThreshold = Number(candidate.negativeDecisionNoteQtyThreshold);

  const normalizedEvidenceThreshold =
    Number.isFinite(negativeEvidenceQtyThreshold) && negativeEvidenceQtyThreshold > 0
      ? Number(negativeEvidenceQtyThreshold.toFixed(3))
      : DEFAULT_STOCK_CONTROL_SETTINGS.negativeEvidenceQtyThreshold;

  const normalizedDecisionThreshold =
    Number.isFinite(negativeDecisionNoteQtyThreshold) &&
    negativeDecisionNoteQtyThreshold >= normalizedEvidenceThreshold
      ? Number(negativeDecisionNoteQtyThreshold.toFixed(3))
      : Math.max(
          DEFAULT_STOCK_CONTROL_SETTINGS.negativeDecisionNoteQtyThreshold,
          normalizedEvidenceThreshold
        );

  return {
    negativeEvidenceQtyThreshold: normalizedEvidenceThreshold,
    negativeDecisionNoteQtyThreshold: normalizedDecisionThreshold,
  };
}

export function readStockControlSettingsFromCompanySettings(input: unknown): StockControlSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return DEFAULT_STOCK_CONTROL_SETTINGS;
  }

  const candidate = input as {
    stockControl?: unknown;
  };

  return normalizeStockControlSettings(candidate.stockControl);
}

export function mergeStockControlSettingsIntoCompanySettings(
  current: unknown,
  stockControl: StockControlSettings
) {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : {};

  return {
    ...base,
    stockControl,
  };
}
