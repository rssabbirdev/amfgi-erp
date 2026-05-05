import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const PatchSchema = z.object({
  documentTypeId: z.string().min(1).optional(),
  visaPeriodId: z.string().optional().nullable(),
  documentNumber: z.string().max(120).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  issuingAuthority: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  customFields: z.any().optional().nullable(),
  mediaUrl: z.string().max(2000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_DOCUMENT_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeDocument.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
  const d = parsed.data;

  const data: Prisma.EmployeeDocumentUpdateInput = {};
  if (d.documentTypeId !== undefined) {
    const dt = await prisma.employeeDocumentType.findFirst({
      where: { id: d.documentTypeId, companyId },
    });
    if (!dt) return errorResponse('Invalid document type', 422);
    data.documentType = { connect: { id: d.documentTypeId } };
  }
  if (d.visaPeriodId !== undefined) {
    if (d.visaPeriodId) {
      const vp = await prisma.visaPeriod.findFirst({
        where: { id: d.visaPeriodId, employeeId: existing.employeeId, companyId },
      });
      if (!vp) return errorResponse('Invalid visa period', 422);
      data.visaPeriod = { connect: { id: d.visaPeriodId } };
    } else {
      data.visaPeriod = { disconnect: true };
    }
  }
  if (d.documentNumber !== undefined) data.documentNumber = d.documentNumber?.trim() || null;
  if (d.issueDate !== undefined) data.issueDate = d.issueDate ? new Date(d.issueDate) : null;
  if (d.expiryDate !== undefined) data.expiryDate = d.expiryDate ? new Date(d.expiryDate) : null;
  if (d.issuingAuthority !== undefined) data.issuingAuthority = d.issuingAuthority?.trim() || null;
  if (d.notes !== undefined) data.notes = d.notes?.trim() || null;
  if (d.customFields !== undefined) data.customFields = d.customFields;
  if (d.mediaUrl !== undefined) data.mediaUrl = d.mediaUrl?.trim() || null;

  const doc = await prisma.employeeDocument.update({ where: { id }, data });
  return successResponse(doc);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_DOCUMENT_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employeeDocument.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  await prisma.employeeDocument.delete({ where: { id } });
  return successResponse({ ok: true });
}
