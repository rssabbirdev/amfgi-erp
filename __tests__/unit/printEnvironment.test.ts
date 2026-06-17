import { buildDeliveryNotePrintUrl } from '@/lib/print/printEnvironment';

describe('printEnvironment', () => {
  describe('buildDeliveryNotePrintUrl', () => {
    it('builds query string for transaction print', () => {
      expect(buildDeliveryNotePrintUrl({ transactionId: 'txn-1', templateId: 'tpl-1' })).toBe(
        '/print/delivery-note?id=txn-1&templateId=tpl-1'
      );
    });

    it('adds embed flag when requested', () => {
      expect(buildDeliveryNotePrintUrl({ deliveryNoteId: 'dn-1' }, { embed: true })).toBe(
        '/print/delivery-note?deliveryNoteId=dn-1&embed=1'
      );
    });
  });
});
