import type { ItemType } from '@/lib/types/printTemplate';

export interface FieldDef {
  path: string;
  label: string;
  category: string;
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  'delivery-note': 'Delivery Note',
  'goods-receipt': 'Goods Receipt',
  'packing-slip': 'Packing Slip',
  'material-label': 'Material Label',
};

export const ITEM_TYPE_FIELDS: Record<ItemType, FieldDef[]> = {
  'delivery-note': [
    // Company
    { path: 'company.name',    label: 'Company Name',    category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone',   label: 'Company Phone',   category: 'Company' },
    { path: 'company.email',   label: 'Company Email',   category: 'Company' },
    // Document
    { path: 'dn.number',   label: 'DN Number',   category: 'Document' },
    { path: 'dn.date',     label: 'DN Date',     category: 'Document' },
    { path: 'dn.notes',    label: 'DN Notes',    category: 'Document' },
    { path: 'dn.totalCost', label: 'Total Cost', category: 'Document' },
    { path: 'dn.quantity', label: 'Quantity',    category: 'Document' },
    // Job
    { path: 'job.jobNumber',       label: 'Job Number',       category: 'Job' },
    { path: 'job.description',     label: 'Job Description',  category: 'Job' },
    { path: 'job.site',            label: 'Site',             category: 'Job' },
    { path: 'job.lpoNumber',       label: 'LPO Number',       category: 'Job' },
    { path: 'job.quotationNumber', label: 'Quotation Number', category: 'Job' },
    // Material
    { path: 'material.name',     label: 'Material Name',      category: 'Material' },
    { path: 'material.unit',     label: 'Material Unit',      category: 'Material' },
    { path: 'material.unitCost', label: 'Material Unit Cost', category: 'Material' },
    // General
    { path: 'today', label: "Today's Date", category: 'General' },
  ],

  'goods-receipt': [
    // Company
    { path: 'company.name',    label: 'Company Name',    category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone',   label: 'Company Phone',   category: 'Company' },
    { path: 'company.email',   label: 'Company Email',   category: 'Company' },
    // Document
    { path: 'grn.number',      label: 'GRN Number',      category: 'Document' },
    { path: 'grn.date',        label: 'GRN Date',        category: 'Document' },
    { path: 'grn.totalCost',   label: 'Total Cost',      category: 'Document' },
    { path: 'grn.notes',       label: 'Notes',           category: 'Document' },
    // Supplier
    { path: 'supplier.name',          label: 'Supplier Name',     category: 'Supplier' },
    { path: 'supplier.contactPerson', label: 'Contact Person',    category: 'Supplier' },
    { path: 'supplier.phone',         label: 'Supplier Phone',    category: 'Supplier' },
    // Material
    { path: 'material.name', label: 'Material Name', category: 'Material' },
    { path: 'material.unit', label: 'Material Unit', category: 'Material' },
    // General
    { path: 'today', label: "Today's Date", category: 'General' },
  ],

  'packing-slip': [
    // Company
    { path: 'company.name',    label: 'Company Name',    category: 'Company' },
    { path: 'company.address', label: 'Company Address', category: 'Company' },
    { path: 'company.phone',   label: 'Company Phone',   category: 'Company' },
    { path: 'company.email',   label: 'Company Email',   category: 'Company' },
    // Job
    { path: 'job.jobNumber',   label: 'Job Number',       category: 'Job' },
    { path: 'job.description', label: 'Job Description',  category: 'Job' },
    { path: 'job.site',        label: 'Site',             category: 'Job' },
    { path: 'job.lpoNumber',   label: 'LPO Number',       category: 'Job' },
    // General
    { path: 'today', label: "Today's Date", category: 'General' },
  ],

  'material-label': [
    // Company
    { path: 'company.name',  label: 'Company Name',  category: 'Company' },
    { path: 'company.phone', label: 'Company Phone', category: 'Company' },
    { path: 'company.email', label: 'Company Email', category: 'Company' },
    // Material
    { path: 'material.name',            label: 'Material Name',        category: 'Material' },
    { path: 'material.unit',            label: 'Unit',                 category: 'Material' },
    { path: 'material.unitCost',        label: 'Unit Cost',            category: 'Material' },
    { path: 'material.stockType',       label: 'Stock Type',           category: 'Material' },
    { path: 'material.category',        label: 'Category',             category: 'Material' },
    { path: 'material.warehouse',       label: 'Warehouse',            category: 'Material' },
    { path: 'material.currentStock',    label: 'Current Stock',        category: 'Material' },
    { path: 'material.reorderLevel',    label: 'Reorder Level',        category: 'Material' },
    { path: 'material.description',     label: 'Description',          category: 'Material' },
    { path: 'material.externalItemName', label: 'External Item Name',  category: 'Material' },
    // General
    { path: 'today', label: "Today's Date", category: 'General' },
  ],
};
