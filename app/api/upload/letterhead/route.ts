import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { uploadToDrive, deleteFromDrive } from '@/lib/utils/googleDrive';
import { extractGoogleDriveFileId } from '@/lib/utils/googleDriveUrl';

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

    if (!file) return errorResponse('File is required', 400);
    if (!companyId) return errorResponse('Company ID is required', 400);

    // Non-SA can only update their own company
    if (!isSA && companyId !== session.user.activeCompanyId) {
      return errorResponse('Forbidden', 403);
    }

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      return errorResponse('Only JPEG, PNG, or WebP images are allowed', 400);
    }

    // Validate file size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      return errorResponse('File size must not exceed 5 MB', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) return errorResponse('Google Drive folder not configured', 500);

    // Get existing letterhead if any
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { letterheadUrl: true },
    });

    // Delete old file from Drive if it exists
    const oldDriveId = extractGoogleDriveFileId(company?.letterheadUrl ?? '');
    if (oldDriveId) {
      try {
        await deleteFromDrive(oldDriveId, companyId);
      } catch (err) {
        // Log but don't fail if deletion fails
        console.error('Failed to delete old letterhead from Drive:', err);
      }
    }

    // Upload new file to Drive
    const { viewerUrl } = await uploadToDrive(
      buffer,
      `letterhead-${companyId}.jpg`,
      file.type,
      {
        companyId,
        rootFolderId: folderId,
        folderPath: [
          { key: 'drive-folder:company-root', name: 'Company' },
          { key: 'drive-folder:company:letterhead', name: 'Letterhead' },
        ],
      },
    );

    // Update company with new URL and Drive ID
    const updated = await prisma.company.update({
      where: { id: companyId },
      data: {
        letterheadUrl: viewerUrl,
      },
      select: { id: true, letterheadUrl: true, name: true },
    });

    return successResponse({ letterheadUrl: updated.letterheadUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Letterhead upload error:', err);
    return errorResponse(message, 500);
  }
}
