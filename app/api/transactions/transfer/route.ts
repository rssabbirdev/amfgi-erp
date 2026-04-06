/**
 * Inter-company transfer endpoint.
 * Atomically deducts stock from the source company and credits the destination company.
 * Uses two separate DB sessions (one per company connection) — committed sequentially.
 * If the destination commit fails after the source commits, a compensating transaction is created.
 */
import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { connectSystemDB }   from '@/lib/db/system';
import { Company }           from '@/lib/db/models/system/Company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';

const TransferSchema = z.object({
  destinationCompanyId: z.string().min(1),
  materialId:           z.string().min(1),
  quantity:             z.number().min(0.001),
  notes:                z.string().max(500).optional(),
  date:                 z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  const srcDbName = session.user.activeCompanyDbName;
  if (!srcDbName) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = TransferSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { destinationCompanyId, materialId, quantity, notes, date } = parsed.data;
  const txDate = date ? new Date(date) : new Date();

  // Resolve destination company
  await connectSystemDB();
  const destCompany = await Company.findById(destinationCompanyId).lean();
  if (!destCompany) return errorResponse('Destination company not found', 404);
  if (!destCompany.isActive) return errorResponse('Destination company is inactive', 400);

  const destDbName = destCompany.dbName;
  if (srcDbName === destDbName) return errorResponse('Source and destination cannot be the same', 400);

  const srcCompanySlug  = session.user.activeCompanySlug ?? srcDbName;
  const destCompanySlug = destCompany.slug;

  // Get both connections and verify material exists in source
  const srcConn  = await getCompanyDB(srcDbName);
  const destConn = await getCompanyDB(destDbName);
  const { Material: SrcMaterial, Transaction: SrcTransaction } = getModels(srcConn);
  const { Material: DestMaterial, Transaction: DestTransaction } = getModels(destConn);

  // Check source material exists and has sufficient stock
  const srcMaterial = await SrcMaterial.findById(materialId).lean();
  if (!srcMaterial) return errorResponse('Material not found in source company', 404);
  if (srcMaterial.currentStock < quantity) {
    return errorResponse(
      `Insufficient stock. Available: ${srcMaterial.currentStock} ${srcMaterial.unit}`,
      400
    );
  }

  // Find or create matching material in destination by name + unit
  let destMaterial = await DestMaterial.findOne({
    name: srcMaterial.name,
    unit: srcMaterial.unit,
  }).lean();

  if (!destMaterial) {
    // Auto-create material in destination company
    destMaterial = await DestMaterial.create({
      name:         srcMaterial.name,
      unit:         srcMaterial.unit,
      description:  srcMaterial.description,
      unitCost:     srcMaterial.unitCost,
      minStock:     srcMaterial.minStock,
      currentStock: 0,
      isActive:     true,
    });
  }

  const destMaterialId = (destMaterial as { _id: Types.ObjectId })._id;
  const performedBy    = session.user.id;

  // --- Phase 1: Deduct from source ---
  const srcSession = await srcConn.startSession();
  srcSession.startTransaction();
  let srcTxId: Types.ObjectId;

  try {
    await SrcMaterial.findByIdAndUpdate(
      materialId,
      { $inc: { currentStock: -quantity } },
      { session: srcSession }
    );

    const [srcTx] = await SrcTransaction.create(
      [
        {
          type:              'TRANSFER_OUT',
          materialId:        new Types.ObjectId(materialId),
          quantity,
          counterpartCompany: destCompanySlug,
          notes,
          date:              txDate,
          performedBy,
        },
      ],
      { session: srcSession }
    );

    await srcSession.commitTransaction();
    srcTxId = srcTx._id as Types.ObjectId;
  } catch (err: unknown) {
    await srcSession.abortTransaction();
    return errorResponse(err instanceof Error ? err.message : 'Transfer deduction failed', 400);
  } finally {
    srcSession.endSession();
  }

  // --- Phase 2: Credit destination ---
  const destSession = await destConn.startSession();
  destSession.startTransaction();

  try {
    await DestMaterial.findByIdAndUpdate(
      destMaterialId,
      { $inc: { currentStock: quantity } },
      { session: destSession }
    );

    await DestTransaction.create(
      [
        {
          type:              'TRANSFER_IN',
          materialId:        destMaterialId,
          quantity,
          counterpartCompany: srcCompanySlug,
          notes,
          date:              txDate,
          performedBy,
        },
      ],
      { session: destSession }
    );

    await destSession.commitTransaction();
  } catch (err: unknown) {
    await destSession.abortTransaction();

    // Compensating transaction: re-credit source
    try {
      await SrcMaterial.findByIdAndUpdate(materialId, { $inc: { currentStock: quantity } });
      await SrcTransaction.create({
        type:              'TRANSFER_IN',
        materialId:        new Types.ObjectId(materialId),
        quantity,
        counterpartCompany: destCompanySlug,
        notes:             `[COMPENSATION] Destination credit failed — stock restored. Original txId: ${srcTxId}`,
        date:              new Date(),
        performedBy,
      });
    } catch {
      // Log compensation failure — manual intervention needed
      console.error('[TRANSFER] Compensation failed for srcTxId:', srcTxId.toString());
    }

    return errorResponse('Transfer credit failed — source stock has been restored', 500);
  } finally {
    destSession.endSession();
  }

  return successResponse({
    transferredQty:     quantity,
    materialName:       srcMaterial.name,
    sourceCompany:      srcCompanySlug,
    destinationCompany: destCompanySlug,
  }, 201);
}
