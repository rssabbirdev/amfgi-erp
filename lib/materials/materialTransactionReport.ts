import type { TransactionType } from '@prisma/client';

import { parseReportDateBounds } from '@/lib/reports/dateRangePresets';
import {
  resolveTransactionFifoUnitCost,
  resolveTransactionNetLineCost,
} from '@/lib/stock/transactionFifoUnitCost';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export type MaterialTransactionReportKind =
  | 'opening_stock'
  | 'purchase'
  | 'production'
  | 'dispatch'
  | 'dispatch_note'
  | 'subcontract'
  | 'transfer'
  | 'adjustment'
  | 'reversal';

export type MaterialTransactionReportRow = {
  id: string;
  kind: MaterialTransactionReportKind;
  kindLabel: string;
  date: string;
  sortDate: string;
  jobNumber: string | null;
  partyName: string | null;
  quantity: number;
  unit: string;
  value: number;
  href: string | null;
  notePreview: string | null;
};

export const MATERIAL_TRANSACTION_REPORT_TYPE_OPTIONS: Array<{
  value: 'all' | MaterialTransactionReportKind;
  label: string;
}> = [
  { value: 'all', label: 'All types' },
  { value: 'opening_stock', label: 'Opening stock' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'production', label: 'Production' },
  { value: 'dispatch', label: 'Dispatch' },
  { value: 'dispatch_note', label: 'Dispatch note' },
  { value: 'subcontract', label: 'Subcontract' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'reversal', label: 'Reversal' },
];

type ReportTransaction = {
  id: string;
  type: TransactionType;
  quantity: unknown;
  totalCost: unknown;
  averageCost: unknown;
  date: Date;
  notes: string | null;
  isDeliveryNote: boolean;
  deliveryNoteId: string | null;
  parentTransactionId: string | null;
  referenceType: string | null;
  sourceModule: string;
  counterpartCompany: string | null;
  jobId: string | null;
  job: { jobNumber: string; customer: { name: string } | null } | null;
  warehouse: { name: string } | null;
  deliveryNote: {
    number: number;
    deliveryType: string;
    supplier: { name: string } | null;
  } | null;
  material: { unit: string; unitCost: unknown } | null;
  batchesUsed: Array<{
    batch: {
      receiptNumber: string | null;
      supplier: string | null;
      supplierRef: { name: string } | null;
    } | null;
  }>;
  parent: {
    id: string;
    date: Date;
    jobId: string | null;
    isDeliveryNote: boolean;
    deliveryNoteId: string | null;
    job: { jobNumber: string } | null;
  } | null;
};

type EntryAccumulator = {
  id: string;
  kind: MaterialTransactionReportKind;
  kindLabel: string;
  sortDate: Date;
  jobNumber: string | null;
  partyName: string | null;
  quantity: number;
  unit: string;
  value: number;
  href: string | null;
  notePreview: string | null;
  anchorTxn: ReportTransaction;
};

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatReportDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function notePreview(notes: string | null | undefined) {
  const trimmed = notes?.trim();
  if (!trimmed) return null;
  const firstLine = trimmed.split('\n').find((line) => line.trim())?.trim() ?? trimmed;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
}

function transactionValue(txn: ReportTransaction) {
  const quantity = Math.abs(decimalToNumberOrZero(txn.quantity));
  return resolveTransactionNetLineCost(txn, quantity);
}

function stockOutKind(txn: ReportTransaction): {
  kind: MaterialTransactionReportKind;
  kindLabel: string;
} {
  if (txn.deliveryNote?.deliveryType === 'SUBCONTRACT') {
    return { kind: 'subcontract', kindLabel: 'Subcontract' };
  }
  if (txn.isDeliveryNote || txn.deliveryNoteId) {
    return { kind: 'dispatch_note', kindLabel: 'Dispatch note' };
  }
  return { kind: 'dispatch', kindLabel: 'Dispatch' };
}

export function materialTransactionKindLabel(txn: ReportTransaction) {
  if (txn.type === 'STOCK_IN') {
    if (txn.sourceModule === 'production') return 'Production';
    return 'Purchase';
  }
  if (txn.type === 'RETURN') return 'Return';
  if (txn.type === 'STOCK_OUT') return stockOutKind(txn).kindLabel;
  if (txn.type === 'TRANSFER_IN' || txn.type === 'TRANSFER_OUT') return 'Transfer';
  if (txn.type === 'ADJUSTMENT') return 'Adjustment';
  if (txn.type === 'REVERSAL') return 'Reversal';
  return txn.type;
}

export function materialTransactionPartyName(
  txn: ReportTransaction,
  purchaseReceiptByNumber?: PurchaseReceiptLookup,
) {
  if (txn.type === 'STOCK_IN') {
    const receiptNumber = parseReceiptNumberFromTransaction(txn);
    if (receiptNumber) {
      const fromLookup = purchaseReceiptByNumber?.get(receiptNumber)?.supplierName;
      if (fromLookup) return fromLookup;
    }
    const batch = txn.batchesUsed.find((row) => row.batch)?.batch;
    return batch?.supplierRef?.name ?? batch?.supplier ?? null;
  }

  if (txn.deliveryNote?.supplier?.name) {
    return txn.deliveryNote.supplier.name;
  }

  if (txn.job?.customer?.name) {
    return txn.job.customer.name;
  }

  if (txn.counterpartCompany?.trim()) {
    return txn.counterpartCompany.trim();
  }

  if (txn.warehouse?.name) {
    return txn.warehouse.name;
  }

  return null;
}

export function materialTransactionHref(
  txn: ReportTransaction,
  _purchaseReceiptByNumber?: PurchaseReceiptLookup,
) {
  if (txn.type === 'STOCK_IN') {
    const receiptNumber = parseReceiptNumberFromTransaction(txn);
    if (receiptNumber) {
      return `/stock/goods-receipt/receive?edit=${encodeURIComponent(receiptNumber)}`;
    }
    return '/stock/goods-receipt';
  }

  if (txn.type === 'STOCK_OUT') {
    if (txn.deliveryNoteId) {
      return `/stock/dispatch/delivery-note?deliveryNoteId=${encodeURIComponent(txn.deliveryNoteId)}`;
    }
    if (txn.isDeliveryNote) {
      return `/stock/dispatch/delivery-note?transactionId=${encodeURIComponent(txn.id)}`;
    }
    if (txn.jobId) {
      const date = toDateOnly(txn.date);
      return `/stock/dispatch/entry?jobId=${encodeURIComponent(txn.jobId)}&date=${date}`;
    }
    return '/stock/dispatch';
  }

  if (txn.type === 'TRANSFER_IN' || txn.type === 'TRANSFER_OUT') {
    return '/stock/warehouse-transfers';
  }

  if (txn.type === 'ADJUSTMENT') {
    return '/reports/stock-adjustments';
  }

  return null;
}

function stockInKind(txn: ReportTransaction): {
  kind: MaterialTransactionReportKind;
  kindLabel: string;
} {
  if (txn.sourceModule === 'production') {
    return { kind: 'production', kindLabel: 'Production' };
  }
  return { kind: 'purchase', kindLabel: 'Purchase' };
}

function otherEntryKind(txn: ReportTransaction): {
  kind: MaterialTransactionReportKind;
  kindLabel: string;
} {
  if (txn.type === 'TRANSFER_IN' || txn.type === 'TRANSFER_OUT') {
    return { kind: 'transfer', kindLabel: 'Transfer' };
  }
  if (txn.type === 'ADJUSTMENT') {
    return { kind: 'adjustment', kindLabel: 'Adjustment' };
  }
  return { kind: 'reversal', kindLabel: 'Reversal' };
}

function stockOutGroupKey(txn: ReportTransaction) {
  if (txn.deliveryNoteId) return `dn:${txn.deliveryNoteId}`;
  if (txn.isDeliveryNote) return `dn-txn:${txn.id}`;
  if (txn.jobId) return `dispatch:${txn.jobId}:${toDateOnly(txn.date)}`;
  return `stock-out:${txn.id}`;
}

export type PurchaseReceiptMeta = {
  supplierName: string | null;
};

export type PurchaseReceiptLookup = Map<string, PurchaseReceiptMeta>;

type MaterialTransactionReportOptions = {
  purchaseReceiptByNumber?: PurchaseReceiptLookup;
};

export function parseReceiptNumberFromTransaction(
  txn: Pick<ReportTransaction, 'notes' | 'batchesUsed'>,
) {
  const markerMatch = txn.notes?.match(/\[RECEIPT:([^\]]+)\]/);
  if (markerMatch?.[1]?.trim()) return markerMatch[1].trim();
  return txn.batchesUsed.find((row) => row.batch?.receiptNumber)?.batch?.receiptNumber ?? null;
}

export type OpeningStockBatch = {
  id: string;
  batchNumber: string;
  quantityReceived: unknown;
  totalCost: unknown;
  supplier: string | null;
  receiptNumber: string | null;
  receivedDate: Date;
  notes: string | null;
  warehouse: { name: string } | null;
};

export function isOpeningStockBatch(
  batch: Pick<OpeningStockBatch, 'batchNumber' | 'supplier' | 'receiptNumber' | 'notes'>,
) {
  if (batch.receiptNumber?.trim()) return false;

  const supplier = batch.supplier?.trim().toLowerCase() ?? '';
  const notes = batch.notes?.trim().toLowerCase() ?? '';
  const batchNumber = batch.batchNumber.trim().toUpperCase();

  if (supplier === 'opening balance') return true;
  if (batchNumber.startsWith('OPEN-') || batchNumber.startsWith('OPENING-')) return true;
  if (notes.includes('opening balance')) return true;
  if (notes === 'created on material setup') return true;
  if (supplier === 'bulk import' && notes === 'created from bulk import') return true;

  return false;
}

export function buildOpeningStockReportRows(
  batches: OpeningStockBatch[],
  material: { id: string; unit: string },
): MaterialTransactionReportRow[] {
  return batches
    .filter(isOpeningStockBatch)
    .map((batch) => ({
      id: `opening:${batch.id}`,
      kind: 'opening_stock' as const,
      kindLabel: 'Opening stock',
      date: formatReportDate(batch.receivedDate),
      sortDate: toDateOnly(batch.receivedDate),
      jobNumber: null,
      partyName: batch.warehouse?.name?.trim() || batch.supplier?.trim() || null,
      quantity: decimalToNumberOrZero(batch.quantityReceived),
      unit: material.unit,
      value: decimalToNumberOrZero(batch.totalCost),
      href: `/stock/materials/${material.id}`,
      notePreview: notePreview(batch.notes),
    }))
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

export function mergeMaterialTransactionReportRows(
  transactionRows: MaterialTransactionReportRow[],
  openingStockRows: MaterialTransactionReportRow[],
) {
  return [...transactionRows, ...openingStockRows].sort(
    (a, b) => b.sortDate.localeCompare(a.sortDate) || a.kindLabel.localeCompare(b.kindLabel),
  );
}

export async function loadOpeningStockBatches(
  db: {
    stockBatch: {
      findMany: (args: {
        where: {
          companyId: string;
          materialId: string;
          receiptNumber: null;
          receivedDate?: { gte?: Date; lte?: Date };
        };
        select: {
          id: true;
          batchNumber: true;
          quantityReceived: true;
          totalCost: true;
          supplier: true;
          receiptNumber: true;
          receivedDate: true;
          notes: true;
          warehouse: { select: { name: true } };
        };
        orderBy: { receivedDate: 'desc' };
      }) => Promise<OpeningStockBatch[]>;
    };
  },
  companyId: string,
  materialId: string,
  dateFilter?: { gte?: Date; lte?: Date },
) {
  return db.stockBatch.findMany({
    where: {
      companyId,
      materialId,
      receiptNumber: null,
      ...(dateFilter ? { receivedDate: dateFilter } : {}),
    },
    select: {
      id: true,
      batchNumber: true,
      quantityReceived: true,
      totalCost: true,
      supplier: true,
      receiptNumber: true,
      receivedDate: true,
      notes: true,
      warehouse: { select: { name: true } },
    },
    orderBy: { receivedDate: 'desc' },
  });
}

export async function loadPurchaseReceiptLookup(
  db: {
    stockBatch: {
      findMany: (args: {
        where: { companyId: string; receiptNumber: { in: string[] } };
        select: {
          receiptNumber: true;
          supplier: true;
          supplierRef: { select: { name: true } };
        };
      }) => Promise<
        Array<{
          receiptNumber: string | null;
          supplier: string | null;
          supplierRef: { name: string } | null;
        }>
      >;
    };
  },
  companyId: string,
  transactions: ReportTransaction[],
) {
  const receiptNumbers = [
    ...new Set(
      transactions
        .filter((txn) => txn.type === 'STOCK_IN')
        .map((txn) => parseReceiptNumberFromTransaction(txn))
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (receiptNumbers.length === 0) return new Map<string, PurchaseReceiptMeta>();

  const batches = await db.stockBatch.findMany({
    where: { companyId, receiptNumber: { in: receiptNumbers } },
    select: {
      receiptNumber: true,
      supplier: true,
      supplierRef: { select: { name: true } },
    },
  });

  const lookup: PurchaseReceiptLookup = new Map();
  for (const batch of batches) {
    if (!batch.receiptNumber) continue;
    const supplierName = batch.supplierRef?.name?.trim() || batch.supplier?.trim() || null;
    const current = lookup.get(batch.receiptNumber);
    if (!current || supplierName) {
      lookup.set(batch.receiptNumber, { supplierName });
    }
  }

  return lookup;
}

function stockInGroupKey(txn: ReportTransaction) {
  const receiptNumber = parseReceiptNumberFromTransaction(txn);
  if (receiptNumber) return `receipt:${receiptNumber}`;
  return `stock-in:${txn.id}`;
}

function buildReturnsByParent(transactions: ReportTransaction[]) {
  const returnsByParent = new Map<string, { qty: number; cost: number }>();
  for (const txn of transactions) {
    if (txn.type !== 'RETURN' || !txn.parentTransactionId) continue;
    const qty = decimalToNumberOrZero(txn.quantity);
    const cost = transactionValue(txn);
    const current = returnsByParent.get(txn.parentTransactionId) ?? { qty: 0, cost: 0 };
    returnsByParent.set(txn.parentTransactionId, {
      qty: current.qty + qty,
      cost: current.cost + cost,
    });
  }
  return returnsByParent;
}

function stockOutNet(txn: ReportTransaction, returnsByParent: Map<string, { qty: number; cost: number }>) {
  const grossQty = decimalToNumberOrZero(txn.quantity);
  const grossValue = transactionValue(txn);
  const returned = returnsByParent.get(txn.id);
  return {
    quantity: grossQty - (returned?.qty ?? 0),
    value: grossValue - (returned?.cost ?? 0),
  };
}

function upsertEntry(
  grouped: Map<string, EntryAccumulator>,
  key: string,
  txn: ReportTransaction,
  patch: {
    kind: MaterialTransactionReportKind;
    kindLabel: string;
    quantity: number;
    value: number;
    id?: string;
  },
  options?: MaterialTransactionReportOptions,
) {
  const unit = txn.material?.unit ?? '';
  const existing = grouped.get(key);
  if (!existing) {
    grouped.set(key, {
      id: patch.id ?? key,
      kind: patch.kind,
      kindLabel: patch.kindLabel,
      sortDate: txn.date,
      jobNumber: txn.job?.jobNumber ?? null,
      partyName: materialTransactionPartyName(txn, options?.purchaseReceiptByNumber),
      quantity: patch.quantity,
      unit,
      value: patch.value,
      href: materialTransactionHref(txn, options?.purchaseReceiptByNumber),
      notePreview: notePreview(txn.notes),
      anchorTxn: txn,
    });
    return;
  }

  existing.quantity += patch.quantity;
  existing.value += patch.value;
  if (txn.date.getTime() > existing.sortDate.getTime()) {
    existing.sortDate = txn.date;
    existing.anchorTxn = txn;
    existing.href = materialTransactionHref(txn, options?.purchaseReceiptByNumber);
    existing.notePreview = notePreview(txn.notes);
    existing.partyName = materialTransactionPartyName(txn, options?.purchaseReceiptByNumber);
    existing.jobNumber = txn.job?.jobNumber ?? existing.jobNumber;
  }
}

export function buildMaterialTransactionReportRows(
  transactions: ReportTransaction[],
  options?: MaterialTransactionReportOptions,
) {
  const returnsByParent = buildReturnsByParent(transactions);
  const grouped = new Map<string, EntryAccumulator>();

  for (const txn of transactions) {
    if (txn.type === 'RETURN') continue;

    if (txn.type === 'STOCK_OUT') {
      const net = stockOutNet(txn, returnsByParent);
      if (Math.abs(net.quantity) <= 0.0005) continue;
      const { kind, kindLabel } = stockOutKind(txn);
      upsertEntry(grouped, stockOutGroupKey(txn), txn, {
        kind,
        kindLabel,
        quantity: net.quantity,
        value: net.value,
        id: stockOutGroupKey(txn),
      }, options);
      continue;
    }

    if (txn.type === 'STOCK_IN') {
      const { kind, kindLabel } = stockInKind(txn);
      const quantity = decimalToNumberOrZero(txn.quantity);
      upsertEntry(grouped, stockInGroupKey(txn), txn, {
        kind,
        kindLabel,
        quantity,
        value: transactionValue(txn),
        id: stockInGroupKey(txn),
      }, options);
      continue;
    }

    const { kind, kindLabel } = otherEntryKind(txn);
    const quantity = decimalToNumberOrZero(txn.quantity);
    upsertEntry(grouped, `entry:${txn.id}`, txn, {
      kind,
      kindLabel,
      quantity,
      value: transactionValue(txn),
      id: txn.id,
    }, options);
  }

  return [...grouped.values()]
    .map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      kindLabel: entry.kindLabel,
      date: formatReportDate(entry.sortDate),
      sortDate: toDateOnly(entry.sortDate),
      jobNumber: entry.jobNumber,
      partyName: entry.partyName,
      quantity: entry.quantity,
      unit: entry.unit,
      value: entry.value,
      href: entry.href,
      notePreview: entry.notePreview,
    }))
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate) || a.kindLabel.localeCompare(b.kindLabel));
}

/** @deprecated Use buildMaterialTransactionReportRows for entry-level report output. */
export function mapMaterialTransactionReportRow(txn: ReportTransaction): MaterialTransactionReportRow {
  const rows = buildMaterialTransactionReportRows([txn]);
  return (
    rows[0] ?? {
      id: txn.id,
      kind: 'dispatch',
      kindLabel: materialTransactionKindLabel(txn),
      date: formatReportDate(txn.date),
      sortDate: toDateOnly(txn.date),
      jobNumber: txn.job?.jobNumber ?? null,
      partyName: materialTransactionPartyName(txn),
      quantity: decimalToNumberOrZero(txn.quantity),
      unit: txn.material?.unit ?? '',
      value: transactionValue(txn),
      href: materialTransactionHref(txn),
      notePreview: notePreview(txn.notes),
    }
  );
}

export function buildMaterialTransactionReportQuery(from?: string | null, to?: string | null) {
  const bounds = parseReportDateBounds(from, to);
  return {
    dateFilter:
      bounds.start || bounds.end
        ? {
            ...(bounds.start ? { gte: bounds.start } : {}),
            ...(bounds.end ? { lte: bounds.end } : {}),
          }
        : undefined,
    dateRangeLabel: bounds.label,
  };
}

export const materialTransactionReportSelect = {
  id: true,
  type: true,
  quantity: true,
  totalCost: true,
  averageCost: true,
  date: true,
  notes: true,
  isDeliveryNote: true,
  deliveryNoteId: true,
  parentTransactionId: true,
  referenceType: true,
  sourceModule: true,
  counterpartCompany: true,
  jobId: true,
  job: {
    select: {
      jobNumber: true,
      customer: { select: { name: true } },
    },
  },
  warehouse: { select: { name: true } },
  deliveryNote: {
    select: {
      number: true,
      deliveryType: true,
      supplier: { select: { name: true } },
    },
  },
  material: { select: { unit: true, unitCost: true } },
  batchesUsed: {
    select: {
      batch: {
        select: {
          receiptNumber: true,
          supplier: true,
          supplierRef: { select: { name: true } },
        },
      },
    },
  },
  parent: {
    select: {
      id: true,
      date: true,
      jobId: true,
      isDeliveryNote: true,
      deliveryNoteId: true,
      job: { select: { jobNumber: true } },
    },
  },
} as const;
