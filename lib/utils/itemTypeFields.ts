import type { KnownItemType } from '@/lib/types/documentTemplate';

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

/** Bound to session user — see /profile (photo + signature uploads). */
export const USER_PRINT_FIELDS: FieldDef[] = [
  { path: 'user.name', label: 'User name', category: 'User' },
  { path: 'user.imageDriveId', label: 'User profile photo (Drive file ID)', category: 'User' },
  { path: 'user.signatureDriveId', label: 'User signature (Drive file ID)', category: 'User' },
  { path: 'user.image', label: 'User profile photo URL (resolved)', category: 'User' },
  { path: 'user.signatureUrl', label: 'User signature image URL (resolved)', category: 'User' },
  { path: 'page.number', label: 'Page Number (dynamic)', category: 'Page' },
  { path: 'page.total', label: 'Total Pages (dynamic)', category: 'Page' },
];

export const ITEM_TYPE_LABELS: Record<KnownItemType, string> = {
  'delivery-note': 'Delivery Note',
  'goods-receipt': 'Goods Receipt',
  'packing-slip': 'Packing Slip',
  'material-label': 'Material Label',
  'work-schedule': 'Work Schedule',
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

/** Job fields aligned with `jobTemplateSlice` / Prisma `Job` (incl. PM integration) */
const JOB_PRINT_FIELDS: FieldDef[] = [
  { path: 'job.jobNumber', label: 'Job Number', category: 'Job' },
  { path: 'job.description', label: 'Job Description', category: 'Job' },
  { path: 'job.site', label: 'Site', category: 'Job' },
  { path: 'job.address', label: 'Job Address', category: 'Job' },
  { path: 'job.locationName', label: 'Location Name', category: 'Job' },
  { path: 'job.locationLat', label: 'Location Latitude', category: 'Job' },
  { path: 'job.locationLng', label: 'Location Longitude', category: 'Job' },
  { path: 'job.status', label: 'Job Status', category: 'Job' },
  { path: 'job.startDate', label: 'Start Date (ISO)', category: 'Job' },
  { path: 'job.endDate', label: 'End Date (ISO)', category: 'Job' },
  { path: 'job.quotationNumber', label: 'Quotation Number', category: 'Job' },
  { path: 'job.quotationDate', label: 'Quotation Date (ISO)', category: 'Job' },
  { path: 'job.lpoNumber', label: 'LPO Number', category: 'Job' },
  { path: 'job.lpoDate', label: 'LPO Date (ISO)', category: 'Job' },
  { path: 'job.lpoValue', label: 'LPO Value', category: 'Job' },
  { path: 'job.projectName', label: 'Project Name', category: 'Job' },
  { path: 'job.projectDetails', label: 'Project Details', category: 'Job' },
  { path: 'job.workProcessDetails', label: 'Work Process Details', category: 'Job' },
  { path: 'job.jobWorkValue', label: 'Job Work Value', category: 'Job' },
  { path: 'job.contactPerson', label: 'Job Contact Person', category: 'Job' },
  { path: 'job.contactPhone', label: 'Job Contact Phone', category: 'Job' },
  { path: 'job.contactEmail', label: 'Job Contact Email', category: 'Job' },
  { path: 'job.contactDesignation', label: 'Job Contact Designation', category: 'Job' },
  { path: 'job.contactLabel', label: 'Job Contact Label', category: 'Job' },
  { path: 'job.salesPerson', label: 'Sales Person', category: 'Job' },
  { path: 'job.externalJobId', label: 'External Job ID', category: 'Job' },
  { path: 'job.parentJobNumber', label: 'Parent Job Number', category: 'Job' },
  { path: 'job.contactsJson', label: 'Contacts (JSON string)', category: 'Job' },
  { path: 'job.source', label: 'Job Record Source', category: 'Job' },
  { path: 'job.externalUpdatedAt', label: 'External Updated At (ISO)', category: 'Job' },
];

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
    ...JOB_PRINT_FIELDS,
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
    ...JOB_PRINT_FIELDS,
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

  'work-schedule': [
    { path: 'company.name', label: 'Company Name', category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    { path: 'company.letterheadUrl', label: 'Letterhead Image URL', category: 'Company' },
    { path: 'job.jobNumber', label: 'Primary Job Number', category: 'Job' },
    { path: 'job.customerName', label: 'Primary Customer Name', category: 'Job' },
    { path: 'job.projectDetails', label: 'Primary Project Details', category: 'Job' },
    { path: 'job.workProcessDetails', label: 'Primary Work Process Details', category: 'Job' },
    { path: 'job.locationLabel', label: 'Primary Job Location', category: 'Job' },
    { path: 'schedule.title', label: 'Document Title', category: 'Schedule' },
    { path: 'schedule.workDate', label: 'Work Date (ISO)', category: 'Schedule' },
    { path: 'schedule.workDateLabel', label: 'Work Date Label', category: 'Schedule' },
    { path: 'schedule.status', label: 'Schedule Status', category: 'Schedule' },
    { path: 'schedule.groupCount', label: 'Group Count', category: 'Schedule' },
    { path: 'schedule.assignedWorkerCount', label: 'Assigned Worker Count', category: 'Schedule' },
    { path: 'schedule.groupsWithTiming', label: 'Groups With Timing', category: 'Schedule' },
    { path: 'schedule.driverCount', label: 'Driver Count', category: 'Schedule' },
    { path: 'schedule.driverTripSummary', label: 'Driver Trip Summary', category: 'Schedule' },
    { path: 'schedule.notes', label: 'Schedule Notes', category: 'Schedule' },
    { path: 'schedule.remarksSummary', label: 'Remarks Summary', category: 'Schedule' },
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
    return mergeFieldLists(ITEM_TYPE_FIELDS[itemType as KnownItemType], USER_PRINT_FIELDS);
  }
  if (customRegistry[itemType]) {
    return mergeFieldLists(customRegistry[itemType], USER_PRINT_FIELDS);
  }
  return mergeFieldLists(FALLBACK_PRINT_FIELDS, USER_PRINT_FIELDS);
}

/** Keys on each table row object in `DocumentRenderer` (not dot paths on document context). */
export function getTableColumnFieldsForDataSource(
  dataSource: 'customItems' | 'batches' | 'items' | 'scheduleGroups' | 'driverTrips'
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
  if (dataSource === 'scheduleGroups') {
    return [
      { path: 'slno', label: 'Serial no.', category: 'Table row' },
      { path: 'label', label: 'Group Label', category: 'Table row' },
      { path: 'locationLabel', label: 'Location', category: 'Table row' },
      { path: 'siteName', label: 'Site Name', category: 'Table row' },
      { path: 'locationDisplay', label: 'Conditional Location Display', category: 'Table row' },
      { path: 'jobNumber', label: 'Job Number', category: 'Table row' },
      { path: 'customerName', label: 'Customer Name', category: 'Table row' },
      { path: 'projectDetails', label: 'Project Details', category: 'Table row' },
      { path: 'workProcessDetails', label: 'Work Process Details', category: 'Table row' },
      { path: 'teamLeaderName', label: 'Team Leader', category: 'Table row' },
        { path: 'driverNames', label: 'Driver Names', category: 'Table row' },
        { path: 'targetQty', label: 'Target Qty', category: 'Table row' },
        { path: 'workerNames', label: 'Assigned Workers', category: 'Table row' },
        { path: 'workerDisplay', label: 'Assigned Workers (One Per Line)', category: 'Table row' },
        { path: 'workerRows', label: 'Assigned Workers (Auto Rows)', category: 'Table row' },
        { path: 'workerBlocks', label: 'Assigned Workers (Structured Cell)', category: 'Table row' },
        { path: 'workerStructuredRows', label: 'Assigned Workers (Expanded Rows)', category: 'Table row' },
        { path: 'workerCount', label: 'Worker Count', category: 'Table row' },
      { path: 'dutyStart', label: 'Duty In', category: 'Table row' },
      { path: 'dutyEnd', label: 'Duty Out', category: 'Table row' },
      { path: 'breakStart', label: 'Break Out', category: 'Table row' },
      { path: 'breakEnd', label: 'Break In', category: 'Table row' },
      { path: 'dutyRange', label: 'Duty Range', category: 'Table row' },
      { path: 'breakRange', label: 'Break Range', category: 'Table row' },
      { path: 'remarks', label: 'Remarks', category: 'Table row' },
    ];
  }
  if (dataSource === 'driverTrips') {
    return [
      { path: 'slno', label: 'Serial no.', category: 'Table row' },
      { path: 'driverName', label: 'Driver Name', category: 'Table row' },
      { path: 'tripOrder', label: 'Trip Order / Route', category: 'Table row' },
    ];
  }
  return [
    { path: 'slno', label: 'Serial no.', category: 'Table row' },
    { path: 'name', label: 'Name', category: 'Table row' },
    { path: 'qty', label: 'Qty', category: 'Table row' },
    { path: 'unit', label: 'Unit', category: 'Table row' },
  ];
}
