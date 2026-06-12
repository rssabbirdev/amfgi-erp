import { buildDeliveryNoteTemplateDataFromEntity } from '@/lib/utils/templateData';

describe('buildDeliveryNoteTemplateDataFromEntity subcontract', () => {
  it('includes supplier, warehouses, and material lines for subcontract notes', () => {
    const ctx = buildDeliveryNoteTemplateDataFromEntity(
      {
        id: 'dn-1',
        number: 42,
        date: '2026-06-08',
        documentNotes: 'Send for galvanizing',
        deliveryType: 'SUBCONTRACT',
        transitStatus: 'ON_TRANSIT',
        contactPerson: 'Ahmed Site',
        supplier: {
          name: 'Galv Co',
          contactPerson: 'Sam',
          phone: '555',
          trnNumber: '100111222333444',
          contactsJson: [
            { contact_name: 'Ahmed Site', phone: '+97150111222', email: 'ahmed@galvco.ae' },
          ],
        },
        sourceWarehouse: { name: 'Main Store' },
        targetWarehouse: { name: 'At Subcontractor' },
        materialLines: [
          {
            materialName: 'Angle',
            materialUnit: 'kg',
            issuedQty: 100,
            receivedQty: 0,
            outstandingQty: 100,
          },
        ],
      },
      { name: 'Test Co' }
    );

    expect(ctx.dn.deliveryType).toBe('SUBCONTRACT');
    expect(ctx.dn.transitStatus).toBe('ON_TRANSIT');
    expect(ctx.supplier?.name).toBe('Galv Co');
    expect(ctx.supplier?.trnNumber).toBe('100111222333444');
    expect(ctx.supplier?.contactPerson).toBe('Sam');
    expect(ctx.supplier?.deliveryContactPerson).toBe('Ahmed Site');
    expect(ctx.supplier?.deliveryContactPhone).toBe('+97150111222');
    expect(ctx.dn.contactPerson).toBe('Ahmed Site');
    expect(ctx.sourceWarehouse?.name).toBe('Main Store');
    expect(ctx.targetWarehouse?.name).toBe('At Subcontractor');
    expect(ctx.materialLines).toHaveLength(1);
    expect(ctx.items[0]).toMatchObject({ name: 'Angle', qty: '100', unit: 'kg' });
    expect(ctx.dn.quantity).toBe(100);
  });
});
