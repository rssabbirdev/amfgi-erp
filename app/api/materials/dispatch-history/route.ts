import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const filterType = searchParams.get('filterType') ?? 'all'; // 'day', 'month', 'all'
  const dateStr = searchParams.get('date'); // ISO date string

  let startDate = new Date(0);
  let endDate = new Date();

  if (filterType === 'day' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
  } else if (filterType === 'month' && dateStr) {
    const date = new Date(dateStr);
    startDate = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
    endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  }

  // Fetch dispatch transactions (STOCK_OUT only) within the date range
  const transactions = await prisma.transaction.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      type: 'STOCK_OUT',
      date: { gte: startDate, lte: endDate },
    },
    include: {
      material: { select: { id: true, name: true, unit: true } },
      job: { select: { id: true, jobNumber: true, description: true } },
    },
    orderBy: { date: 'desc' },
  });

  // Calculate consumption summary by material
  const summaryMap = new Map<string, {
    materialId: string;
    materialName: string;
    materialUnit: string;
    totalQuantity: number;
    transactionCount: number;
  }>();

  for (const txn of transactions) {
    const key = txn.materialId;
    if (summaryMap.has(key)) {
      const existing = summaryMap.get(key)!;
      existing.totalQuantity += decimalToNumberOrZero(txn.quantity);
      existing.transactionCount += 1;
    } else {
      summaryMap.set(key, {
        materialId: txn.materialId,
        materialName: txn.material?.name ?? 'Unknown',
        materialUnit: txn.material?.unit ?? '—',
        totalQuantity: decimalToNumberOrZero(txn.quantity),
        transactionCount: 1,
      });
    }
  }

  const summary = Array.from(summaryMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);

  return successResponse({
    transactions: transactions.map(txn => ({
      ...txn,
      materialId: txn.material?.id,
      materialName: txn.material?.name,
      materialUnit: txn.material?.unit,
      jobId: txn.job?.id,
      jobNumber: txn.job?.jobNumber,
      jobDescription: txn.job?.description,
    })),
    summary,
    dateRange: {
      startDate,
      endDate,
      filterType,
    },
  });
}
