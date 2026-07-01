import { prisma } from '@/lib/db/prisma';
import { publishLiveUpdate } from '@/lib/live-updates/server';
import type { Employee, Prisma } from '@prisma/client';
import { provisionEmployeeUser } from '@/lib/hr/provisionEmployeeUser';
import {
  checkEmployeeEmailUserConflict,
  employeeEmailConflictStatus,
} from '@/lib/hr/employeeEmailUserConflict';
import {
  basicHoursForProfileExtension,
  employeeTypeFromProfileExtension,
  readEmployeeTypeSettingsFromCompanyData,
} from '@/lib/hr/employeeTypeSettings';
import {
  buildEmployeeListWhere,
  filterEmployeesByWorkforceType,
  sortEmployeesByName,
} from '@/lib/hr/employeeListQuery';
import { parseNationalityInput } from '@/lib/hr/countryNames';
import { P } from '@/lib/permissions';
import { requireCompanySession, requirePerm } from '@/lib/hr/requireCompanySession';
import { parseListLimit, parseListOffset } from '@/lib/pagination/serverList';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';

/** Empty string or explicit null clears email; valid strings must be emails. */
const employeeEmailField = z
  .union([z.string().email(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v));

const CreateSchema = z.object({
  employeeCode: z.string().min(1).max(80),
  fullName: z.string().min(1).max(200),
  preferredName: z.string().max(200).optional().nullable(),
  email: employeeEmailField,
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
  const idsParam = searchParams.get('ids');
  const forExport = searchParams.get('forExport') === '1';
  const q = (searchParams.get('q') ?? '').trim();
  const status = searchParams.get('status');
  const employeeType = searchParams.get('employeeType');
  const portal = searchParams.get('portal');
  const limitParam = searchParams.get('limit');

  if (forExport) {
    const where = buildEmployeeListWhere(companyId, { q, status, portal });
    const needsTypeFilter = Boolean(employeeType && employeeType !== 'ALL');
    const exportSelect = {
      id: true,
      employeeCode: true,
      fullName: true,
      preferredName: true,
      email: true,
      phone: true,
      nationality: true,
      dateOfBirth: true,
      gender: true,
      designation: true,
      department: true,
      employmentType: true,
      signatureGroup: true,
      hireDate: true,
      terminationDate: true,
      status: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      bloodGroup: true,
      portalEnabled: true,
      adminNotes: true,
      profileExtension: true,
    } as const;

    const list = await prisma.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }],
      take: 10000,
      select: exportSelect,
    });
    const filtered = needsTypeFilter ? filterEmployeesByWorkforceType(list, employeeType) : list;
    return successResponse(sortEmployeesByName(filtered));
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { hrEmployeeTypeSettings: true, printTemplates: true },
  });
  const typeSettings = readEmployeeTypeSettingsFromCompanyData(company);

  const mapEmployee = (employee: Employee) => {
    const employeeTypeValue = employeeTypeFromProfileExtension(employee.profileExtension);
    const timing = typeSettings[employeeTypeValue];
    return {
      ...employee,
      employeeType: employeeTypeValue,
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
  };

  if (idsParam) {
    const ids = [...new Set(idsParam.split(',').map((part) => part.trim()).filter(Boolean))].slice(0, 100);
    if (ids.length === 0) return successResponse([]);
    const list = await prisma.employee.findMany({
      where: { companyId, id: { in: ids } },
      orderBy: [{ fullName: 'asc' }],
    });
    return successResponse(list.map(mapEmployee));
  }

  const where: Prisma.EmployeeWhereInput = { companyId };
  if (status && status !== 'ALL') where.status = status as Prisma.EnumEmployeeStatusFilter;
  if (portal === 'enabled') where.portalEnabled = true;
  if (portal === 'disabled') where.portalEnabled = false;
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { employeeCode: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }

  const applyEmployeeTypeFilter = <T extends { profileExtension: unknown }>(rows: T[]) => {
    if (!employeeType || employeeType === 'ALL') return rows;
    return rows.filter((employee) => {
      const type = employeeTypeFromProfileExtension(employee.profileExtension);
      if (employeeType === '__none__') return !type || type.trim() === '';
      return type === employeeType;
    });
  };

  if (limitParam !== null) {
    const limit = parseListLimit(limitParam);
    const offset = parseListOffset(searchParams.get('offset'));

    const needsTypeFilter = Boolean(employeeType && employeeType !== 'ALL');

    if (needsTypeFilter) {
      const allRows = await prisma.employee.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
      });
      const filtered = applyEmployeeTypeFilter(allRows);
      const items = filtered.slice(offset, offset + limit).map(mapEmployee);
      const employeeTypes = Array.from(
        new Set(
          allRows
            .map((row) => employeeTypeFromProfileExtension(row.profileExtension)?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((a, b) => a.localeCompare(b));

      return successResponse({
        items,
        total: filtered.length,
        employeeTypes,
      });
    }

    const [total, list, typeRows] = await Promise.all([
      prisma.employee.count({ where }),
      prisma.employee.findMany({
        where,
        orderBy: [{ fullName: 'asc' }],
        skip: offset,
        take: limit,
      }),
      prisma.employee.findMany({
        where: { companyId },
        select: { profileExtension: true },
        take: 2000,
      }),
    ]);

    const employeeTypes = Array.from(
      new Set(
        typeRows
          .map((row) => employeeTypeFromProfileExtension(row.profileExtension)?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return successResponse({
      items: list.map(mapEmployee),
      total,
      employeeTypes,
    });
  }

  const list = await prisma.employee.findMany({
    where,
    orderBy: [{ fullName: 'asc' }],
    take: 500,
  });

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

  if (emailNorm) {
    const emailConflict = await checkEmployeeEmailUserConflict(prisma, { email: emailNorm });
    if (!emailConflict.ok) {
      return errorResponse(emailConflict.message, employeeEmailConflictStatus(emailConflict.code));
    }
  }

  let nationality: string | null = null;
  if (d.nationality !== undefined) {
    const parsedNationality = parseNationalityInput(d.nationality);
    if (!parsedNationality.ok) return errorResponse(parsedNationality.error, 422);
    nationality = parsedNationality.value;
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
          nationality,
          dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
          gender: d.gender?.trim() || null,
          designation: d.designation?.trim() || null,
          department: d.department?.trim() || null,
          employmentType: d.employmentType?.trim() || null,
          signatureGroup: d.signatureGroup?.trim() || null,
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
      if (code === 'EMAIL_USER_CONFLICT') return errorResponse(msg, 422);
      return errorResponse(msg, 422);
    }
    if (e instanceof Error && e.message.includes('Unique constraint')) {
      return errorResponse('Duplicate employee code or email for this company', 409);
    }
    throw e;
  }

}
