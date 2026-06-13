import { resolveEntryCreatedBy } from '@/lib/deliveryNote/resolveCreatedBy';

describe('resolveEntryCreatedBy', () => {
  const creators = new Map([
    [
      'user-1',
      { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com', signatureUrl: '/sig.png' },
    ],
  ]);

  it('prefers delivery note creator over transaction actor', () => {
    const result = resolveEntryCreatedBy(
      { createdByUserId: 'user-1', createdByName: 'Stored Name' },
      { performedByUserId: 'other', performedByName: 'Txn Actor', performedBy: 'Txn Actor' },
      creators
    );
    expect(result.createdByUserId).toBe('user-1');
    expect(result.createdByName).toBe('Jane Doe');
    expect(result.createdByEmail).toBe('jane@example.com');
  });

  it('falls back to transaction actor when delivery note has no creator', () => {
    const result = resolveEntryCreatedBy(
      { createdByUserId: null, createdByName: null },
      { performedByUserId: null, performedByName: 'Batch User', performedBy: 'Batch User' },
      creators
    );
    expect(result.createdByName).toBe('Batch User');
  });
});
