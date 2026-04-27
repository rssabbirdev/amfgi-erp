import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { ensureCategoryRef, ensureWarehouseRef } from '@/lib/materialMasterData';
import { z } from 'zod';

const MaterialRowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  unit: z.string().min(1).max(20),
  category: z.string().max(100).optional(),
  warehouse: z.string().max(100).optional(),
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

    // ──────────── CREATE NEW ROWS (with StockBatch for opening stock) ────────────
    if (newRows.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const row of newRows) {
          const categoryRef = await ensureCategoryRef(tx, companyId, row.category);
          const warehouseRef = await ensureWarehouseRef(tx, companyId, row.warehouse);

          await tx.material.create({
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
        }
      });

      // Create StockBatch records for rows with opening stock
      // Fetch the created materials to get their IDs
      const createdMaterialsList = await prisma.material.findMany({
        where: {
          companyId,
          name: { in: newRows.map((r) => r.name.trim()) },
        },
        select: { id: true, name: true },
      });

      const nameToIdMap = new Map(createdMaterialsList.map((m) => [m.name.toLowerCase(), m.id]));

      const stockBatchesToCreate = newRows
        .filter((row) => decimalToNumberOrZero(row.currentStock) > 0)
        .map((row) => {
          const materialId = nameToIdMap.get(row.name.trim().toLowerCase());
          if (!materialId) return null;
          const quantity = decimalToNumberOrZero(row.currentStock);
          const unitCost = decimalToNumberOrZero(row.unitCost);
          const totalCost = quantity * unitCost;
          const now = new Date();

          return {
            materialId,
            companyId,
            batchNumber: `BLK-${now.getTime()}-${Math.random().toString(36).substr(2, 9)}`,
            quantityReceived: quantity,
            quantityAvailable: quantity,
            unitCost,
            totalCost,
            supplier: 'Bulk Import',
            receiptNumber: null,
            receivedDate: now,
            expiryDate: null,
            notes: 'Created from bulk import',
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (stockBatchesToCreate.length > 0) {
        await prisma.stockBatch.createMany({
          data: stockBatchesToCreate,
        });
      }

      created = newRows.length;
    }

    // ──────────── UPDATE EXISTING ROWS (exclude currentStock) ────────────
    if (updateRows.length > 0) {
      // Get IDs of all matching materials by name
      const existingMaterials = await prisma.material.findMany({
        where: {
          companyId,
          name: { in: updateRows.map((r) => r.name.trim()) },
        },
        select: { id: true, name: true },
      });

      const nameToIdMap = new Map(existingMaterials.map((m) => [m.name.toLowerCase(), m.id]));

      // Update each row (NOTE: currentStock is NOT updated for duplicates)
      for (const row of updateRows) {
        const materialId = nameToIdMap.get(row.name.trim().toLowerCase());
        if (materialId) {
          const categoryRef = await ensureCategoryRef(prisma, companyId, row.category);
          const warehouseRef = await ensureWarehouseRef(prisma, companyId, row.warehouse);

          await prisma.material.update({
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
              externalItemName: row.externalItemName?.trim() || null,
              unitCost: decimalToNumber(row.unitCost) ?? null,
              reorderLevel: decimalToNumber(row.reorderLevel) ?? null,
              // NOTE: currentStock is intentionally excluded - opening stock is not updated for duplicates
            },
          });
          updated++;
        }
      }
    }

    return successResponse({ created, updated });
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Bulk operation failed', 400);
  }
}
