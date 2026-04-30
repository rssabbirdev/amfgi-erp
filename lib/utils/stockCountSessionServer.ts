import { decimalToNumberOrZero } from '@/lib/utils/decimal';

type SessionLineInput = {
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId: string;
  systemQty: number;
  countedQty?: number | null;
  varianceQty: number;
  unitCost: number;
  sortOrder: number;
};

export function buildStockCountSessionSnapshot(args: {
  title: string;
  warehouseId: string;
  evidenceReference?: string | null;
  evidenceNotes?: string | null;
  notes?: string | null;
  status: string;
  lines: SessionLineInput[];
}) {
  return {
    title: args.title,
    warehouseId: args.warehouseId,
    evidenceReference: args.evidenceReference ?? null,
    evidenceNotes: args.evidenceNotes ?? null,
    notes: args.notes ?? null,
    status: args.status,
    lines: args.lines.map((line) => ({
      materialId: line.materialId,
      materialName: line.materialName,
      unit: line.unit,
      warehouseId: line.warehouseId,
      systemQty: line.systemQty,
      countedQty: line.countedQty ?? null,
      varianceQty: line.varianceQty,
      unitCost: line.unitCost,
      sortOrder: line.sortOrder,
    })),
  };
}

export function mapStockCountSessionLine(line: {
  id: string;
  materialId: string;
  materialName: string;
  unit: string;
  warehouseId: string;
  systemQty: unknown;
  countedQty: unknown;
  varianceQty: unknown;
  unitCost: unknown;
  sortOrder: number;
}) {
  return {
    id: line.id,
    materialId: line.materialId,
    materialName: line.materialName,
    unit: line.unit,
    warehouseId: line.warehouseId,
    systemQty: decimalToNumberOrZero(line.systemQty),
    countedQty: line.countedQty == null ? null : decimalToNumberOrZero(line.countedQty),
    varianceQty: decimalToNumberOrZero(line.varianceQty),
    unitCost: decimalToNumberOrZero(line.unitCost),
    sortOrder: line.sortOrder,
  };
}
