import type { Prisma, PrismaClient } from '@prisma/client';
import { decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';
import type { BulkImportResult } from '@/lib/import-export/types';

export const MATERIAL_BULK_IMPORT_MAX_ROWS = 50;

export type MaterialImportRow = {
  id?: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
  categoryId?: string;
  warehouse?: string;
  warehouseId?: string;
  stockType: string;
  allowNegativeConsumption?: boolean;
  assemblyUseDynamicCost?: boolean;
  externalItemName?: string;
  unitCost?: number;
  reorderLevel?: number;
  currentStock?: number;
};

type Tx = PrismaClient | Prisma.TransactionClient;

type RefResolution = {
  categoryId: string | null;
  categoryName: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
};

type ImportContext = {
  unitByName: Map<string, { id: string; name: string }>;
  categoryById: Map<string, { id: string; name: string; isActive: boolean }>;
  categoryByName: Map<string, { id: string; name: string; isActive: boolean }>;
  warehouseById: Map<string, { id: string; name: string }>;
  warehouseByName: Map<string, { id: string; name: string }>;
};

async function buildImportContext(prisma: PrismaClient, companyId: string): Promise<ImportContext> {
  const [units, categories, warehouses] = await Promise.all([
    prisma.unit.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.category.findMany({
      where: { companyId },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.warehouse.findMany({
      where: { companyId },
      select: { id: true, name: true },
    }),
  ]);

  return {
    unitByName: new Map(units.map((unit) => [unit.name.toLowerCase(), unit])),
    categoryById: new Map(categories.map((category) => [category.id, category])),
    categoryByName: new Map(categories.map((category) => [category.name.toLowerCase(), category])),
    warehouseById: new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    warehouseByName: new Map(warehouses.map((warehouse) => [warehouse.name.toLowerCase(), warehouse])),
  };
}

async function resolveCategoryRef(
  tx: Tx,
  ctx: ImportContext,
  companyId: string,
  input?: { id?: string; name?: string }
): Promise<Pick<RefResolution, 'categoryId' | 'categoryName'>> {
  const id = input?.id?.trim();
  const name = input?.name?.trim();

  if (id) {
    const cached = ctx.categoryById.get(id);
    if (cached) {
      if (!cached.isActive) {
        await tx.category.update({ where: { id: cached.id }, data: { isActive: true } });
        cached.isActive = true;
      }
      return { categoryId: cached.id, categoryName: cached.name };
    }
  }

  if (name) {
    const cached = ctx.categoryByName.get(name.toLowerCase());
    if (cached) {
      if (!cached.isActive) {
        await tx.category.update({ where: { id: cached.id }, data: { isActive: true } });
        cached.isActive = true;
      }
      return { categoryId: cached.id, categoryName: cached.name };
    }

    const created = await tx.category.upsert({
      where: { companyId_name: { companyId, name } },
      update: { isActive: true },
      create: { companyId, name, isActive: true },
      select: { id: true, name: true, isActive: true },
    });
    ctx.categoryById.set(created.id, created);
    ctx.categoryByName.set(created.name.toLowerCase(), created);
    return { categoryId: created.id, categoryName: created.name };
  }

  return { categoryId: null, categoryName: null };
}

function resolveWarehouseRef(
  ctx: ImportContext,
  input?: { id?: string; name?: string }
): Pick<RefResolution, 'warehouseId' | 'warehouseName'> {
  const id = input?.id?.trim();
  const name = input?.name?.trim();

  if (id) {
    const warehouse = ctx.warehouseById.get(id);
    if (!warehouse) throw new Error(`Warehouse not found for ID: ${id}`);
    return { warehouseId: warehouse.id, warehouseName: warehouse.name };
  }

  if (name) {
    const warehouse = ctx.warehouseByName.get(name.toLowerCase());
    if (!warehouse) throw new Error(`Warehouse not found: ${name}`);
    return { warehouseId: warehouse.id, warehouseName: warehouse.name };
  }

  return { warehouseId: null, warehouseName: null };
}

async function createMaterialRow(
  tx: Tx,
  ctx: ImportContext,
  companyId: string,
  row: MaterialImportRow
) {
  const categoryRef = await resolveCategoryRef(tx, ctx, companyId, {
    id: row.categoryId,
    name: row.category,
  });
  const warehouseRef = resolveWarehouseRef(ctx, {
    id: row.warehouseId,
    name: row.warehouse,
  });

  const material = await tx.material.create({
    data: {
      name: row.name.trim(),
      description: row.description?.trim() || null,
      unit: row.unit.trim(),
      category: categoryRef.categoryName,
      categoryId: categoryRef.categoryId,
      warehouse: warehouseRef.warehouseName,
      warehouseId: warehouseRef.warehouseId,
      stockType: row.stockType.trim(),
      allowNegativeConsumption: row.allowNegativeConsumption ?? false,
      assemblyUseDynamicCost: row.assemblyUseDynamicCost ?? true,
      externalItemName: row.externalItemName?.trim() || null,
      unitCost: decimalToNumber(row.unitCost) ?? null,
      reorderLevel: decimalToNumber(row.reorderLevel) ?? null,
      currentStock: decimalToNumber(row.currentStock) ?? 0,
      companyId,
      isActive: true,
    },
  });

  const unitRow = ctx.unitByName.get(row.unit.trim().toLowerCase());
  if (unitRow) {
    await tx.materialUom.create({
      data: {
        companyId,
        materialId: material.id,
        unitId: unitRow.id,
        isBase: true,
        parentUomId: null,
        factorToParent: 1,
      },
    });
  }

  const openingStock = decimalToNumberOrZero(row.currentStock);
  if (openingStock > 0 && warehouseRef.warehouseId) {
    await applyMaterialWarehouseDelta(tx, companyId, material.id, warehouseRef.warehouseId, openingStock);

    const unitCost = decimalToNumberOrZero(row.unitCost);
    await tx.stockBatch.create({
      data: {
        materialId: material.id,
        companyId,
        warehouseId: warehouseRef.warehouseId,
        batchNumber: `BLK-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        quantityReceived: openingStock,
        quantityAvailable: openingStock,
        unitCost,
        totalCost: openingStock * unitCost,
        supplier: 'Bulk Import',
        receiptNumber: null,
        receivedDate: new Date(),
        expiryDate: null,
        notes: 'Created from bulk import',
      },
    });
  }
}

async function updateMaterialRow(
  tx: Tx,
  ctx: ImportContext,
  companyId: string,
  materialId: string,
  row: MaterialImportRow
) {
  const categoryRef = await resolveCategoryRef(tx, ctx, companyId, {
    id: row.categoryId,
    name: row.category,
  });
  const warehouseRef = resolveWarehouseRef(ctx, {
    id: row.warehouseId,
    name: row.warehouse,
  });

  await tx.material.update({
    where: { id: materialId },
    data: {
      description: row.description?.trim() || null,
      unit: row.unit.trim(),
      category: categoryRef.categoryName,
      categoryId: categoryRef.categoryId,
      warehouse: warehouseRef.warehouseName,
      warehouseId: warehouseRef.warehouseId,
      stockType: row.stockType.trim(),
      allowNegativeConsumption: row.allowNegativeConsumption ?? false,
      ...(row.assemblyUseDynamicCost !== undefined
        ? { assemblyUseDynamicCost: row.assemblyUseDynamicCost }
        : {}),
      externalItemName: row.externalItemName?.trim() || null,
      unitCost: decimalToNumber(row.unitCost) ?? null,
      reorderLevel: decimalToNumber(row.reorderLevel) ?? null,
    },
  });

  const unitRow = ctx.unitByName.get(row.unit.trim().toLowerCase());
  if (!unitRow) return;

  const base = await tx.materialUom.findFirst({
    where: { materialId, isBase: true },
  });

  if (base) {
    const taken = await tx.materialUom.findFirst({
      where: {
        materialId,
        unitId: unitRow.id,
        NOT: { id: base.id },
      },
    });

    if (!taken) {
      await tx.materialUom.update({
        where: { id: base.id },
        data: { unitId: unitRow.id },
      });
    }
    return;
  }

  await tx.materialUom.create({
    data: {
      companyId,
      materialId,
      unitId: unitRow.id,
      isBase: true,
      parentUomId: null,
      factorToParent: 1,
    },
  });
}

export async function runMaterialBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    newRows: MaterialImportRow[];
    updateRows: MaterialImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, newRows, updateRows } = opts;
  const totalRows = newRows.length + updateRows.length;
  if (totalRows > MATERIAL_BULK_IMPORT_MAX_ROWS) {
    throw new Error(
      `Import batch too large (${totalRows} rows). Maximum ${MATERIAL_BULK_IMPORT_MAX_ROWS} rows per request.`
    );
  }

  let created = 0;
  let updated = 0;

  if (newRows.length > 0) {
    const newRowNameCounts = new Map<string, number>();
    for (const row of newRows) {
      const normalizedName = row.name.trim().toLowerCase();
      newRowNameCounts.set(normalizedName, (newRowNameCounts.get(normalizedName) ?? 0) + 1);
    }

    const duplicateImportNames = [...newRowNameCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
    if (duplicateImportNames.length > 0) {
      throw new Error(`Duplicate material names in import file: ${duplicateImportNames.join(', ')}`);
    }

    const uniqueNewNames = [...new Set(newRows.map((row) => row.name.trim()))];
    const existingConflicts = await prisma.material.findMany({
      where: {
        companyId,
        OR: uniqueNewNames.map((name) => ({
          name: { equals: name, mode: 'insensitive' as const },
        })),
      },
      select: { name: true },
    });

    if (existingConflicts.length > 0) {
      throw new Error(
        `Material already exists: ${existingConflicts.map((material) => material.name).join(', ')}`
      );
    }

    const ctx = await buildImportContext(prisma, companyId);
    await prisma.$transaction(async (tx) => {
      for (const row of newRows) {
        await createMaterialRow(tx, ctx, companyId, row);
      }
    });
    created = newRows.length;
  }

  if (updateRows.length > 0) {
    const existingMaterials = await prisma.material.findMany({
      where: {
        companyId,
        OR: updateRows.map((row) =>
          row.id?.trim() ? { id: row.id.trim() } : { name: row.name.trim() }
        ),
      },
      select: { id: true, name: true },
    });

    const nameToIdMap = new Map(
      existingMaterials.map((material) => [material.name.toLowerCase(), material.id])
    );
    const idLookup = new Set(existingMaterials.map((material) => material.id));

    const ctx = await buildImportContext(prisma, companyId);
    await prisma.$transaction(async (tx) => {
      for (const row of updateRows) {
        const resolvedMaterialId =
          (row.id?.trim() && idLookup.has(row.id.trim()) ? row.id.trim() : null) ??
          nameToIdMap.get(row.name.trim().toLowerCase());

        if (!resolvedMaterialId) continue;

        await updateMaterialRow(tx, ctx, companyId, resolvedMaterialId, row);
        updated++;
      }
    });
  }

  return { created, updated, skipped: 0, warnings: [] };
}
