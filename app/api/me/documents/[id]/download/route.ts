import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { canEmployeeDownloadPortalDocument } from '@/lib/hr/employeeDocumentPortal';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { P } from '@/lib/permissions';
import { hasPerm } from '@/lib/hr/requireCompanySession';
import { errorResponse } from '@/lib/utils/apiResponse';
import { extractGoogleDriveFileId } from '@/lib/utils/googleDriveUrl';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!hasPerm(session.user, P.SELF_EMPLOYEE_DOCUMENTS)) return errorResponse('Forbidden', 403);

  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee for this company', 403);

  const { id } = await params;
  const doc = await prisma.employeeDocument.findFirst({
    where: { id, employeeId: emp.id, companyId: emp.companyId },
    select: {
      id: true,
      mediaUrl: true,
      portalViewEnabled: true,
      portalDownloadEnabled: true,
    },
  });
  if (!doc) return errorResponse('Document not found', 404);
  if (!canEmployeeDownloadPortalDocument(doc)) {
    return errorResponse('Download is not enabled for this document', 403);
  }

  const driveId = extractGoogleDriveFileId(doc.mediaUrl ?? '');
  if (!driveId) return errorResponse('No file is attached to this document', 404);

  return NextResponse.redirect(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`);
}
