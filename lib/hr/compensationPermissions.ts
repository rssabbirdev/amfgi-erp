import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

/** Legacy `hr.payroll.compensation` grants full compensation CRUD on employee profiles. */
export function hasLegacyHrCompensationFullAccess(permissions: string[]): boolean {
  return permissions.includes(P.HR_PAYROLL_COMPENSATION);
}

export function canHrCompensationView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return (
    perms.includes(P.HR_COMPENSATION_VIEW) ||
    hasLegacyHrCompensationFullAccess(perms) ||
    perms.includes(P.HR_PAYROLL_SETTINGS)
  );
}

export function canHrCompensationCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_CREATE) || hasLegacyHrCompensationFullAccess(perms);
}

export function canHrCompensationEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_EDIT) || hasLegacyHrCompensationFullAccess(perms);
}

export function canHrCompensationDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_COMPENSATION_DELETE) || hasLegacyHrCompensationFullAccess(perms);
}

/** Add or change compensation packages (POST). */
export function canHrCompensationRecordPackage(user: AppSessionUser): boolean {
  return canHrCompensationCreate(user) || canHrCompensationEdit(user);
}
