import { auth } from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  try {
    const conn = await getCompanyDB(dbName);
    const { Material, Transaction } = getModels(conn);

    // Get all materials with current stock
    const materials = await Material.find({ isActive: true }).lean();

    // Calculate total stock value
    const stockValuation = materials.reduce((sum, mat) => {
      const value = (mat.currentStock || 0) * (mat.unitCost || 0);
      return sum + value;
    }, 0);

    // Get previous month's consumption
    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const prevMonthConsumption = await Transaction.aggregate([
      {
        $match: {
          type: 'STOCK_OUT',
          date: { $gte: prevMonthStart, $lte: prevMonthEnd },
        },
      },
      {
        $group: {
          _id: '$materialId',
          totalQuantity: { $sum: '$quantity' },
        },
      },
      {
        $lookup: {
          from: 'materials',
          localField: '_id',
          foreignField: '_id',
          as: 'material',
        },
      },
      {
        $unwind: {
          path: '$material',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          totalValue: {
            $multiply: ['$totalQuantity', { $ifNull: ['$material.unitCost', 0] }],
          },
        },
      },
      {
        $sort: { totalValue: -1 },
      },
    ]);

    const prevMonthValue = prevMonthConsumption.reduce((sum, item) => sum + (item.totalValue || 0), 0);

    // Top 30 materials by valuation
    const topMaterialsByValue = materials
      .map((mat) => ({
        _id: mat._id,
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
      materialId: item._id,
      name: item.material?.name || 'Unknown',
      unit: item.material?.unit || '',
      quantity: item.totalQuantity,
      unitCost: item.material?.unitCost || 0,
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
