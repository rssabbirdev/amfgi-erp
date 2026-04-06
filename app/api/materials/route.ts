import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';

const MaterialSchema = z.object({
  name:         z.string().min(1).max(100),
  unit:         z.string().min(1).max(20),
  description:  z.string().max(500).optional(),
  unitCost:     z.number().min(0).optional(),
  minStock:     z.number().min(0).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const conn = await getCompanyDB(dbName);
  const { Material } = getModels(conn);
  const materials = await Material.find({ isActive: true }).sort({ name: 1 }).lean();
  return successResponse(materials);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.create')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = MaterialSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const conn = await getCompanyDB(dbName);
  const { Material } = getModels(conn);
  const material = await Material.create({ ...parsed.data, currentStock: 0, isActive: true });
  return successResponse(material, 201);
}
