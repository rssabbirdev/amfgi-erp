import { auth } from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PriceLogSchema = z.object({
  materialId: z.string().min(1),
  previousPrice: z.number().min(0),
  currentPrice: z.number().min(0),
  source: z.enum(['manual', 'bill']),
  billId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = PriceLogSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  // Only create log if prices are different
  if (parsed.data.previousPrice === parsed.data.currentPrice) {
    return successResponse({ skipped: true }, 200);
  }

  try {
    const conn = await getCompanyDB(dbName);
    const { PriceLog } = getModels(conn);

    const log = await PriceLog.create({
      materialId: parsed.data.materialId,
      previousPrice: parsed.data.previousPrice,
      currentPrice: parsed.data.currentPrice,
      source: parsed.data.source,
      changedBy: session.user.name || session.user.email || session.user.id,
      billId: parsed.data.billId,
      notes: parsed.data.notes,
      timestamp: new Date(),
    });

    return successResponse(log, 201);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create price log', 400);
  }
}
