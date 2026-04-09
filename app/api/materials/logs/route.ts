import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const LogSchema = z.object({
  materialId: z.string().min(1),
  action: z.enum(['created', 'updated']),
  changes: z.record(z.string(), z.any()),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const body = await req.json();
  const parsed = LogSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  try {
    // Verify material exists and belongs to this company
    const material = await prisma.material.findUnique({
      where: { id: parsed.data.materialId },
    });
    if (!material || material.companyId !== session.user.activeCompanyId) {
      return errorResponse('Material not found', 404);
    }

    const log = await prisma.materialLog.create({
      data: {
        companyId: session.user.activeCompanyId,
        materialId: parsed.data.materialId,
        action: parsed.data.action,
        changes: parsed.data.changes,
        changedBy: session.user.name || session.user.email || session.user.id,
      },
    });

    return successResponse(log, 201);
  } catch (err: unknown) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to create log', 400);
  }
}
