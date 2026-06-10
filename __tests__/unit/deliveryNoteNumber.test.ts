import {
  replaceDeliveryNoteContactInNotes,
  replaceDeliveryNoteNumberInNotes,
  resolveDeliveryContactPerson,
  resolveDeliveryNoteNumber,
} from '@/lib/deliveryNoteNumber';

describe('deliveryNoteNumber', () => {
  it('replaces an existing delivery note header', () => {
    const notes = '--- DELIVERY NOTE #12\n--- DELIVERY CONTACT PERSON: Alex';
    expect(replaceDeliveryNoteNumberInNotes(notes, 42)).toBe(
      '--- DELIVERY NOTE #42\n--- DELIVERY CONTACT PERSON: Alex'
    );
  });

  it('prepends a header when missing', () => {
    expect(replaceDeliveryNoteNumberInNotes('Line note', 7)).toBe('--- DELIVERY NOTE #7\nLine note');
  });

  it('resolves structured delivery note numbers first', () => {
    expect(resolveDeliveryNoteNumber('--- DELIVERY NOTE #9', { number: 15 })).toBe(15);
  });

  it('prefers delivery note contactPerson over notes', () => {
    expect(
      resolveDeliveryContactPerson('--- DELIVERY CONTACT PERSON: Old', {
        contactPerson: 'New',
      })
    ).toBe('New');
  });

  it('replaces delivery contact in notes after the header', () => {
    const notes = '--- DELIVERY NOTE #3\n--- DELIVERY CONTACT PERSON: Old';
    expect(replaceDeliveryNoteContactInNotes(notes, 'Sara')).toBe(
      '--- DELIVERY NOTE #3\n--- DELIVERY CONTACT PERSON: Sara'
    );
  });
});
