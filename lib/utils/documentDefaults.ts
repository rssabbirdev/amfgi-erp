import type { DocumentTemplate, DocumentSection } from '@/lib/types/documentTemplate';
import { buildCanvasRectsFromSections } from '@/lib/utils/canvasLayout';

/** Matches `default-delivery-note` in `scripts/seed-print-templates.ts` (single A4 page). */
const DEFAULT_DELIVERY_NOTE_SECTIONS: DocumentSection[] = [
  {
    type: 'image',
    heightMm: 22,
    source: 'field',
    field: 'company.letterheadUrl',
    objectFit: 'contain',
    objectPosition: 'center',
    opacity: 0.14,
    align: 'center',
    layout: 'fill',
    useCompanyLetterheadFallback: true,
    marginBottomMm: 2,
  },
  { type: 'line', thickness: 2, color: '#1e3a8a', marginTop: 0, marginBottom: 0, width: 100 },
  { type: 'spacer', height: 1 },
  {
    type: 'heading',
    text: 'DELIVERY NOTE',
    fontSize: 16,
    align: 'center',
    bold: true,
    color: '#0f172a',
  },
  {
    type: 'text',
    content: 'Verify quantities and condition at receipt.',
    fontSize: 8,
    align: 'center',
    bold: false,
    color: '#64748b',
  },
  { type: 'spacer', height: 2 },
  {
    type: 'field-row',
    cells: [
      { label: 'Document No.', field: 'dn.number', width: 32, bold: true, fontSize: 10, color: '#0f172a' },
      { label: 'Delivery date', field: 'dn.date', width: 34, fontSize: 9, color: '#334155' },
      { label: 'Printed', field: 'today', width: 34, align: 'right', fontSize: 8, color: '#64748b' },
    ],
    bordered: false,
    minHeight: 10,
  },
  { type: 'divider', thickness: 1, color: '#cbd5e1', marginTop: 1, marginBottom: 2 },
  {
    type: 'info-grid',
    columns: 2,
    bordered: true,
    items: [
      { label: 'Customer', field: 'customer.name', bold: true },
      { label: 'Contact', field: 'customer.contactPerson' },
      { label: 'Phone', field: 'customer.phone' },
      { label: 'Email', field: 'customer.email' },
      { label: 'Address', field: 'customer.address' },
      { label: 'Site', field: 'job.site' },
    ],
  },
  { type: 'spacer', height: 2 },
  {
    type: 'field-row',
    cells: [
      { label: 'Job No.', field: 'job.jobNumber', width: 30, bold: true, fontSize: 9, color: '#0f172a' },
      { label: 'Project', field: 'job.projectName', width: 38, fontSize: 9, color: '#334155' },
      { label: 'LPO', field: 'job.lpoNumber', width: 32, align: 'right', fontSize: 8, color: '#475569' },
    ],
    bordered: false,
  },
  {
    type: 'field-row',
    cells: [
      { label: 'Scope', field: 'job.description', width: 58, fontSize: 8, color: '#334155' },
      { label: 'Quotation', field: 'job.quotationNumber', width: 42, align: 'right', fontSize: 8, color: '#475569' },
    ],
    bordered: false,
  },
  { type: 'spacer', height: 2 },
  { type: 'divider', thickness: 2, color: '#0f172a', marginTop: 0, marginBottom: 1 },
  {
    type: 'table',
    dataSource: 'customItems',
    columns: [
      { header: '#', field: 'slno', width: 6, align: 'center' },
      { header: 'Item / material', field: 'name', width: 38, align: 'left' },
      { header: 'Specification', field: 'description', width: 28, align: 'left' },
      { header: 'Qty', field: 'qty', width: 14, align: 'right' },
      { header: 'Unit', field: 'unit', width: 14, align: 'center' },
    ],
    fontSize: 8,
    showBorders: true,
    headerBg: '#1e3a8a',
    headerColor: '#ffffff',
    repeatHeaderOnNewPage: true,
    minRows: 4,
    rowPadding: 2,
  },
  { type: 'spacer', height: 1 },
  {
    type: 'field-row',
    cells: [
      { label: 'Total qty', field: 'dn.quantity', width: 50, bold: true, fontSize: 8, color: '#334155' },
      { label: 'Declared value (ref.)', field: 'dn.totalCost', width: 50, align: 'right', fontSize: 8, color: '#64748b' },
    ],
    bordered: false,
  },
  { type: 'spacer', height: 2 },
  {
    type: 'text',
    content: 'Received in good condition. Report issues within 24 hours.',
    fontSize: 8,
    align: 'center',
    bold: false,
    color: '#475569',
  },
  { type: 'spacer', height: 3 },
  {
    type: 'signatures',
    items: [
      { label: 'Prepared (Store)' },
      { label: 'Delivered (Driver)' },
      { label: 'Received (Customer)' },
    ],
    lineHeight: 16,
  },
];

export const DEFAULT_DELIVERY_NOTE: DocumentTemplate = (() => {
  const base: DocumentTemplate = {
    id: 'default-delivery-note',
    name: 'Delivery Note',
    itemType: 'delivery-note',
    isDefault: true,
    pageMargins: { top: 10, right: 12, bottom: 10, left: 12 },
    sections: DEFAULT_DELIVERY_NOTE_SECTIONS,
    canvasMode: true,
    canvasRects: [],
  };
  return {
    ...base,
    canvasRects: buildCanvasRectsFromSections(base),
  };
})();

export const DEFAULT_TEMPLATES: DocumentTemplate[] = [DEFAULT_DELIVERY_NOTE];
