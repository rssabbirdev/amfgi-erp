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

/** Delete all media rows (and Drive files) in the active company that have no usage links. */
export async function POST() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { canManage, companyId } = canAccess(session.user);
  if (!canManage) return errorResponse('Forbidden', 403);
  if (!companyId) return errorResponse('No active company selected', 400);

  const orphans = await prisma.mediaAsset.findMany({
    where: { companyId, links: { none: {} } },
    select: { id: true, driveId: true },
  });

  let deleted = 0;
  const driveErrors: string[] = [];

  for (const row of orphans) {
    try {
      const driveId = extractGoogleDriveFileId(row.driveId);
      if (driveId) await deleteFromDrive(driveId, companyId);
    } catch (e) {
      driveErrors.push(
        row.driveId + (e instanceof Error ? `: ${e.message}` : ': unknown error')
      );
    }
    await prisma.mediaAsset.delete({ where: { id: row.id } });
    deleted += 1;
  }

  return successResponse({ deleted, attempted: orphans.length, driveErrors });
}
