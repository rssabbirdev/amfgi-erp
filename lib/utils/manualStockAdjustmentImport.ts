export type ManualAdjustmentImportReference = {
  id: string;
  name: string;
};

export type ManualAdjustmentImportDraftLine = {
  materialId: string;
  warehouseId: string;
  quantityDelta: string;
  unitCost: string;
};

export type ManualAdjustmentImportError = {
  rowNumber: number;
  values: string[];
  message: string;
};

const HEADER_ALIASES: Record<string, 'material' | 'warehouse' | 'quantityDelta' | 'unitCost'> = {
  material: 'material',
  materialname: 'material',
  itemname: 'material',
  materialid: 'material',
  warehouse: 'warehouse',
  warehousename: 'warehouse',
  warehouseid: 'warehouse',
  qty: 'quantityDelta',
  qtydelta: 'quantityDelta',
  quantity: 'quantityDelta',
  quantitydelta: 'quantityDelta',
  delta: 'quantityDelta',
  adjustmentqty: 'quantityDelta',
  unitcost: 'unitCost',
  cost: 'unitCost',
  rate: 'unitCost',
};

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function parseNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function splitDelimitedLine(line: string, delimiter: string) {
  return line
    .split(delimiter)
    .map((part) => part.trim());
}

export function parseManualStockAdjustmentText(text: string) {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) {
    return { headers: [] as string[], rows: [] as string[][] };
  }

  const delimiter = rawLines.some((line) => line.includes('\t'))
    ? '\t'
    : rawLines.some((line) => line.includes(','))
      ? ','
      : null;

  if (!delimiter) {
    return { headers: [] as string[], rows: [] as string[][] };
  }

  const parsedRows = rawLines.map((line) => splitDelimitedLine(line, delimiter));
  return {
    headers: parsedRows[0] ?? [],
    rows: parsedRows.slice(1),
  };
}

export function mapManualStockAdjustmentImportRows(args: {
  headers: string[];
  rows: string[][];
  materials: ManualAdjustmentImportReference[];
  warehouses: ManualAdjustmentImportReference[];
}) {
  const materialById = new Map(args.materials.map((item) => [item.id, item]));
  const materialByName = new Map(args.materials.map((item) => [normalizeName(item.name), item]));
  const warehouseById = new Map(args.warehouses.map((item) => [item.id, item]));
  const warehouseByName = new Map(args.warehouses.map((item) => [normalizeName(item.name), item]));

  const mappedColumns = args.headers.map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? null);
  const resolvedLines: ManualAdjustmentImportDraftLine[] = [];
  const errors: ManualAdjustmentImportError[] = [];

  args.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const values = args.headers.map((_, columnIndex) => String(row[columnIndex] ?? '').trim());

    if (values.every((value) => value.length === 0)) {
      return;
    }

    let materialValue = '';
    let warehouseValue = '';
    let quantityValue = '';
    let unitCostValue = '';

    mappedColumns.forEach((mappedColumn, columnIndex) => {
      const value = values[columnIndex] ?? '';
      if (!mappedColumn || !value) return;
      if (mappedColumn === 'material' && !materialValue) materialValue = value;
      if (mappedColumn === 'warehouse' && !warehouseValue) warehouseValue = value;
      if (mappedColumn === 'quantityDelta' && !quantityValue) quantityValue = value;
      if (mappedColumn === 'unitCost' && !unitCostValue) unitCostValue = value;
    });

    if (!materialValue || !warehouseValue || !quantityValue) {
      errors.push({
        rowNumber,
        values,
        message: 'Material, warehouse, and quantity are required.',
      });
      return;
    }

    const material =
      materialById.get(materialValue) ?? materialByName.get(normalizeName(materialValue)) ?? null;
    if (!material) {
      errors.push({
        rowNumber,
        values,
        message: `Material not found: ${materialValue}`,
      });
      return;
    }

    const warehouse =
      warehouseById.get(warehouseValue) ?? warehouseByName.get(normalizeName(warehouseValue)) ?? null;
    if (!warehouse) {
      errors.push({
        rowNumber,
        values,
        message: `Warehouse not found: ${warehouseValue}`,
      });
      return;
    }

    const quantity = parseNumber(quantityValue);
    if (quantity == null || Math.abs(quantity) < 0.001) {
      errors.push({
        rowNumber,
        values,
        message: `Invalid quantity delta: ${quantityValue}`,
      });
      return;
    }

    if (unitCostValue) {
      const unitCost = parseNumber(unitCostValue);
      if (unitCost == null || unitCost < 0) {
        errors.push({
          rowNumber,
          values,
          message: `Invalid unit cost: ${unitCostValue}`,
        });
        return;
      }
    }

    resolvedLines.push({
      materialId: material.id,
      warehouseId: warehouse.id,
      quantityDelta: quantityValue,
      unitCost: unitCostValue,
    });
  });

  return {
    lines: resolvedLines,
    errors,
    mappedColumns,
  };
}
