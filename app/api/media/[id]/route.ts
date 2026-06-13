import { auth } from '@/auth';
import { canAccessSettingsMedia } from '@/lib/auth/settingsAccess';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { deleteFromDrive } from '@/lib/utils/googleDrive';
import { extractGoogleDriveFileId } from '@/lib/utils/googleDriveUrl';

function canAccess(user: AppSessionUser) {
  const canManage = canAccessSettingsMedia({
    isSuperAdmin: user.isSuperAdmin ?? false,
    permissions: (user.permissions ?? []) as string[],
  });
  return { canManage, companyId: user.activeCompanyId };
}

/** Delete one unused (no links) media asset and its Drive file. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { canManage, companyId } = canAccess(session.user);
  if (!canManage) return errorResponse('Forbidden', 403);
  if (!companyId) return errorResponse('No active company selected', 400);

  const { id } = await ctx.params;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id, companyId },
    include: { _count: { select: { links: true } } },
  });

  if (!asset) return errorResponse('Not found', 404);
  if (asset._count.links > 0) {
    return errorResponse('File is in use; unlink or replace it on the owning record first', 400);
  }

  try {
    const driveId = extractGoogleDriveFileId(asset.driveId);
    if (driveId) {
      await deleteFromDrive(driveId, companyId);
    }
  } catch (e) {
    console.error('Drive delete failed for media asset', asset.id, e);
  }

  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  return successResponse({ ok: true });
}
