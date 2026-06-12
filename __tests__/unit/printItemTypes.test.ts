import {
  deliveryNotePrintItemType,
  filterTemplatesForDeliveryNotePrint,
  isDeliveryNoteFamilyItemType,
} from '@/lib/utils/printItemTypes';
import { getMockData } from '@/lib/utils/templateData';

describe('printItemTypes', () => {
  it('maps subcontract delivery notes to subcontract-delivery-note format', () => {
    expect(deliveryNotePrintItemType('SUBCONTRACT')).toBe('subcontract-delivery-note');
    expect(deliveryNotePrintItemType('DISPATCH')).toBe('delivery-note');
  });

  it('recognizes delivery note family item types', () => {
    expect(isDeliveryNoteFamilyItemType('delivery-note')).toBe(true);
    expect(isDeliveryNoteFamilyItemType('subcontract-delivery-note')).toBe(true);
    expect(isDeliveryNoteFamilyItemType('work-schedule')).toBe(false);
  });

  it('prefers subcontract templates and falls back to delivery-note templates', () => {
    const templates = [
      { id: 'dn-1', itemType: 'delivery-note', isDefault: true },
      { id: 'sc-1', itemType: 'subcontract-delivery-note', isDefault: false },
    ];
    expect(filterTemplatesForDeliveryNotePrint(templates, 'SUBCONTRACT').map((t) => t.id)).toEqual([
      'sc-1',
    ]);
    expect(filterTemplatesForDeliveryNotePrint(templates, 'SUBCONTRACT').length).toBe(1);
    expect(
      filterTemplatesForDeliveryNotePrint([templates[0]], 'SUBCONTRACT').map((t) => t.id)
    ).toEqual(['dn-1']);
  });
});

describe('getMockData subcontract format', () => {
  it('returns subcontract sample fields', () => {
    const mock = getMockData('subcontract-delivery-note');
    expect(mock.dn.deliveryType).toBe('SUBCONTRACT');
    expect(mock.supplier?.name).toContain('Galv');
    expect(mock.materialLines?.length).toBeGreaterThan(0);
  });
});
