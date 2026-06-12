import type { DocumentTemplate, ItemType, KnownItemType } from '@/lib/types/documentTemplate';
import { KNOWN_ITEM_TYPES } from '@/lib/types/documentTemplate';

export const SUBCONTRACT_DELIVERY_NOTE_ITEM_TYPE = 'subcontract-delivery-note' as const;

export type SubcontractDeliveryNoteItemType = typeof SUBCONTRACT_DELIVERY_NOTE_ITEM_TYPE;

/** Item types that share delivery-note print data and preview pickers. */
export function isDeliveryNoteFamilyItemType(itemType: string): boolean {
  return itemType === 'delivery-note' || itemType === SUBCONTRACT_DELIVERY_NOTE_ITEM_TYPE;
}

/** Resolve which print format bucket a delivery note belongs to. */
export function deliveryNotePrintItemType(
  deliveryType?: string | null
): 'delivery-note' | SubcontractDeliveryNoteItemType {
  return deliveryType === 'SUBCONTRACT' ? SUBCONTRACT_DELIVERY_NOTE_ITEM_TYPE : 'delivery-note';
}

/** Format types shown when converting inside the print builder. */
export function getPrintBuilderConvertibleItemTypes(): KnownItemType[] {
  return [...KNOWN_ITEM_TYPES];
}

export function filterTemplatesForDeliveryNotePrint(
  templates: DocumentTemplate[],
  deliveryType?: string | null
): DocumentTemplate[] {
  const preferred = deliveryNotePrintItemType(deliveryType);
  const exact = templates.filter((t) => String(t.itemType) === preferred);
  if (exact.length > 0) return exact;
  if (preferred === SUBCONTRACT_DELIVERY_NOTE_ITEM_TYPE) {
    return templates.filter((t) => String(t.itemType) === 'delivery-note');
  }
  return exact;
}

export function resolveDefaultPrintTemplateId(
  templates: DocumentTemplate[],
  deliveryType?: string | null
) {
  const pool = filterTemplatesForDeliveryNotePrint(templates, deliveryType);
  return pool.find((t) => t.isDefault)?.id ?? pool[0]?.id ?? '';
}
