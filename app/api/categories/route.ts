import { auth } from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  try {
    const conn = await getCompanyDB(dbName);
    const { Category } = getModels(conn);

    const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();
    return successResponse(categories, 200);
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
  const parsed = CategorySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const conn = await getCompanyDB(dbName);
    const { Category } = getModels(conn);

    const category = await Category.create({
      name: parsed.data.name.trim(),
      isActive: true,
    });

    return successResponse(category, 201);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Creation failed';
    if (errMsg.includes('duplicate')) {
      return errorResponse('Category already exists', 409);
    }
    return errorResponse(errMsg, 400);
  }
}
