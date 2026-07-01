import { formatDate, formatCurrency } from './formatters';
import type { ItemType } from '@/lib/types/documentTemplate';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';
import { decimalToNumber } from './decimal';
import { resolveDeliveryContactPerson, resolveDeliveryNoteNumber } from '@/lib/deliveryNoteNumber';
import {
  customItemsFromJson,
  mapCustomItemsForTemplate,
  parseDeliveryNoteCustomItemsFromNotes,
} from '@/lib/utils/deliveryNoteCustomItems';
import { parseSupplierContactsJson } from '@/lib/utils/supplierContactOptions';

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
    deliveryType?: string;
    transitStatus?: string;
    /** Selected delivery contact for this note (job or supplier contact name) */
    contactPerson?: string;
  };
  supplier?: {
    name: string;
    /** Primary company contact on the supplier master record */
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    /** Supplier tax registration (TRN) number */
    trnNumber?: string;
    /** Contact selected on this subcontract delivery note */
    deliveryContactPerson?: string;
    deliveryContactPhone?: string;
    deliveryContactEmail?: string;
  } | null;
  sourceWarehouse?: { name: string } | null;
  targetWarehouse?: { name: string } | null;
  materialLines?: Array<{
    materialName: string;
    materialUnit: string;
    issuedQty: string;
    receivedQty: string;
    outstandingQty: string;
    sourceWarehouseName?: string;
    targetWarehouseName?: string;
  }>;
  referenceJob?: TemplateDataContext['job'];
  material: {
    name: string;
    unit: string;
    unitCost: number;
  } | null;
  job: {
    jobNumber: string;
    description: string;
    workProcessDetails?: string;
    site?: string;
    lpoNumber?: string;
    quotationNumber?: string;
    projectName?: string;
    projectDetails?: string;
    jobWorkValue?: number;
    externalJobId?: string;
    parentJobNumber?: string;
    address?: string;
    locationName?: string;
    locationLat?: number;
    locationLng?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    quotationDate?: string;
    lpoDate?: string;
    lpoValue?: number;
    /** Primary job/site contact (same idea as customer.contactPerson) */
    contactPerson?: string;
    /** JSON array/object as string (for bindings); use text format or custom layout for pretty display */
    contactsJson?: string;
    contactPhone?: string;
    contactEmail?: string;
    contactDesignation?: string;
    contactLabel?: string;
    salesPerson?: string;
    source?: string;
    externalUpdatedAt?: string;
  } | null;
  customer: {
    name: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    address?: string;
    /** Customer tax registration (TRN) number */
    trnNumber?: string;
  } | null;
  customItems: Array<{
    lineNo: string;
    slno: string;
    name: string;
    description: string;
    qty: string;
    unit: string;
  }>;
  items: Array<{
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
  items: TemplateDataContext['items'];
  today: string;
}

export interface PackingSlipContext {
  company: TemplateDataContext['company'];
  job: TemplateDataContext['job'];
  customer: TemplateDataContext['customer'];
  customItems: TemplateDataContext['customItems'];
  items: TemplateDataContext['items'];
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

export interface WorkScheduleContext {
  company: TemplateDataContext['company'];
  job: {
    jobNumber: string;
    customerName: string;
    projectDetails: string;
    workProcessDetails: string;
    locationLabel: string;
  };
  schedule: {
    title: string;
    workDate: string;
    workDateLabel: string;
    status: string;
    groupCount: number;
    assignedWorkerCount: number;
    groupsWithTiming: number;
    driverCount: number;
    driverTripSummary: string;
    notes: string;
    remarksSummary: string;
    multiAssignedWorkerSummary: string;
  };
  scheduleGroups: Array<{
    label: string;
    locationLabel: string;
    siteName: string;
    locationDisplay: string;
    locationBadgeVariant: 'factory' | 'site' | 'other';
    jobNumber: string;
    customerName: string;
    projectDetails: string;
    projectType: string;
    projectQtyArea: string;
    workProcessDetails: string;
    teamLeaderName: string;
    driverNames: string;
    targetQty: string;
    workerNames: string;
    workerDisplay: string;
    workerRows: string[];
    workerStructuredRows: string[];
    workerBlocks: Array<{
      kind: 'subteam' | 'leader' | 'worker' | 'spacer';
      text: string;
    }>;
    workerCount: number;
    dutyStart: string;
    dutyEnd: string;
    breakStart: string;
    breakEnd: string;
    dutyRange: string;
    breakRange: string;
    remarks: string;
  }>;
  driverTrips: Array<{
    driverName: string;
    tripOrder: string;
  }>;
  today: string;
}

/** Logged-in user fields for print templates (profile photo + signature from /profile). */
export type UserPrintSlice = {
  user: {
    name: string;
    image: string;
    signatureUrl: string;
  };
};

export type AnyTemplateDataContext = (
  | TemplateDataContext
  | GoodsReceiptContext
  | PackingSlipContext
  | MaterialLabelContext
  | WorkScheduleContext
) &
  Partial<UserPrintSlice>;

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
  { path: 'job.workProcessDetails', label: 'Work Process Details' },
  { path: 'job.site', label: 'Site' },
  { path: 'job.lpoNumber', label: 'LPO Number' },
  { path: 'job.quotationNumber', label: 'Quotation Number' },
  { path: 'job.lpoValue', label: 'LPO Value' },
  { path: 'job.salesPerson', label: 'Sales Person' },
  { path: 'material.name', label: 'Material Name' },
  { path: 'material.unit', label: 'Material Unit' },
  { path: 'material.unitCost', label: 'Material Unit Cost' },
  { path: 'today', label: "Today's Date" },
];

function toIsoDateString(d: unknown): string | undefined {
  if (d == null) return undefined;
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'string' && d.trim()) return d;
  return undefined;
}

function contactsJsonToString(contacts: unknown): string | undefined {
  if (contacts == null || contacts === '') return undefined;
  if (typeof contacts === 'string') return contacts;
  try {
    return JSON.stringify(contacts);
  } catch {
    return undefined;
  }
}

type JobContactInfo = {
  name: string;
  number?: string;
  email?: string;
  designation?: string;
  label?: string;
};

function parseJobContacts(contacts: unknown): JobContactInfo[] {
  if (!Array.isArray(contacts)) return [];
  const rows: JobContactInfo[] = [];
  for (const row of contacts) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    rows.push({
      name,
      number: typeof r.number === 'string' ? r.number.trim() : undefined,
      email: typeof r.email === 'string' ? r.email.trim() : undefined,
      designation: typeof r.designation === 'string' ? r.designation.trim() : undefined,
      label: typeof r.label === 'string' ? r.label.trim() : undefined,
    });
  }
  return rows;
}

function formatScheduleTimeForPrint(raw: string | null | undefined): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return value;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function enrichWithPrimaryContact(
  base: NonNullable<TemplateDataContext['job']>,
  contacts: unknown,
  preferredName?: string
): NonNullable<TemplateDataContext['job']> {
  const rows = parseJobContacts(contacts);
  const selectedName = preferredName?.trim() || base.contactPerson?.trim();
  const selected = selectedName
    ? rows.find((r) => r.name.toLowerCase() === selectedName.toLowerCase())
    : rows[0];
  return {
    ...base,
    contactPerson: selectedName || selected?.name || base.contactPerson,
    contactPhone: selected?.number,
    contactEmail: selected?.email,
    contactDesignation: selected?.designation,
    contactLabel: selected?.label,
  };
}

function finiteNumber(v: unknown): number | undefined {
  return decimalToNumber(v);
}

/** Maps API/Prisma customer (partial) to print template `customer` slice */
export function customerTemplateSlice(
  customer: Record<string, unknown> | null | undefined
): TemplateDataContext['customer'] {
  if (!customer) return null;
  return {
    name: String(customer.name ?? ''),
    contactPerson:
      customer.contactPerson != null ? String(customer.contactPerson) : undefined,
    phone: customer.phone != null ? String(customer.phone) : undefined,
    email: customer.email != null ? String(customer.email) : undefined,
    address: customer.address != null ? String(customer.address) : undefined,
    trnNumber: customer.trnNumber != null ? String(customer.trnNumber) : undefined,
  };
}

/** Maps API/Prisma job (partial) to print template `job` slice */
export function jobTemplateSlice(job: Record<string, unknown> | null | undefined): TemplateDataContext['job'] {
  if (!job) return null;
  const parentJob = job.parentJob as { jobNumber?: string } | null | undefined;
  return {
    jobNumber: String(job.jobNumber ?? ''),
    description: String(job.description ?? ''),
    site: job.site != null ? String(job.site) : undefined,
    lpoNumber: job.lpoNumber != null ? String(job.lpoNumber) : undefined,
    quotationNumber: job.quotationNumber != null ? String(job.quotationNumber) : undefined,
    projectName: job.projectName != null ? String(job.projectName) : undefined,
    projectDetails: job.projectDetails != null ? String(job.projectDetails) : undefined,
    workProcessDetails: job.description != null ? String(job.description) : undefined,
    jobWorkValue: finiteNumber(job.jobWorkValue),
    externalJobId: job.externalJobId != null ? String(job.externalJobId) : undefined,
    parentJobNumber: parentJob?.jobNumber != null ? String(parentJob.jobNumber) : undefined,
    address: job.address != null ? String(job.address) : undefined,
    locationName: job.locationName != null ? String(job.locationName) : undefined,
    locationLat: finiteNumber(job.locationLat),
    locationLng: finiteNumber(job.locationLng),
    status: job.status != null ? String(job.status) : undefined,
    startDate: toIsoDateString(job.startDate),
    endDate: toIsoDateString(job.endDate),
    quotationDate: toIsoDateString(job.quotationDate),
    lpoDate: toIsoDateString(job.lpoDate),
    lpoValue: finiteNumber(job.lpoValue),
    contactPerson: job.contactPerson != null ? String(job.contactPerson) : undefined,
    contactsJson: contactsJsonToString(job.contactsJson),
    salesPerson: job.salesPerson != null ? String(job.salesPerson) : undefined,
    source: job.source != null ? String(job.source) : undefined,
    externalUpdatedAt: toIsoDateString(job.externalUpdatedAt),
  };
}

function parseDeliveryNoteNumber(notes?: string, deliveryNote?: { number: number } | null): string {
  const n = resolveDeliveryNoteNumber(notes, deliveryNote ?? null);
  return n > 0 ? String(n) : 'N/A';
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
  return [...parseDeliveryNoteCustomItemsFromNotes(notes), ...stockOutMaterialTableRows(stockOutTransactions)];
}

function resolveCustomItemsForPrint(
  notes?: string | null,
  customItemsJson?: unknown
): TemplateDataContext['customItems'] {
  const fromJson = customItemsFromJson(customItemsJson);
  const items = fromJson.length > 0 ? fromJson : parseDeliveryNoteCustomItemsFromNotes(notes);
  return mapCustomItemsForTemplate(items);
}

/**
 * Build preview/print context from a `DeliveryNote` row (incl. print-only notes with no stock lines).
 */
function subcontractMaterialLinesForTemplate(
  materialLines: unknown
): NonNullable<TemplateDataContext['materialLines']> {
  if (!Array.isArray(materialLines)) return [];
  return materialLines
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const materialName = typeof r.materialName === 'string' ? r.materialName : '';
      if (!materialName) return null;
      const issued = Number(r.issuedQty ?? 0);
      const received = Number(r.receivedQty ?? 0);
      const outstanding = Number(r.outstandingQty ?? Math.max(0, issued - received));
      return {
        materialName,
        materialUnit: typeof r.materialUnit === 'string' ? r.materialUnit : '',
        issuedQty: String(issued),
        receivedQty: String(received),
        outstandingQty: String(outstanding),
        ...(typeof r.sourceWarehouseName === 'string' && r.sourceWarehouseName
          ? { sourceWarehouseName: r.sourceWarehouseName }
          : {}),
        ...(typeof r.targetWarehouseName === 'string' && r.targetWarehouseName
          ? { targetWarehouseName: r.targetWarehouseName }
          : {}),
      };
    })
    .filter(Boolean) as NonNullable<TemplateDataContext['materialLines']>;
}

function supplierTemplateSlice(supplier: unknown): TemplateDataContext['supplier'] {
  if (!supplier || typeof supplier !== 'object') return null;
  const s = supplier as Record<string, unknown>;
  const name = typeof s.name === 'string' ? s.name.trim() : '';
  if (!name) return null;
  return {
    name,
    contactPerson: typeof s.contactPerson === 'string' ? s.contactPerson : undefined,
    phone: typeof s.phone === 'string' ? s.phone : undefined,
    email: typeof s.email === 'string' ? s.email : undefined,
    address: typeof s.address === 'string' ? s.address : undefined,
    trnNumber: s.trnNumber != null ? String(s.trnNumber) : undefined,
  };
}

function enrichSupplierWithDeliveryContact(
  base: NonNullable<TemplateDataContext['supplier']>,
  contacts: unknown,
  preferredName?: string
): NonNullable<TemplateDataContext['supplier']> {
  const rows = parseSupplierContactsJson(contacts);
  const selectedName = preferredName?.trim();
  const selected = selectedName
    ? rows.find((row) => row.name.toLowerCase() === selectedName.toLowerCase())
    : rows[0];
  return {
    ...base,
    deliveryContactPerson: selectedName || selected?.name,
    deliveryContactPhone: selected?.phone,
    deliveryContactEmail: selected?.email,
  };
}

export function buildDeliveryNoteTemplateDataFromEntity(
  dn: {
    id: string;
    number: number;
    date: string | Date;
    documentNotes?: string | null;
    contactPerson?: string | null;
    customItemsJson?: unknown;
    deliveryType?: string;
    transitStatus?: string | null;
    supplier?: Record<string, unknown> | null;
    sourceWarehouse?: { name?: string } | null;
    targetWarehouse?: { name?: string } | null;
    referenceJob?: Record<string, unknown> | null;
    materialLines?: unknown;
    job?: Record<string, unknown> | null;
  },
  company: any
): TemplateDataContext {
  const customItems = resolveCustomItemsForPrint(dn.documentNotes, dn.customItemsJson);
  const materialLines = subcontractMaterialLinesForTemplate(dn.materialLines);
  const issuedQtyTotal = materialLines.reduce(
    (sum, row) => sum + (Number.parseFloat(row.issuedQty) || 0),
    0
  );
  const totalQty =
    dn.deliveryType === 'SUBCONTRACT' && issuedQtyTotal > 0
      ? issuedQtyTotal
      : customItems.reduce((sum, row) => sum + (Number.parseFloat(row.qty) || 0), 0);
  const selectedContactPerson =
    (typeof dn.contactPerson === 'string' ? dn.contactPerson.trim() : '') ||
    (typeof dn.job?.contactPerson === 'string' ? dn.job.contactPerson.trim() : '');
  const jobSource =
    dn.deliveryType === 'SUBCONTRACT' && dn.referenceJob ? dn.referenceJob : dn.job;
  const jobSlice = jobTemplateSlice(jobSource);
  const enrichedJobSlice = jobSlice
    ? enrichWithPrimaryContact(
        jobSlice,
        (jobSource as { contactsJson?: unknown } | null | undefined)?.contactsJson,
        selectedContactPerson
      )
    : null;
  const customerSlice = customerTemplateSlice(
    jobSource?.customer as Record<string, unknown> | null | undefined
  );
  const referenceJobSlice =
    dn.deliveryType === 'SUBCONTRACT' && dn.referenceJob
      ? jobTemplateSlice(dn.referenceJob)
      : null;
  const supplierBase = supplierTemplateSlice(dn.supplier);
  const supplierSlice =
    supplierBase && dn.deliveryType === 'SUBCONTRACT'
      ? enrichSupplierWithDeliveryContact(
          supplierBase,
          (dn.supplier as { contactsJson?: unknown } | null | undefined)?.contactsJson,
          selectedContactPerson
        )
      : supplierBase;
  const subcontractItems =
    dn.deliveryType === 'SUBCONTRACT'
      ? materialLines.map((row) => ({
          name: row.materialName,
          description: '',
          qty: row.issuedQty,
          unit: row.materialUnit,
        }))
      : [];

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
      number: String(dn.number),
      date: formatDate(typeof dn.date === 'string' ? dn.date : dn.date.toISOString()),
      notes: (dn.documentNotes ?? '').trim(),
      totalCost: 0,
      quantity: totalQty,
      signedCopyUrl: '',
      deliveryType: dn.deliveryType ?? 'DISPATCH',
      transitStatus: dn.transitStatus ?? undefined,
      contactPerson: selectedContactPerson || undefined,
    },
    supplier: supplierSlice,
    sourceWarehouse: dn.sourceWarehouse?.name ? { name: dn.sourceWarehouse.name } : null,
    targetWarehouse: dn.targetWarehouse?.name ? { name: dn.targetWarehouse.name } : null,
    materialLines,
    material: null,
    job: enrichedJobSlice,
    referenceJob: referenceJobSlice,
    customer: customerSlice,
    customItems,
    items: subcontractItems,
    today: formatDate(new Date().toISOString()),
  };
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
  const customItems = resolveCustomItemsForPrint(first.notes, first.deliveryNote?.customItemsJson);
  const items = stockOutMaterialTableRows(txs);
  const totalCost = txs.reduce((s, t) => s + (Number(t.totalCost) || 0), 0);
  const totalQty = txs.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
  const withMat = txs.find((t) => t.material);
  const selectedContactPerson = resolveDeliveryContactPerson(first.notes, first.deliveryNote);
  const jobSlice = jobTemplateSlice(first.job as Record<string, unknown> | null | undefined);
  const enrichedJobSlice = jobSlice
    ? enrichWithPrimaryContact(jobSlice, first.job?.contactsJson, selectedContactPerson)
    : null;

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
      number: parseDeliveryNoteNumber(first.notes, first.deliveryNote),
      date: formatDate(first.date),
      notes: (first.notes ?? '').split('--- DELIVERY NOTE')[0].trim(),
      totalCost,
      quantity: totalQty,
      signedCopyUrl: first.signedCopyUrl ?? '',
      deliveryType: first.deliveryNote?.deliveryType ?? 'DISPATCH',
      transitStatus: first.deliveryNote?.transitStatus ?? undefined,
    },
    supplier: supplierTemplateSlice(first.deliveryNote?.supplier),
    sourceWarehouse: first.deliveryNote?.sourceWarehouse?.name
      ? { name: first.deliveryNote.sourceWarehouse.name }
      : null,
    targetWarehouse: first.deliveryNote?.targetWarehouse?.name
      ? { name: first.deliveryNote.targetWarehouse.name }
      : null,
    materialLines: subcontractMaterialLinesForTemplate(first.deliveryNote?.materialLines),
    material: withMat?.material
      ? {
          name: withMat.material.name ?? '',
          unit: withMat.material.unit ?? '',
          unitCost: withMat.material.unitCost ?? 0,
        }
      : null,
    job: enrichedJobSlice,
    customer: customerTemplateSlice(
      first.job?.customer as Record<string, unknown> | null | undefined
    ),
    customItems,
    items,
    today: formatDate(new Date().toISOString()),
  };
}

export function buildTemplateData(
  transaction: any, // Transaction from API
  company: any      // Company from API
): TemplateDataContext {
  const stockOutSlice =
    transaction?.type === 'STOCK_OUT' ? [transaction] : [];
  const customItems = resolveCustomItemsForPrint(
    transaction.notes,
    transaction.deliveryNote?.customItemsJson
  );
  const items = stockOutMaterialTableRows(stockOutSlice);
  const selectedContactPerson = resolveDeliveryContactPerson(
    transaction.notes,
    transaction.deliveryNote
  );
  const jobSlice = jobTemplateSlice(transaction.job as Record<string, unknown> | null | undefined);
  const enrichedJobSlice = jobSlice
    ? enrichWithPrimaryContact(jobSlice, transaction.job?.contactsJson, selectedContactPerson)
    : null;

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
      number: parseDeliveryNoteNumber(transaction.notes, transaction.deliveryNote),
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
    job: enrichedJobSlice,
    customer: customerTemplateSlice(
      transaction.job?.customer as Record<string, unknown> | null | undefined
    ),
    customItems,
    items,
    today: formatDate(new Date().toISOString()),
  };
}

export function resolveField(
  field: string,
  data: AnyTemplateDataContext
): string {
  if (field === 'page.number') return '__PAGE_NUMBER__';
  if (field === 'page.total') return '__PAGE_TOTAL__';
  if (field === 'customer.trxNumber' || field === 'customer.trxnumber') {
    return resolveField('customer.trnNumber', data);
  }
  if (field === 'supplier.trxNumber' || field === 'supplier.trxnumber') {
    return resolveField('supplier.trnNumber', data);
  }
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
    workProcessDetails: 'Floors 3–5 MEP supports',
    jobWorkValue: 125000,
    externalJobId: 'PM-JOB-123',
    parentJobNumber: 'JOB-2024-000',
    address: 'Plot 12, Jebel Ali Industrial 1',
    locationName: 'Site gate A',
    locationLat: 25.0,
    locationLng: 55.14,
    status: 'ACTIVE',
    startDate: new Date('2026-01-10T00:00:00.000Z').toISOString(),
    endDate: new Date('2026-12-31T00:00:00.000Z').toISOString(),
    quotationDate: new Date('2026-01-04T00:00:00.000Z').toISOString(),
    lpoDate: new Date('2026-01-06T00:00:00.000Z').toISOString(),
    lpoValue: 125000,
    contactPerson: 'John Doe',
    contactsJson: JSON.stringify([
      { label: 'site', name: 'John Doe', number: '+971500000000', email: 'john@example.com' },
    ]),
    salesPerson: 'Ali Khan',
    source: 'EXTERNAL_API',
    externalUpdatedAt: new Date('2026-04-13T07:50:00.000Z').toISOString(),
  },
  customer: {
    name: 'Acme Contracting LLC',
    contactPerson: 'Sara Al-Mazrouei',
    phone: '+971 50 111 2233',
    email: 'procurement@acme.ae',
    address: 'Business Bay, Dubai',
    trnNumber: '100123456700003',
  },
  customItems: [
    {
      lineNo: '1',
      slno: '1',
      name: 'Steel Pipe 2"',
      description: 'Galvanized steel pipe',
      qty: '2',
      unit: 'PCS',
    },
    {
      lineNo: '2',
      slno: '2',
      name: 'Elbow Fitting',
      description: '90° elbow 2"',
      qty: '1',
      unit: 'PCS',
    },
  ],
  items: [
    {
      name: 'Steel Pipe 2"',
      description: '',
      qty: '3',
      unit: 'PCS',
    },
  ],
  today: new Date().toLocaleDateString('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }),
};

export const MOCK_SUBCONTRACT_DN_DATA: TemplateDataContext = {
  ...MOCK_PREVIEW_DATA,
  dn: {
    ...MOCK_PREVIEW_DATA.dn,
    number: '42',
    notes: 'Send materials to subcontractor for galvanizing.',
    quantity: 150,
    deliveryType: 'SUBCONTRACT',
    transitStatus: 'ON_TRANSIT',
    contactPerson: 'Ahmed Site',
  },
  supplier: {
    name: 'Galv Co LLC',
    contactPerson: 'Sam Supplier',
    phone: '+971 4 555 0101',
    email: 'ops@galvco.ae',
    address: 'Jebel Ali Free Zone',
    trnNumber: '100987654300001',
    deliveryContactPerson: 'Ahmed Site',
    deliveryContactPhone: '+971 50 222 3344',
    deliveryContactEmail: 'ahmed.site@galvco.ae',
  },
  sourceWarehouse: { name: 'Main Store' },
  targetWarehouse: { name: 'At Subcontractor' },
  material: null,
  referenceJob: {
    jobNumber: 'JOB-2024-001',
    description: 'Infrastructure Project - Phase 1',
    site: 'Dubai Industrial Zone',
    projectName: 'Tower B Fit-out',
    contactPerson: 'John Doe',
  },
  materialLines: [
    {
      materialName: 'Steel Angle 50x50',
      materialUnit: 'kg',
      issuedQty: '100',
      receivedQty: '0',
      outstandingQty: '100',
      sourceWarehouseName: 'Main Store',
      targetWarehouseName: 'At Subcontractor',
    },
    {
      materialName: 'Flat Bar 25mm',
      materialUnit: 'kg',
      issuedQty: '50',
      receivedQty: '25',
      outstandingQty: '25',
      sourceWarehouseName: 'Main Store',
      targetWarehouseName: 'At Subcontractor',
    },
  ],
  items: [
    { name: 'Steel Angle 50x50', description: '', qty: '100', unit: 'kg' },
    { name: 'Flat Bar 25mm', description: '', qty: '50', unit: 'kg' },
  ],
  customItems: [],
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
      lineNo: '1',
      slno: '1',
      name: 'Fiberglass Sheet 3mm',
      description: 'Clear fiberglass sheet',
      qty: '70',
      unit: 'SQM',
    },
  ],
  items: [],
  today: MOCK_PREVIEW_DATA.today,
};

export const MOCK_PACKING_SLIP_DATA: PackingSlipContext = {
  company: MOCK_PREVIEW_DATA.company,
  job: MOCK_PREVIEW_DATA.job,
  customer: MOCK_PREVIEW_DATA.customer,
  customItems: MOCK_PREVIEW_DATA.customItems,
  items: MOCK_PREVIEW_DATA.items,
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

export const MOCK_WORK_SCHEDULE_DATA: WorkScheduleContext = {
  company: MOCK_PREVIEW_DATA.company,
  job: {
    jobNumber: 'JOB-2026-018',
    customerName: 'Acme Contracting LLC',
    projectDetails: 'Tower facade repair',
    workProcessDetails: 'Tower facade repair',
    locationLabel: 'Site job',
  },
  schedule: {
    title: 'Daily Work Schedule',
    workDate: '2026-04-23',
    workDateLabel: '23 Apr 2026',
    status: 'DRAFT',
    groupCount: 3,
    assignedWorkerCount: 14,
    groupsWithTiming: 2,
    driverCount: 3,
    driverTripSummary: '3 active drivers listed below',
    notes: 'General notes for the day and crew coordination.',
    remarksSummary: 'Two site teams and one factory support group.',
    multiAssignedWorkerSummary: 'Sabbir - [T1,T3], Rahat - [T2,T3]',
  },
  scheduleGroups: [
    {
      label: 'Team#1',
      locationLabel: 'Site job',
      siteName: 'Dubai Marina Tower',
      locationDisplay: 'Dubai Marina Tower',
      locationBadgeVariant: 'site',
      jobNumber: 'JOB-2026-018',
      customerName: 'Acme Contracting LLC',
      projectDetails: 'Tower facade repair',
      projectType: 'Fit-out',
      projectQtyArea: '1,200 sqm',
        workProcessDetails: 'Tower facade repair',
        teamLeaderName: 'Mohammad Ali',
        driverNames: 'Yousuf / Kareem',
        targetQty: '120 pcs',
        workerNames: 'Imran, Faiz, Salim, Sabbir - [T3]',
        workerDisplay: '1. Imran\n2. Faiz\n3. Salim\n4. Sabbir - [T3]',
      workerRows: ['1. Imran', '2. Faiz', '3. Salim', '4. Sabbir - [T3]'],
      workerStructuredRows: ['1. Imran', '2. Faiz', '3. Salim', '4. Sabbir - [T3]'],
      workerBlocks: [
        { kind: 'leader', text: '1. Imran' },
        { kind: 'worker', text: '2. Faiz' },
        { kind: 'worker', text: '3. Salim' },
        { kind: 'worker', text: '4. Sabbir - [T3]' },
      ],
      workerCount: 4,
      dutyStart: formatScheduleTimeForPrint('05:00'),
      dutyEnd: formatScheduleTimeForPrint('18:00'),
      breakStart: formatScheduleTimeForPrint('13:00'),
      breakEnd: formatScheduleTimeForPrint('14:00'),
      dutyRange: `${formatScheduleTimeForPrint('05:00')} - ${formatScheduleTimeForPrint('18:00')}`,
      breakRange: `${formatScheduleTimeForPrint('13:00')} - ${formatScheduleTimeForPrint('14:00')}`,
      remarks: 'Start with south elevation.',
    },
    {
      label: 'Team#2',
      locationLabel: 'Site job',
      siteName: 'Jebel Ali Pipe Rack',
      locationDisplay: 'Jebel Ali Pipe Rack',
      locationBadgeVariant: 'site',
      jobNumber: 'JOB-2026-022',
      customerName: 'Gulf Projects',
      projectDetails: 'Pipe support installation',
      projectType: 'Installation',
      projectQtyArea: '3 areas / 42 brackets',
        workProcessDetails: 'Pipe support installation',
        teamLeaderName: 'Rizwan Khan',
        driverNames: 'Adnan',
        targetQty: '3 areas / 42 brackets',
        workerNames: 'Asif, Kabir, Rahat - [T3], Sameer, Bilal, Tariq',
      workerDisplay: 'Sub-team A\n1. Rahat - [T3]\n2. Asif\n3. Kabir\nSub-team B\n1. Saad\n2. Sameer\n3. Bilal\n4. Tariq',
      workerRows: ['1. Rahat - [T3]', '2. Asif', '3. Kabir', '1. Saad', '2. Sameer', '3. Bilal', '4. Tariq'],
      workerStructuredRows: [
        'Sub-team A',
        '1. Rahat - [T3]',
        '2. Asif',
        '3. Kabir',
        '',
        'Sub-team B',
        '1. Saad',
        '2. Sameer',
        '3. Bilal',
        '4. Tariq',
      ],
      workerBlocks: [
        { kind: 'subteam', text: 'Sub-team A' },
        { kind: 'leader', text: '1. Rahat - [T3]' },
        { kind: 'worker', text: '2. Asif' },
        { kind: 'worker', text: '3. Kabir' },
        { kind: 'spacer', text: '' },
        { kind: 'subteam', text: 'Sub-team B' },
        { kind: 'leader', text: '1. Saad' },
        { kind: 'worker', text: '2. Sameer' },
        { kind: 'worker', text: '3. Bilal' },
        { kind: 'worker', text: '4. Tariq' },
      ],
      workerCount: 5,
      dutyStart: formatScheduleTimeForPrint('06:00'),
      dutyEnd: formatScheduleTimeForPrint('17:00'),
      breakStart: formatScheduleTimeForPrint('13:00'),
      breakEnd: formatScheduleTimeForPrint('14:00'),
      dutyRange: `${formatScheduleTimeForPrint('06:00')} - ${formatScheduleTimeForPrint('17:00')}`,
      breakRange: `${formatScheduleTimeForPrint('13:00')} - ${formatScheduleTimeForPrint('14:00')}`,
      remarks: 'Coordinate with site store before unloading.',
    },
    {
      label: 'Team#3',
      locationLabel: 'Factory',
      siteName: '',
      locationDisplay: 'Factory',
      locationBadgeVariant: 'factory',
      jobNumber: 'FGI-YARD',
      customerName: '',
      projectDetails: 'Factory prep and loading support',
      projectType: 'Factory support',
      projectQtyArea: '250 pcs loading',
        workProcessDetails: 'Factory prep and loading support',
        teamLeaderName: '',
        driverNames: '',
        targetQty: '250 pcs loading',
        workerNames: 'Zubair, Nabeel, Arif, Sajid, Imtiyaz',
      workerDisplay: '1. Zubair\n2. Nabeel\n3. Arif\n4. Sajid\n5. Imtiyaz',
      workerRows: ['1. Zubair', '2. Nabeel', '3. Arif', '4. Sajid', '5. Imtiyaz'],
      workerStructuredRows: [
        '1. Zubair',
        '2. Nabeel',
        '3. Arif',
        '4. Sajid',
        '5. Imtiyaz',
      ],
      workerBlocks: [
        { kind: 'leader', text: '1. Zubair' },
        { kind: 'worker', text: '2. Nabeel' },
        { kind: 'worker', text: '3. Arif' },
        { kind: 'worker', text: '4. Sajid' },
        { kind: 'worker', text: '5. Imtiyaz' },
      ],
      workerCount: 5,
      dutyStart: '',
      dutyEnd: '',
      breakStart: '',
      breakEnd: '',
      dutyRange: '',
      breakRange: '',
      remarks: 'Support dispatch and stock movement.',
    },
  ],
  driverTrips: [
    { driverName: 'Yousuf', tripOrder: 'Trip 1 - Tower facade crew' },
    { driverName: 'Kareem', tripOrder: 'Trip 2 - Extra material support' },
    { driverName: 'Adnan', tripOrder: 'Trip 1 - Pipe support team' },
  ],
  today: MOCK_PREVIEW_DATA.today,
};

/**
 * Builds appropriate data context based on item type.
 * For delivery-note: uses existing buildTemplateData.
 * For other types: return mock data (future: integrate with actual sources).
 */
function userSliceFromSession(user?: {
  name?: string | null;
  image?: string | null;
  signatureUrl?: string | null;
}): UserPrintSlice {
  const image =
    (user?.image?.trim() ? convertGoogleDriveUrl(user.image.trim()) : null) ??
    '';
  const signatureUrl =
    (user?.signatureUrl?.trim() ? convertGoogleDriveUrl(user.signatureUrl.trim()) : null) ??
    '';
  return {
    user: {
      name: user?.name?.trim() ?? '',
      image,
      signatureUrl,
    },
  };
}

/** Delivery note row from `/api/delivery-notes/:id` (not a stock transaction). */
export function isDeliveryNoteRecord(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Record<string, unknown>;
  return typeof d.number === 'number' && d.type === undefined && d.documentNotes !== undefined;
}

function buildDeliveryNoteFamilyContext(sourceDoc: any, company: any): TemplateDataContext {
  if (isDeliveryNoteRecord(sourceDoc)) {
    return buildDeliveryNoteTemplateDataFromEntity(sourceDoc, company);
  }
  if (sourceDoc?.type === 'STOCK_OUT') {
    return buildDeliveryNoteTemplateData([sourceDoc], company);
  }
  if (sourceDoc?.deliveryType || sourceDoc?.materialLines) {
    return buildDeliveryNoteTemplateDataFromEntity(sourceDoc, company);
  }
  return buildTemplateData(sourceDoc, company);
}

export function buildDataContext(
  itemType: ItemType,
  sourceDoc: any,
  company: any,
  user?: {
    name?: string | null;
    image?: string | null;
    signatureUrl?: string | null;
  },
): AnyTemplateDataContext {
  let ctx: AnyTemplateDataContext;
  if (itemType === 'delivery-note' || itemType === 'subcontract-delivery-note') {
    ctx = buildDeliveryNoteFamilyContext(sourceDoc, company) as AnyTemplateDataContext;
  } else if (itemType === 'goods-receipt') {
    ctx = MOCK_GRN_DATA as AnyTemplateDataContext;
  } else if (itemType === 'packing-slip') {
    ctx = MOCK_PACKING_SLIP_DATA as AnyTemplateDataContext;
  } else if (itemType === 'material-label') {
    ctx = MOCK_MATERIAL_LABEL_DATA as AnyTemplateDataContext;
  } else if (itemType === 'work-schedule') {
    ctx = ((sourceDoc as WorkScheduleContext | null) ?? MOCK_WORK_SCHEDULE_DATA) as AnyTemplateDataContext;
  } else {
    ctx = buildTemplateData(sourceDoc, company) as AnyTemplateDataContext;
  }
  return { ...ctx, ...userSliceFromSession(user) };
}

/**
 * Get mock data for a given item type (for preview/builder).
 */
const MOCK_USER_PRINT: UserPrintSlice = {
  user: {
    name: 'Demo user',
    image: '',
    signatureUrl: '',
  },
};

export function getMockData(itemType: ItemType): AnyTemplateDataContext {
  switch (itemType) {
    case 'delivery-note':
      return { ...MOCK_PREVIEW_DATA, ...MOCK_USER_PRINT };
    case 'subcontract-delivery-note':
      return { ...MOCK_SUBCONTRACT_DN_DATA, ...MOCK_USER_PRINT };
    case 'goods-receipt':
      return { ...MOCK_GRN_DATA, ...MOCK_USER_PRINT };
    case 'packing-slip':
      return { ...MOCK_PACKING_SLIP_DATA, ...MOCK_USER_PRINT };
    case 'material-label':
      return { ...MOCK_MATERIAL_LABEL_DATA, ...MOCK_USER_PRINT };
    case 'work-schedule':
      return { ...MOCK_WORK_SCHEDULE_DATA, ...MOCK_USER_PRINT };
    default:
      return { ...MOCK_PREVIEW_DATA, ...MOCK_USER_PRINT };
  }
}
