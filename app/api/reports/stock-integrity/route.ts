import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

const EPSILON = 0.0005;

function hasMismatch(left: number, right: number) {
  return Math.abs(left - right) > EPSILON;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const canView =
    session.user.isSuperAdmin ||
    session.user.permissions.includes('material.view') ||
    session.user.permissions.includes('transaction.stock_in') ||
    session.user.permissions.includes('transaction.stock_out');

  if (!canView) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;

  try {
    const [materials, warehouseStocks, openBatches] = await Promise.all([
      prisma.material.findMany({
        where: { companyId, isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          unit: true,
          currentStock: true,
          isActive: true,
        },
      }),
      prisma.materialWarehouseStock.findMany({
        where: { companyId },
        select: {
          materialId: true,
          warehouseId: true,
          currentStock: true,
          warehouse: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      }),
      prisma.stockBatch.findMany({
        where: {
          companyId,
          quantityAvailable: { not: 0 },
        },
        select: {
          materialId: true,
          warehouseId: true,
          quantityAvailable: true,
          batchNumber: true,
          warehouse: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      }),
    ]);

    const warehouseTotalsByMaterial = new Map<string, number>();
    const warehouseCountsByMaterial = new Map<string, Set<string>>();
    const inactiveWarehouseQtyByMaterial = new Map<string, number>();

    for (const stock of warehouseStocks) {
      const quantity = decimalToNumberOrZero(stock.currentStock);
      warehouseTotalsByMaterial.set(
        stock.materialId,
        (warehouseTotalsByMaterial.get(stock.materialId) ?? 0) + quantity
      );
      const warehouseIds = warehouseCountsByMaterial.get(stock.materialId) ?? new Set<string>();
      warehouseIds.add(stock.warehouseId);
      warehouseCountsByMaterial.set(stock.materialId, warehouseIds);
      if (!stock.warehouse.isActive && Math.abs(quantity) > EPSILON) {
        inactiveWarehouseQtyByMaterial.set(
          stock.materialId,
          (inactiveWarehouseQtyByMaterial.get(stock.materialId) ?? 0) + quantity
        );
      }
    }

    const batchTotalsByMaterial = new Map<string, number>();
    const batchCountsByMaterial = new Map<string, number>();
    const batchWarehouseCountsByMaterial = new Map<string, Set<string>>();
    const batchlessWarehouseQtyByMaterial = new Map<string, number>();
    const inactiveBatchWarehouseQtyByMaterial = new Map<string, number>();

    for (const batch of openBatches) {
      const quantity = decimalToNumberOrZero(batch.quantityAvailable);
      batchTotalsByMaterial.set(
        batch.materialId,
        (batchTotalsByMaterial.get(batch.materialId) ?? 0) + quantity
      );
      batchCountsByMaterial.set(batch.materialId, (batchCountsByMaterial.get(batch.materialId) ?? 0) + 1);
      if (batch.warehouseId) {
        const batchWarehouseIds = batchWarehouseCountsByMaterial.get(batch.materialId) ?? new Set<string>();
        batchWarehouseIds.add(batch.warehouseId);
        batchWarehouseCountsByMaterial.set(batch.materialId, batchWarehouseIds);
        if (!batch.warehouse?.isActive && Math.abs(quantity) > EPSILON) {
          inactiveBatchWarehouseQtyByMaterial.set(
            batch.materialId,
            (inactiveBatchWarehouseQtyByMaterial.get(batch.materialId) ?? 0) + quantity
          );
        }
      }
    }

    for (const stock of warehouseStocks) {
      const quantity = decimalToNumberOrZero(stock.currentStock);
      if (Math.abs(quantity) <= EPSILON) continue;
      const batchWarehouseIds = batchWarehouseCountsByMaterial.get(stock.materialId);
      const hasBatchPresenceInWarehouse = batchWarehouseIds?.has(stock.warehouseId) ?? false;
      if (!hasBatchPresenceInWarehouse) {
        batchlessWarehouseQtyByMaterial.set(
          stock.materialId,
          (batchlessWarehouseQtyByMaterial.get(stock.materialId) ?? 0) + quantity
        );
      }
    }

    const rows = materials
      .map((material) => {
        const companyTotal = decimalToNumberOrZero(material.currentStock);
        const warehouseTotal = warehouseTotalsByMaterial.get(material.id) ?? 0;
        const batchTotal = batchTotalsByMaterial.get(material.id) ?? 0;
        const inactiveWarehouseQty = inactiveWarehouseQtyByMaterial.get(material.id) ?? 0;
        const batchlessWarehouseQty = batchlessWarehouseQtyByMaterial.get(material.id) ?? 0;
        const inactiveBatchWarehouseQty = inactiveBatchWarehouseQtyByMaterial.get(material.id) ?? 0;

        const exceptions: string[] = [];
        if (companyTotal < -EPSILON) exceptions.push('negative_company_stock');
        if (warehouseTotal < -EPSILON) exceptions.push('negative_warehouse_stock');
        if (batchTotal < -EPSILON) exceptions.push('negative_batch_stock');
        if (hasMismatch(companyTotal, warehouseTotal)) exceptions.push('warehouse_mismatch');
        if (hasMismatch(companyTotal, batchTotal)) exceptions.push('batch_mismatch');
        if (Math.abs(batchlessWarehouseQty) > EPSILON) exceptions.push('batchless_stock');
        if (Math.abs(inactiveWarehouseQty) > EPSILON) exceptions.push('inactive_warehouse_stock');
        if (Math.abs(inactiveBatchWarehouseQty) > EPSILON) exceptions.push('inactive_batch_stock');

        return {
          materialId: material.id,
          materialName: material.name,
          unit: material.unit,
          companyTotal,
          warehouseTotal,
          batchTotal,
          warehouseDelta: companyTotal - warehouseTotal,
          batchDelta: companyTotal - batchTotal,
          warehouseCount: warehouseCountsByMaterial.get(material.id)?.size ?? 0,
          openBatchCount: batchCountsByMaterial.get(material.id) ?? 0,
          inactiveWarehouseQty,
          batchlessWarehouseQty,
          inactiveBatchWarehouseQty,
          exceptions,
        };
      })
      .filter((row) =>
        Math.abs(row.companyTotal) > EPSILON ||
        Math.abs(row.warehouseTotal) > EPSILON ||
        Math.abs(row.batchTotal) > EPSILON ||
        row.exceptions.length > 0
      );

    const summary = {
      totalMaterials: rows.length,
      materialsWithExceptions: rows.filter((row) => row.exceptions.length > 0).length,
      warehouseMismatchCount: rows.filter((row) => row.exceptions.includes('warehouse_mismatch')).length,
      batchMismatchCount: rows.filter((row) => row.exceptions.includes('batch_mismatch')).length,
      batchlessStockCount: rows.filter((row) => row.exceptions.includes('batchless_stock')).length,
      inactiveWarehouseStockCount: rows.filter((row) => row.exceptions.includes('inactive_warehouse_stock')).length,
      negativeStockCount: rows.filter(
        (row) =>
          row.exceptions.includes('negative_company_stock') ||
          row.exceptions.includes('negative_warehouse_stock') ||
          row.exceptions.includes('negative_batch_stock')
      ).length,
    };

    return successResponse({
      summary,
      rows,
    });
  } catch (error) {
    console.error('[stock-integrity]', error);
    return errorResponse('Failed to load stock integrity report', 500);
  }
}
