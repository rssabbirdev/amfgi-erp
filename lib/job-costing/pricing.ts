import { computeFactorToBase } from '@/lib/utils/materialUom';
import type { MaterialPricingSnapshot, PricingMode } from '@/lib/job-costing/types';

type MaterialWithPricing = {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
  materialUoms: Array<{
    id: string;
    parentUomId: string | null;
    factorToParent: number;
    unitId: string;
  }>;
  stockBatches: Array<{
    quantityReceived: number;
    quantityAvailable: number;
    unitCost: number;
    receivedDate: Date;
  }>;
};

function weightedAverage(
  rows: Array<{ quantity: number; unitCost: number }>,
  fallback: number
) {
  const totalQuantity = rows.reduce((sum, row) => sum + Math.max(row.quantity, 0), 0);
  if (totalQuantity <= 0) return fallback;
  const totalValue = rows.reduce((sum, row) => sum + Math.max(row.quantity, 0) * row.unitCost, 0);
  return totalValue / totalQuantity;
}

export function resolvePricingSnapshot(
  material: MaterialWithPricing,
  pricingMode: PricingMode,
  customUnitCost?: number | null
): MaterialPricingSnapshot {
  if (pricingMode === 'CUSTOM' && customUnitCost != null) {
    return {
      materialId: material.id,
      materialName: material.name,
      baseUnit: material.unit,
      baseUnitCost: customUnitCost,
      source: 'CUSTOM',
    };
  }

  if (pricingMode === 'CURRENT') {
    return {
      materialId: material.id,
      materialName: material.name,
      baseUnit: material.unit,
      baseUnitCost: material.unitCost ?? 0,
      source: 'CURRENT',
    };
  }

  if (pricingMode === 'MOVING_AVERAGE') {
    return {
      materialId: material.id,
      materialName: material.name,
      baseUnit: material.unit,
      baseUnitCost: weightedAverage(
        material.stockBatches.map((batch) => ({
          quantity: batch.quantityReceived,
          unitCost: batch.unitCost,
        })),
        material.unitCost ?? 0
      ),
      source: 'MOVING_AVERAGE',
    };
  }

  return {
    materialId: material.id,
    materialName: material.name,
    baseUnit: material.unit,
    baseUnitCost: weightedAverage(
      [...material.stockBatches]
        .sort((a, b) => a.receivedDate.getTime() - b.receivedDate.getTime())
        .map((batch) => ({
          quantity: batch.quantityAvailable,
          unitCost: batch.unitCost,
        })),
      material.unitCost ?? 0
    ),
    source: 'FIFO',
  };
}

export function getFactorToBase(
  material: Pick<MaterialWithPricing, 'materialUoms'>,
  quantityUomId?: string | null
) {
  if (!quantityUomId) return 1;
  const byId = new Map(
    material.materialUoms.map((row) => [
      row.id,
      {
        id: row.id,
        parentUomId: row.parentUomId,
        factorToParent: row.factorToParent,
      },
    ])
  );
  return computeFactorToBase(quantityUomId, byId);
}
