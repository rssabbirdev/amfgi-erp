import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const dateStr = searchParams.get('date');

  if (!jobId || !dateStr) {
    return errorResponse('jobId and date are required', 400);
  }

  try {
    const companyId = session.user.activeCompanyId;

    // Parse date to day boundaries
    const date = new Date(dateStr);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    // Find all STOCK_OUT transactions for this job on this date
    const transactions = await prisma.transaction.findMany({
      where: {
        companyId,
        type: 'STOCK_OUT',
        jobId,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: {
        id: true,
        materialId: true,
        warehouseId: true,
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        quantity: true,
        notes: true,
        material: {
          select: {
            name: true,
            unit: true,
          },
        },
      },
    });

    if (transactions.length === 0) {
      return successResponse({
        exists: false,
        lines: [],
        transactionIds: [],
        notes: '',
      });
    }

    // Enrich with return quantities
    const lines = await Promise.all(
      transactions.map(async (txn) => {
        // Find linked RETURN transaction if any
        const returnTxn = await prisma.transaction.findFirst({
          where: {
            companyId,
            type: 'RETURN',
            parentTransactionId: txn.id,
          },
          select: {
            quantity: true,
          },
        });

        return {
          materialId: txn.materialId,
          materialName: txn.material?.name ?? 'Unknown',
          unit: txn.material?.unit ?? '',
          warehouseId: txn.warehouse?.id ?? txn.warehouseId ?? null,
          warehouseName: txn.warehouse?.name ?? null,
          quantity: txn.quantity,
          returnQty: returnTxn?.quantity ?? 0,
          transactionId: txn.id,
        };
      })
    );

    // Extract notes from the first transaction
    const notes = transactions[0]?.notes ?? '';

    return successResponse({
      exists: true,
      lines,
      transactionIds: transactions.map((t) => t.id),
      notes,
    });
  } catch (err) {
    console.error('Dispatch entry error:', err);
    return errorResponse('Failed to fetch dispatch entry', 500);
  }
}
