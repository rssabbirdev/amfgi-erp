import { auth } from '@/auth';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  buildUserDriveFolderName,
  explainGoogleDriveError,
  uploadToDrive,
} from '@/lib/utils/googleDrive';
import { finalizeUserMediaUpload, MEDIA_KIND_USER_PROFILE } from '@/lib/media/userScopedMedia';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse('Unauthorized', 401);

  const companyId = session.user.activeCompanyId;
  if (!companyId) {
    return errorResponse('Select an active company before uploading', 400);
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return errorResponse('File is required', 400);

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      return errorResponse('Only JPEG, PNG, or WebP images are allowed', 400);
    }

    if (file.size > 5 * 1024 * 1024) {
      return errorResponse('File size must not exceed 5 MB', 400);
    }

    const userId = session.user.id;
    const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!rootFolderId) return errorResponse('Google Drive folder not configured', 500);
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const { id } = await uploadToDrive(
      buffer,
      `user-${userId}-avatar-${Date.now()}.${ext}`,
      file.type,
      {
        companyId,
        rootFolderId,
        folderPath: [
          { key: 'drive-folder:users-root', name: 'Users' },
          {
            key: `drive-folder:user:${userId}`,
            name: buildUserDriveFolderName(session.user.name ?? 'User', userId),
          },
        ],
      },
    );

    const { displayUrl, driveId } = await finalizeUserMediaUpload({
      userId,
      companyId,
      kind: MEDIA_KIND_USER_PROFILE,
      newDriveId: id,
      mimeType: file.type,
      fileName: `user-${userId}-avatar.${ext}`,
      bytes: file.size,
      uploadedById: userId,
    });

    return successResponse({ url: displayUrl, driveId });
  } catch (err: unknown) {
    const message = explainGoogleDriveError(err);
    console.error('User profile image upload error:', message);
    return errorResponse(message, 500);
  }
}
