import {
  getSupplierContactOptions,
  resolveSupplierContactIdByName,
} from '@/lib/utils/supplierContactOptions';

describe('supplierContactOptions', () => {
  it('builds options from supplier primary and contactsJson', () => {
    const options = getSupplierContactOptions({
      contactPerson: 'Sam Supplier',
      phone: '555-1000',
      email: 'sam@example.com',
      contactsJson: [
        { contact_name: 'Ahmed Site', phone: '+97150111222', email: 'ahmed@example.com' },
      ],
    });

    expect(options.map((opt) => opt.name)).toEqual(['Ahmed Site', 'Sam Supplier']);
    expect(resolveSupplierContactIdByName(options, 'Ahmed Site')).toBe(options[0].id);
  });
});
