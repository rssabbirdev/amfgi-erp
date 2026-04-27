import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { resolveQuantityToBase } from '@/lib/utils/materialUomDb';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import { z } from 'zod';

const ReconcileLineSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().min(0.001),
  quantityUomId: z.string().optional(),
  warehouseId: z.string().min(1).optional(),
});

const ReconcileSchema = z.object({
  jobIds: z.array(z.string().min(1)).min(1),
  lines: z.array(ReconcileLineSchema).min(1),
  notes: z.string().max(20000).optional(),
  date: z.string().optional(),
});

function splitQuantityEvenly(total: number, count: number) {
  if (count <= 0) return [];
  const base = total / count;
  const quantities = Array.from({ length: count }, () => base);
  const allocated = quantities.reduce((sum, value) => sum + value, 0);
  quantities[count - 1] += total - allocated;
  return quantities;
}

type BatchPool = {
  batchId: string;
  batchNumber: string;
  quantityRemaining: number;
  unitCost: number;
};

function consumeFromPools(pools: BatchPool[], quantity: number) {
  let remaining = quantity;
  const allocations: Array<{
    batchId: string;
    batchNumber: string;
    quantityFromBatch: number;
    unitCost: number;
    costAmount: number;
  }> = [];

  for (const pool of pools) {
    if (remaining <= 0) break;
    if (pool.quantityRemaining <= 0) continue;
    const quantityFromBatch = Math.min(pool.quantityRemaining, remaining);
    pool.quantityRemaining -= quantityFromBatch;
    remaining -= quantityFromBatch;
    allocations.push({
      batchId: pool.batchId,
      batchNumber: pool.batchNumber,
      quantityFromBatch,
      unitCost: pool.unitCost,
      costAmount: quantityFromBatch * pool.unitCost,
    });
  }

  return { allocations, remaining };
}

function getMonthRange(referenceDate: Date) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  return { start, end };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.reconcile')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const companyId = session.user.activeCompanyId;
  const { searchParams } = new URL(req.url);
  const requestedDate = searchParams.get('date');
  const referenceDate = requestedDate ? new Date(requestedDate) : new Date();
  if (Number.isNaN(referenceDate.getTime())) {
    return errorResponse('Invalid date', 422);
  }
  const { start: monthStart, end: monthEnd } = getMonthRange(referenceDate);

  const [materials, jobs, history] = await Promise.all([
    prisma.material.findMany({
      where: {
        companyId,
        isActive: true,
        stockType: 'Non-Stock',
      },
      include: {
        materialUoms: {
          include: { unit: { select: { id: true, name: true } } },
          orderBy: [{ isBase: 'desc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.job.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        parentJobId: { not: null },
        transactions: {
          some: {
            type: 'STOCK_OUT',
            isDeliveryNote: false,
            date: {
              gte: monthStart,
              lt: monthEnd,
            },
          },
        },
      },
      select: {
        id: true,
        jobNumber: true,
        description: true,
        customer: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ jobNumber: 'asc' }],
    }),
    prisma.transaction.findMany({
      where: {
        companyId,
        type: 'STOCK_OUT',
        notes: {
          contains: 'Non-stock reconcile',
        },
      },
      select: {
        id: true,
        quantity: true,
        totalCost: true,
        averageCost: true,
        notes: true,
        date: true,
        createdAt: true,
        material: {
          select: {
            name: true,
            unit: true,
          },
        },
        job: {
          select: {
            id: true,
            jobNumber: true,
            description: true,
            customer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 80,
    }),
  ]);

  return successResponse({
    materials,
    jobs: jobs.map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      description: job.description,
      customerName: job.customer?.name ?? '',
    })),
    selectedMonth: monthStart.toISOString(),
    history: history.map((entry) => ({
      id: entry.id,
      quantity: entry.quantity,
      totalCost: entry.totalCost,
      averageCost: entry.averageCost,
      notes: entry.notes,
      date: entry.date,
      createdAt: entry.createdAt,
      materialName: entry.material.name,
      unit: entry.material.unit,
      jobId: entry.job?.id ?? '',
      jobNumber: entry.job?.jobNumber ?? '-',
      jobDescription: entry.job?.description ?? '',
      customerName: entry.job?.customer?.name ?? '',
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.reconcile')) {
    return errorResponse('Forbidden', 403);
  }
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = ReconcileSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const companyId = session.user.activeCompanyId;
  const txDate = parsed.data.date ? new Date(parsed.data.date) : new Date();
  const selectedLines = parsed.data.lines.filter((line) => line.quantity > 0);
  if (selectedLines.length === 0) return errorResponse('Enter at least one quantity to distribute', 422);

  try {
    const actorFields = buildTransactionActorFields(session.user);
    const result = await prisma.$transaction(async (tx) => {
      const jobs = await tx.job.findMany({
        where: {
          companyId,
          id: { in: parsed.data.jobIds },
          status: 'ACTIVE',
          parentJobId: { not: null },
          transactions: {
            some: {
              type: 'STOCK_OUT',
              isDeliveryNote: false,
              date: {
                gte: getMonthRange(txDate).start,
                lt: getMonthRange(txDate).end,
              },
            },
          },
        },
        select: { id: true, jobNumber: true },
        orderBy: { jobNumber: 'asc' },
      });

      if (jobs.length === 0) {
        throw new Error('Select at least one active job with a dispatch note');
      }

      const createdIds: string[] = [];

      for (const line of selectedLines) {
        const material = await tx.material.findUnique({
          where: { id: line.materialId },
        });

        if (!material || material.companyId !== companyId || material.stockType !== 'Non-Stock') {
          throw new Error('Selected material is not a valid non-stock item');
        }

        const baseQuantity = await resolveQuantityToBase(tx, line.materialId, line.quantity, line.quantityUomId);
        const effectiveWarehouse = await resolveEffectiveWarehouse(tx, {
          companyId,
          materialId: line.materialId,
          warehouseId: line.warehouseId,
        });
        let batches = await tx.stockBatch.findMany({
          where: {
            companyId,
            materialId: line.materialId,
            warehouseId: effectiveWarehouse.warehouseId,
            quantityAvailable: { gt: 0 },
          },
          orderBy: { receivedDate: 'asc' },
        });

        const currentStock = decimalToNumberOrZero(material.currentStock);
        if (batches.length === 0 && currentStock > 0) {
          const unitCost = decimalToNumberOrZero(material.unitCost);
          const totalCost = currentStock * unitCost;
          const openingBatch = await tx.stockBatch.create({
            data: {
              companyId,
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
              batchNumber: `OPENING-${line.materialId}-${Date.now()}`,
              quantityReceived: currentStock,
              quantityAvailable: currentStock,
              unitCost,
              totalCost,
              receivedDate: new Date('2020-01-01'),
              supplier: 'Opening Balance',
              notes: 'Auto-created opening balance for non-stock reconciliation',
            },
          });
          batches = [openingBatch];
        }

        if (!material.allowNegativeConsumption && currentStock < baseQuantity) {
          throw new Error(`Insufficient stock for ${material.name}. Available: ${currentStock.toFixed(3)} ${material.unit}`);
        }

        const fallbackUnitCost = decimalToNumberOrZero(material.unitCost);
        const availableFromBatches = batches.reduce((sum, batch) => sum + decimalToNumberOrZero(batch.quantityAvailable), 0);
        const quantityFromBatches = material.allowNegativeConsumption
          ? Math.min(baseQuantity, availableFromBatches)
          : baseQuantity;

        const fifoResult =
          quantityFromBatches > 0
            ? calculateFIFOConsumption(
                batches.map((batch) => ({
                  id: batch.id,
                  batchNumber: batch.batchNumber,
                  quantityAvailable: decimalToNumberOrZero(batch.quantityAvailable),
                  unitCost: decimalToNumberOrZero(batch.unitCost),
                  receivedDate: batch.receivedDate,
                })),
                quantityFromBatches
              )
            : {
                totalCost: 0,
                averageCost: 0,
                batchesUsed: [],
              };

        if (!material.allowNegativeConsumption && fifoResult.batchesUsed.length === 0) {
          throw new Error(`Cannot fulfill ${baseQuantity.toFixed(3)} ${material.unit} of ${material.name}`);
        }

        for (const batchUsed of fifoResult.batchesUsed) {
          await tx.stockBatch.update({
            where: { id: String(batchUsed.batchId) },
            data: {
              quantityAvailable: {
                decrement: batchUsed.quantityFromBatch,
              },
            },
          });
        }

        await tx.material.update({
          where: { id: line.materialId },
          data: {
            currentStock: {
              decrement: baseQuantity,
            },
          },
        });
        await applyMaterialWarehouseDelta(
          tx,
          companyId,
          line.materialId,
          effectiveWarehouse.warehouseId,
          -baseQuantity
        );

        const jobQuantities = splitQuantityEvenly(baseQuantity, jobs.length);
        const batchPools: BatchPool[] = fifoResult.batchesUsed.map((entry) => ({
          batchId: String(entry.batchId),
          batchNumber: entry.batchNumber,
          quantityRemaining: entry.quantityFromBatch,
          unitCost: entry.unitCost,
        }));

        for (let index = 0; index < jobs.length; index += 1) {
          const job = jobs[index];
          const jobQuantity = jobQuantities[index];
          if (jobQuantity <= 0) continue;

          const { allocations, remaining } = consumeFromPools(batchPools, jobQuantity);
          const allocatedCost = allocations.reduce((sum, entry) => sum + entry.costAmount, 0);
          const shortfallCost = remaining > 0 ? remaining * fallbackUnitCost : 0;
          const totalCost = allocatedCost + shortfallCost;
          const averageCost = jobQuantity > 0 ? totalCost / jobQuantity : 0;

          const transaction = await tx.transaction.create({
            data: {
              companyId,
              type: 'STOCK_OUT',
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
              quantity: jobQuantity,
              jobId: job.id,
              totalCost,
              averageCost,
              notes: parsed.data.notes?.trim()
                ? `Non-stock reconcile. ${parsed.data.notes.trim()}`
                : 'Non-stock reconcile',
              date: txDate,
              ...actorFields,
            },
          });

          createdIds.push(transaction.id);

          for (const allocation of allocations) {
            await tx.transactionBatch.create({
              data: {
                transactionId: transaction.id,
                batchId: allocation.batchId,
                batchNumber: allocation.batchNumber,
                quantityFromBatch: allocation.quantityFromBatch,
                unitCost: allocation.unitCost,
                costAmount: allocation.costAmount,
              },
            });
          }
        }
      }

      return {
        created: createdIds.length,
        ids: createdIds,
      };
    });

    return successResponse(result, 201);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Reconciliation failed', 400);
  }
}
