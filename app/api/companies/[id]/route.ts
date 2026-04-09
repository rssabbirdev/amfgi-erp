import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';

const UpdateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  isActive:    z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { id } = await params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return errorResponse('Company not found', 404);

  return successResponse(company);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;

  const company = await prisma.company.update({
    where: { id },
    data: update,
  });

  if (!company) return errorResponse('Company not found', 404);
  return successResponse(company);
}
