export type StockCountMaterialInput = {
  id: string;
  name: string;
  unit: string;
  warehouseId?: string | null;
  currentStock: number;
  unitCost?: number;
  isActive: boolean;
  materialWarehouseStocks?: Array<{
    warehouseId: string;
    currentStock: number;
  }>;
};

export type StockCountDraftLine = {
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId: string;
  systemQty: number;
  countedQty: string;
  varianceQty: number;
  unitCost: number;
};

function roundQty(value: number) {
  return Number(value.toFixed(3));
}

export function buildStockCountDraftLines(materials: StockCountMaterialInput[], warehouseId: string) {
  return materials
    .filter((material) => material.isActive)
    .map((material) => {
      const warehouseStock = material.materialWarehouseStocks?.find((row) => row.warehouseId === warehouseId);
      const systemQty = warehouseStock ? warehouseStock.currentStock : material.warehouseId === warehouseId ? material.currentStock : 0;
      return {
        materialId: material.id,
        materialName: material.name,
        unit: material.unit,
        warehouseId,
        systemQty: roundQty(systemQty),
        countedQty: '',
        varianceQty: 0,
        unitCost: Number(material.unitCost ?? 0),
      };
    })
    .filter((line) => line.systemQty !== 0 || materials.some((material) => material.id === line.materialId && material.warehouseId === warehouseId))
    .sort((a, b) => a.materialName.localeCompare(b.materialName));
}

export function updateStockCountVariance(line: StockCountDraftLine, countedQty: string): StockCountDraftLine {
  const parsed = Number(countedQty);
  const varianceQty = Number.isFinite(parsed) ? roundQty(parsed - line.systemQty) : 0;
  return {
    ...line,
    countedQty,
    varianceQty,
  };
}

export function buildManualAdjustmentLinesFromCount(lines: StockCountDraftLine[]) {
  return lines
    .filter((line) => line.countedQty.trim().length > 0 && Math.abs(line.varianceQty) >= 0.001)
    .map((line) => ({
      materialId: line.materialId,
      warehouseId: line.warehouseId,
      quantityDelta: line.varianceQty,
      ...(line.varianceQty > 0 ? { unitCost: line.unitCost } : {}),
    }));
}
