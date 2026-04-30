import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildTransactionActorFields } from '@/lib/utils/auditActor';
import { decimalEqualsNullable, decimalToNumber, decimalToNumberOrZero } from '@/lib/utils/decimal';
import { z } from 'zod';
import { calculateFIFOConsumption } from '@/lib/utils/fifoConsumption';
import { createBatchData } from '@/lib/utils/stockBatchManagement';
import {
  consumeTransactionBatchQuantities,
  createTransactionBatchRecords,
  normalizeTransactionBatchLinks,
  restoreTransactionBatchQuantities,
  type TransactionBatchLinkInput,
} from '@/lib/utils/transactionBatchLinks';
import { resolveQuantityToBase, resolveFactorToBase } from '@/lib/utils/materialUomDb';
import { applyMaterialWarehouseDelta, resolveEffectiveWarehouse } from '@/lib/warehouses/stockWarehouses';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import {
  buildCustomerDriveFolderName,
  buildJobDriveFolderName,
  buildSignedDeliveryNoteDriveFileName,
  moveDriveFile,
} from '@/lib/utils/googleDrive';
import { upsertStockExceptionApproval } from '@/lib/utils/stockExceptionApproval';

function parseDeliveryNoteLabel(notes?: string | null): string {
  const match = notes?.match(/--- DELIVERY NOTE #(\d+)/);
  const raw = match?.[1] ?? '';
  return `DN${(raw || '0').padStart(3, '0')}`;
}

function buildStockInReceiptNote(notes?: string, receiptNumber?: string) {
  const trimmed = notes?.trim() || '';
  if (!receiptNumber) return trimmed || null;
  const marker = `[RECEIPT:${receiptNumber}]`;
  return trimmed ? `${trimmed}\n${marker}` : marker;
}

function buildStockOutOverrideNote(notes?: string, overrideReason?: string) {
  const trimmedNotes = notes?.trim() || '';
  const trimmedReason = overrideReason?.trim() || '';
  if (!trimmedReason) return trimmedNotes || null;
  const marker = `[OVERRIDE_REASON:${trimmedReason}]`;
  return trimmedNotes ? `${marker}\n${trimmedNotes}` : marker;
}

function buildReturnBatchLinks(
  stockOutTxnId: string,
  materialId: string,
  warehouseId: string,
  txDate: Date,
  quantityToReturn: number,
  sourceLinks: readonly TransactionBatchLinkInput[],
  fallbackUnitCost: number,
  notes?: string | null
) {
  let remaining = quantityToReturn;
  const returnLinks: TransactionBatchLinkInput[] = [];
  let syntheticBatch:
    | {
        materialId: string;
        warehouseId: string;
        batchNumber: string;
        quantityReceived: number;
        quantityAvailable: number;
        unitCost: number;
        totalCost: number;
        receivedDate: Date;
        supplier: string;
        notes: string;
      }
    | null = null;

  for (const sourceLink of sourceLinks) {
    if (remaining <= 0) break;
    const quantityFromBatch = Math.min(remaining, sourceLink.quantityFromBatch);
    if (quantityFromBatch <= 0) continue;

    returnLinks.push({
      batchId: sourceLink.batchId,
      batchNumber: sourceLink.batchNumber,
      quantityFromBatch,
      unitCost: sourceLink.unitCost,
      costAmount: quantityFromBatch * sourceLink.unitCost,
    });
    remaining -= quantityFromBatch;
  }

  if (remaining > 0) {
    const syntheticBatchNumber = `RETURN-${stockOutTxnId.slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    syntheticBatch = {
      materialId,
      warehouseId,
      batchNumber: syntheticBatchNumber,
      quantityReceived: remaining,
      quantityAvailable: remaining,
      unitCost: fallbackUnitCost,
      totalCost: remaining * fallbackUnitCost,
      receivedDate: txDate,
      supplier: 'Return Adjustment',
      notes: notes?.trim()
        ? `Auto-created return batch for previously batchless quantity. ${notes.trim()}`
        : 'Auto-created return batch for previously batchless quantity.',
    };
  }

  return { returnLinks, syntheticBatch };
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
  overrideReason: z.string().max(500).optional(),
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
})
  .refine(
    (data) => data.lines.length > 0 || data.isDeliveryNote === true,
    { message: 'At least one line item required, or enable custom items only for delivery notes', path: ['lines'] }
  )
  .refine(
    (data) => data.type !== 'STOCK_IN' || Boolean(data.receiptNumber),
    { message: 'Receipt number is required for goods receipt', path: ['receiptNumber'] }
  )
  .refine(
    (data) =>
      (data.type !== 'STOCK_IN' && data.type !== 'STOCK_OUT') ||
      data.lines.every((line) => Boolean(line.warehouseId?.trim())),
    { message: 'Warehouse is required for every stock line', path: ['lines'] }
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
    overrideReason,
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
  const actorName = session.user.name || session.user.email || session.user.id || null;

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
      const materialCostById = new Map<string, number>();
      let preservedSignedCopy:
        | {
            signedCopyDriveId: string;
            signedCopyUrl: string | null;
          }
        | null = null;

      // Delete existing transactions and reverse stock if updating
      if (existingTransactionIds && existingTransactionIds.length > 0) {
        await tx.stockExceptionApproval.deleteMany({
          where: {
            companyId,
            exceptionType: 'DISPATCH_OVERRIDE',
            referenceId: {
              in: existingTransactionIds,
            },
          },
        });

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
                await restoreTransactionBatchQuantities(
                  tx,
                  normalizeTransactionBatchLinks(existingTxn.batchesUsed)
                );
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
                include: {
                  batchesUsed: true,
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

                if (returnTxn.batchesUsed && returnTxn.batchesUsed.length > 0) {
                  await consumeTransactionBatchQuantities(
                    tx,
                    normalizeTransactionBatchLinks(returnTxn.batchesUsed),
                    'Stock changed while removing a linked return. Please refresh and submit again.'
                  );
                }

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
        if (returnBase > baseQuantity) {
          throw new Error(`Return quantity cannot exceed dispatch quantity for ${mat.name}`);
        }
        const effectiveWarehouse = await resolveEffectiveWarehouse(tx, {
          companyId,
          materialId: line.materialId,
          warehouseId: line.warehouseId ?? warehouseId,
        });
        const warehouseStockRow = await tx.materialWarehouseStock.findUnique({
          where: {
            companyId_materialId_warehouseId: {
              companyId,
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
            },
          },
          select: {
            currentStock: true,
          },
        });
        const currentWarehouseStock = decimalToNumberOrZero(warehouseStockRow?.currentStock);

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

          // If no batches exist but warehouse stock > 0, create an opening batch for that warehouse.
          if (batches.length === 0 && currentWarehouseStock > 0) {
            const unitCost = decimalToNumberOrZero(mat.unitCost);
            const totalCost = currentWarehouseStock * unitCost;
            const openingBatch = await tx.stockBatch.create({
              data: {
                companyId,
                materialId: line.materialId,
                warehouseId: effectiveWarehouse.warehouseId,
                batchNumber: `OPENING-${line.materialId}-${Date.now()}`,
                quantityReceived: currentWarehouseStock,
                quantityAvailable: currentWarehouseStock,
                unitCost: unitCost,
                totalCost: totalCost,
                receivedDate: new Date('2020-01-01'), // Historical date
                supplier: 'Opening Balance',
                notes: 'Auto-created opening balance for pre-FIFO warehouse stock',
              },
            });
            batches = [openingBatch];
          }

          if (!canGoNegative && (batches.length === 0 || currentWarehouseStock < baseQuantity)) {
            throw new Error(
              `Insufficient stock for ${mat.name} in ${effectiveWarehouse.warehouseName}. Available: ${currentWarehouseStock}`
            );
          }

          const availableFromBatches = batches.reduce((sum, batch) => sum + decimalToNumberOrZero(batch.quantityAvailable), 0);
          const quantityFromBatches = canGoNegative ? Math.min(baseQuantity, availableFromBatches) : baseQuantity;
          const shortfallQuantity = Math.max(0, baseQuantity - quantityFromBatches);

          if (canGoNegative && shortfallQuantity > 0.0005 && !overrideReason?.trim()) {
            throw new Error(
              `Override reason is required for ${mat.name} because the dispatch exceeds available FIFO stock in ${effectiveWarehouse.warehouseName}.`
            );
          }

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
          const batchLinkData: TransactionBatchLinkInput[] = [];
          for (const batchUsed of fifoResult.batchesUsed) {
            // batchUsed.batchId is already the Prisma string ID from FIFO calculation
            const prismaId = batchUsed.batchId.toString();
            batchLinkData.push({
              batchNumber: batchUsed.batchNumber,
              quantityFromBatch: batchUsed.quantityFromBatch,
              unitCost: batchUsed.unitCost,
              costAmount: batchUsed.costAmount,
              batchId: prismaId,
            });
          }
          await consumeTransactionBatchQuantities(
            tx,
            batchLinkData,
            `Stock changed while dispatching ${mat.name}. Please refresh and submit again.`
          );

          // Update material stock
          if (canGoNegative) {
            await tx.material.update({
              where: { id: line.materialId },
              data: {
                currentStock: {
                  decrement: baseQuantity,
                },
              },
            });
          } else {
            const stockUpdateResult = await tx.material.updateMany({
              where: {
                id: line.materialId,
                currentStock: {
                  gte: baseQuantity,
                },
              },
              data: {
                currentStock: {
                  decrement: baseQuantity,
                },
              },
            });
            if (stockUpdateResult.count === 0) {
              throw new Error(
                `Insufficient stock for ${mat.name}. Stock changed by another user; refresh and retry.`
              );
            }
          }
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
              notes: buildStockOutOverrideNote(notes, overrideReason),
              isDeliveryNote: isDeliveryNote || false,
              signedCopyDriveId: preservedSignedCopy && created.length === 0 ? preservedSignedCopy.signedCopyDriveId : null,
              signedCopyUrl: preservedSignedCopy && created.length === 0 ? preservedSignedCopy.signedCopyUrl : null,
              date: txDate,
              ...actorFields,
            },
          });

          if (overrideReason?.trim()) {
            const isAutoApproved = Boolean(session.user.isSuperAdmin);
            await upsertStockExceptionApproval(tx, {
              companyId,
              exceptionType: 'DISPATCH_OVERRIDE',
              referenceId: stockOutTxn.id,
              referenceNumber: stockOutTxn.id,
              reason: overrideReason.trim(),
              createdById: session.user.id ?? null,
              createdByName: actorName,
              status: isAutoApproved ? 'APPROVED' : 'PENDING',
              decidedById: isAutoApproved ? (session.user.id ?? null) : null,
              decidedByName: isAutoApproved ? actorName : null,
              decidedAt: isAutoApproved ? txDate : null,
              decisionNote: isAutoApproved
                ? 'Auto-approved because override was posted by super admin.'
                : null,
            });
          }

          // Create TransactionBatch junction entries
          await createTransactionBatchRecords(tx, stockOutTxn.id, batchLinkData);

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

            const { returnLinks, syntheticBatch } = buildReturnBatchLinks(
              stockOutTxn.id,
              line.materialId,
              effectiveWarehouse.warehouseId,
              txDate,
              returnBase,
              batchLinkData,
              averageCost || fallbackUnitCost,
              notes || null
            );

            if (returnLinks.length > 0) {
              await restoreTransactionBatchQuantities(tx, returnLinks);
              await createTransactionBatchRecords(tx, returnTxn.id, returnLinks);
            }

            if (syntheticBatch) {
              const createdReturnBatch = await tx.stockBatch.create({
                data: {
                  companyId,
                  ...syntheticBatch,
                },
              });
              await tx.transactionBatch.create({
                data: {
                  transactionId: returnTxn.id,
                  batchId: createdReturnBatch.id,
                  batchNumber: createdReturnBatch.batchNumber,
                  quantityFromBatch: syntheticBatch.quantityReceived,
                  unitCost: syntheticBatch.unitCost,
                  costAmount: syntheticBatch.totalCost,
                },
              });
            }

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

          // Capture unit cost updates (stored per base UOM) and apply once with price logging later.
          if (line.unitCost !== undefined) {
            materialCostById.set(line.materialId, unitCostPerBase);
          }

          // Create STOCK_IN transaction
          const stockInTxn = await tx.transaction.create({
            data: {
              companyId,
              type: 'STOCK_IN',
              materialId: line.materialId,
              warehouseId: effectiveWarehouse.warehouseId,
              quantity: baseQuantity,
              notes: buildStockInReceiptNote(notes, receiptNumber),
              date: txDate,
              ...actorFields,
            },
          });

          created.push(stockInTxn.id);
        }
      }

      // Update material unit costs and create price logs.
      // Priority: explicit materialUpdates payload. Fallback: unitCost provided on STOCK_IN lines.
      const requestedMaterialCostUpdates = new Map<string, number>();
      if (materialUpdates && materialUpdates.length > 0) {
        for (const update of materialUpdates) {
          let currentPrice = decimalToNumber(update.unitCost) ?? 0;
          if (update.quantityUomId) {
            const factor = await resolveFactorToBase(tx, update.materialId, update.quantityUomId);
            currentPrice = update.unitCost / factor;
          }
          requestedMaterialCostUpdates.set(update.materialId, currentPrice);
        }
      }
      for (const [materialId, currentPrice] of materialCostById) {
        if (!requestedMaterialCostUpdates.has(materialId)) {
          requestedMaterialCostUpdates.set(materialId, currentPrice);
        }
      }

      if (requestedMaterialCostUpdates.size > 0) {
        for (const [materialId, currentPrice] of requestedMaterialCostUpdates) {
          const material = await tx.material.findUnique({
            where: { id: materialId },
          });

          if (material) {
            const previousPrice = decimalToNumberOrZero(material.unitCost);

            // Only create log if price changed
            if (!decimalEqualsNullable(previousPrice, currentPrice)) {
              await tx.priceLog.create({
                data: {
                  companyId,
                  materialId,
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
              where: { id: materialId },
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

    publishLiveUpdate({
      companyId,
      channel: 'stock',
      entity: type === 'STOCK_IN' ? 'receipt' : 'dispatch',
      action: existingTransactionIds && existingTransactionIds.length > 0 ? 'updated' : 'created',
    });

    return successResponse(result, 201);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Batch failed';
    return errorResponse(message, 400);
  }
}
