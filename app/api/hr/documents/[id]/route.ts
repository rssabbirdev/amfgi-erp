import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { canHrDocumentDelete, canHrDocumentEdit } from '@/lib/hr/documentPermissions';
import { normalizePortalDocumentFlags } from '@/lib/hr/employeeDocumentPortal';
import { EMPLOYEE_DOC_OTHER_SLUG } from '@/lib/hr/employeeDocumentDisplay';
import { requireCompanySession } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  documentTypeId: z.string().min(1).optional(),
  customTitle: z.string().max(200).optional().nullable(),
  visaPeriodId: z.string().optional().nullable(),
  documentNumber: z.string().max(120).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  issuingAuthority: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.any().optional().nullable(),
  mediaUrl: z.string().max(2000).optional().nullable(),
  portalViewEnabled: z.boolean().optional(),
  portalDownloadEnabled: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!canHrDocumentEdit(session.user)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeDocument.findFirst({
    where: { id, companyId },
    include: { documentType: { select: { slug: true } } },
  });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  let nextTypeSlug = existing.documentType.slug;
  if (d.documentTypeId !== undefined) {
    const dt = await prisma.employeeDocumentType.findFirst({
      where: { id: d.documentTypeId, companyId },
    });
    if (!dt) return errorResponse('Invalid document type', 422);
    nextTypeSlug = dt.slug;
  }

  if (d.visaPeriodId) {
    const vp = await prisma.visaPeriod.findFirst({
      where: { id: d.visaPeriodId, employeeId: existing.employeeId, companyId },
    });
    if (!vp) return errorResponse('Invalid visa period', 422);
  }

  const customTitle = d.customTitle === undefined ? undefined : d.customTitle?.trim() || null;
  if (nextTypeSlug === EMPLOYEE_DOC_OTHER_SLUG && customTitle === null && d.customTitle !== undefined) {
    return errorResponse('Custom title is required for custom documents', 422);
  }
  if (customTitle && nextTypeSlug !== EMPLOYEE_DOC_OTHER_SLUG) {
    return errorResponse('Custom title is only allowed for custom documents', 422);
  }

  const data: Prisma.EmployeeDocumentUpdateInput = {};
  if (d.documentTypeId !== undefined) {
    data.documentType = {
      connect: {
        companyId_id: {
          companyId,
          id: d.documentTypeId,
        },
      },
    };
  }
  if (d.visaPeriodId !== undefined) {
    data.visaPeriod = d.visaPeriodId
      ? {
          connect: {
            companyId_id: {
              companyId,
              id: d.visaPeriodId,
            },
          },
        }
      : { disconnect: true };
  }
  if (d.documentNumber !== undefined) data.documentNumber = d.documentNumber?.trim() || null;
  if (d.issueDate !== undefined) data.issueDate = d.issueDate ? new Date(d.issueDate) : null;
  if (d.expiryDate !== undefined) data.expiryDate = d.expiryDate ? new Date(d.expiryDate) : null;
  if (d.issuingAuthority !== undefined) data.issuingAuthority = d.issuingAuthority?.trim() || null;
  if (d.notes !== undefined) data.notes = d.notes?.trim() || null;
  if (d.customFields !== undefined) {
    data.customFields = d.customFields;
  } else if (d.customTitle !== undefined) {
    const trimmed = d.customTitle?.trim() || null;
    if (trimmed) {
      data.customFields = { customTitle: trimmed };
    } else if (d.documentTypeId !== undefined && nextTypeSlug !== EMPLOYEE_DOC_OTHER_SLUG) {
      data.customFields = Prisma.DbNull;
    }
  }

  if (d.mediaUrl !== undefined) data.mediaUrl = d.mediaUrl?.trim() || null;

  if (d.portalViewEnabled !== undefined || d.portalDownloadEnabled !== undefined) {
    const portalFlags = normalizePortalDocumentFlags(
      d.portalViewEnabled ?? existing.portalViewEnabled,
      d.portalDownloadEnabled ?? (d.portalViewEnabled === false ? false : existing.portalDownloadEnabled)
    );
    data.portalViewEnabled = portalFlags.portalViewEnabled;
    data.portalDownloadEnabled = portalFlags.portalDownloadEnabled;
  }

  const doc = await prisma.employeeDocument.update({ where: { id }, data });
  return successResponse(doc);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!canHrDocumentDelete(session.user)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeDocument.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  await prisma.employeeDocument.delete({ where: { id } });
  return successResponse({ ok: true });
}
