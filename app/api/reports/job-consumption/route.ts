import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('report.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const jobIds = searchParams.getAll('jobId');

  try {
    const companyId = session.user.activeCompanyId;

    // Build date filter
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

    // Get STOCK_OUT and RETURN transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        companyId,
        type: {
          in: ['STOCK_OUT', 'RETURN'],
        },
        date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
        jobId: jobIds.length > 0 ? { in: jobIds } : undefined,
      },
      select: {
        type: true,
        quantity: true,
        jobId: true,
        materialId: true,
        job: {
          select: {
            jobNumber: true,
          },
        },
        material: {
          select: {
            name: true,
            unit: true,
          },
        },
      },
    });

    // Group by jobId + materialId and calculate net consumption
    const grouped: Record<
      string,
      {
        jobId: string;
        jobNumber: string;
        materialId: string;
        materialName: string;
        unit: string;
        dispatched: number;
        returned: number;
        netConsumed: number;
      }
    > = {};

    for (const txn of transactions) {
      if (!txn.jobId) continue; // Skip if no job

      const key = `${txn.jobId}|${txn.materialId}`;

      if (!grouped[key]) {
        grouped[key] = {
          jobId: txn.jobId,
          jobNumber: txn.job?.jobNumber || 'Unknown',
          materialId: txn.materialId,
          materialName: txn.material?.name || 'Unknown',
          unit: txn.material?.unit || '',
          dispatched: 0,
          returned: 0,
          netConsumed: 0,
        };
      }

      if (txn.type === 'STOCK_OUT') {
        grouped[key].dispatched += decimalToNumberOrZero(txn.quantity);
      } else if (txn.type === 'RETURN') {
        grouped[key].returned += decimalToNumberOrZero(txn.quantity);
      }
    }

    // Calculate net consumed and sort
    const rows = Object.values(grouped)
      .map((row) => ({
        ...row,
        netConsumed: row.dispatched - row.returned,
      }))
      .sort((a, b) => {
        if (a.jobNumber !== b.jobNumber) {
          return a.jobNumber.localeCompare(b.jobNumber);
        }
        return a.materialName.localeCompare(b.materialName);
      });

    return successResponse(rows);
  } catch (err) {
    console.error('Job consumption report error:', err);
    return errorResponse('Failed to fetch job consumption data', 500);
  }
}
