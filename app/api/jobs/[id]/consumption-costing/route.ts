import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';

function resolveTransactionUnitCost(
  txn: {
    averageCost: unknown;
    material?: { unitCost?: unknown } | null;
    batchesUsed: Array<{ quantityFromBatch: unknown; unitCost: unknown; batch: { unitCost: unknown } }>;
  },
  costingMethod: string
) {
  if (costingMethod === 'CURRENT_PRICE') {
    return decimalToNumberOrZero(txn.material?.unitCost) || decimalToNumberOrZero(txn.averageCost);
  }

  if (txn.batchesUsed.length > 0) {
    let totalCostAmount = 0;
    let totalQty = 0;
    for (const tb of txn.batchesUsed) {
      const batchUnitCost = costingMethod === 'FIFO' ? decimalToNumberOrZero(tb.batch.unitCost) : decimalToNumberOrZero(tb.unitCost);
      const quantityFromBatch = decimalToNumberOrZero(tb.quantityFromBatch);
      totalCostAmount += batchUnitCost * quantityFromBatch;
      totalQty += quantityFromBatch;
    }
    if (totalQty > 0) return totalCostAmount / totalQty;
  }

  return decimalToNumberOrZero(txn.averageCost) || decimalToNumberOrZero(txn.material?.unitCost);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('job.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { id: jobId } = await params;
  const { searchParams } = new URL(req.url);
  const costingMethod = searchParams.get('method') || 'FIFO'; // FIFO, MOVING_AVERAGE, CURRENT_PRICE
  const variationIds = searchParams.getAll('variationIds'); // For parent job filtering

  const companyId = session.user.activeCompanyId;

  // Fetch the job
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { customer: true, variations: true },
  });

  if (!job || job.companyId !== companyId) {
    return errorResponse('Job not found', 404);
  }

  // Determine which jobs to fetch transactions for
  let jobsToAnalyze: string[] = [jobId];
  if (!job.parentJobId && job.variations.length > 0) {
    // This is a parent job
    if (variationIds && variationIds.length > 0) {
      // User selected specific variations
      jobsToAnalyze = variationIds;
    } else {
      // Include parent job and all variations
      jobsToAnalyze = [jobId, ...job.variations.map((v) => v.id)];
    }
  }

  // Fetch all STOCK_OUT and RETURN transactions for these jobs
  const transactions = await prisma.transaction.findMany({
    where: {
      companyId,
      jobId: { in: jobsToAnalyze },
      type: { in: ['STOCK_OUT', 'RETURN'] },
    },
    include: {
      material: {
        select: { id: true, name: true, unit: true, unitCost: true, stockType: true },
      },
      batchesUsed: {
        include: {
          batch: { select: { unitCost: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  });

  // Calculate consumption by material
  interface MaterialConsumption {
    materialId: string;
    materialName: string;
    unit: string;
    totalQuantity: number;
    totalCost: number;
    transactions: Array<{
      id: string;
      type: string;
      quantity: number;
      date: Date;
      cost: number;
      method: string;
    }>;
  }

  const consumptionMap = new Map<string, MaterialConsumption>();

  for (const txn of transactions) {
    const materialId = txn.materialId;
    if (!consumptionMap.has(materialId)) {
      consumptionMap.set(materialId, {
        materialId,
        materialName: txn.material?.name || 'Unknown',
        unit: txn.material?.unit || '—',
        totalQuantity: 0,
        totalCost: 0,
        transactions: [],
      });
    }

    const consumption = consumptionMap.get(materialId)!;
    const unitCost = resolveTransactionUnitCost(txn, costingMethod);

    const quantity = decimalToNumberOrZero(txn.quantity);
    const cost = quantity * unitCost;
    consumption.totalQuantity += txn.type === 'STOCK_OUT' ? quantity : -quantity;
    consumption.totalCost += txn.type === 'STOCK_OUT' ? cost : -cost;

    consumption.transactions.push({
      id: txn.id,
      type: txn.type,
      quantity,
      date: txn.date,
      cost,
      method: costingMethod,
    });
  }

  // Get all variations if parent job
  const relatedJobs = !job.parentJobId ? job.variations : [];

  return successResponse({
    job: {
      id: job.id,
      jobNumber: job.jobNumber,
      description: job.description,
      status: job.status,
      isParent: !job.parentJobId,
      parentJobId: job.parentJobId,
      customer: job.customer?.name,
    },
    consumption: Array.from(consumptionMap.values()),
    totalCost: Array.from(consumptionMap.values()).reduce((sum, m) => sum + m.totalCost, 0),
    costingMethod,
    relatedJobs: relatedJobs.map((v) => ({ id: v.id, jobNumber: v.jobNumber, description: v.description })),
    jobsIncluded: jobsToAnalyze,
  });
}
