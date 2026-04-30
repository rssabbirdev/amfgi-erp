import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  findWarehouseRef,
  resolveCategoryRef,
} from '@/lib/materialMasterData';
import { decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { applyMaterialWarehouseDelta } from '@/lib/warehouses/stockWarehouses';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { z } from 'zod';

const MaterialRowSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  unit: z.string().min(1).max(20),
  category: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  warehouse: z.string().max(100).optional(),
  warehouseId: z.string().max(100).optional(),
  stockType: z.string().min(1).max(50),
  allowNegativeConsumption: z.boolean().optional(),
  externalItemName: z.string().max(100).optional(),
  unitCost: z.number().finite().min(0).optional(),
  reorderLevel: z.number().finite().min(0).optional(),
  currentStock: z.number().finite().min(0).optional(),
});

const BulkSchema = z.object({
  newRows: z.array(MaterialRowSchema),
  updateRows: z.array(MaterialRowSchema),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.create')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  }

  const { newRows, updateRows } = parsed.data;
  const companyId = session.user.activeCompanyId;

  try {
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
        return errorResponse(
          `Duplicate material names in import file: ${duplicateImportNames.join(', ')}`,
          409
        );
      }

      const uniqueNewNames = [...new Set(newRows.map((row) => row.name.trim()))];
      const existingConflicts = await prisma.material.findMany({
        where: {
          companyId,
          OR: uniqueNewNames.map((name) => ({
            name: {
              equals: name,
              mode: 'insensitive',
            },
          })),
        },
        select: { name: true },
      });

      if (existingConflicts.length > 0) {
        return errorResponse(
          `Material already exists: ${existingConflicts.map((material) => material.name).join(', ')}`,
          409
        );
      }

      for (const row of newRows) {
        await prisma.$transaction(async (tx) => {
          const categoryRef = await resolveCategoryRef(tx, companyId, {
            id: row.categoryId,
            name: row.category,
          });
          const warehouseRef = await findWarehouseRef(tx, companyId, {
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
              externalItemName: row.externalItemName?.trim() || null,
              unitCost: decimalToNumber(row.unitCost) ?? null,
              reorderLevel: decimalToNumber(row.reorderLevel) ?? null,
              currentStock: decimalToNumber(row.currentStock) ?? 0,
              companyId,
              isActive: true,
            },
          });

          const unitRow = await tx.unit.findUnique({
            where: {
              companyId_name: {
                companyId,
                name: row.unit.trim(),
              },
            },
          });

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
            await applyMaterialWarehouseDelta(
              tx,
              companyId,
              material.id,
              warehouseRef.warehouseId,
              openingStock
            );

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
        });
      }

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

      const nameToIdMap = new Map(existingMaterials.map((material) => [material.name.toLowerCase(), material.id]));
      const idLookup = new Set(existingMaterials.map((material) => material.id));

      for (const row of updateRows) {
        await prisma.$transaction(async (tx) => {
          const resolvedMaterialId =
            (row.id?.trim() && idLookup.has(row.id.trim()) ? row.id.trim() : null) ??
            nameToIdMap.get(row.name.trim().toLowerCase());

          if (!resolvedMaterialId) return;

          const categoryRef = await resolveCategoryRef(tx, companyId, {
            id: row.categoryId,
            name: row.category,
          });
          const warehouseRef = await findWarehouseRef(tx, companyId, {
            id: row.warehouseId,
            name: row.warehouse,
          });

          await tx.material.update({
            where: { id: resolvedMaterialId },
            data: {
              description: row.description?.trim() || null,
              unit: row.unit.trim(),
              category: categoryRef.categoryName,
              categoryId: categoryRef.categoryId,
              warehouse: warehouseRef.warehouseName,
              warehouseId: warehouseRef.warehouseId,
              stockType: row.stockType.trim(),
              allowNegativeConsumption: row.allowNegativeConsumption ?? false,
              externalItemName: row.externalItemName?.trim() || null,
              unitCost: decimalToNumber(row.unitCost) ?? null,
              reorderLevel: decimalToNumber(row.reorderLevel) ?? null,
            },
          });

          const unitRow = await tx.unit.findUnique({
            where: {
              companyId_name: {
                companyId,
                name: row.unit.trim(),
              },
            },
          });

          if (unitRow) {
            const base = await tx.materialUom.findFirst({
              where: { materialId: resolvedMaterialId, isBase: true },
            });

            if (base) {
              const taken = await tx.materialUom.findFirst({
                where: {
                  materialId: resolvedMaterialId,
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
            } else {
              await tx.materialUom.create({
                data: {
                  companyId,
                  materialId: resolvedMaterialId,
                  unitId: unitRow.id,
                  isBase: true,
                  parentUomId: null,
                  factorToParent: 1,
                },
              });
            }
          }

          updated++;
        });
      }
    }

    if (created > 0 || updated > 0) {
      publishLiveUpdate({
        companyId,
        channel: 'stock',
        entity: 'material',
        action: created > 0 && updated > 0 ? 'changed' : created > 0 ? 'created' : 'updated',
      });
    }

    return successResponse({ created, updated });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Bulk operation failed', 400);
  }
}
