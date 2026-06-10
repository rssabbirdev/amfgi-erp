import { replaceDeliveryNoteNumberInNotes, resolveDeliveryNoteNumber } from '@/lib/deliveryNoteNumber';

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
});
