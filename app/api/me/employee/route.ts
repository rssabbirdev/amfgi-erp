import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { getPortalEmployeeForSession } from '@/lib/hr/linkedEmployee';
import { serializeEmployeeDocumentForPortal } from '@/lib/hr/employeeDocumentPortal';
import { P } from '@/lib/permissions';
import { hasPerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const emp = await getPortalEmployeeForSession(session.user);
  if (!emp) return errorResponse('No linked employee for this company', 403);

  const full = await prisma.employee.findFirst({
    where: { id: emp.id },
    include: {
      visaPeriods: { orderBy: { endDate: 'desc' }, take: 20 },
      documents: {
        include: { documentType: { select: { id: true, name: true, slug: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 50,
      },
    },
  });
  if (!full) return errorResponse('Employee not found', 404);

  const canViewDocuments = hasPerm(session.user, P.SELF_EMPLOYEE_DOCUMENTS);
  const documentsOnFileCount = full.documents.length;
  const portalDocuments = canViewDocuments
    ? full.documents
        .map((doc) => serializeEmployeeDocumentForPortal(doc))
        .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
    : [];

  const { documents: _documents, ...employee } = full;

  return successResponse({
    ...employee,
    documentsOnFileCount,
    portalDocuments,
  });
}
