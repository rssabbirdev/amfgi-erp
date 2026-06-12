import {
  canEditSubcontractIssue,
  computeTransitStatus,
  hasAnyReceived,
  outstandingQty,
} from '@/lib/stock/subcontractDeliveryNote';

describe('subcontractDeliveryNote helpers', () => {
  describe('outstandingQty', () => {
    it('returns issued minus received floored at zero', () => {
      expect(outstandingQty(10, 3)).toBe(7);
      expect(outstandingQty(5, 5)).toBe(0);
      expect(outstandingQty(2, 8)).toBe(0);
    });
  });

  describe('computeTransitStatus', () => {
    it('returns ON_TRANSIT when nothing received', () => {
      expect(computeTransitStatus([{ issuedQty: 10, receivedQty: 0 }])).toBe('ON_TRANSIT');
    });

    it('returns PARTIALLY_RECEIVED when some lines are open', () => {
      expect(
        computeTransitStatus([
          { issuedQty: 10, receivedQty: 10 },
          { issuedQty: 5, receivedQty: 2 },
        ])
      ).toBe('PARTIALLY_RECEIVED');
    });

    it('returns RECEIVED when all lines are fully received', () => {
      expect(
        computeTransitStatus([
          { issuedQty: 10, receivedQty: 10 },
          { issuedQty: 5, receivedQty: 5 },
        ])
      ).toBe('RECEIVED');
    });

    it('returns null for empty line set', () => {
      expect(computeTransitStatus([])).toBeNull();
    });
  });

  describe('canEditSubcontractIssue', () => {
    it('allows edit only on ON_TRANSIT or unset status', () => {
      expect(canEditSubcontractIssue('ON_TRANSIT')).toBe(true);
      expect(canEditSubcontractIssue(null)).toBe(true);
      expect(canEditSubcontractIssue(undefined)).toBe(true);
      expect(canEditSubcontractIssue('PARTIALLY_RECEIVED')).toBe(false);
      expect(canEditSubcontractIssue('RECEIVED')).toBe(false);
    });
  });

  describe('hasAnyReceived', () => {
    it('detects any positive received quantity', () => {
      expect(hasAnyReceived([{ receivedQty: 0 }, { receivedQty: 0 }])).toBe(false);
      expect(hasAnyReceived([{ receivedQty: 0 }, { receivedQty: 1 }])).toBe(true);
    });
  });
});
