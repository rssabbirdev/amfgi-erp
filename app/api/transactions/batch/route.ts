import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';

const LineSchema = z.object({
  materialId: z.string().min(1),
  quantity:   z.number().min(0.001),
  unitCost:   z.number().min(0).optional(),
  returnQty:  z.number().min(0).optional(),
});

const BatchSchema = z.object({
  type:          z.enum(['STOCK_IN', 'STOCK_OUT']),
  lines:         z.array(LineSchema).min(1, 'At least one line item required'),
  receiptNumber: z.string().min(1).max(50).optional(),
  jobId:         z.string().optional(),
  supplier:      z.string().max(100).optional(),
  notes:         z.string().max(500).optional(),
  date:          z.string().optional(),
  existingTransactionIds: z.array(z.string()).optional(),
  billAmount:    z.number().optional(),
  includeTax:    z.boolean().optional(),
  taxAmount:     z.number().optional(),
  materialUpdates: z.array(z.object({
    materialId: z.string(),
    unitCost: z.number(),
  })).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { type, lines, receiptNumber, jobId, supplier, notes, date, existingTransactionIds, billAmount, includeTax, taxAmount, materialUpdates } = parsed.data;

  // Permission check
  if (type === 'STOCK_IN') {
    if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
      return errorResponse('Forbidden', 403);
    }
  } else if (type === 'STOCK_OUT') {
    if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_out')) {
      return errorResponse('Forbidden', 403);
    }
  }

  const txDate = date ? new Date(date) : new Date();

  const conn = await getCompanyDB(dbName);
  const { Material, Transaction } = getModels(conn);

  const dbSession = await conn.startSession();
  dbSession.startTransaction();

  try {
    const created = [];

    // Delete existing transactions and reverse stock if updating
    if (existingTransactionIds && existingTransactionIds.length > 0) {
      for (const txnId of existingTransactionIds) {
        const existingTxn = await Transaction.findById(txnId).session(dbSession);
        if (existingTxn) {
          // Reverse stock impact
          if (existingTxn.type === 'STOCK_OUT') {
            // STOCK_OUT reduced stock, so add it back
            await Material.findByIdAndUpdate(
              existingTxn.materialId,
              { $inc: { currentStock: existingTxn.quantity } },
              { session: dbSession }
            );
          } else if (existingTxn.type === 'STOCK_IN') {
            // STOCK_IN increased stock, so reduce it
            await Material.findByIdAndUpdate(
              existingTxn.materialId,
              { $inc: { currentStock: -existingTxn.quantity } },
              { session: dbSession }
            );
          }
          // Delete the transaction
          await Transaction.deleteOne({ _id: existingTxn._id }, { session: dbSession });

          // Also delete any linked RETURN transactions
          if (existingTxn.type === 'STOCK_OUT') {
            const returnTxns = await Transaction.find(
              { parentTransactionId: existingTxn._id },
              {},
              { session: dbSession }
            );
            for (const returnTxn of returnTxns) {
              // Reverse RETURN stock impact
              await Material.findByIdAndUpdate(
                returnTxn.materialId,
                { $inc: { currentStock: -returnTxn.quantity } },
                { session: dbSession }
              );
              await Transaction.deleteOne({ _id: returnTxn._id }, { session: dbSession });
            }
          }
        }
      }
    }

    for (const line of lines) {
      // For STOCK_OUT, verify sufficient stock
      if (type === 'STOCK_OUT') {
        const mat = await Material.findById(line.materialId).session(dbSession);
        if (!mat) throw new Error(`Material ${line.materialId} not found`);
        if (mat.currentStock < line.quantity) {
          throw new Error(`Insufficient stock for ${mat.name}. Available: ${mat.currentStock}`);
        }
      }

      // Update stock
      const delta = type === 'STOCK_IN' ? line.quantity : -line.quantity;
      await Material.findByIdAndUpdate(
        line.materialId,
        { $inc: { currentStock: delta } },
        { session: dbSession }
      );

      // Update unit cost if provided (STOCK_IN only)
      if (type === 'STOCK_IN' && line.unitCost !== undefined) {
        await Material.findByIdAndUpdate(
          line.materialId,
          { unitCost: line.unitCost },
          { session: dbSession }
        );
      }

      // Create STOCK_OUT or STOCK_IN transaction
      const txNotes = type === 'STOCK_IN'
        ? notes || undefined
        : notes || undefined;

      const [tx] = await Transaction.create(
        [
          {
            type,
            materialId:  new Types.ObjectId(line.materialId),
            quantity:    line.quantity,
            jobId:       type === 'STOCK_OUT' && jobId ? new Types.ObjectId(jobId) : null,
            notes:       txNotes,
            date:        txDate,
            performedBy: session.user.id,
          },
        ],
        { session: dbSession }
      );
      created.push(tx._id);

      // Create RETURN transaction if returnQty provided (STOCK_OUT only)
      if (type === 'STOCK_OUT' && line.returnQty && line.returnQty > 0) {
        // Re-add returned quantity to stock
        await Material.findByIdAndUpdate(
          line.materialId,
          { $inc: { currentStock: line.returnQty } },
          { session: dbSession }
        );

        const [returnTx] = await Transaction.create(
          [
            {
              type:              'RETURN',
              materialId:        new Types.ObjectId(line.materialId),
              quantity:          line.returnQty,
              jobId:             jobId ? new Types.ObjectId(jobId) : null,
              parentTransactionId: tx._id,
              notes:             notes ? `Return: ${notes}` : 'Return',
              date:              txDate,
              performedBy:       session.user.id,
            },
          ],
          { session: dbSession }
        );
        created.push(returnTx._id);
      }
    }

    // Update material unit costs if provided
    if (materialUpdates && materialUpdates.length > 0) {
      for (const update of materialUpdates) {
        await Material.findByIdAndUpdate(
          update.materialId,
          { unitCost: update.unitCost },
          { session: dbSession }
        );
      }
    }

    await dbSession.commitTransaction();
    return successResponse({
      created: created.length,
      ids: created,
      billAmount,
      includeTax,
      taxAmount,
    }, 201);
  } catch (err: unknown) {
    await dbSession.abortTransaction();
    return errorResponse(err instanceof Error ? err.message : 'Batch failed', 400);
  } finally {
    dbSession.endSession();
  }
}
