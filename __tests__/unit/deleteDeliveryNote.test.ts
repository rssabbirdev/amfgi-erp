import { sortTransactionsForDeletion } from '@/lib/stock/reverseAndDeleteTransaction';

describe('sortTransactionsForDeletion', () => {
  it('orders transfer-ins before transfer-outs and stock-outs last', () => {
    const sorted = sortTransactionsForDeletion([
      { id: 'out', type: 'TRANSFER_OUT', createdAt: new Date('2026-01-03') },
      { id: 'in', type: 'TRANSFER_IN', createdAt: new Date('2026-01-02') },
      { id: 'stock', type: 'STOCK_OUT', createdAt: new Date('2026-01-04') },
      { id: 'ret', type: 'RETURN', createdAt: new Date('2026-01-05') },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['in', 'out', 'ret', 'stock']);
  });

  it('unwinds subcontract receive transfers before issue transfers', () => {
    const sorted = sortTransactionsForDeletion([
      { id: 'issue-out', type: 'TRANSFER_OUT', referenceType: 'subcontract_issue', createdAt: new Date('2026-01-01') },
      { id: 'issue-in', type: 'TRANSFER_IN', referenceType: 'subcontract_issue', createdAt: new Date('2026-01-01') },
      { id: 'recv-out', type: 'TRANSFER_OUT', referenceType: 'subcontract_receive', createdAt: new Date('2026-01-02') },
      { id: 'recv-in', type: 'TRANSFER_IN', referenceType: 'subcontract_receive', createdAt: new Date('2026-01-02') },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['recv-in', 'recv-out', 'issue-in', 'issue-out']);
  });
});
