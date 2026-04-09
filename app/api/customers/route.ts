import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CustomerSchema = z.object({
  name:          z.string().min(1).max(100),
  contactPerson: z.string().max(100).optional(),
  phone:         z.string().max(30).optional(),
  email:         z.string().email().optional().or(z.literal('')),
  address:       z.string().max(300).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const customers = await prisma.customer.findMany({
    where: {
      companyId: session.user.activeCompanyId,
      isActive: true,
    },
    orderBy: { name: 'asc' },
  });
  return successResponse(customers);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.create')) {
    return errorResponse('Forbidden', 403);
  }

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = CustomerSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const customer = await prisma.customer.create({
      data: {
        ...parsed.data,
        companyId: session.user.activeCompanyId,
        email: parsed.data.email || null,
        isActive: true,
      },
    });
    return successResponse(customer, 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create customer';
    if (errorMsg.includes('Unique constraint failed')) {
      return errorResponse('Customer name already exists for this company', 409);
    }
    return errorResponse(errorMsg, 500);
  }
}
