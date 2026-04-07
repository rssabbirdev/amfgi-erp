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
    const { Transaction } = getModels(conn);

    // Current month consumption
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const currentMonthConsumption = await Transaction.aggregate([
      {
        $match: {
          type: 'STOCK_OUT',
          date: { $gte: currentMonthStart, $lte: currentMonthEnd },
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

    const totalConsumptionValue = currentMonthConsumption.reduce(
      (sum, item) => sum + (item.totalValue || 0),
      0
    );

    const consumedItems = currentMonthConsumption.map((item) => ({
      materialId: item._id,
      name: item.material?.name || 'Unknown',
      unit: item.material?.unit || '',
      quantity: item.totalQuantity,
      unitCost: item.material?.unitCost || 0,
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
