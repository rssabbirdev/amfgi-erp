import { auth }              from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';

const MaterialSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional(),
  unit:                z.string().min(1).max(20),
  category:            z.string().min(1).max(100).optional(),
  warehouse:           z.string().min(1).max(100).optional(),
  stockType:           z.string().min(1).max(50),
  externalItemName:    z.string().min(1).max(100).optional(),
  unitCost:            z.number().min(0).optional(),
  reorderLevel:        z.number().min(0).optional(),
  currentStock:        z.number().min(0).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const materials = await prisma.material.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      isActive: true,
    },
    orderBy: { name: 'asc' },
  });

  return successResponse(materials);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('material.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = MaterialSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  // Check if material name already exists for this company
  const existing = await prisma.material.findUnique({
    where: {
      companyId_name: {
        companyId: session.user.activeCompanyId,
        name: parsed.data.name,
      },
    },
  });
  if (existing) return errorResponse('Material with this name already exists', 409);

  const material = await prisma.material.create({
    data: {
      ...parsed.data,
      externalItemName: parsed.data.externalItemName ?? null,
      companyId: session.user.activeCompanyId,
      currentStock: 0,
      isActive: true,
    },
  });

  return successResponse(material, 201);
}
