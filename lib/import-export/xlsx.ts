import * as XLSX from 'xlsx';

export function cellToString(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function hasRowContent(row: (string | number | boolean | null)[]) {
  return row.some((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });
}

export function parseOptionalBoolean(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'active'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'inactive'].includes(normalized)) return false;
  return undefined;
}

export function parseOptionalNumber(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseWorkbookBuffer(buffer: ArrayBuffer, sheetName?: string) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const name = sheetName ?? workbook.SheetNames.find((n) => n !== 'Instructions') ?? workbook.SheetNames[0];
  if (!name) throw new Error('Workbook has no sheets');
  const worksheet = workbook.Sheets[name];
  if (!worksheet) throw new Error(`Sheet "${name}" not found`);
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number | boolean | null)[][];
  if (rows.length < 2) throw new Error('Sheet must have a header row and at least one data row');
  const headers = rows[0].map((cell) => cellToString(cell));
  const dataRows = rows.slice(1).filter((row) => hasRowContent(row));
  return { headers, dataRows, sheetName: name };
}

export function sanitizeSheetName(name: string, used: Set<string>) {
  const cleaned = name.replace(/[\\/?*\[\]:]/g, ' ').trim() || 'Sheet';
  let candidate = cleaned.slice(0, 31);
  let counter = 1;
  while (used.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

export function downloadWorkbook(
  filename: string,
  sheets: Array<{ name: string; rows: Array<Array<string | number | boolean | null>> | Record<string, unknown>[] }>
) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = Array.isArray(sheet.rows[0])
      ? XLSX.utils.aoa_to_sheet(sheet.rows as Array<Array<string | number | boolean | null>>)
      : XLSX.utils.json_to_sheet(sheet.rows as Record<string, unknown>[]);
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  XLSX.writeFile(workbook, filename);
}
