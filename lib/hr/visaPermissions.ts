import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

function hasGranularHrVisaPermissions(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_VISA_VIEW) ||
    permissions.includes(P.HR_VISA_CREATE) ||
    permissions.includes(P.HR_VISA_EDIT) ||
    permissions.includes(P.HR_VISA_DELETE)
  );
}

/** Legacy roles with only `hr.employee.edit` retain full visa / contract CRUD. */
export function hasLegacyHrVisaFullAccess(permissions: string[]): boolean {
  return permissions.includes(P.HR_EMPLOYEE_EDIT) && !hasGranularHrVisaPermissions(permissions);
}

export function canHrVisaView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_VISA_VIEW) || perms.includes(P.HR_EMPLOYEE_VIEW);
}

export function canHrVisaCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_VISA_CREATE) || hasLegacyHrVisaFullAccess(perms);
}

export function canHrVisaEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_VISA_EDIT) || hasLegacyHrVisaFullAccess(perms);
}

export function canHrVisaDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_VISA_DELETE) || hasLegacyHrVisaFullAccess(perms);
}

export function canHrVisaMutate(user: AppSessionUser): boolean {
  return canHrVisaCreate(user) || canHrVisaEdit(user);
}
