import { prisma } from '@/lib/db/prisma';
import { deleteFromDrive } from '@/lib/utils/googleDrive';
import { extractGoogleDriveFileId } from '@/lib/utils/googleDriveUrl';

export const MEDIA_KIND_USER_PROFILE = 'USER_PROFILE_IMAGE';
export const MEDIA_KIND_USER_SIGNATURE = 'USER_SIGNATURE';

export type UserMediaKind = typeof MEDIA_KIND_USER_PROFILE | typeof MEDIA_KIND_USER_SIGNATURE;

/**
 * After a new file is on Drive: detach old link, remove orphan DB rows, attach new MediaAsset + link, update User.
 * Deletes the previous Drive file (if any) after the transaction succeeds.
 */
export async function finalizeUserMediaUpload(params: {
  userId: string;
  companyId: string;
  kind: UserMediaKind;
  newFileUrl: string;
  mimeType: string;
  fileName: string;
  bytes: number;
  uploadedById: string;
}): Promise<{ displayUrl: string }> {
  const { userId, companyId, kind, newFileUrl, mimeType, fileName, bytes, uploadedById } = params;
  const displayUrl = newFileUrl;

  const category = kind === MEDIA_KIND_USER_PROFILE ? 'profile_image' : 'signature';

  const oldDriveIdToRemove = await prisma.$transaction(async (tx) => {
    const prevUser = await tx.user.findUnique({
      where: { id: userId },
      select: { image: true, signatureUrl: true },
    });
    const prevUrl = kind === MEDIA_KIND_USER_PROFILE ? prevUser?.image : prevUser?.signatureUrl;

    const existingLink = await tx.mediaAssetLink.findUnique({
      where: { kind_entityId: { kind, entityId: userId } },
    });

    if (existingLink) {
      await tx.mediaAssetLink.delete({ where: { id: existingLink.id } });
      const remaining = await tx.mediaAssetLink.count({ where: { assetId: existingLink.assetId } });
      if (remaining === 0) {
        await tx.mediaAsset.delete({ where: { id: existingLink.assetId } });
      }
    }

    await tx.mediaAsset.create({
      data: {
        companyId,
        fileUrl: newFileUrl,
        mimeType,
        fileName,
        category,
        bytes,
        uploadedById,
        links: {
          create: { kind, entityId: userId },
        },
      },
    });

    if (kind === MEDIA_KIND_USER_PROFILE) {
      await tx.user.update({
        where: { id: userId },
        data: { image: displayUrl },
      });
    } else {
      await tx.user.update({
        where: { id: userId },
        data: { signatureUrl: displayUrl },
      });
    }

    return prevUrl && prevUrl !== newFileUrl ? prevUrl : null;
  });

  if (oldDriveIdToRemove) {
    try {
      const driveId = extractGoogleDriveFileId(oldDriveIdToRemove);
      if (driveId) await deleteFromDrive(driveId, companyId);
    } catch (err) {
      console.error('Failed to delete replaced user media from Drive:', err);
    }
  }

  return { displayUrl };
}
