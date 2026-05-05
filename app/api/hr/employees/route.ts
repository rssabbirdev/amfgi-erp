import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import type { Prisma } from '@prisma/client';
import { provisionEmployeeUser } from '@/lib/hr/provisionEmployeeUser';
import {
  basicHoursForProfileExtension,
  employeeTypeFromProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

const CreateSchema = z.object({
  employeeCode: z.string().min(1).max(80),
  fullName: z.string().min(1).max(200),
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
  photoUrl: z.string().max(2000).optional().nullable(),
  portalEnabled: z.boolean().optional(),
  adminNotes: z.string().max(20000).optional().nullable(),
  profileExtension: z.unknown().optional().nullable(),
  /** When true (default) and `email` is set, creates or links a `User` for Google / portal login */
  autoProvisionLogin: z.boolean().optional(),
});

export async function GET(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_VIEW)) return errorResponse('Forbidden', 403);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const status = searchParams.get('status');

  const where: Record<string, unknown> = { companyId };
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { employeeCode: { contains: q } },
      { email: { contains: q } },
    ];
  }

  const [company, list] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { hrEmployeeTypeSettings: true, printTemplates: true },
    }),
    prisma.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      take: 500,
    }),
  ]);
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);
  return successResponse(
    list.map((employee) => {
      const employeeType = employeeTypeFromProfileExtension(employee.profileExtension);
      const timing = typeSettings[employeeType];
      return {
        ...employee,
        employeeType,
        basicHoursPerDay: basicHoursForProfileExtension(employee.profileExtension, typeSettings),
        defaultTiming: timing
          ? {
              dutyStart: timing.dutyStart,
              dutyEnd: timing.dutyEnd,
              breakStart: timing.breakStart,
              breakEnd: timing.breakEnd,
            }
          : null,
      };
    })
  );
}

export async function POST(req: Request) {
  const ctx = await requireCompanySession();
  if (!ctx.ok) return ctx.response;
  const { session, companyId } = ctx;
  if (!requirePerm(session.user, P.HR_EMPLOYEE_EDIT)) return errorResponse('Forbidden', 403);

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const d = parsed.data;
  const emailNorm = d.email ? d.email.trim().toLowerCase() : null;
  const auto = d.autoProvisionLogin !== false && Boolean(emailNorm);

  if (auto) {
    const role = await prisma.role.findFirst({ where: { slug: 'employee-self' } });
    if (!role) {
      return errorResponse(
        'Auto-login requires the "employee-self" role. Run `npm run seed` once or create that role in Admin → Roles.',
        503,
      );
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const emp = await tx.employee.create({
        data: {
          companyId,
          employeeCode: d.employeeCode.trim(),
          fullName: d.fullName.trim(),
          preferredName: d.preferredName?.trim() || null,
          email: emailNorm,
          phone: d.phone?.trim() || null,
          nationality: d.nationality?.trim() || null,
          dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
          gender: d.gender?.trim() || null,
          designation: d.designation?.trim() || null,
          department: d.department?.trim() || null,
          employmentType: d.employmentType?.trim() || null,
          hireDate: d.hireDate ? new Date(d.hireDate) : null,
          terminationDate: d.terminationDate ? new Date(d.terminationDate) : null,
          status: d.status ?? 'ACTIVE',
          emergencyContactName: d.emergencyContactName?.trim() || null,
          emergencyContactPhone: d.emergencyContactPhone?.trim() || null,
          bloodGroup: d.bloodGroup?.trim() || null,
          photoUrl: d.photoUrl?.trim() || null,
          portalEnabled: auto ? true : (d.portalEnabled ?? false),
          adminNotes: d.adminNotes?.trim() || null,
          profileExtension:
            d.profileExtension === undefined
              ? undefined
              : (d.profileExtension as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput),
        },
      });

      let provision: { createdUser: boolean; userId: string } | null = null;
      if (auto && emailNorm) {
        const prov = await provisionEmployeeUser(tx, {
          employeeId: emp.id,
          companyId,
          email: emailNorm,
          fullName: emp.fullName,
        });
        if (!prov.ok) {
          throw new Error(`PROVISION:${prov.code}:${prov.message}`);
        }
        provision = { createdUser: prov.createdUser, userId: prov.userId };
      }

      return { emp, provision };
    });

    const full = await prisma.employee.findFirst({
      where: { id: result.emp.id },
      include: {
        userLink: { select: { id: true, email: true, name: true } },
      },
    });

    publishLiveUpdate({
      companyId,
      channel: 'hr',
      entity: 'employee',
      action: 'created',
    });

    return successResponse(
      {
        ...full,
        loginProvision: result.provision,
      },
      201,
    );
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
    throw e;
  }

}
