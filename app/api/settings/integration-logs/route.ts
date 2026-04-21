import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function hasManagePermission(user: AppSessionUser) {
  const isSA = user.isSuperAdmin ?? false;
  const perms = (user.permissions ?? []) as string[];
  return isSA || perms.includes('settings.manage');
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasManagePermission(session.user)) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status')?.trim() || undefined;
  const from = searchParams.get('from')?.trim() || undefined;
  const to = searchParams.get('to')?.trim() || undefined;
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 50), 1), 200);
  const cursorId = searchParams.get('cursor')?.trim() || undefined;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  const where = {
    companyId: session.user.activeCompanyId,
    ...(status ? { status } : {}),
    ...((fromDate || toDate)
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const rows = await prisma.integrationSyncLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

  return successResponse({ items, nextCursor });
}
