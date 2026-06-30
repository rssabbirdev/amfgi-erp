import { runEmployeeBulkImport } from '@/lib/import-export/runEmployeeBulkImport';
import type { EmployeeImportRow } from '@/lib/import-export/employeeFields';
import { formatZodImportError } from '@/lib/import-export/formatImportErrors';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import { prisma } from '@/lib/db/prisma';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { errorResponse, successResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const EmployeeImportRowSchema = z.object({
  id: z.string().min(1).optional(),
  employeeCode: z.string().min(1).max(80),
  fullName: z.string().min(1).max(200),
  preferredName: z.string().max(200).optional().nullable(),
  email: z.union([z.string().email(), z.literal('')]).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  nationality: z.string().max(100).optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.string().max(20).optional().nullable(),
  designation: z.string().max(120).optional().nullable(),
  department: z.string().max(120).optional().nullable(),
  employmentType: z.string().max(80).optional().nullable(),
  signatureGroup: z.string().max(120).optional().nullable(),
  hireDate: z.string().optional().nullable(),
  terminationDate: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED']).optional(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(50).optional().nullable(),
  bloodGroup: z.string().max(10).optional().nullable(),
  adminNotes: z.string().max(20000).optional().nullable(),
  portalEnabled: z.boolean().optional(),
  employeeType: z
    .enum(['OFFICE_STAFF', 'HYBRID_STAFF', 'DRIVER', 'LABOUR_WORKER'])
    .optional(),
  visaHolding: z.enum(['COMPANY_PROVIDED', 'SELF_OWN', 'NO_VISA']).optional(),
  expertises: z.array(z.string()).optional(),
});

const BulkSchema = z.object({
  newRows: z.array(EmployeeImportRowSchema),
  updateRows: z.array(EmployeeImportRowSchema),
});

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(formatZodImportError(parsed.error, 'Employee import'), 422);
  }

  const normalize = (row: z.infer<typeof EmployeeImportRowSchema>): EmployeeImportRow => ({
    id: row.id,
    employeeCode: row.employeeCode,
    fullName: row.fullName,
    preferredName: row.preferredName,
    email: row.email === '' ? null : row.email,
    phone: row.phone,
    nationality: row.nationality,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    designation: row.designation,
    department: row.department,
    employmentType: row.employmentType,
    signatureGroup: row.signatureGroup,
    hireDate: row.hireDate,
    terminationDate: row.terminationDate,
    status: row.status,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    bloodGroup: row.bloodGroup,
    portalEnabled: row.portalEnabled,
    adminNotes: row.adminNotes,
    employeeType: row.employeeType,
    visaHolding: row.visaHolding,
    expertises: row.expertises,
  });

  try {
    const result = await runEmployeeBulkImport(prisma, {
      companyId,
      newRows: parsed.data.newRows.map(normalize),
      updateRows: parsed.data.updateRows.map(normalize),
    });

    if (result.created > 0 || result.updated > 0) {
      publishLiveUpdate({
        companyId,
        channel: 'hr',
        entity: 'employee',
        action: 'bulk_import',
      });
    }

    return successResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Employee import failed';
    if (message.includes('Unique constraint')) {
      return errorResponse('Duplicate employee code or email for this company', 409);
    }
    return errorResponse(message, 500);
  }
}
