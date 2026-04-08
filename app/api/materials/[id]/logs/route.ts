import { auth } from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const { id } = await params;

  try {
    const conn = await getCompanyDB(dbName);
    const { MaterialLog } = getModels(conn);

    const logs = await MaterialLog.find({ materialId: id })
      .sort({ timestamp: -1 })
      .lean();

    return successResponse(logs || []);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to fetch logs', 400);
  }
}
