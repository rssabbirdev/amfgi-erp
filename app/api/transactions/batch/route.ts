import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { decimalEqualsNullable, decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';
import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { createBatchData } from '@/lib/utils/stockBatchManagement';
import { resolveQuantityToBase, resolveFactorToBase } from '@/lib/utils/materialUomDb';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import {
  buildCustomerDriveFolderName,
  buildJobDriveFolderName,
  buildSignedDeliveryNoteDriveFileName,
  moveDriveFile,
} from '@/lib/utils/googleDrive';

function parseDeliveryNoteLabel(notes?: string | null): string {
  const match = notes?.match(/--- DELIVERY NOTE #(\d+)/);
  const raw = match?.[1] ?? '';
  return `DN${(raw || '0').padStart(3, '0')}`;
}

const LineSchema = z.object({
  materialId:     z.string().min(1),
  quantity:       z.number().finite().min(0.001),
  quantityUomId:  z.string().optional(),
  unitCost:       z.number().finite().min(0).optional(),
  returnQty:      z.number().finite().min(0).optional(),
  warehouseId:    z.string().min(1).optional(),
});

const BatchSchema = z.object({
  type:          z.enum(['STOCK_IN', 'STOCK_OUT']),
  lines:         z.array(LineSchema),
  receiptNumber: z.string().max(50).optional().transform((val) => val && val.trim().length > 0 ? val.trim() : undefined),
  jobId:         z.string().optional(),
  supplier:      z.string().max(100).optional(),
  supplierId:    z.string().min(1).optional(),
  notes:         z.string().max(20000).optional(),
  date:          z.string().optional(),
  isDeliveryNote: z.boolean().optional(),
  existingTransactionIds: z.array(z.string()).optional(),
  billAmount:    z.number().finite().optional(),
  includeTax:    z.boolean().optional(),
  taxAmount:     z.number().finite().optional(),
  warehouseId:   z.string().min(1).optional(),
  materialUpdates: z.array(z.object({
    materialId: z.string(),
    unitCost: z.number().finite(),
    quantityUomId: z.string().optional(),
  })).optional(),
}).refine(
  (data) => data.lines.length > 0 || data.isDeliveryNote === true,
  { message: 'At least one line item required, or enable custom items only for delivery notes', path: ['lines'] }
);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const {
    type,
    lines,
    receiptNumber,
    jobId,
    supplier,
    supplierId,
    notes,
    date,
    isDeliveryNote,
    existingTransactionIds,
    billAmount,
    includeTax,
    taxAmount,
    warehouseId,
    materialUpdates,
  } = parsed.data;

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

  if (supplierId) {
    const supOk = await prisma.supplier.findFirst({
      where: { id: supplierId, companyId },
      select: { id: true },
    });
    if (!supOk) return errorResponse('Supplier not found', 422);
  }

  try {
    const actorFields = buildTransactionActorFields(session.user);
    const result = await prisma.$transaction(async (tx) => {
      const created: string[] = [];
      let preservedSignedCopy:
        | {
            signedCopyDriveId: string;
            signedCopyUrl: string | null;
          }
        | null = null;

      // Delete existing transactions and reverse stock if updating
      if (existingTransactionIds && existingTransactionIds.length > 0) {
        for (const txnId of existingTransactionIds) {
          const existingTxn = await tx.transaction.findUnique({
            where: { id: txnId },
            include: { batchesUsed: true },
          });

          if (existingTxn) {
            if (!preservedSignedCopy && existingTxn.signedCopyDriveId) {
              preservedSignedCopy = {
                signedCopyDriveId: existingTxn.signedCopyDriveId,
                signedCopyUrl: existingTxn.signedCopyUrl,
              };
            }
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
              const reversalWarehouse = await resolveEffectiveWarehouse(tx, {
                companyId,
                materialId: existingTxn.materialId,
                warehouseId: existingTxn.warehouseId,
              });
              await applyMaterialWarehouseDelta(
                tx,
                companyId,
                existingTxn.materialId,
                reversalWarehouse.warehouseId,
                decimalToNumberOrZero(existingTxn.quantity)
              );

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
              const reversalWarehouse = await resolveEffectiveWarehouse(tx, {
                companyId,
                materialId: existingTxn.materialId,
                warehouseId: existingTxn.warehouseId,
              });
              await applyMaterialWarehouseDelta(
                tx,
                companyId,
                existingTxn.materialId,
                reversalWarehouse.warehouseId,
                -decimalToNumberOrZero(existingTxn.quantity)
              );
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
                const returnWarehouse = await resolveEffectiveWarehouse(tx, {
                  companyId,
                  materialId: returnTxn.materialId,
                  warehouseId: returnTxn.warehouseId,
                });
                await applyMaterialWarehouseDelta(
                  tx,
                  companyId,
                  returnTxn.materialId,
                  returnWarehouse.warehouseId,
                  -decimalToNumberOrZero(returnTxn.quantity)
                );

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

      // If no lines (custom items only delivery note), skip transaction creation and return early
      if (lines.length === 0) {
        return {
          created: 0,
          ids: [],
          billAmount,
          includeTax,
          taxAmount,
        };
      }

      // Process each line item
      for (const line of lines) {
        const mat = await tx.material.findUnique({
          where: { id: line.materialId },
        });

        if (!mat) throw new Error(`Material ${line.materialId} not found`);

        const baseQuantity = await resolveQuantityToBase(tx, line.materialId, line.quantity, line.quantityUomId);
        const returnQtyInput = line.returnQty && line.returnQty > 0 ? line.returnQty : 0;
        const returnBase =
          returnQtyInput > 0
            ? await resolveQuantityToBase(tx, line.materialId, returnQtyInput, line.quantityUomId)
            : 0;
        const effectiveWarehouse = await resolveEffectiveWarehouse(tx, {
          companyId,
          materialId: line.materialId,
          warehouseId: line.warehouseId ?? warehouseId,
        });

        if (type === 'STOCK_OUT') {
          const fallbackUnitCost = decimalToNumberOrZero(mat.unitCost);
          const canGoNegative = mat.allowNegativeConsumption;

          // FIFO consumption
          let batches = await tx.stockBatch.findMany({
            where: {
              companyId,
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
              quantityAvailable: {
                gt: 0,
              },
            },
            orderBy: {
              receivedDate: 'asc',
            },
          });

          // If no batches exist but currentStock > 0, create opening balance batch
          const currentStock = decimalToNumberOrZero(mat.currentStock);
          if (batches.length === 0 && currentStock > 0) {
            const unitCost = decimalToNumberOrZero(mat.unitCost);
            const totalCost = currentStock * unitCost;
            const openingBatch = await tx.stockBatch.create({
              data: {
                companyId,
                materialId: line.materialId,
                warehouseId: effectiveWarehouse.warehouseId,
                batchNumber: `OPENING-${line.materialId}-${Date.now()}`,
                quantityReceived: currentStock,
                quantityAvailable: currentStock,
                unitCost: unitCost,
                totalCost: totalCost,
                receivedDate: new Date('2020-01-01'), // Historical date
                supplier: 'Opening Balance',
                notes: 'Auto-created opening balance for pre-FIFO material',
              },
            });
            batches = [openingBatch];
          }

          if (!canGoNegative && (batches.length === 0 || currentStock < baseQuantity)) {
            throw new Error(`Insufficient stock for ${mat.name}. Available: ${currentStock}`);
          }

          const availableFromBatches = batches.reduce((sum, batch) => sum + decimalToNumberOrZero(batch.quantityAvailable), 0);
          const quantityFromBatches = canGoNegative ? Math.min(baseQuantity, availableFromBatches) : baseQuantity;
          const shortfallQuantity = Math.max(0, baseQuantity - quantityFromBatches);

          const fifoResult =
            quantityFromBatches > 0
              ? calculateFIFOConsumption(
                  batches.map((b) => ({
                    id: b.id,
                    batchNumber: b.batchNumber,
                    quantityAvailable: decimalToNumberOrZero(b.quantityAvailable),
                    unitCost: decimalToNumberOrZero(b.unitCost),
                    receivedDate: b.receivedDate,
                  })),
                  quantityFromBatches
                )
              : {
                  totalCost: 0,
                  averageCost: 0,
                  batchesUsed: [],
                };

          if (!canGoNegative && fifoResult.batchesUsed.length === 0) {
            throw new Error(`Cannot fulfill ${baseQuantity} units of ${mat.name}`);
          }

          const totalCost = fifoResult.totalCost + shortfallQuantity * fallbackUnitCost;
          const averageCost = baseQuantity > 0 ? totalCost / baseQuantity : 0;

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
          await applyMaterialWarehouseDelta(
            tx,
            companyId,
            line.materialId,
            effectiveWarehouse.warehouseId,
            -baseQuantity
          );

          // Create STOCK_OUT transaction with FIFO data
          const stockOutTxn = await tx.transaction.create({
            data: {
              companyId,
              type: 'STOCK_OUT',
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
              quantity: baseQuantity,
              jobId: jobId || null,
              totalCost,
              averageCost,
              notes: notes || null,
              isDeliveryNote: isDeliveryNote || false,
              signedCopyDriveId: preservedSignedCopy && created.length === 0 ? preservedSignedCopy.signedCopyDriveId : null,
              signedCopyUrl: preservedSignedCopy && created.length === 0 ? preservedSignedCopy.signedCopyUrl : null,
              date: txDate,
              ...actorFields,
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
          if (returnBase > 0) {
            // Re-add returned quantity to stock
            await tx.material.update({
              where: { id: line.materialId },
              data: {
                currentStock: {
                  increment: returnBase,
                },
              },
            });
            await applyMaterialWarehouseDelta(
              tx,
              companyId,
              line.materialId,
              effectiveWarehouse.warehouseId,
              returnBase
            );

            const returnTxn = await tx.transaction.create({
              data: {
                companyId,
                type: 'RETURN',
                materialId: line.materialId,
                warehouseId: effectiveWarehouse.warehouseId,
                quantity: returnBase,
                jobId: jobId || null,
                parentTransactionId: stockOutTxn.id,
                notes: notes ? `Return: ${notes}` : 'Return',
                date: txDate,
                ...actorFields,
              },
            });

            created.push(returnTxn.id);
          }
        } else {
          // STOCK_IN: create batch and transaction (unitCost on line = per line UOM when quantityUomId set)
          let unitCostPerBase = decimalToNumber(line.unitCost) ?? decimalToNumberOrZero(mat.unitCost);
          if (line.quantityUomId && line.unitCost != null && line.unitCost > 0) {
            const factor = await resolveFactorToBase(tx, line.materialId, line.quantityUomId);
            unitCostPerBase = line.unitCost / factor;
          }
          const batchData = createBatchData({
            materialId: line.materialId,
            quantity: baseQuantity,
            unitCost: unitCostPerBase,
            supplier,
            supplierId,
            receiptNumber,
            receivedDate: txDate,
            notes,
          });

          // Create StockBatch record
          await tx.stockBatch.create({
            data: {
              companyId,
              warehouseId: effectiveWarehouse.warehouseId,
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
          await applyMaterialWarehouseDelta(
            tx,
            companyId,
            line.materialId,
            effectiveWarehouse.warehouseId,
            baseQuantity
          );

          // Update unit cost if provided (stored per base UOM)
          if (line.unitCost !== undefined) {
            await tx.material.update({
              where: { id: line.materialId },
              data: {
                unitCost: unitCostPerBase,
              },
            });
          }

          // Create STOCK_IN transaction
          const stockInTxn = await tx.transaction.create({
            data: {
              companyId,
              type: 'STOCK_IN',
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
              quantity: baseQuantity,
              notes: notes || null,
              date: txDate,
              ...actorFields,
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
            const previousPrice = decimalToNumberOrZero(material.unitCost);
            let currentPrice = decimalToNumber(update.unitCost) ?? 0;
            if (update.quantityUomId) {
              const factor = await resolveFactorToBase(tx, update.materialId, update.quantityUomId);
              currentPrice = update.unitCost / factor;
            }

            // Only create log if price changed
            if (!decimalEqualsNullable(previousPrice, currentPrice)) {
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
                unitCost: currentPrice,
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
        signedCopyDriveId: preservedSignedCopy?.signedCopyDriveId ?? null,
      };
    });

    if (result.signedCopyDriveId && result.ids.length > 0 && jobId) {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
      if (folderId) {
        try {
          const job = await prisma.job.findUnique({
            where: { id: jobId },
            select: {
              id: true,
              jobNumber: true,
              customerId: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

          if (job) {
            const customerId = job.customer?.id || job.customerId || 'customer';
            const customerName = job.customer?.name || 'Customer';
            const fileName = buildSignedDeliveryNoteDriveFileName(
              parseDeliveryNoteLabel(notes),
              job.jobNumber || 'JOB',
              result.ids[0],
            );

            await moveDriveFile(result.signedCopyDriveId, fileName, {
              companyId,
              rootFolderId: folderId,
              folderPath: [
                { key: 'drive-folder:customer-root', name: 'Customer' },
                {
                  key: `drive-folder:customer:${customerId}`,
                  name: buildCustomerDriveFolderName(customerName, customerId),
                },
                {
                  key: `drive-folder:job:${job.id}`,
                  name: buildJobDriveFolderName(job.jobNumber || 'JOB', job.id),
                },
              ],
            });
          }
        } catch (moveError) {
          console.error('Failed to move signed delivery note copy after save:', moveError);
        }
      }
    }

    return successResponse(result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Batch failed';
    return errorResponse(message, 400);
  }
}
