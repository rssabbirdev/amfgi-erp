import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';
import { Types }             from 'mongoose';

const TransactionSchema = z.object({
  type:                z.enum(['STOCK_IN', 'STOCK_OUT', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT']),
  materialId:          z.string().min(1),
  quantity:            z.number().min(0.001),
  jobId:               z.string().optional(),
  parentTransactionId: z.string().optional(),
  notes:               z.string().max(500).optional(),
  date:                z.string().optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in') &&
      !session.user.permissions.includes('transaction.stock_out') &&
      !session.user.permissions.includes('transaction.return')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const type  = searchParams.get('type');
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

  const conn = await getCompanyDB(dbName);
  const { Transaction } = getModels(conn);

  const filter: Record<string, unknown> = {};
  if (jobId) filter.jobId = new Types.ObjectId(jobId);
  if (type)  filter.type  = type;

  const transactions = await Transaction.find(filter)
    .populate('materialId', 'name unit')
    .populate('jobId', 'jobNumber')
    .sort({ date: -1 })
    .limit(limit)
    .lean();
  return successResponse(transactions);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const body   = await req.json();
  const parsed = TransactionSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const { type, materialId, quantity, jobId, parentTransactionId, notes, date } = parsed.data;

  // Permission check per transaction type
  const permMap: Record<string, string> = {
    STOCK_IN:      'transaction.stock_in',
    STOCK_OUT:     'transaction.stock_out',
    RETURN:        'transaction.return',
    TRANSFER_IN:   'transaction.transfer',
    TRANSFER_OUT:  'transaction.transfer',
  };
  const requiredPerm = permMap[type];
  if (!session.user.isSuperAdmin && !session.user.permissions.includes(requiredPerm as never)) {
    return errorResponse('Forbidden', 403);
  }

  if ((type === 'STOCK_OUT' || type === 'RETURN') && !jobId) {
    return errorResponse('jobId is required for dispatches and returns', 400);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const conn = await getCompanyDB(dbName);
  const { Material, Transaction } = getModels(conn);

  const dbSession = await conn.startSession();
  dbSession.startTransaction();

  try {
    const delta =
      type === 'STOCK_IN'  ?  quantity :
      type === 'STOCK_OUT' ? -quantity :
                              quantity; // RETURN adds back

    if (type === 'STOCK_OUT') {
      const mat = await Material.findById(materialId).session(dbSession);
      if (!mat) throw new Error('Material not found');
      if (mat.currentStock < quantity) {
        throw new Error(`Insufficient stock. Available: ${mat.currentStock} ${mat.unit}`);
      }
    }

    await Material.findByIdAndUpdate(
      materialId,
      { $inc: { currentStock: delta } },
      { session: dbSession }
    );

    const [tx] = await Transaction.create(
      [
        {
          type,
          materialId:          new Types.ObjectId(materialId),
          quantity,
          jobId:               jobId               ? new Types.ObjectId(jobId)               : null,
          parentTransactionId: parentTransactionId ? new Types.ObjectId(parentTransactionId) : null,
          notes,
          date:                date ? new Date(date) : new Date(),
          performedBy:         session.user.id, // string — cross-DB
        },
      ],
      { session: dbSession }
    );

    await dbSession.commitTransaction();

    const populated = await Transaction.findById(tx._id)
      .populate('materialId', 'name unit')
      .lean();

    return successResponse(populated, 201);
  } catch (err: unknown) {
    await dbSession.abortTransaction();
    return errorResponse(err instanceof Error ? err.message : 'Transaction failed', 400);
  } finally {
    dbSession.endSession();
  }
}
