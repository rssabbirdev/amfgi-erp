import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CategorySchema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const categories = await prisma.category.findMany({
      where: {
        companyId: session.user.activeCompanyId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
    return successResponse(categories, 200);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Fetch failed', 400);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = CategorySchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    const category = await prisma.category.create({
      data: {
        name: parsed.data.name.trim(),
        companyId: session.user.activeCompanyId,
        isActive: true,
      },
    });

    return successResponse(category, 201);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Creation failed';
    if (errMsg.includes('Unique constraint failed')) {
      return errorResponse('Category already exists for this company', 409);
    }
    return errorResponse(errMsg, 400);
  }
}
