import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { uploadToDrive, deleteFromDrive } from '@/lib/utils/googleDrive';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const isSA = session.user.isSuperAdmin ?? false;
  const perms = (session.user.permissions ?? []) as string[];
  const hasPermission = isSA || perms.includes('transaction.stock_out');

  if (!hasPermission) return errorResponse('Forbidden', 403);
  if (!session.user.activeCompanyId) return errorResponse('No active company selected', 400);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const transactionId = formData.get('transactionId') as string | null;

    if (!file) return errorResponse('File is required', 400);
    if (!transactionId) return errorResponse('Transaction ID is required', 400);

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimes.includes(file.type)) {
      return errorResponse('Only images (JPEG, PNG, WebP) or PDF files are allowed', 400);
    }

    // Validate file size (max 20 MB)
    if (file.size > 20 * 1024 * 1024) {
      return errorResponse('File size must not exceed 20 MB', 400);
    }

    // Fetch transaction and verify it belongs to active company
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { companyId: true, isDeliveryNote: true, signedCopyDriveId: true },
    });

    if (!transaction) return errorResponse('Transaction not found', 404);
    if (transaction.companyId !== session.user.activeCompanyId) {
      return errorResponse('Forbidden', 403);
    }
    if (!transaction.isDeliveryNote) {
      return errorResponse('Signed copies can only be uploaded for delivery notes', 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) return errorResponse('Google Drive folder not configured', 500);

    // Delete old file from Drive if it exists
    if (transaction.signedCopyDriveId) {
      try {
        await deleteFromDrive(transaction.signedCopyDriveId);
      } catch (err) {
        console.error('Failed to delete old signed copy from Drive:', err);
      }
    }

    // Determine file extension
    const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';

    // Upload new file to Drive
    const { id, webViewLink } = await uploadToDrive(
      buffer,
      `signed-dn-${transactionId}.${ext}`,
      file.type,
      folderId,
    );

    // Update transaction with new URL and Drive ID
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        signedCopyUrl: webViewLink,
        signedCopyDriveId: id,
      },
    });

    return successResponse({ signedCopyUrl: webViewLink });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Signed copy upload error:', err);
    return errorResponse(message, 500);
  }
}
