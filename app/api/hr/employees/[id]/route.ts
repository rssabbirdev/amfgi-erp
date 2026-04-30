import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { provisionEmployeeUser } from '@/lib/hr/provisionEmployeeUser';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { driveFileIdToDisplayUrl } from '@/lib/utils/googleDriveUrl';
import { z } from 'zod';

const PatchSchema = z.object({
  employeeCode: z.string().min(1).max(80).optional(),
  fullName: z.string().min(1).max(200).optional(),
  preferredName: z.string().max(200).optional().nullable(),
  email: z.union([z.string().email(), z.literal('')]).optional().transform((v) => (v === '' ? null : v)),
  phone: z.string().max(50).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  employmentType: z.string().max(80).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  terminationDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED']).optional(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(50).optional().nullable(),
  bloodGroup: z.string().max(10).optional().nullable(),
  photoDriveId: z.string().max(200).optional().nullable(),
  portalEnabled: z.boolean().optional(),
  adminNotes: z.string().max(20000).optional().nullable(),
  profileExtension: z.unknown().optional().nullable(),
  /** When false, skip creating/linking `User` even if email is set */
  provisionLogin: z.boolean().optional(),
  /** When true, run login provisioning using the employee’s current email (after update) */
  provisionNow: z.boolean().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_VIEW)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const emp = await prisma.employee.findFirst({
    where: { id, companyId },
    include: {
      visaPeriods: { orderBy: { endDate: 'desc' } },
      documents: {
        include: {
          documentType: { select: { id: true, name: true, slug: true } },
          visaPeriod: { select: { id: true, label: true } },
        },
        orderBy: { expiryDate: 'asc' },
      },
      userLink: { select: { id: true, email: true, name: true } },
    },
  });
  if (!emp) return errorResponse('Not found', 404);
  return successResponse(emp);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCompanySession();
    if (!ctx.ok) return ctx.response;
    const { session, companyId } = ctx;
    if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
    const { id } = await params;

    const existing = await prisma.employee.findFirst({ where: { id, companyId } });
    if (!existing) return errorResponse('Not found', 404);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400);
    }
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    const d = parsed.data;
    const emailNorm = d.email !== undefined && d.email ? d.email.trim().toLowerCase() : d.email;

    const data: Prisma.EmployeeUpdateInput = {};
    if (d.employeeCode !== undefined) data.employeeCode = d.employeeCode.trim();
    if (d.fullName !== undefined) data.fullName = d.fullName.trim();
    if (d.preferredName !== undefined) data.preferredName = d.preferredName?.trim() || null;
    if (d.email !== undefined) data.email = emailNorm === undefined ? undefined : emailNorm ?? null;
    if (d.phone !== undefined) data.phone = d.phone?.trim() || null;
    if (d.nationality !== undefined) data.nationality = d.nationality?.trim() || null;
    if (d.dateOfBirth !== undefined) data.dateOfBirth = d.dateOfBirth ? new Date(d.dateOfBirth) : null;
    if (d.gender !== undefined) data.gender = d.gender?.trim() || null;
    if (d.designation !== undefined) data.designation = d.designation?.trim() || null;
    if (d.department !== undefined) data.department = d.department?.trim() || null;
    if (d.employmentType !== undefined) data.employmentType = d.employmentType?.trim() || null;
    if (d.hireDate !== undefined) data.hireDate = d.hireDate ? new Date(d.hireDate) : null;
    if (d.terminationDate !== undefined) data.terminationDate = d.terminationDate ? new Date(d.terminationDate) : null;
    if (d.status !== undefined) data.status = d.status;
    if (d.emergencyContactName !== undefined) data.emergencyContactName = d.emergencyContactName?.trim() || null;
    if (d.emergencyContactPhone !== undefined) data.emergencyContactPhone = d.emergencyContactPhone?.trim() || null;
    if (d.bloodGroup !== undefined) data.bloodGroup = d.bloodGroup?.trim() || null;
    if (d.photoDriveId !== undefined) data.photoDriveId = d.photoDriveId?.trim() || null;
    if (d.portalEnabled !== undefined) data.portalEnabled = d.portalEnabled;
    if (d.adminNotes !== undefined) data.adminNotes = d.adminNotes?.trim() || null;
    if (d.profileExtension !== undefined)
      data.profileExtension = d.profileExtension === null ? Prisma.JsonNull : (d.profileExtension as Prisma.InputJsonValue);

    const shouldTryProvision =
      d.provisionLogin !== false && (d.provisionNow === true || (d.email !== undefined && Boolean(d.email)));

    if (shouldTryProvision) {
      const role = await prisma.role.findFirst({ where: { slug: 'employee-self' } });
      if (!role) {
        return errorResponse(
          'Login provisioning requires the "employee-self" role. Run seed or create that role.',
          503,
        );
      }
    }

    try {
      const emp = await prisma.$transaction(async (tx) => {
        if (Object.keys(data).length > 0) {
          await tx.employee.update({ where: { id }, data });
        }

        const row = await tx.employee.findUnique({
          where: { id },
          select: { email: true, fullName: true, photoDriveId: true },
        });

        if (shouldTryProvision && row?.email) {
          const prov = await provisionEmployeeUser(tx, {
            employeeId: id,
            companyId,
            email: row.email,
            fullName: row.fullName,
          });
          if (!prov.ok) {
            throw new Error(`PROVISION:${prov.code}:${prov.message}`);
          }
          await tx.employee.update({
            where: { id },
            data: { portalEnabled: true },
          });
        }

        // Keep linked self-service user profile in sync with HR master record.
          if (row && (d.fullName !== undefined || d.photoDriveId !== undefined)) {
            await tx.user.updateMany({
              where: { linkedEmployeeId: id },
              data: {
                ...(d.fullName !== undefined ? { name: row.fullName } : {}),
                ...(d.photoDriveId !== undefined
                  ? {
                      imageDriveId: row.photoDriveId,
                      image: driveFileIdToDisplayUrl(row.photoDriveId) ?? null,
                    }
                  : {}),
              },
            });
          }

        return tx.employee.findFirst({
          where: { id },
          include: {
            visaPeriods: { orderBy: { endDate: 'desc' } },
            documents: {
              include: {
                documentType: { select: { id: true, name: true, slug: true } },
                visaPeriod: { select: { id: true, label: true } },
              },
              orderBy: { expiryDate: 'asc' },
            },
            userLink: { select: { id: true, email: true, name: true } },
          },
        });
      });

      publishLiveUpdate({
        companyId,
        channel: 'hr',
        entity: 'employee',
        action: 'updated',
      });

      return successResponse(emp);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('PROVISION:')) {
        const parts = e.message.split(':');
        const code = parts[1];
        const msg = parts.slice(2).join(':') || 'Login provisioning failed';
        if (code === 'EMAIL_LINKED_OTHER') return errorResponse(msg, 409);
        return errorResponse(msg, 422);
      }
      if (e instanceof Error && e.message.includes('Unique constraint')) {
        return errorResponse('Duplicate employee code or email for this company', 409);
      }
      console.error('PATCH /api/hr/employees/[id]', e);
      return errorResponse(e instanceof Error ? e.message : 'Update failed', 500);
    }
  } catch (e) {
    console.error('PATCH /api/hr/employees/[id] (outer)', e);
    return errorResponse(e instanceof Error ? e.message : 'Update failed', 500);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const existing = await prisma.employee.findFirst({ where: { id, companyId } });
  if (!existing) return errorResponse('Not found', 404);

  await prisma.user.updateMany({ where: { linkedEmployeeId: id }, data: { linkedEmployeeId: null } });
  await prisma.employee.delete({ where: { id } });
  publishLiveUpdate({
    companyId,
    channel: 'hr',
    entity: 'employee',
    action: 'deleted',
  });
  return successResponse({ ok: true });
}
