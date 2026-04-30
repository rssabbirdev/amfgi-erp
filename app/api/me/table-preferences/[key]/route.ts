import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';

const TablePreferenceSchema = z.object({
  order: z.array(z.string().min(1)).default([]),
  visible: z.record(z.string(), z.boolean()).default({}),
});

function normalizePreferenceKey(value: string) {
  return value.trim().toLowerCase();
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return errorResponse('Unauthorized', 401);
    if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

    const { key } = await context.params;
    const preference = await prisma.userTablePreference.findUnique({
      where: {
        userId_companyId_key: {
          userId: session.user.id,
          companyId: session.user.activeCompanyId,
          key: normalizePreferenceKey(key),
        },
      },
    });

    return successResponse(preference?.state ?? null);
  } catch (error) {
    console.error('Failed to load user table preference', error);
    return errorResponse('Table preference storage unavailable', 503);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ key: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return errorResponse('Unauthorized', 401);
    if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

    const body = await req.json();
    const parsed = TablePreferenceSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    }

    const { key } = await context.params;
    const preference = await prisma.userTablePreference.upsert({
      where: {
        userId_companyId_key: {
          userId: session.user.id,
          companyId: session.user.activeCompanyId,
          key: normalizePreferenceKey(key),
        },
      },
      update: {
        state: parsed.data,
      },
      create: {
        userId: session.user.id,
        companyId: session.user.activeCompanyId,
        key: normalizePreferenceKey(key),
        state: parsed.data,
      },
    });

    return successResponse(preference.state);
  } catch (error) {
    console.error('Failed to save user table preference', error);
    return errorResponse('Table preference storage unavailable', 503);
  }
}
