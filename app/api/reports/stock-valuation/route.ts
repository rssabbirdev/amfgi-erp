import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const companyId = session.user.activeCompanyId;

    // Get all active materials with current stock
    const materials = await prisma.material.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        unit: true,
        currentStock: true,
        unitCost: true,
      },
    });

    // Calculate total stock value
    const stockValuation = materials.reduce((sum, mat) => {
      const value = (mat.currentStock || 0) * (mat.unitCost || 0);
      return sum + value;
    }, 0);

    // Get previous month's consumption
    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Get STOCK_OUT transactions from previous month
    const prevMonthTransactions = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'STOCK_OUT',
        date: {
          gte: prevMonthStart,
          lte: prevMonthEnd,
        },
      },
      select: {
        materialId: true,
        quantity: true,
        material: {
          select: {
            name: true,
            unit: true,
            unitCost: true,
          },
        },
      },
    });

    // Group by material and calculate totals
    const consumptionByMaterial: Record<
      string,
      { totalQuantity: number; material: { name: string; unit: string; unitCost: number | null } }
    > = {};

    for (const txn of prevMonthTransactions) {
      if (!consumptionByMaterial[txn.materialId]) {
        consumptionByMaterial[txn.materialId] = {
          totalQuantity: 0,
          material: txn.material,
        };
      }
      consumptionByMaterial[txn.materialId].totalQuantity += txn.quantity;
    }

    const prevMonthConsumption = Object.entries(consumptionByMaterial)
      .map(([materialId, data]) => ({
        materialId,
        totalQuantity: data.totalQuantity,
        material: data.material,
        totalValue: data.totalQuantity * (data.material.unitCost || 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const prevMonthValue = prevMonthConsumption.reduce((sum, item) => sum + (item.totalValue || 0), 0);

    // Top 30 materials by valuation
    const topMaterialsByValue = materials
      .map((mat) => ({
        id: mat.id,
        name: mat.name,
        unit: mat.unit,
        quantity: mat.currentStock || 0,
        unitCost: mat.unitCost || 0,
        totalValue: (mat.currentStock || 0) * (mat.unitCost || 0),
      }))
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 30);

    // Top 30 consumed items in previous month
    const topConsumedItems = prevMonthConsumption.slice(0, 30).map((item) => ({
      materialId: item.materialId,
      name: item.material.name || 'Unknown',
      unit: item.material.unit || '',
      quantity: item.totalQuantity,
      unitCost: item.material.unitCost || 0,
      totalValue: item.totalValue,
    }));

    return successResponse({
      summary: {
        totalStockValue: stockValuation,
        prevMonthConsumptionValue: prevMonthValue,
      },
      topMaterialsByValue,
      topConsumedItems,
    });
  } catch (err) {
    console.error('Stock valuation error:', err);
    return errorResponse('Failed to fetch stock valuation', 500);
  }
}
