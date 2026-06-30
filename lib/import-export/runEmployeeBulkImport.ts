import type { EmployeeStatus, Prisma, PrismaClient } from '@prisma/client';

import {
  normalizeImportedExpertises,
  profileExtensionForEmployeeImport,
  type WorkforceImportPatch,
} from '@/lib/hr/employeeImportProfile';
import { parseNationalityInput } from '@/lib/hr/countryNames';
import type { EmployeeImportRow } from '@/lib/import-export/employeeFields';
import type { BulkImportResult } from '@/lib/import-export/types';

type ExistingEmployee = {
  id: string;
  employeeCode: string;
  status: EmployeeStatus;
  profileExtension: unknown;
};

function parseDateOrNull(value?: string | null) {
  if (value === undefined) return undefined;
  if (!value?.trim()) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function workforcePatchFromRow(row: EmployeeImportRow): WorkforceImportPatch {
  return {
    employeeType: row.employeeType,
    visaHolding: row.visaHolding,
    expertises: row.expertises,
  };
}

function resolveNationality(row: EmployeeImportRow): { value: string | null | undefined; error?: string } {
  if (row.nationality === undefined) return { value: undefined };
  if (!row.nationality?.trim()) return { value: null };
  const parsed = parseNationalityInput(row.nationality);
  if (!parsed.ok) return { value: undefined, error: parsed.error };
  return { value: parsed.value };
}

function employeeCreateData(
  companyId: string,
  row: EmployeeImportRow,
  workforcePatch: WorkforceImportPatch,
  nationality: string | null
): Prisma.EmployeeCreateInput {
  const emailNorm = row.email?.trim() ? row.email.trim().toLowerCase() : null;
  const status = row.status ?? 'ACTIVE';
  return {
    company: { connect: { id: companyId } },
    employeeCode: row.employeeCode.trim(),
    fullName: row.fullName.trim(),
    preferredName: row.preferredName?.trim() || null,
    email: emailNorm,
    phone: row.phone?.trim() || null,
    nationality,
    dateOfBirth: parseDateOrNull(row.dateOfBirth) ?? null,
    gender: row.gender?.trim() || null,
    designation: row.designation?.trim() || null,
    department: row.department?.trim() || null,
    employmentType: row.employmentType?.trim() || null,
    signatureGroup: row.signatureGroup?.trim() || null,
    hireDate: parseDateOrNull(row.hireDate) ?? null,
    terminationDate: parseDateOrNull(row.terminationDate) ?? null,
    status,
    emergencyContactName: row.emergencyContactName?.trim() || null,
    emergencyContactPhone: row.emergencyContactPhone?.trim() || null,
    bloodGroup: row.bloodGroup?.trim() || null,
    portalEnabled: row.portalEnabled ?? false,
    adminNotes: row.adminNotes?.trim() || null,
    profileExtension: profileExtensionForEmployeeImport({
      existingExtension: null,
      previousStatus: 'ACTIVE',
      nextStatus: status,
      workforcePatch,
      isCreate: true,
    }) as Prisma.InputJsonValue,
  };
}

function employeeUpdateData(
  row: EmployeeImportRow,
  existing: ExistingEmployee,
  workforcePatch: WorkforceImportPatch,
  nationality: string | null | undefined
): Prisma.EmployeeUpdateInput {
  const data: Prisma.EmployeeUpdateInput = {
    employeeCode: row.employeeCode.trim(),
    fullName: row.fullName.trim(),
  };

  if (row.preferredName !== undefined) data.preferredName = row.preferredName?.trim() || null;
  if (row.email !== undefined) {
    data.email = row.email?.trim() ? row.email.trim().toLowerCase() : null;
  }
  if (row.phone !== undefined) data.phone = row.phone?.trim() || null;
  if (nationality !== undefined) data.nationality = nationality;
  if (row.dateOfBirth !== undefined) data.dateOfBirth = parseDateOrNull(row.dateOfBirth) ?? null;
  if (row.gender !== undefined) data.gender = row.gender?.trim() || null;
  if (row.designation !== undefined) data.designation = row.designation?.trim() || null;
  if (row.department !== undefined) data.department = row.department?.trim() || null;
  if (row.employmentType !== undefined) data.employmentType = row.employmentType?.trim() || null;
  if (row.signatureGroup !== undefined) data.signatureGroup = row.signatureGroup?.trim() || null;
  if (row.hireDate !== undefined) data.hireDate = parseDateOrNull(row.hireDate) ?? null;
  if (row.terminationDate !== undefined) data.terminationDate = parseDateOrNull(row.terminationDate) ?? null;
  if (row.emergencyContactName !== undefined) {
    data.emergencyContactName = row.emergencyContactName?.trim() || null;
  }
  if (row.emergencyContactPhone !== undefined) {
    data.emergencyContactPhone = row.emergencyContactPhone?.trim() || null;
  }
  if (row.bloodGroup !== undefined) data.bloodGroup = row.bloodGroup?.trim() || null;
  if (row.adminNotes !== undefined) data.adminNotes = row.adminNotes?.trim() || null;
  if (row.portalEnabled !== undefined) data.portalEnabled = row.portalEnabled;

  const nextStatus = row.status ?? existing.status;
  if (row.status !== undefined) data.status = row.status;

  const hasWorkforcePatch =
    workforcePatch.employeeType !== undefined ||
    workforcePatch.visaHolding !== undefined ||
    workforcePatch.expertises !== undefined ||
    row.status !== undefined;

  if (hasWorkforcePatch) {
    data.profileExtension = profileExtensionForEmployeeImport({
      existingExtension: existing.profileExtension,
      previousStatus: existing.status,
      nextStatus,
      workforcePatch,
      isCreate: false,
    }) as Prisma.InputJsonValue;
  }

  return data;
}

export async function runEmployeeBulkImport(
  prisma: PrismaClient,
  opts: {
    companyId: string;
    newRows: EmployeeImportRow[];
    updateRows: EmployeeImportRow[];
  }
): Promise<BulkImportResult> {
  const { companyId, newRows, updateRows } = opts;
  const warnings: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const existing = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, employeeCode: true, status: true, profileExtension: true },
  });
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byCode = new Map(existing.map((e) => [e.employeeCode.trim().toLowerCase(), e]));

  const resolveExisting = (row: EmployeeImportRow): ExistingEmployee | null => {
    if (row.id && byId.has(row.id)) return byId.get(row.id)!;
    const byCd = byCode.get(row.employeeCode.trim().toLowerCase());
    return byCd ?? null;
  };

  const resolveWorkforcePatch = async (row: EmployeeImportRow) => {
    const patch = workforcePatchFromRow(row);
    if (patch.expertises === undefined) return { patch, warning: undefined as string | undefined };
    const normalized = await normalizeImportedExpertises(prisma, companyId, patch.expertises);
    if (normalized.warning) return { patch, warning: normalized.warning };
    return {
      patch: { ...patch, expertises: normalized.expertises },
      warning: undefined as string | undefined,
    };
  };

  const applyRow = async (row: EmployeeImportRow, mode: 'create' | 'update', match: ExistingEmployee | null) => {
    const { patch, warning } = await resolveWorkforcePatch(row);
    if (warning) {
      skipped += 1;
      warnings.push(`${row.employeeCode}: ${warning}`);
      return;
    }

    const nationalityResult = resolveNationality(row);
    if (nationalityResult.error) {
      skipped += 1;
      warnings.push(`${row.employeeCode}: ${nationalityResult.error}`);
      return;
    }
    const nationality = nationalityResult.value;

    if (mode === 'create') {
      const dup = byCode.get(row.employeeCode.trim().toLowerCase());
      if (dup) {
        skipped += 1;
        warnings.push(`Employee code already exists: ${row.employeeCode}`);
        return;
      }

      try {
        const emp = await prisma.employee.create({
          data: employeeCreateData(companyId, row, patch, nationality ?? null),
        });
        byId.set(emp.id, {
          id: emp.id,
          employeeCode: emp.employeeCode,
          status: emp.status,
          profileExtension: emp.profileExtension,
        });
        byCode.set(emp.employeeCode.trim().toLowerCase(), {
          id: emp.id,
          employeeCode: emp.employeeCode,
          status: emp.status,
          profileExtension: emp.profileExtension,
        });
        created += 1;
      } catch (e) {
        if (e instanceof Error && e.message.includes('Unique constraint')) {
          skipped += 1;
          warnings.push(`Could not create "${row.employeeCode}" — duplicate code or email`);
          return;
        }
        throw e;
      }
      return;
    }

    if (!match) {
      skipped += 1;
      warnings.push(`Update target not found: ${row.employeeCode}`);
      return;
    }

    try {
      const emp = await prisma.employee.update({
        where: { id: match.id },
        data: employeeUpdateData(row, match, patch, nationality),
      });
      byCode.delete(match.employeeCode.trim().toLowerCase());
      byCode.set(emp.employeeCode.trim().toLowerCase(), {
        id: emp.id,
        employeeCode: emp.employeeCode,
        status: emp.status,
        profileExtension: emp.profileExtension,
      });
      byId.set(emp.id, {
        id: emp.id,
        employeeCode: emp.employeeCode,
        status: emp.status,
        profileExtension: emp.profileExtension,
      });
      updated += 1;
    } catch (e) {
      if (e instanceof Error && e.message.includes('Unique constraint')) {
        skipped += 1;
        warnings.push(`Could not update "${row.employeeCode}" — duplicate code or email`);
        return;
      }
      throw e;
    }
  };

  for (const row of newRows) {
    await applyRow(row, 'create', null);
  }
  for (const row of updateRows) {
    await applyRow(row, 'update', resolveExisting(row));
  }

  return { created, updated, skipped, warnings };
}
