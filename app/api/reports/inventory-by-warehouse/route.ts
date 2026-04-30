import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

type InventoryByWarehouseRow = {
  materialId: string;
  materialName: string;
  unit: string;
  companyTotal: number;
  splitTotal: number;
  qtyByWarehouseId: Record<string, number>;
};

type InventoryByWarehouseWarehouseCol = {
  id: string;
  name: string;
};

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
    const [activeWarehouses, snapshotRows, materials] = await Promise.all([
      prisma.warehouse.findMany({
        where: { companyId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.materialWarehouseStock.findMany({
        where: { companyId },
        select: {
          materialId: true,
          warehouseId: true,
          currentStock: true,
          warehouse: { select: { id: true, name: true, isActive: true } },
        },
      }),
      prisma.material.findMany({
        where: { companyId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, unit: true, currentStock: true },
      }),
    ]);

    const activeIds = new Set(activeWarehouses.map((w) => w.id));
    const qtyByMaterialWarehouse = new Map<string, Map<string, number>>();
    const inactiveWarehouseCols = new Map<string, InventoryByWarehouseWarehouseCol>();

    for (const s of snapshotRows) {
      const qty = decimalToNumberOrZero(s.currentStock);
      if (qty === 0) continue;
      let inner = qtyByMaterialWarehouse.get(s.materialId);
      if (!inner) {
        inner = new Map();
        qtyByMaterialWarehouse.set(s.materialId, inner);
      }
      inner.set(s.warehouseId, (inner.get(s.warehouseId) ?? 0) + qty);
      if (!activeIds.has(s.warehouseId) && s.warehouse) {
        inactiveWarehouseCols.set(s.warehouseId, {
          id: s.warehouseId,
          name: `${s.warehouse.name} (inactive)`,
        });
      }
    }

    const warehouseColumns: InventoryByWarehouseWarehouseCol[] = [
      ...activeWarehouses.map((w) => ({ id: w.id, name: w.name })),
      ...[...inactiveWarehouseCols.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ];

    const rows: InventoryByWarehouseRow[] = materials
      .map((mat) => {
        const wh = qtyByMaterialWarehouse.get(mat.id);
        const qtyByWarehouseId: Record<string, number> = {};
        let splitTotal = 0;
        if (wh) {
          for (const [wid, q] of wh) {
            qtyByWarehouseId[wid] = q;
            splitTotal += q;
          }
        }
        const companyTotal = decimalToNumberOrZero(mat.currentStock);
        return {
          materialId: mat.id,
          materialName: mat.name,
          unit: mat.unit,
          companyTotal,
          splitTotal,
          qtyByWarehouseId,
        };
      })
      .filter((r) => r.companyTotal > 0 || r.splitTotal > 0);

    return successResponse({ warehouseColumns, rows });
  } catch (e) {
    console.error('[inventory-by-warehouse]', e);
    return errorResponse('Failed to load inventory by warehouse', 500);
  }
}
