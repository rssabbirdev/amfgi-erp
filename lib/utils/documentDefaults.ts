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

export function createWorkScheduleTemplateDraft(
  id: string,
  name = 'Work Schedule PDF'
): DocumentTemplate {
  const base: DocumentTemplate = {
    id,
    name,
    itemType: 'work-schedule',
    isDefault: false,
    pageMargins: { top: 8, right: 8, bottom: 8, left: 8 },
    pageStyle: {
      pageOrientation: 'landscape',
      bodyFontFamily: 'Arial, Helvetica, sans-serif',
    },
    sections: [
      {
        type: 'image',
        heightMm: 18,
        source: 'field',
        field: 'company.letterheadUrl',
        objectFit: 'contain',
        objectPosition: 'center',
        opacity: 1,
        align: 'center',
        layout: 'fill',
        useCompanyLetterheadFallback: true,
        marginBottomMm: 2,
        pageAnchor: 'top',
      },
      {
        type: 'heading',
        text: 'DAILY WORK SCHEDULE',
        fontSize: 15,
        align: 'center',
        bold: true,
        color: '#0f172a',
      },
      {
        type: 'field-row',
        cells: [
          { label: 'Date', field: 'schedule.workDateLabel', width: 30, bold: true, fontSize: 9 },
          { label: 'Status', field: 'schedule.status', width: 16, fontSize: 9 },
          { label: 'Groups', field: 'schedule.groupCount', width: 12, align: 'center', fontSize: 9 },
          { label: 'Workers', field: 'schedule.assignedWorkerCount', width: 12, align: 'center', fontSize: 9 },
          { label: 'Driver trips', field: 'schedule.driverTripSummary', width: 18, fontSize: 8 },
          { label: 'Remarks', field: 'schedule.remarksSummary', width: 12, align: 'right', fontSize: 8 },
        ],
        bordered: true,
        minHeight: 10,
      },
      {
        type: 'table',
        dataSource: 'scheduleGroups',
        layoutMode: 'group-columns',
        columns: [
          { header: 'Work location', field: 'locationDisplay', align: 'left' },
          { header: 'Job No', field: 'jobNumber', align: 'left' },
          { header: 'Customer', field: 'customerName', align: 'left' },
          { header: 'Project details', field: 'projectDetails', align: 'left' },
          { header: 'Team leader', field: 'teamLeaderName', align: 'left' },
          { header: 'Drivers', field: 'driverNames', align: 'left' },
            { header: 'Assigned workers', field: 'workerBlocks', align: 'left' },
          { header: 'Duty timing', field: 'dutyRange', align: 'center' },
          { header: 'Break timing', field: 'breakRange', align: 'center' },
          { header: 'Remarks', field: 'remarks', align: 'left' },
        ],
        fontSize: 7,
        showBorders: true,
        headerBg: '#0f172a',
        headerColor: '#ffffff',
        repeatHeaderOnNewPage: true,
        minRows: 3,
        rowPadding: 2,
      },
      {
        type: 'heading',
        text: 'Driver Trip Plan',
        fontSize: 11,
        align: 'left',
        bold: true,
        color: '#0f172a',
        pageAnchor: 'bottom',
      },
      {
        type: 'table',
        dataSource: 'driverTrips',
        columns: [
          { header: '#', field: 'slno', width: 8, align: 'center' },
          { header: 'Driver', field: 'driverName', width: 28, align: 'left' },
          { header: 'Trip Order / Route', field: 'tripOrder', width: 64, align: 'left' },
        ],
        fontSize: 8,
        showBorders: true,
        headerBg: '#e2e8f0',
        headerColor: '#0f172a',
        repeatHeaderOnNewPage: false,
        minRows: 3,
        rowPadding: 2,
        pageAnchor: 'bottom',
      },
    ],
    canvasMode: true,
    canvasRects: [],
  };
  return {
    ...base,
    canvasRects: buildCanvasRectsFromSections(base),
  };
}
