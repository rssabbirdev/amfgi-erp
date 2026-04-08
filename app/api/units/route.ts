import { auth } from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const UnitSchema = z.object({
  name: z.string().min(1).max(50),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  try {
    const conn = await getCompanyDB(dbName);
    const { Unit } = getModels(conn);

    const units = await Unit.find({ isActive: true }).sort({ name: 1 }).lean();
    return successResponse(units, 200);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Fetch failed', 400);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = UnitSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const conn = await getCompanyDB(dbName);
    const { Unit } = getModels(conn);

    const unit = await Unit.create({
      name: parsed.data.name.trim(),
      isActive: true,
    });

    return successResponse(unit, 201);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Creation failed';
    if (errMsg.includes('duplicate')) {
      return errorResponse('Unit already exists', 409);
    }
    return errorResponse(errMsg, 400);
  }
}
