import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const companyId = session.user.activeCompanyId;

    // Current month consumption
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Get STOCK_OUT transactions from current month
    const currentMonthTransactions = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'STOCK_OUT',
        date: {
          gte: currentMonthStart,
          lte: currentMonthEnd,
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
      {
        totalQuantity: number;
        material: { name: string; unit: string; unitCost: unknown | null };
      }
    > = {};

    for (const txn of currentMonthTransactions) {
      if (!consumptionByMaterial[txn.materialId]) {
        consumptionByMaterial[txn.materialId] = {
          totalQuantity: 0,
          material: txn.material,
        };
      }
      consumptionByMaterial[txn.materialId].totalQuantity += decimalToNumberOrZero(txn.quantity);
    }

    const currentMonthConsumption = Object.entries(consumptionByMaterial)
      .map(([materialId, data]) => ({
        materialId,
        totalQuantity: data.totalQuantity,
        material: data.material,
        totalValue: data.totalQuantity * decimalToNumberOrZero(data.material.unitCost),
      }))
      .sort((a, b) => b.totalValue - a.totalValue);

    const totalConsumptionValue = currentMonthConsumption.reduce(
      (sum, item) => sum + (item.totalValue || 0),
      0
    );

    const consumedItems = currentMonthConsumption.map((item) => ({
      materialId: item.materialId,
      name: item.material.name || 'Unknown',
      unit: item.material.unit || '',
      quantity: item.totalQuantity,
      unitCost: decimalToNumberOrZero(item.material.unitCost),
      totalValue: item.totalValue,
    }));

    return successResponse({
      currentMonth: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        totalValue: totalConsumptionValue,
        itemCount: consumedItems.length,
        items: consumedItems,
      },
    });
  } catch (err) {
    console.error('Consumption report error:', err);
    return errorResponse('Failed to fetch consumption data', 500);
  }
}
