import { formatDate, formatCurrency } from './formatters';
import type { ItemType } from '@/lib/types/documentTemplate';

export interface TemplateDataContext {
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    letterheadUrl: string;
    slug?: string;
    description?: string;
  };
  dn: {
    number: string;
    date: string;
    notes: string;
    totalCost: number;
    quantity: number;
    signedCopyUrl: string;
  };
  material: {
    name: string;
    unit: string;
    unitCost: number;
  } | null;
  job: {
    jobNumber: string;
    description: string;
    site?: string;
    lpoNumber?: string;
    quotationNumber?: string;
    projectName?: string;
    projectDetails?: string;
    jobWorkValue?: number;
  } | null;
  customer: {
    name: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
  } | null;
  customItems: Array<{
    name: string;
    description: string;
    qty: string;
    unit: string;
  }>;
  today: string;
}

// ---- Additional context types for other document types ----

export interface GoodsReceiptContext {
  company: TemplateDataContext['company'];
  grn: {
    number: string;
    date: string;
    totalCost: number;
    notes: string;
  };
  supplier: {
    name: string;
    contactPerson: string;
    phone: string;
  } | null;
  material: {
    name: string;
    unit: string;
    unitCost: number;
  } | null;
  customItems: TemplateDataContext['customItems'];
  today: string;
}

export interface PackingSlipContext {
  company: TemplateDataContext['company'];
  job: TemplateDataContext['job'];
  customer: TemplateDataContext['customer'];
  customItems: TemplateDataContext['customItems'];
  today: string;
}

export interface MaterialLabelContext {
  company: TemplateDataContext['company'];
  material: {
    name: string;
    unit: string;
    unitCost: number;
    stockType: string;
    category: string;
    warehouse: string;
    currentStock: number;
    reorderLevel: number;
    description: string;
    externalItemName: string;
  } | null;
  today: string;
}

export type AnyTemplateDataContext =
  | TemplateDataContext
  | GoodsReceiptContext
  | PackingSlipContext
  | MaterialLabelContext;

export const AVAILABLE_FIELDS = [
  { path: 'company.name', label: 'Company Name' },
  { path: 'company.address', label: 'Company Address' },
  { path: 'company.phone', label: 'Company Phone' },
  { path: 'company.email', label: 'Company Email' },
  { path: 'dn.number', label: 'DN Number' },
  { path: 'dn.date', label: 'DN Date' },
  { path: 'dn.totalCost', label: 'Total Cost' },
  { path: 'dn.quantity', label: 'Quantity' },
  { path: 'job.jobNumber', label: 'Job Number' },
  { path: 'job.description', label: 'Job Description' },
  { path: 'job.site', label: 'Site' },
  { path: 'job.lpoNumber', label: 'LPO Number' },
  { path: 'job.quotationNumber', label: 'Quotation Number' },
  { path: 'material.name', label: 'Material Name' },
  { path: 'material.unit', label: 'Material Unit' },
  { path: 'material.unitCost', label: 'Material Unit Cost' },
  { path: 'today', label: "Today's Date" },
];

function parseDeliveryNoteNumber(notes?: string): string {
  if (!notes) return 'N/A';
  const match = notes.match(/--- DELIVERY NOTE #(\d+)/);
  return match ? match[1] : 'N/A';
}

function parseCustomItems(notes?: string): Array<{
  name: string;
  description: string;
  qty: string;
  unit: string;
}> {
  if (!notes) return [];

  const itemsMatch = notes.match(
    /--- DELIVERY NOTE ITEMS \(For Printing\) ---\r?\n([\s\S]*?)(?=\r?\n---|\r?\n$|$)/
  );
  if (!itemsMatch) return [];

  const itemsText = itemsMatch[1];
  const items: Array<{ name: string; description: string; qty: string; unit: string }> = [];

  const lines = itemsText.split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines) {
    // Same as dispatch/delivery-note save: `• name | qty unit` or `• name - description | qty unit`
    const bullet = line.match(/^•\s*(.+)$/);
    if (!bullet) continue;
    const rest = bullet[1].trim();
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx < 0) continue;
    const left = rest.slice(0, pipeIdx).trim();
    const right = rest.slice(pipeIdx + 1).trim();
    const qtyUnit = right.match(/^(\S+)\s+(.+)$/);
    if (!qtyUnit) continue;
    const qty = qtyUnit[1].trim();
    const unit = qtyUnit[2].trim();
    const dashIdx = left.indexOf(' - ');
    let name: string;
    let description: string;
    if (dashIdx >= 0) {
      name = left.slice(0, dashIdx).trim();
      description = left.slice(dashIdx + 3).trim();
    } else {
      name = left;
      description = '';
    }
    items.push({ name, description, qty, unit });
  }

  return items;
}

/** One table row per STOCK_OUT line that has a material (dispatch lines are not stored in notes). */
function stockOutMaterialTableRows(transactions: any[]): Array<{
  name: string;
  description: string;
  qty: string;
  unit: string;
}> {
  return transactions
    .filter((t) => t?.type === 'STOCK_OUT' && t.material)
    .map((t) => ({
      name: String(t.material?.name ?? ''),
      description: '',
      qty: String(t.quantity ?? ''),
      unit: String(t.material?.unit ?? ''),
    }));
}

function deliveryNoteTableRowsFromNotesAndTransactions(
  notes: string | undefined,
  stockOutTransactions: any[]
): Array<{ name: string; description: string; qty: string; unit: string }> {
  return [...parseCustomItems(notes), ...stockOutMaterialTableRows(stockOutTransactions)];
}

/**
 * Build preview/print context for a full delivery note (one or more STOCK_OUT lines sharing the same note block).
 */
export function buildDeliveryNoteTemplateData(
  stockOutTransactions: any[],
  company: any
): TemplateDataContext {
  const txs = stockOutTransactions.filter((t) => t?.type === 'STOCK_OUT');
  if (txs.length === 0) {
    return buildTemplateData(stockOutTransactions[0] ?? { notes: '', date: new Date() }, company);
  }
  const first = txs[0];
  const customItems = deliveryNoteTableRowsFromNotesAndTransactions(first.notes, txs);
  const totalCost = txs.reduce((s, t) => s + (Number(t.totalCost) || 0), 0);
  const totalQty = txs.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
  const withMat = txs.find((t) => t.material);

  return {
    company: {
      name: company?.name ?? '',
      address: company?.address ?? '',
      phone: company?.phone ?? '',
      email: company?.email ?? '',
      letterheadUrl: company?.letterheadUrl ?? '',
      slug: company?.slug,
      description: company?.description,
    },
    dn: {
      number: parseDeliveryNoteNumber(first.notes),
      date: formatDate(first.date),
      notes: (first.notes ?? '').split('--- DELIVERY NOTE')[0].trim(),
      totalCost,
      quantity: totalQty,
      signedCopyUrl: first.signedCopyUrl ?? '',
    },
    material: withMat?.material
      ? {
          name: withMat.material.name ?? '',
          unit: withMat.material.unit ?? '',
          unitCost: withMat.material.unitCost ?? 0,
        }
      : null,
    job: first.job
      ? {
          jobNumber: first.job.jobNumber ?? '',
          description: first.job.description ?? '',
          site: first.job.site,
          lpoNumber: first.job.lpoNumber,
          quotationNumber: first.job.quotationNumber,
          projectName: first.job.projectName,
          projectDetails: first.job.projectDetails,
          jobWorkValue: first.job.jobWorkValue,
        }
      : null,
    customer: first.job?.customer
      ? {
          name: first.job.customer.name ?? '',
          contactPerson: first.job.customer.contactPerson ?? undefined,
          phone: first.job.customer.phone ?? undefined,
          email: first.job.customer.email ?? undefined,
          address: first.job.customer.address ?? undefined,
        }
      : null,
    customItems,
    today: formatDate(new Date().toISOString()),
  };
}

export function buildTemplateData(
  transaction: any, // Transaction from API
  company: any      // Company from API
): TemplateDataContext {
  const stockOutSlice =
    transaction?.type === 'STOCK_OUT' ? [transaction] : [];
  const customItems = deliveryNoteTableRowsFromNotesAndTransactions(
    transaction.notes,
    stockOutSlice
  );

  return {
    company: {
      name: company?.name ?? '',
      address: company?.address ?? '',
      phone: company?.phone ?? '',
      email: company?.email ?? '',
      letterheadUrl: company?.letterheadUrl ?? '',
      slug: company?.slug,
      description: company?.description,
    },
    dn: {
      number: parseDeliveryNoteNumber(transaction.notes),
      date: formatDate(transaction.date),
      notes: (transaction.notes ?? '').split('--- DELIVERY NOTE')[0].trim(),
      totalCost: transaction.totalCost ?? 0,
      quantity: transaction.quantity ?? 0,
      signedCopyUrl: transaction.signedCopyUrl ?? '',
    },
    material: transaction.material
      ? {
          name: transaction.material.name ?? '',
          unit: transaction.material.unit ?? '',
          unitCost: transaction.material.unitCost ?? 0,
        }
      : null,
    job: transaction.job
      ? {
          jobNumber: transaction.job.jobNumber ?? '',
          description: transaction.job.description ?? '',
          site: transaction.job.site,
          lpoNumber: transaction.job.lpoNumber,
          quotationNumber: transaction.job.quotationNumber,
          projectName: transaction.job.projectName,
          projectDetails: transaction.job.projectDetails,
          jobWorkValue: transaction.job.jobWorkValue,
        }
      : null,
    customer: transaction.job?.customer
      ? {
          name: transaction.job.customer.name ?? '',
          contactPerson: transaction.job.customer.contactPerson ?? undefined,
          phone: transaction.job.customer.phone ?? undefined,
          email: transaction.job.customer.email ?? undefined,
          address: transaction.job.customer.address ?? undefined,
        }
      : null,
    customItems,
    today: formatDate(new Date().toISOString()),
  };
}

export function resolveField(
  field: string,
  data: AnyTemplateDataContext
): string {
  const parts = field.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return '';
    current = (current as Record<string, unknown>)[part];
  }

  if (current === null || current === undefined) return '';
  if (typeof current === 'number' && Number.isFinite(current)) return String(current);
  return String(current);
}

export function formatValue(
  value: string | number,
  format?: 'date' | 'currency' | 'number' | 'text'
): string {
  if (!format || format === 'text') return String(value);

  if (format === 'date') {
    // Assume value is ISO string like "2026-04-10"
    if (typeof value === 'string') {
      return formatDate(value);
    }
    return String(value);
  }

  if (format === 'currency') {
    return formatCurrency(Number(value));
  }

  if (format === 'number') {
    const num = Number(value);
    return isNaN(num) ? String(value) : num.toFixed(2);
  }

  return String(value);
}

export const MOCK_PREVIEW_DATA: TemplateDataContext = {
  company: {
    name: 'Almuraqib Fiber Glass Industry LLC',
    address: 'P.O. Box 123456, Dubai, UAE — Jebel Ali Industrial Area 1',
    phone: '+971 4 885 1234',
    email: 'info@almuraqib.ae',
    letterheadUrl: '',
    slug: 'amfgi',
    description: 'Fiberglass fabrication and moulding',
  },
  dn: {
    number: 'DN-2026-0042',
    date: new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }),
    notes: 'Delivery for Phase 1 project. Items packed and ready.',
    totalCost: 5250,
    quantity: 3,
    signedCopyUrl: '',
  },
  material: {
    name: 'Steel Pipe 2"',
    unit: 'PCS',
    unitCost: 1750,
  },
  job: {
    jobNumber: 'JOB-2024-001',
    description: 'Infrastructure Project - Phase 1',
    site: 'Dubai Industrial Zone',
    lpoNumber: 'LPO-9876',
    quotationNumber: 'QTN-5432',
    projectName: 'Tower B Fit-out',
    projectDetails: 'Floors 3–5 MEP supports',
    jobWorkValue: 125000,
  },
  customer: {
    name: 'Acme Contracting LLC',
    contactPerson: 'Sara Al-Mazrouei',
    phone: '+971 50 111 2233',
    email: 'procurement@acme.ae',
    address: 'Business Bay, Dubai',
  },
  customItems: [
    {
      name: 'Steel Pipe 2"',
      description: 'Galvanized steel pipe',
      qty: '2',
      unit: 'PCS',
    },
    {
      name: 'Elbow Fitting',
      description: '90° elbow 2"',
      qty: '1',
      unit: 'PCS',
    },
  ],
  today: new Date().toLocaleDateString('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }),
};

export const MOCK_GRN_DATA: GoodsReceiptContext = {
  company: MOCK_PREVIEW_DATA.company,
  grn: {
    number: 'GRN-2024-089',
    date: new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }),
    totalCost: 8750,
    notes: 'Goods received in good condition. Inspected and accepted.',
  },
  supplier: {
    name: 'Supplier A LLC',
    contactPerson: 'Ahmed Al-Mansouri',
    phone: '+971 4 555 6789',
  },
  material: {
    name: 'Fiberglass Sheet 3mm',
    unit: 'SQM',
    unitCost: 125,
  },
  customItems: [
    {
      name: 'Fiberglass Sheet 3mm',
      description: 'Clear fiberglass sheet',
      qty: '70',
      unit: 'SQM',
    },
  ],
  today: MOCK_PREVIEW_DATA.today,
};

export const MOCK_PACKING_SLIP_DATA: PackingSlipContext = {
  company: MOCK_PREVIEW_DATA.company,
  job: MOCK_PREVIEW_DATA.job,
  customer: MOCK_PREVIEW_DATA.customer,
  customItems: MOCK_PREVIEW_DATA.customItems,
  today: MOCK_PREVIEW_DATA.today,
};

export const MOCK_MATERIAL_LABEL_DATA: MaterialLabelContext = {
  company: MOCK_PREVIEW_DATA.company,
  material: {
    name: 'Steel Pipe 2"',
    unit: 'PCS',
    unitCost: 1750,
    stockType: 'Material',
    category: 'Steel Products',
    warehouse: 'Main Store',
    currentStock: 45,
    reorderLevel: 20,
    description: 'Galvanized steel pipe, 2 inch diameter',
    externalItemName: 'SP-2-GAL',
  },
  today: MOCK_PREVIEW_DATA.today,
};

/**
 * Builds appropriate data context based on item type.
 * For delivery-note: uses existing buildTemplateData.
 * For other types: return mock data (future: integrate with actual sources).
 */
export function buildDataContext(
  itemType: ItemType,
  sourceDoc: any,
  company: any
): AnyTemplateDataContext {
  if (itemType === 'delivery-note') {
    return buildTemplateData(sourceDoc, company);
  }
  if (itemType === 'goods-receipt') {
    return MOCK_GRN_DATA;
  }
  if (itemType === 'packing-slip') {
    return MOCK_PACKING_SLIP_DATA;
  }
  if (itemType === 'material-label') {
    return MOCK_MATERIAL_LABEL_DATA;
  }
  // Fallback (should never happen with proper types)
  return buildTemplateData(sourceDoc, company);
}

/**
 * Get mock data for a given item type (for preview/builder).
 */
export function getMockData(itemType: ItemType): AnyTemplateDataContext {
  switch (itemType) {
    case 'delivery-note':
      return MOCK_PREVIEW_DATA;
    case 'goods-receipt':
      return MOCK_GRN_DATA;
    case 'packing-slip':
      return MOCK_PACKING_SLIP_DATA;
    case 'material-label':
      return MOCK_MATERIAL_LABEL_DATA;
    default:
      return MOCK_PREVIEW_DATA;
  }
}
