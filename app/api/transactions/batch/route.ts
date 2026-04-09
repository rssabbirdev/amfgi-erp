import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';
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
  receiptNumber: z.string().max(50).optional().transform((val) => val && val.trim().length > 0 ? val.trim() : undefined),
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

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
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
  const companyId = session.user.activeCompanyId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created: string[] = [];

      // Delete existing transactions and reverse stock if updating
      if (existingTransactionIds && existingTransactionIds.length > 0) {
        for (const txnId of existingTransactionIds) {
          const existingTxn = await tx.transaction.findUnique({
            where: { id: txnId },
            include: { batchesUsed: true },
          });

          if (existingTxn) {
            // Reverse stock impact
            if (existingTxn.type === 'STOCK_OUT') {
              // STOCK_OUT reduced stock, so add it back
              await tx.material.update({
                where: { id: existingTxn.materialId },
                data: {
                  currentStock: {
                    increment: existingTxn.quantity,
                  },
                },
              });

              // Restore batch quantities if FIFO data exists
              if (existingTxn.batchesUsed && existingTxn.batchesUsed.length > 0) {
                for (const batchUsed of existingTxn.batchesUsed) {
                  await tx.stockBatch.update({
                    where: { id: batchUsed.batchId },
                    data: {
                      quantityAvailable: {
                        increment: batchUsed.quantityFromBatch,
                      },
                    },
                  });
                }
              }
            } else if (existingTxn.type === 'STOCK_IN') {
              // STOCK_IN increased stock, so reduce it
              await tx.material.update({
                where: { id: existingTxn.materialId },
                data: {
                  currentStock: {
                    increment: -existingTxn.quantity,
                  },
                },
              });
            }

            // Delete any linked RETURN transactions
            if (existingTxn.type === 'STOCK_OUT') {
              const returnTxns = await tx.transaction.findMany({
                where: {
                  parentTransactionId: existingTxn.id,
                },
              });

              for (const returnTxn of returnTxns) {
                // Reverse RETURN stock impact
                await tx.material.update({
                  where: { id: returnTxn.materialId },
                  data: {
                    currentStock: {
                      increment: -returnTxn.quantity,
                    },
                  },
                });

                // Delete the RETURN transaction (cascade will remove batchesUsed)
                await tx.transaction.delete({
                  where: { id: returnTxn.id },
                });
              }
            }

            // Delete the transaction (cascade will remove batchesUsed)
            await tx.transaction.delete({
              where: { id: txnId },
            });
          }
        }
      }

      // Process each line item
      for (const line of lines) {
        const mat = await tx.material.findUnique({
          where: { id: line.materialId },
        });

        if (!mat) throw new Error(`Material ${line.materialId} not found`);

        const baseQuantity = line.quantity;

        if (type === 'STOCK_OUT') {
          // FIFO consumption
          let batches = await tx.stockBatch.findMany({
            where: {
              companyId,
              materialId: line.materialId,
              quantityAvailable: {
                gt: 0,
              },
            },
            orderBy: {
              receivedDate: 'asc',
            },
          });

          // If no batches exist but currentStock > 0, create opening balance batch
          if (batches.length === 0 && mat.currentStock > 0) {
            const unitCost = mat.unitCost || 0;
            const totalCost = mat.currentStock * unitCost;
            const openingBatch = await tx.stockBatch.create({
              data: {
                companyId,
                materialId: line.materialId,
                batchNumber: `OPENING-${line.materialId}-${Date.now()}`,
                quantityReceived: mat.currentStock,
                quantityAvailable: mat.currentStock,
                unitCost: unitCost,
                totalCost: totalCost,
                receivedDate: new Date('2020-01-01'), // Historical date
                supplier: 'Opening Balance',
                notes: 'Auto-created opening balance for pre-FIFO material',
              },
            });
            batches = [openingBatch];
          }

          if (batches.length === 0 || mat.currentStock < baseQuantity) {
            throw new Error(`Insufficient stock for ${mat.name}. Available: ${mat.currentStock}`);
          }

          // Calculate FIFO consumption with Prisma StockBatch objects
          const fifoResult = calculateFIFOConsumption(
            batches.map((b) => ({
              _id: b.id as any, // Map string id to _id for FIFO function
              batchNumber: b.batchNumber,
              quantityAvailable: b.quantityAvailable,
              unitCost: b.unitCost,
              receivedDate: b.receivedDate,
            })),
            baseQuantity
          );

          if (fifoResult.batchesUsed.length === 0) {
            throw new Error(`Cannot fulfill ${baseQuantity} units of ${mat.name}`);
          }

          // Update batch quantities and create TransactionBatch entries
          const batchLinkData = [];
          for (const batchUsed of fifoResult.batchesUsed) {
            // batchUsed.batchId is already the Prisma string ID from FIFO calculation
            const prismaId = batchUsed.batchId.toString();

            await tx.stockBatch.update({
              where: { id: prismaId },
              data: {
                quantityAvailable: {
                  decrement: batchUsed.quantityFromBatch,
                },
              },
            });

            batchLinkData.push({
              batchNumber: batchUsed.batchNumber,
              quantityFromBatch: batchUsed.quantityFromBatch,
              unitCost: batchUsed.unitCost,
              costAmount: batchUsed.costAmount,
              batchId: prismaId,
            });
          }

          // Update material stock
          await tx.material.update({
            where: { id: line.materialId },
            data: {
              currentStock: {
                decrement: baseQuantity,
              },
            },
          });

          // Create STOCK_OUT transaction with FIFO data
          const stockOutTxn = await tx.transaction.create({
            data: {
              companyId,
              type: 'STOCK_OUT',
              materialId: line.materialId,
              quantity: baseQuantity,
              jobId: jobId || null,
              totalCost: fifoResult.totalCost,
              averageCost: fifoResult.averageCost,
              notes: notes || null,
              date: txDate,
              performedBy: session.user.id,
            },
          });

          // Create TransactionBatch junction entries
          for (const batchLink of batchLinkData) {
            await tx.transactionBatch.create({
              data: {
                transactionId: stockOutTxn.id,
                batchId: batchLink.batchId,
                batchNumber: batchLink.batchNumber,
                quantityFromBatch: batchLink.quantityFromBatch,
                unitCost: batchLink.unitCost,
                costAmount: batchLink.costAmount,
              },
            });
          }

          created.push(stockOutTxn.id);

          // Create RETURN transaction if returnQty provided
          if (line.returnQty && line.returnQty > 0) {
            // Re-add returned quantity to stock
            await tx.material.update({
              where: { id: line.materialId },
              data: {
                currentStock: {
                  increment: line.returnQty,
                },
              },
            });

            const returnTxn = await tx.transaction.create({
              data: {
                companyId,
                type: 'RETURN',
                materialId: line.materialId,
                quantity: line.returnQty,
                jobId: jobId || null,
                parentTransactionId: stockOutTxn.id,
                notes: notes ? `Return: ${notes}` : 'Return',
                date: txDate,
                performedBy: session.user.id,
              },
            });

            created.push(returnTxn.id);
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
          const newBatch = await tx.stockBatch.create({
            data: {
              companyId,
              ...batchData,
            },
          });

          // Update material stock
          await tx.material.update({
            where: { id: line.materialId },
            data: {
              currentStock: {
                increment: baseQuantity,
              },
            },
          });

          // Update unit cost if provided
          if (line.unitCost !== undefined) {
            await tx.material.update({
              where: { id: line.materialId },
              data: {
                unitCost: line.unitCost,
              },
            });
          }

          // Create STOCK_IN transaction
          const stockInTxn = await tx.transaction.create({
            data: {
              companyId,
              type: 'STOCK_IN',
              materialId: line.materialId,
              quantity: baseQuantity,
              notes: notes || null,
              date: txDate,
              performedBy: session.user.id,
            },
          });

          created.push(stockInTxn.id);
        }
      }

      // Update material unit costs if provided and create price logs
      if (materialUpdates && materialUpdates.length > 0) {
        for (const update of materialUpdates) {
          const material = await tx.material.findUnique({
            where: { id: update.materialId },
          });

          if (material) {
            const previousPrice = material.unitCost || 0;
            const currentPrice = update.unitCost;

            // Only create log if price changed
            if (previousPrice !== currentPrice) {
              await tx.priceLog.create({
                data: {
                  companyId,
                  materialId: update.materialId,
                  previousPrice: previousPrice,
                  currentPrice: currentPrice,
                  source: 'bill',
                  changedBy: session.user.name || session.user.email || session.user.id,
                  notes: `Updated via goods receipt: ${receiptNumber || 'N/A'}`,
                  timestamp: new Date(),
                },
              });
            }

            // Update material cost
            await tx.material.update({
              where: { id: update.materialId },
              data: {
                unitCost: update.unitCost,
              },
            });
          }
        }
      }

      return {
        created: created.length,
        ids: created,
        billAmount,
        includeTax,
        taxAmount,
      };
    });

    return successResponse(result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Batch failed';
    return errorResponse(message, 400);
  }
}
