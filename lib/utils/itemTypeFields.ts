import type { ItemType, KnownItemType } from '@/lib/types/documentTemplate';

export interface FieldDef {
  path: string;
  label: string;
  category: string;
}

/** Optional runtime registration (e.g. from a plugin or future admin UI) */
const customRegistry: Record<string, FieldDef[]> = {};

export function registerPrintItemTypeFields(itemType: string, fields: FieldDef[]) {
  customRegistry[itemType] = fields;
}

function mergeFieldLists(...lists: FieldDef[][]): FieldDef[] {
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const list of lists) {
    for (const f of list) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      out.push(f);
    }
  }
  return out.sort(
    (a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label)
  );
}

export const ITEM_TYPE_LABELS: Record<KnownItemType, string> = {
  'delivery-note': 'Delivery Note',
  'goods-receipt': 'Goods Receipt',
  'packing-slip': 'Packing Slip',
  'material-label': 'Material Label',
};

export function getItemTypeLabel(itemType: string): string {
  if (itemType in ITEM_TYPE_LABELS) {
    return ITEM_TYPE_LABELS[itemType as KnownItemType];
  }
  return itemType
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const ITEM_TYPE_FIELDS: Record<KnownItemType, FieldDef[]> = {
  'delivery-note': [
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.slug', label: 'Company Slug', category: 'Company' },
    { path: 'company.description', label: 'Company Description', category: 'Company' },
    { path: 'company.letterheadUrl', label: 'Letterhead Image URL', category: 'Company' },
    { path: 'dn.number', label: 'DN Number', category: 'Document' },
    { path: 'dn.date', label: 'DN Date', category: 'Document' },
    { path: 'dn.notes', label: 'DN Notes', category: 'Document' },
    { path: 'dn.totalCost', label: 'Total Cost', category: 'Document' },
    { path: 'dn.quantity', label: 'Line Quantity', category: 'Document' },
    { path: 'dn.signedCopyUrl', label: 'Signed Copy URL', category: 'Document' },
    { path: 'job.jobNumber', label: 'Job Number', category: 'Job' },
    { path: 'job.description', label: 'Job Description', category: 'Job' },
    { path: 'job.site', label: 'Site', category: 'Job' },
    { path: 'job.lpoNumber', label: 'LPO Number', category: 'Job' },
    { path: 'job.quotationNumber', label: 'Quotation Number', category: 'Job' },
    { path: 'job.projectName', label: 'Project Name', category: 'Job' },
    { path: 'job.projectDetails', label: 'Project Details', category: 'Job' },
    { path: 'job.jobWorkValue', label: 'Job Work Value', category: 'Job' },
    { path: 'customer.name', label: 'Customer Name', category: 'Customer' },
    { path: 'customer.contactPerson', label: 'Customer Contact', category: 'Customer' },
    { path: 'customer.phone', label: 'Customer Phone', category: 'Customer' },
    { path: 'customer.email', label: 'Customer Email', category: 'Customer' },
    { path: 'customer.address', label: 'Customer Address', category: 'Customer' },
    { path: 'material.name', label: 'Material Name', category: 'Material' },
    { path: 'material.unit', label: 'Material Unit', category: 'Material' },
    { path: 'material.unitCost', label: 'Material Unit Cost', category: 'Material' },
    { path: 'today', label: "Today's Date", category: 'General' },
  ],

  'goods-receipt': [
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.letterheadUrl', label: 'Letterhead Image URL', category: 'Company' },
    { path: 'grn.number', label: 'GRN Number', category: 'Document' },
    { path: 'grn.date', label: 'GRN Date', category: 'Document' },
    { path: 'grn.totalCost', label: 'Total Cost', category: 'Document' },
    { path: 'grn.notes', label: 'Notes', category: 'Document' },
    { path: 'supplier.name', label: 'Supplier Name', category: 'Supplier' },
    { path: 'supplier.contactPerson', label: 'Contact Person', category: 'Supplier' },
    { path: 'supplier.phone', label: 'Supplier Phone', category: 'Supplier' },
    { path: 'material.name', label: 'Material Name', category: 'Material' },
    { path: 'material.unit', label: 'Material Unit', category: 'Material' },
    { path: 'today', label: "Today's Date", category: 'General' },
  ],

  'packing-slip': [
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.letterheadUrl', label: 'Letterhead Image URL', category: 'Company' },
    { path: 'job.jobNumber', label: 'Job Number', category: 'Job' },
    { path: 'job.description', label: 'Job Description', category: 'Job' },
    { path: 'job.site', label: 'Site', category: 'Job' },
    { path: 'job.lpoNumber', label: 'LPO Number', category: 'Job' },
    { path: 'job.quotationNumber', label: 'Quotation Number', category: 'Job' },
    { path: 'customer.name', label: 'Customer Name', category: 'Customer' },
    { path: 'customer.contactPerson', label: 'Customer Contact', category: 'Customer' },
    { path: 'customer.phone', label: 'Customer Phone', category: 'Customer' },
    { path: 'customer.email', label: 'Customer Email', category: 'Customer' },
    { path: 'customer.address', label: 'Customer Address', category: 'Customer' },
    { path: 'today', label: "Today's Date", category: 'General' },
  ],

  'material-label': [
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.letterheadUrl', label: 'Letterhead Image URL', category: 'Company' },
    { path: 'material.name', label: 'Material Name', category: 'Material' },
    { path: 'material.unit', label: 'Unit', category: 'Material' },
    { path: 'material.unitCost', label: 'Unit Cost', category: 'Material' },
    { path: 'material.stockType', label: 'Stock Type', category: 'Material' },
    { path: 'material.category', label: 'Category', category: 'Material' },
    { path: 'material.warehouse', label: 'Warehouse', category: 'Material' },
    { path: 'material.currentStock', label: 'Current Stock', category: 'Material' },
    { path: 'material.reorderLevel', label: 'Reorder Level', category: 'Material' },
    { path: 'material.description', label: 'Description', category: 'Material' },
    { path: 'material.externalItemName', label: 'External Item Name', category: 'Material' },
    { path: 'today', label: "Today's Date", category: 'General' },
  ],
};

/** Union of all built-in fields — used when `itemType` is not registered */
export const FALLBACK_PRINT_FIELDS = mergeFieldLists(...Object.values(ITEM_TYPE_FIELDS));

/**
 * Fields shown in the print builder for bindings (dropdowns + data explorer).
 * Unknown `itemType` strings use the merged catalog so new ERP kinds still get usable paths.
 */
export function getFieldsForItemType(itemType: string): FieldDef[] {
  if (itemType in ITEM_TYPE_FIELDS) {
    return ITEM_TYPE_FIELDS[itemType as KnownItemType];
  }
  if (customRegistry[itemType]) {
    return customRegistry[itemType];
  }
  return FALLBACK_PRINT_FIELDS;
}

/** Keys on each table row object in `DocumentRenderer` (not dot paths on document context). */
export function getTableColumnFieldsForDataSource(
  dataSource: 'customItems' | 'batches' | 'items'
): FieldDef[] {
  if (dataSource === 'customItems') {
    return [
      { path: 'slno', label: 'Serial no. (auto)', category: 'Table row' },
      { path: 'name', label: 'Name', category: 'Table row' },
      { path: 'description', label: 'Description', category: 'Table row' },
      { path: 'qty', label: 'Quantity', category: 'Table row' },
      { path: 'unit', label: 'Unit', category: 'Table row' },
    ];
  }
  if (dataSource === 'batches') {
    return [
      { path: 'slno', label: 'Serial no.', category: 'Table row' },
      { path: 'batchNumber', label: 'Batch number', category: 'Table row' },
      { path: 'quantityFromBatch', label: 'Qty from batch', category: 'Table row' },
      { path: 'unitCost', label: 'Unit cost', category: 'Table row' },
    ];
  }
  return [
    { path: 'slno', label: 'Serial no.', category: 'Table row' },
    { path: 'name', label: 'Name', category: 'Table row' },
    { path: 'qty', label: 'Qty', category: 'Table row' },
    { path: 'unit', label: 'Unit', category: 'Table row' },
  ];
}
