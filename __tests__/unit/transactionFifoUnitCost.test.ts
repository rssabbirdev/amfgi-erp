import {
  resolveTransactionFifoUnitCost,
  resolveTransactionNetLineCost,
} from '@/lib/stock/transactionFifoUnitCost';

describe('transactionFifoUnitCost', () => {
  it('prefers transaction averageCost over material master unitCost', () => {
    expect(
      resolveTransactionFifoUnitCost({
        averageCost: 12.5,
        totalCost: 50,
        quantity: 4,
        material: { unitCost: 99 },
      })
    ).toBe(12.5);
  });

  it('derives unit cost from totalCost and quantity when averageCost is zero', () => {
    expect(
      resolveTransactionFifoUnitCost({
        averageCost: 0,
        totalCost: 40,
        quantity: 8,
        material: { unitCost: 99 },
      })
    ).toBe(5);
  });

  it('scales line cost for partial returns using transaction totalCost', () => {
    expect(
      resolveTransactionNetLineCost(
        {
          averageCost: 10,
          totalCost: 100,
          quantity: 10,
          material: { unitCost: 99 },
        },
        4
      )
    ).toBe(40);
  });
});
