import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildEmployeeDriveFolderName, uploadToDrive } from '@/lib/utils/googleDrive';

const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_DOCUMENT_EDIT)) return errorResponse('Forbidden', 403);
  const { id: documentId } = await params;

  const doc = await prisma.employeeDocument.findFirst({
    where: { id: documentId, companyId },
    include: { employee: { select: { employeeCode: true, fullName: true, id: true } } },
  });
  if (!doc) return errorResponse('Document not found', 404);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('File is required', 400);

    if (!ALLOWED.has(file.type)) {
      return errorResponse('Allowed types: PDF, JPEG, PNG, WebP', 400);
    }
    if (file.size > 20 * 1024 * 1024) {
      return errorResponse('File size must not exceed 20 MB', 400);
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) return errorResponse('Google Drive folder not configured', 500);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = ALLOWED.get(file.type)!;
    const safeCode = doc.employee.employeeCode.replace(/[^a-zA-Z0-9-_]/g, '_');
    const { id: driveId, viewerUrl } = await uploadToDrive(
      buffer,
      `employee-doc-${safeCode}-${documentId.slice(0, 8)}-${Date.now()}.${ext}`,
      file.type,
      {
        companyId,
        rootFolderId: folderId,
        folderPath: [
          { key: 'drive-folder:employees-root', name: 'Employees' },
          {
            key: `drive-folder:employee:${doc.employee.id}`,
            name: buildEmployeeDriveFolderName(doc.employee.fullName, doc.employee.id),
          },
          { key: `drive-folder:employee:${doc.employee.id}:documents`, name: 'Documents' },
        ],
      },
    );

    await prisma.employeeDocument.update({
      where: { id: documentId },
      data: { mediaDriveId: driveId },
    });

    return successResponse({
      driveId,
      previewUrl: viewerUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Employee document upload:', err);
    return errorResponse(message, 500);
  }
}
