import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
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

  const { searchParams } = new URL(req.url);
  const requestedCompanyId = searchParams.get('companyId')?.trim() || session.user.activeCompanyId;
  const isCrossCompanyRequest = requestedCompanyId !== session.user.activeCompanyId;

  if (
    isCrossCompanyRequest &&
    !session.user.isSuperAdmin &&
    !session.user.permissions.includes('transaction.transfer')
  ) {
    return errorResponse('Forbidden', 403);
  }

  try {
    const warehouses = await prisma.warehouse.findMany({
      where: {
        companyId: requestedCompanyId,
        isActive: true,
        isSystem: false,
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
    const companyId = session.user.activeCompanyId;
    const warehouse = await prisma.warehouse.create({
      data: {
        name: parsed.data.name.trim(),
        location: parsed.data.location?.trim() || null,
        companyId,
        isActive: true,
      },
    });

    publishLiveUpdate({
      companyId,
      channel: 'settings',
      entity: 'warehouse',
      action: 'created',
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
