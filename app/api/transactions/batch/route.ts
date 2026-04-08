import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';
import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { createBatchData } from '@/lib/utils/stockBatchManagement';

const LineSchema = z.object({
  materialId:  z.string().min(1),
  quantity:    z.number().min(0.001),
  unitCost:    z.number().min(0).optional(),
  returnQty:   z.number().min(0).optional(),
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
  const { Material, Transaction, StockBatch, PriceLog } = getModels(conn);

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
      const mat = await Material.findById(line.materialId).session(dbSession);
      if (!mat) throw new Error(`Material ${line.materialId} not found`);

      const baseQuantity = line.quantity;

      if (type === 'STOCK_OUT') {
        // FIFO consumption
        let batches = await StockBatch.find(
          { materialId: new Types.ObjectId(line.materialId), quantityAvailable: { $gt: 0 } },
          {},
          { session: dbSession }
        ).sort({ receivedDate: 1 });

        // If no batches exist but currentStock > 0, create opening balance batch
        if (batches.length === 0 && mat.currentStock > 0) {
          const unitCost = mat.unitCost || 0;
          const totalCost = mat.currentStock * unitCost;
          const openingBatch = await StockBatch.create(
            [
              {
                materialId: new Types.ObjectId(line.materialId),
                batchNumber: `OPENING-${mat._id}-${Date.now()}`,
                quantityReceived: mat.currentStock,
                quantityAvailable: mat.currentStock,
                unitCost: unitCost,
                totalCost: totalCost,
                receivedDate: new Date('2020-01-01'), // Historical date
                supplier: 'Opening Balance',
                notes: 'Auto-created opening balance for pre-FIFO material',
              },
            ],
            { session: dbSession }
          );
          batches = openingBatch;
        }

        if (batches.length === 0 || mat.currentStock < baseQuantity) {
          throw new Error(`Insufficient stock for ${mat.name}. Available: ${mat.currentStock}`);
        }

        // Calculate FIFO consumption
        const fifoResult = calculateFIFOConsumption(batches, baseQuantity);

        if (fifoResult.batchesUsed.length === 0) {
          throw new Error(`Cannot fulfill ${baseQuantity} units of ${mat.name}`);
        }

        // Update batch quantities
        for (const batchUsed of fifoResult.batchesUsed) {
          await StockBatch.findByIdAndUpdate(
            batchUsed.batchId,
            { $inc: { quantityAvailable: -batchUsed.quantityFromBatch } },
            { session: dbSession }
          );
        }

        // Update material stock
        await Material.findByIdAndUpdate(
          line.materialId,
          { $inc: { currentStock: -baseQuantity } },
          { session: dbSession }
        );

        // Create STOCK_OUT transaction with FIFO data
        const [tx] = await Transaction.create(
          [
            {
              type: 'STOCK_OUT',
              materialId:  new Types.ObjectId(line.materialId),
              quantity:    baseQuantity,
              jobId:       jobId ? new Types.ObjectId(jobId) : null,
              batchesUsed: fifoResult.batchesUsed.map(b => ({
                batchId: b.batchId,
                batchNumber: b.batchNumber,
                quantityFromBatch: b.quantityFromBatch,
                unitCost: b.unitCost,
                costAmount: b.costAmount,
              })),
              totalCost:   fifoResult.totalCost,
              averageCost: fifoResult.averageCost,
              notes:       notes || undefined,
              date:        txDate,
              performedBy: session.user.id,
            },
          ],
          { session: dbSession }
        );
        created.push(tx._id);

        // Create RETURN transaction if returnQty provided
        if (line.returnQty && line.returnQty > 0) {
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
      } else {
        // STOCK_IN: create batch and transaction
        const batchData = createBatchData({
          materialId: line.materialId,
          quantity: baseQuantity,
          unitCost: line.unitCost || mat.unitCost || 0,
          supplier,
          receiptNumber,
          receivedDate: txDate,
          notes,
        });

        // Create StockBatch record
        await StockBatch.create(
          [batchData],
          { session: dbSession }
        );

        // Update material stock
        await Material.findByIdAndUpdate(
          line.materialId,
          { $inc: { currentStock: baseQuantity } },
          { session: dbSession }
        );

        // Update unit cost if provided
        if (line.unitCost !== undefined) {
          await Material.findByIdAndUpdate(
            line.materialId,
            { unitCost: line.unitCost },
            { session: dbSession }
          );
        }

        // Create STOCK_IN transaction
        const [tx] = await Transaction.create(
          [
            {
              type: 'STOCK_IN',
              materialId:  new Types.ObjectId(line.materialId),
              quantity:    baseQuantity,
              notes:       notes || undefined,
              date:        txDate,
              performedBy: session.user.id,
            },
          ],
          { session: dbSession }
        );
        created.push(tx._id);
      }
    }

    // Update material unit costs if provided and create price logs
    if (materialUpdates && materialUpdates.length > 0) {
      for (const update of materialUpdates) {
        const material = await Material.findById(update.materialId).session(dbSession);
        if (material) {
          const previousPrice = material.unitCost || 0;
          const currentPrice = update.unitCost;

          // Only create log if price changed
          if (previousPrice !== currentPrice) {
            await PriceLog.create(
              [
                {
                  materialId: update.materialId.toString(),
                  previousPrice: previousPrice,
                  currentPrice: currentPrice,
                  source: 'bill',
                  changedBy: session.user.name || session.user.email || session.user.id,
                  notes: `Updated via goods receipt: ${receiptNumber || 'N/A'}`,
                  timestamp: new Date(),
                },
              ],
              { session: dbSession }
            );
          }

          // Update material cost
          await Material.findByIdAndUpdate(
            update.materialId,
            { unitCost: update.unitCost },
            { session: dbSession }
          );
        }
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
