import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { resolveQuantityToBase } from '@/lib/utils/materialUomDb';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import { z } from 'zod';

type TransactionFilterType = 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT';

const TransactionSchema = z.object({
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT']),
  materialId: z.string().min(1),
  quantity: z.number().finite().min(0.001),
  quantityUomId: z.string().optional(),
  jobId: z.string().optional(),
  parentTransactionId: z.string().optional(),
  warehouseId: z.string().optional(),
  notes: z.string().max(20000).optional(),
  date: z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (
    !session.user.isSuperAdmin &&
    !session.user.permissions.includes('transaction.stock_in') &&
    !session.user.permissions.includes('transaction.stock_out') &&
    !session.user.permissions.includes('transaction.return')
  ) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const type = searchParams.get('type');
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

  try {
    const companyId = session.user.activeCompanyId;

    const transactions = await prisma.transaction.findMany({
      where: {
        companyId,
        jobId: jobId ? jobId : undefined,
        type: type ? (type as TransactionFilterType) : undefined,
      },
      select: {
        id: true,
        type: true,
        quantity: true,
        date: true,
        notes: true,
        jobId: true,
        materialId: true,
        parentTransactionId: true,
        totalCost: true,
        averageCost: true,
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
        material: {
          select: {
            name: true,
            unit: true,
          },
        },
        job: {
          select: {
            jobNumber: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
      take: limit,
    });

    return successResponse(transactions);
  } catch (err) {
    console.error('Transaction GET error:', err);
    return errorResponse('Failed to fetch transactions', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = TransactionSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { type, materialId, quantity, quantityUomId, jobId, parentTransactionId, warehouseId, notes, date } = parsed.data;

  // Permission check per transaction type
  const permMap: Record<string, string> = {
    STOCK_IN: 'transaction.stock_in',
    STOCK_OUT: 'transaction.stock_out',
    RETURN: 'transaction.return',
    TRANSFER_IN: 'transaction.transfer',
    TRANSFER_OUT: 'transaction.transfer',
  };
  const requiredPerm = permMap[type];
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(requiredPerm as never)) {
    return errorResponse('Forbidden', 403);
  }

  if ((type === 'STOCK_OUT' || type === 'RETURN') && !jobId) {
    return errorResponse('jobId is required for dispatches and returns', 400);
  }

  try {
    const companyId = session.user.activeCompanyId;
    const txDate = date ? new Date(date) : new Date();
    const actorFields = buildTransactionActorFields(session.user);

    const result = await prisma.$transaction(async (tx) => {
      const qtyBase = await resolveQuantityToBase(tx, materialId, quantity, quantityUomId);
      const delta = type === 'STOCK_IN' ? qtyBase : type === 'STOCK_OUT' ? -qtyBase : qtyBase; // RETURN adds back
      const effectiveWarehouse = await resolveEffectiveWarehouse(tx, {
        companyId,
        materialId,
        warehouseId,
      });

      if (type === 'STOCK_OUT') {
        const mat = await tx.material.findUnique({
          where: { id: materialId },
        });
        if (!mat) throw new Error('Material not found');
        const currentStock = decimalToNumberOrZero(mat.currentStock);
        if (!mat.allowNegativeConsumption && currentStock < qtyBase) {
          throw new Error(`Insufficient stock. Available: ${currentStock} ${mat.unit}`);
        }
      }

      // Update material stock
      await tx.material.update({
        where: { id: materialId },
        data: {
          currentStock: {
            increment: delta,
          },
        },
      });
      await applyMaterialWarehouseDelta(tx, companyId, materialId, effectiveWarehouse.warehouseId, delta);

      // Create transaction
      const newTxn = await tx.transaction.create({
        data: {
          companyId,
          type,
          materialId,
          warehouseId: effectiveWarehouse.warehouseId,
          quantity: qtyBase,
          jobId: jobId || null,
          parentTransactionId: parentTransactionId || null,
          notes: notes || null,
          date: txDate,
          ...actorFields,
        },
        include: {
          material: {
            select: {
              name: true,
              unit: true,
            },
          },
          job: {
            select: {
              jobNumber: true,
            },
          },
        },
      });

      return newTxn;
    });

    return successResponse(result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Transaction failed';
    return errorResponse(message, 400);
  }
}
