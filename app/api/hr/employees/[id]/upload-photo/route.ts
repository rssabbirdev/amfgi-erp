import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { buildEmployeeDriveFolderName, uploadToDrive } from '@/lib/utils/googleDrive';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id: employeeId } = await params;

  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) return errorResponse('Employee not found', 404);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('File is required', 400);

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
      return errorResponse('Only JPEG, PNG, or WebP images are allowed', 400);
    }
    if (file.size > 8 * 1024 * 1024) {
      return errorResponse('File size must not exceed 8 MB', 400);
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) return errorResponse('Google Drive folder not configured', 500);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const safeCode = emp.employeeCode.replace(/[^a-zA-Z0-9-_]/g, '_');
    const { id: driveId, viewerUrl } = await uploadToDrive(
      buffer,
      `employee-${safeCode}-photo-${Date.now()}.${ext}`,
      file.type,
      {
        companyId,
        rootFolderId: folderId,
        folderPath: [
          { key: 'drive-folder:employees-root', name: 'Employees' },
          {
            key: `drive-folder:employee:${employeeId}`,
            name: buildEmployeeDriveFolderName(emp.fullName, employeeId),
          },
          { key: `drive-folder:employee:${employeeId}:profile`, name: 'Profile' },
        ],
      },
    );

    await prisma.employee.update({
      where: { id: employeeId },
      data: { photoDriveId: driveId },
    });

    // Mirror profile photo to linked self-service user (if linked).
    await prisma.user.updateMany({
      where: { linkedEmployeeId: employeeId },
      data: { imageDriveId: driveId, image: viewerUrl },
    });

    return successResponse({ driveId, url: viewerUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    console.error('Employee photo upload:', err);
    return errorResponse(message, 500);
  }
}
