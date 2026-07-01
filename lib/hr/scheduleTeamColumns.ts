export function teamDisplayLabel(index: number): string {
  return `Team#${index + 1}`;
}

export function teamDisplayLabelShort(index: number): string {
  return `T${index + 1}`;
}

/** Keep column order, `columnIndex`, and `Team#` labels in sync (1…n left-to-right). */
export function renormalizeTeamColumnDrafts<T extends { columnIndex: number; label: string }>(
  rows: T[],
): T[] {
  return rows.map((row, index) => ({
    ...row,
    columnIndex: index + 1,
    label: teamDisplayLabel(index),
  }));
}
