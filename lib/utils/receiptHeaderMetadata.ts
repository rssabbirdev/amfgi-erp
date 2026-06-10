import type { Prisma } from '@prisma/client';

export const STOCK_BATCH_RECEIPT_HEADER_META_KEY = 'receiptHeader';

export interface ReceiptHeaderMetadata {
  lpoNumber: string | null;
  supplierInvoiceNumber: string | null;
  billAmount: number | null;
  includeTax: boolean | null;
  taxAmount: number | null;
}

const EMPTY_HEADER: ReceiptHeaderMetadata = {
  lpoNumber: null,
  supplierInvoiceNumber: null,
  billAmount: null,
  includeTax: null,
  taxAmount: null,
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function resolveReceiptBillAmount(
  header: ReceiptHeaderMetadata,
  subtotalValue: number
): number {
  if (header.billAmount != null && header.billAmount >= 0) {
    return header.billAmount;
  }
  return subtotalValue;
}

export function parseReceiptHeaderMetadata(meta: unknown): ReceiptHeaderMetadata {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return EMPTY_HEADER;
  }

  const receiptHeader = (meta as Record<string, unknown>)[STOCK_BATCH_RECEIPT_HEADER_META_KEY];
  if (!receiptHeader || typeof receiptHeader !== 'object' || Array.isArray(receiptHeader)) {
    return EMPTY_HEADER;
  }

  const row = receiptHeader as Record<string, unknown>;
  return {
    lpoNumber: normalizeOptionalString(row.lpoNumber),
    supplierInvoiceNumber: normalizeOptionalString(row.supplierInvoiceNumber),
    billAmount: normalizeOptionalNumber(row.billAmount),
    includeTax: typeof row.includeTax === 'boolean' ? row.includeTax : null,
    taxAmount: normalizeOptionalNumber(row.taxAmount),
  };
}

export function buildStockBatchReceiptHeaderMeta(input: {
  lpoNumber?: string | null;
  supplierInvoiceNumber?: string | null;
  billAmount?: number | null;
  includeTax?: boolean | null;
  taxAmount?: number | null;
}): Prisma.InputJsonValue | undefined {
  const lpoNumber = normalizeOptionalString(input.lpoNumber);
  const supplierInvoiceNumber = normalizeOptionalString(input.supplierInvoiceNumber);
  const billAmount = normalizeOptionalNumber(input.billAmount);
  const includeTax = typeof input.includeTax === 'boolean' ? input.includeTax : null;
  const taxAmount = normalizeOptionalNumber(input.taxAmount);

  if (!lpoNumber && !supplierInvoiceNumber && billAmount == null && includeTax == null && taxAmount == null) {
    return undefined;
  }

  const receiptHeader: Record<string, string | number | boolean> = {};
  if (lpoNumber) receiptHeader.lpoNumber = lpoNumber;
  if (supplierInvoiceNumber) receiptHeader.supplierInvoiceNumber = supplierInvoiceNumber;
  if (billAmount != null) receiptHeader.billAmount = billAmount;
  if (includeTax != null) receiptHeader.includeTax = includeTax;
  if (taxAmount != null) receiptHeader.taxAmount = taxAmount;

  return { [STOCK_BATCH_RECEIPT_HEADER_META_KEY]: receiptHeader };
}

export function mergeStockBatchReceiptMeta(
  lineMeta: Prisma.InputJsonValue | undefined,
  headerMeta: Prisma.InputJsonValue | undefined
): Prisma.InputJsonValue | undefined {
  if (!lineMeta && !headerMeta) return undefined;
  return {
    ...(lineMeta && typeof lineMeta === 'object' && !Array.isArray(lineMeta) ? lineMeta : {}),
    ...(headerMeta && typeof headerMeta === 'object' && !Array.isArray(headerMeta) ? headerMeta : {}),
  };
}
