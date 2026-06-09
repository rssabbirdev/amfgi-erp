export type AllowanceSumRow = {
  allowanceTypeId: string;
  allowanceTypeName: string;
  amount: number;
  effectiveFrom: string;
};

/** One row per allowance type — latest effectiveFrom wins (avoids double-counting history). */
export function dedupeAllowancesByType<T extends AllowanceSumRow>(items: T[]): T[] {
  const byType = new Map<string, T>();
  for (const item of items) {
    const existing = byType.get(item.allowanceTypeId);
    if (!existing || item.effectiveFrom >= existing.effectiveFrom) {
      byType.set(item.allowanceTypeId, item);
    }
  }
  return [...byType.values()].sort((a, b) =>
    a.allowanceTypeName.localeCompare(b.allowanceTypeName)
  );
}

export function sumAllowanceAmounts(items: Array<{ amount: number }>): number {
  return items.reduce((sum, row) => sum + row.amount, 0);
}

export function resolveMonthlyAllowanceTotal(
  legacyMonthlyAllowance: number,
  typedRows: Array<{ amount: { toString(): string } | number }>
): number {
  if (typedRows.length > 0) {
    return typedRows.reduce((sum, row) => sum + Number(row.amount), 0);
  }
  return legacyMonthlyAllowance;
}
