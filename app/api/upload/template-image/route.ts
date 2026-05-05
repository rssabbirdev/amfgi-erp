import { auth } from '@/auth';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { uploadToDrive, deleteFromDrive } from '@/lib/utils/googleDrive';
import { extractGoogleDriveFileId } from '@/lib/utils/googleDriveUrl';

/**
 * Upload an image for a print template (e.g. letterhead block). Does not update Company;
 * the client stores the returned URL on the template JSON.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const isSA = session.user.isSuperAdmin ?? false;
  const perms = (session.user.permissions ?? []) as string[];
  const canManage = isSA || perms.includes('settings.manage');

  if (!canManage) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const companyId = formData.get('companyId') as string | null;
    const replaceDriveId = (formData.get('replaceDriveId') as string | null)?.trim() || null;
    const replaceUrl = (formData.get('replaceUrl') as string | null)?.trim() || null;

    if (!file) return errorResponse('File is required', 400);
    if (!companyId) return errorResponse('Company ID is required', 400);

    if (!isSA && companyId !== session.user.activeCompanyId) {
      return errorResponse('Forbidden', 403);
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      return errorResponse('Only JPEG, PNG, or WebP images are allowed', 400);
    }

    if (file.size > 5 * 1024 * 1024) {
      return errorResponse('File size must not exceed 5 MB', 400);
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) return errorResponse('Google Drive folder not configured', 500);

    const oldDriveId = replaceDriveId || extractGoogleDriveFileId(replaceUrl ?? '');
    if (oldDriveId) {
      try {
        await deleteFromDrive(oldDriveId, companyId);
      } catch (err) {
        console.error('Failed to delete replaced template image from Drive:', err);
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext =
      file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const { viewerUrl } = await uploadToDrive(
      buffer,
      `print-template-${companyId}-${Date.now()}.${ext}`,
      file.type,
      {
        companyId,
        rootFolderId: folderId,
        folderPath: [
          { key: 'drive-folder:company-root', name: 'Company' },
          { key: 'drive-folder:company:print-templates', name: 'Print Templates' },
        ],
      },
    );

    return successResponse({ url: viewerUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Template image upload error:', err);
    return errorResponse(message, 500);
  }
}
