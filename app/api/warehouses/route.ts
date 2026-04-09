import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const WarehouseSchema = z.object({
  name: z.string().min(1).max(100),
  location: z.string().max(200).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const warehouses = await prisma.warehouse.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
    return successResponse(warehouses, 200);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Fetch failed', 400);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = WarehouseSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const warehouse = await prisma.warehouse.create({
      data: {
        name: parsed.data.name.trim(),
        location: parsed.data.location?.trim() || null,
        companyId: session.user.activeCompanyId,
        isActive: true,
      },
    });

    return successResponse(warehouse, 201);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Creation failed';
    if (errMsg.includes('Unique constraint failed')) {
      return errorResponse('Warehouse already exists for this company', 409);
    }
    return errorResponse(errMsg, 400);
  }
}
