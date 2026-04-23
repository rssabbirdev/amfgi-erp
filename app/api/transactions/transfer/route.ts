/**
 * Inter-company transfer endpoint.
 * Deducts source stock using FIFO batches and recreates inbound batches in the destination company.
 */
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { resolveQuantityToBase } from '@/lib/utils/materialUomDb';
import { createBatchData } from '@/lib/utils/stockBatchManagement';
import { z } from 'zod';

const TransferSchema = z.object({
  sourceCompanyId: z.string().optional(),
  destinationCompanyId: z.string().min(1),
  destinationWarehouse: z.string().max(100).optional(),
  materialId: z.string().min(1),
  quantity: z.number().min(0.001),
  quantityUomId: z.string().optional(),
  notes: z.string().max(20000).optional(),
  date: z.string().optional(),
});

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function ensureCategory(tx: Tx, companyId: string, categoryName?: string | null) {
  const name = categoryName?.trim();
  if (!name) return null;
  return tx.category.upsert({
    where: { companyId_name: { companyId, name } },
    update: { isActive: true },
    create: { companyId, name, isActive: true },
  });
}

async function getWarehouseNameIfExists(tx: Tx, companyId: string, warehouseName?: string | null) {
  const name = warehouseName?.trim();
  if (!name) return null;
  const warehouse = await tx.warehouse.findFirst({
    where: {
      companyId,
      name,
      isActive: true,
    },
    select: { name: true },
  });
  return warehouse?.name ?? null;
}

async function ensureUnit(tx: Tx, companyId: string, unitName: string) {
  const name = unitName.trim();
  return tx.unit.upsert({
    where: { companyId_name: { companyId, name } },
    update: { isActive: true },
    create: { companyId, name, isActive: true },
  });
}

async function syncMaterialUoms(
  tx: Tx,
  sourceMaterialId: string,
  destinationMaterialId: string,
  sourceCompanyId: string,
  destinationCompanyId: string
) {
  const sourceUoms = await tx.materialUom.findMany({
    where: { companyId: sourceCompanyId, materialId: sourceMaterialId },
    include: { unit: true },
    orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
  });

  if (sourceUoms.length === 0) return;

  const destinationUoms = await tx.materialUom.findMany({
    where: { companyId: destinationCompanyId, materialId: destinationMaterialId },
  });

  const byUnitId = new Map(destinationUoms.map((row) => [row.unitId, row]));
  const createdIdMap = new Map<string, string>();

  for (const sourceUom of sourceUoms) {
    const destUnit = await ensureUnit(tx, destinationCompanyId, sourceUom.unit.name);
    const existing = byUnitId.get(destUnit.id);

    if (existing) {
      createdIdMap.set(sourceUom.id, existing.id);
      continue;
    }

    const parentDestId = sourceUom.parentUomId ? createdIdMap.get(sourceUom.parentUomId) ?? null : null;
    const created = await tx.materialUom.create({
      data: {
        companyId: destinationCompanyId,
        materialId: destinationMaterialId,
        unitId: destUnit.id,
        isBase: sourceUom.isBase,
        parentUomId: parentDestId,
        factorToParent: sourceUom.factorToParent,
      },
    });

    byUnitId.set(destUnit.id, created);
    createdIdMap.set(sourceUom.id, created.id);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = TransferSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const {
    sourceCompanyId,
    destinationCompanyId,
    destinationWarehouse,
    materialId,
    quantity,
    quantityUomId,
    notes,
    date,
  } = parsed.data;

  const txDate = date ? new Date(date) : new Date();
  const srcCompanyId = sourceCompanyId || session.user.activeCompanyId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const srcCompany = await tx.company.findUnique({ where: { id: srcCompanyId } });
      if (!srcCompany) throw new Error('Source company not found');

      const destCompany = await tx.company.findUnique({ where: { id: destinationCompanyId } });
      if (!destCompany) throw new Error('Destination company not found');
      if (!destCompany.isActive) throw new Error('Destination company is inactive');

      if (srcCompanyId === destinationCompanyId) {
        throw new Error('Source and destination cannot be the same');
      }

      const srcMaterial = await tx.material.findUnique({
        where: { id: materialId },
        include: {
          materialUoms: {
            include: { unit: true },
            orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
          },
        },
      });
      if (!srcMaterial) throw new Error('Material not found in source company');
      if (srcMaterial.companyId !== srcCompany.id) {
        throw new Error('Material does not belong to source company');
      }

      const qtyBase = await resolveQuantityToBase(tx, materialId, quantity, quantityUomId);
      if (srcMaterial.currentStock < qtyBase) {
        throw new Error(`Insufficient stock. Available: ${srcMaterial.currentStock} ${srcMaterial.unit}`);
      }

      let sourceBatches = await tx.stockBatch.findMany({
        where: {
          companyId: srcCompanyId,
          materialId,
          quantityAvailable: { gt: 0 },
        },
        orderBy: [{ receivedDate: 'asc' }, { createdAt: 'asc' }],
      });

      if (sourceBatches.length === 0 && srcMaterial.currentStock > 0) {
        const openingUnitCost = srcMaterial.unitCost ?? 0;
        sourceBatches = [
          await tx.stockBatch.create({
            data: {
              companyId: srcCompanyId,
              materialId,
              batchNumber: `OPENING-${materialId}-${Date.now()}`,
              quantityReceived: srcMaterial.currentStock,
              quantityAvailable: srcMaterial.currentStock,
              unitCost: openingUnitCost,
              totalCost: srcMaterial.currentStock * openingUnitCost,
              receivedDate: new Date('2020-01-01'),
              supplier: 'Opening Balance',
              notes: 'Auto-created opening balance for inter-company transfer',
            },
          }),
        ];
      }

      const fifoResult = calculateFIFOConsumption(
        sourceBatches.map((batch) => ({
          id: batch.id,
          batchNumber: batch.batchNumber,
          quantityAvailable: batch.quantityAvailable,
          unitCost: batch.unitCost,
          receivedDate: batch.receivedDate,
        })),
        qtyBase
      );

      if (fifoResult.batchesUsed.length === 0) {
        throw new Error(`Cannot fulfill ${qtyBase} ${srcMaterial.unit} of ${srcMaterial.name}`);
      }
      const consumedQty = fifoResult.batchesUsed.reduce((sum, batch) => sum + batch.quantityFromBatch, 0);
      if (consumedQty < qtyBase) {
        throw new Error(`Insufficient FIFO batches for ${srcMaterial.name}. Available in batches: ${consumedQty} ${srcMaterial.unit}`);
      }

      const requestedWarehouse = destinationWarehouse?.trim() || null;
      if (requestedWarehouse) {
        const selectedWarehouse = await getWarehouseNameIfExists(tx, destinationCompanyId, requestedWarehouse);
        if (!selectedWarehouse) {
          throw new Error(`Selected warehouse not found in destination company: ${requestedWarehouse}`);
        }
      }
      await ensureCategory(tx, destinationCompanyId, srcMaterial.category);
      await ensureUnit(tx, destinationCompanyId, srcMaterial.unit);

      let destMaterial = await tx.material.findFirst({
        where: {
          companyId: destinationCompanyId,
          name: srcMaterial.name,
        },
      });

      const inboundWarehouse =
        requestedWarehouse ??
        (await getWarehouseNameIfExists(tx, destinationCompanyId, destMaterial?.warehouse)) ??
        (await getWarehouseNameIfExists(tx, destinationCompanyId, srcMaterial.warehouse)) ??
        null;

      const previousPrice = destMaterial?.unitCost ?? 0;
      const nextPrice = fifoResult.averageCost || srcMaterial.unitCost || 0;

      if (!destMaterial) {
        destMaterial = await tx.material.create({
          data: {
            companyId: destinationCompanyId,
            name: srcMaterial.name,
            unit: srcMaterial.unit,
            description: srcMaterial.description,
            unitCost: nextPrice,
            category: srcMaterial.category,
            warehouse: inboundWarehouse,
            stockType: srcMaterial.stockType,
            allowNegativeConsumption: srcMaterial.allowNegativeConsumption,
            externalItemName: srcMaterial.externalItemName,
            currentStock: 0,
            reorderLevel: srcMaterial.reorderLevel,
            isActive: true,
          },
        });
      } else {
        destMaterial = await tx.material.update({
          where: { id: destMaterial.id },
          data: {
            description: srcMaterial.description,
            unit: srcMaterial.unit,
            category: srcMaterial.category,
            warehouse: inboundWarehouse ?? destMaterial.warehouse,
            stockType: srcMaterial.stockType,
            allowNegativeConsumption: srcMaterial.allowNegativeConsumption,
            externalItemName: srcMaterial.externalItemName,
            reorderLevel: srcMaterial.reorderLevel,
            unitCost: nextPrice,
            isActive: true,
          },
        });
      }

      await syncMaterialUoms(tx, srcMaterial.id, destMaterial.id, srcCompanyId, destinationCompanyId);

      const performedBy = session.user.id;
      const changedBy = session.user.name || session.user.email || session.user.id;

      const transferOutTxn = await tx.transaction.create({
        data: {
          companyId: srcCompanyId,
          type: 'TRANSFER_OUT',
          materialId,
          quantity: qtyBase,
          counterpartCompany: destCompany.slug,
          notes: notes || null,
          date: txDate,
          performedBy,
          totalCost: fifoResult.totalCost,
          averageCost: fifoResult.averageCost,
        },
      });

      for (const batchUsed of fifoResult.batchesUsed) {
        await tx.stockBatch.update({
          where: { id: String(batchUsed.batchId) },
          data: {
            quantityAvailable: {
              decrement: batchUsed.quantityFromBatch,
            },
          },
        });

        await tx.transactionBatch.create({
          data: {
            transactionId: transferOutTxn.id,
            batchId: String(batchUsed.batchId),
            batchNumber: batchUsed.batchNumber,
            quantityFromBatch: batchUsed.quantityFromBatch,
            unitCost: batchUsed.unitCost,
            costAmount: batchUsed.costAmount,
          },
        });
      }

      await tx.material.update({
        where: { id: materialId },
        data: {
          currentStock: {
            decrement: qtyBase,
          },
        },
      });

      await tx.material.update({
        where: { id: destMaterial.id },
        data: {
          currentStock: {
            increment: qtyBase,
          },
          unitCost: nextPrice,
        },
      });

      const transferInTxn = await tx.transaction.create({
        data: {
          companyId: destinationCompanyId,
          type: 'TRANSFER_IN',
          materialId: destMaterial.id,
          quantity: qtyBase,
          counterpartCompany: srcCompany.slug,
          notes: notes || null,
          date: txDate,
          performedBy,
          totalCost: fifoResult.totalCost,
          averageCost: fifoResult.averageCost,
        },
      });

      for (const batchUsed of fifoResult.batchesUsed) {
        const inboundBatch = await tx.stockBatch.create({
          data: {
            companyId: destinationCompanyId,
            ...createBatchData({
              materialId: destMaterial.id,
              quantity: batchUsed.quantityFromBatch,
              unitCost: batchUsed.unitCost,
              receivedDate: txDate,
              receiptNumber: `XFER-${transferOutTxn.id.slice(-8).toUpperCase()}`,
              notes: notes
                ? `Inter-company transfer from ${srcCompany.slug}: ${notes}`
                : `Inter-company transfer from ${srcCompany.slug}`,
            }),
          },
        });

        await tx.transactionBatch.create({
          data: {
            transactionId: transferInTxn.id,
            batchId: inboundBatch.id,
            batchNumber: inboundBatch.batchNumber,
            quantityFromBatch: batchUsed.quantityFromBatch,
            unitCost: batchUsed.unitCost,
            costAmount: batchUsed.costAmount,
          },
        });
      }

      if (previousPrice !== nextPrice) {
        await tx.priceLog.create({
          data: {
            companyId: destinationCompanyId,
            materialId: destMaterial.id,
            previousPrice,
            currentPrice: nextPrice,
            source: 'manual',
            changedBy,
            notes: notes
              ? `Inter-company transfer from ${srcCompany.slug}. ${notes}`
              : `Inter-company transfer from ${srcCompany.slug}`,
          },
        });
      }

      return {
        transferredQty: qtyBase,
        materialName: srcMaterial.name,
        sourceCompany: srcCompany.slug,
        destinationCompany: destCompany.slug,
        destMaterialId: destMaterial.id,
      };
    });

    return successResponse(result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transfer failed';
    return errorResponse(message, 400);
  }
}
