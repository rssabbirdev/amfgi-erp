import { auth } from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const LogSchema = z.object({
  materialId: z.string().min(1),
  action: z.enum(['created', 'updated']),
  changes: z.record(z.string(), z.any()),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const conn = await getCompanyDB(dbName);
    const { MaterialLog } = getModels(conn);

    const log = await MaterialLog.create({
      materialId: parsed.data.materialId,
      action: parsed.data.action,
      changes: parsed.data.changes,
      changedBy: session.user.name || session.user.email || session.user.id,
      timestamp: new Date(),
    });

    return successResponse(log, 201);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create log', 400);
  }
}
