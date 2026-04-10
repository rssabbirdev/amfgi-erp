import { formatDate, formatCurrency } from './formatters';
import type { FieldElement, ItemType } from '@/lib/types/printTemplate';

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
    /--- DELIVERY NOTE ITEMS \(For Printing\) ---\n([\s\S]*?)(?:---|$)/
  );
  if (!itemsMatch) return [];

  const itemsText = itemsMatch[1];
  const items: Array<{ name: string; description: string; qty: string; unit: string }> = [];

  const lines = itemsText.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    // Format: • {name} - {description} | {qty} {unit}
    const bulletMatch = line.match(
      /^•\s*([^-]+)\s*-\s*([^|]+)\s*\|\s*([^\s]+)\s*(.+?)$/
    );
    if (bulletMatch) {
      items.push({
        name: bulletMatch[1].trim(),
        description: bulletMatch[2].trim(),
        qty: bulletMatch[3].trim(),
        unit: bulletMatch[4].trim(),
      });
    }
  }

  return items;
}

export function buildTemplateData(
  transaction: any, // Transaction from API
  company: any      // Company from API
): TemplateDataContext {
  const customItems = parseCustomItems(transaction.notes);

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
  let current: any = data;

  for (const part of parts) {
    if (current === null || current === undefined) return '';
    current = current[part];
  }

  if (current === null || current === undefined) return '';
  return String(current);
}

export function formatValue(
  value: string | number,
  format?: FieldElement['format']
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
    name: 'AMFGI Company LLC',
    address: 'P.O. Box 12345, Dubai, UAE',
    phone: '+971 4 123 4567',
    email: 'info@amfgi.ae',
    letterheadUrl: '',
    slug: 'amfgi',
    description: 'Fiberglass & Steel Workshop',
  },
  dn: {
    number: '0042',
    date: new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }),
    notes: 'Delivery for Phase 1 project. Items packed and ready.',
    totalCost: 5250,
    quantity: 3,
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
  }
}
