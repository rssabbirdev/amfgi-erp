import type { PrintTemplate, NamedPrintTemplate, PrintElement, ItemType } from '@/lib/types/printTemplate';

export const DEFAULT_TEMPLATE: NamedPrintTemplate = {
  id: 'default-delivery-note',
  name: 'Delivery Note - Standard',
  itemType: 'delivery-note',
  isDefault: true,
  version: 1,
  pageMargins: { top: 15, right: 15, bottom: 15, left: 15 },
  elements: [
    // Letterhead background
    {
      id: 'letterhead-bg',
      type: 'letterhead',
      x: 0,
      y: 0,
      width: 210,
      height: 100,
      zIndex: 0,
      style: { opacity: 0.15 },
      objectFit: 'contain',
    },
    // Header: DELIVERY NOTE title
    {
      id: 'header-title',
      type: 'text',
      x: 15,
      y: 102,
      width: 100,
      height: 12,
      zIndex: 1,
      content: 'DELIVERY NOTE',
      style: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#000',
      },
    },
    // Header: DN Number
    {
      id: 'header-dn-number',
      type: 'field',
      x: 130,
      y: 102,
      width: 65,
      height: 8,
      zIndex: 1,
      field: 'dn.number',
      label: 'NO:',
      format: 'text',
      style: {
        fontSize: 11,
        color: '#d32f2f',
        textAlign: 'right',
      },
    },
    // Header: Date
    {
      id: 'header-date',
      type: 'field',
      x: 130,
      y: 112,
      width: 65,
      height: 6,
      zIndex: 1,
      field: 'dn.date',
      label: 'DATE:',
      format: 'date',
      style: {
        fontSize: 10,
        textAlign: 'right',
      },
    },
    // M/S Box (left)
    {
      id: 'ms-box',
      type: 'box',
      x: 15,
      y: 125,
      width: 82,
      height: 25,
      zIndex: 1,
      style: {
        borderWidth: 2,
        borderColor: '#000',
      },
    },
    // M/S Label
    {
      id: 'ms-label',
      type: 'text',
      x: 17,
      y: 127,
      width: 30,
      height: 6,
      zIndex: 2,
      content: 'M/S',
      style: {
        fontSize: 10,
        fontWeight: 'bold',
      },
    },
    // M/S Content
    {
      id: 'ms-content',
      type: 'field',
      x: 17,
      y: 133,
      width: 78,
      height: 15,
      zIndex: 2,
      field: 'job.description',
      style: {
        fontSize: 9,
      },
    },
    // Project Box (right)
    {
      id: 'project-box',
      type: 'box',
      x: 113,
      y: 125,
      width: 82,
      height: 25,
      zIndex: 1,
      style: {
        borderWidth: 2,
        borderColor: '#000',
      },
    },
    // Project Label
    {
      id: 'project-label',
      type: 'text',
      x: 115,
      y: 127,
      width: 30,
      height: 6,
      zIndex: 2,
      content: 'PROJECT:',
      style: {
        fontSize: 10,
        fontWeight: 'bold',
      },
    },
    // Project Job Number
    {
      id: 'project-job-number',
      type: 'field',
      x: 115,
      y: 133,
      width: 78,
      height: 6,
      zIndex: 2,
      field: 'job.jobNumber',
      style: {
        fontSize: 10,
        fontWeight: 'bold',
      },
    },
    // Project Description
    {
      id: 'project-description',
      type: 'field',
      x: 115,
      y: 139,
      width: 78,
      height: 10,
      zIndex: 2,
      field: 'job.description',
      style: {
        fontSize: 9,
      },
    },
    // Items Table
    {
      id: 'items-table',
      type: 'table',
      x: 15,
      y: 155,
      width: 180,
      height: 60,
      zIndex: 1,
      dataSource: 'customItems',
      columns: [
        { header: 'SL.NO.', field: 'slno', width: 10, align: 'center' },
        { header: 'DESCRIPTION', field: 'name', width: 55 },
        { header: 'UNIT', field: 'unit', width: 15, align: 'center' },
        { header: 'QTY', field: 'qty', width: 20, align: 'right' },
      ],
    },
    // Footer: Received text
    {
      id: 'footer-received',
      type: 'text',
      x: 15,
      y: 220,
      width: 180,
      height: 10,
      zIndex: 1,
      content: 'Received above goods in perfect condition.',
      style: {
        fontSize: 10,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    },
    // Signature: Prepared By
    {
      id: 'signature-prepared',
      type: 'signature',
      x: 15,
      y: 235,
      width: 50,
      height: 25,
      zIndex: 1,
      label: 'PREPARED BY',
    },
    // Signature: Delivered By
    {
      id: 'signature-delivered',
      type: 'signature',
      x: 80,
      y: 235,
      width: 50,
      height: 25,
      zIndex: 1,
      label: 'DELIVERED BY',
    },
    // Signature: Received By
    {
      id: 'signature-received',
      type: 'signature',
      x: 145,
      y: 235,
      width: 50,
      height: 25,
      zIndex: 1,
      label: 'RECEIVED BY',
    },
  ],
};

/**
 * Returns the default elements for a given item type.
 * Currently only delivery-note has defaults; others return empty array.
 */
export function getDefaultElements(itemType: ItemType): PrintElement[] {
  if (itemType === 'delivery-note') {
    return DEFAULT_TEMPLATE.elements;
  }
  // For other types, start with empty canvas
  return [];
}

/**
 * List of all default templates.
 * Currently only delivery-note; add more as needed.
 */
export const DEFAULT_TEMPLATES: NamedPrintTemplate[] = [DEFAULT_TEMPLATE];
