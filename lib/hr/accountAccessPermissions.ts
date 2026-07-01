import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

function hasGranularHrAccountAccessPermissions(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_ACCOUNT_ACCESS_VIEW) ||
    permissions.includes(P.HR_ACCOUNT_ACCESS_CREATE) ||
    permissions.includes(P.HR_ACCOUNT_ACCESS_EDIT) ||
    permissions.includes(P.HR_ACCOUNT_ACCESS_DELETE)
  );
}

/** Legacy roles with only `hr.employee.edit` retain full account-access management. */
export function hasLegacyHrAccountAccessFullAccess(permissions: string[]): boolean {
  return permissions.includes(P.HR_EMPLOYEE_EDIT) && !hasGranularHrAccountAccessPermissions(permissions);
}

export function canHrAccountAccessView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_ACCOUNT_ACCESS_VIEW) || perms.includes(P.HR_EMPLOYEE_VIEW);
}

export function canHrAccountAccessCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_ACCOUNT_ACCESS_CREATE) || hasLegacyHrAccountAccessFullAccess(perms);
}

export function canHrAccountAccessEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_ACCOUNT_ACCESS_EDIT) || hasLegacyHrAccountAccessFullAccess(perms);
}

export function canHrAccountAccessDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_ACCOUNT_ACCESS_DELETE) || hasLegacyHrAccountAccessFullAccess(perms);
}

type AccountPatchFields = {
  portalEnabled?: boolean;
  provisionNow?: boolean;
  provisionLogin?: boolean;
};

export function employeePatchTouchesAccountFields(data: AccountPatchFields): boolean {
  return (
    data.portalEnabled !== undefined ||
    data.provisionNow === true ||
    data.provisionLogin !== undefined
  );
}

export function assertCanPatchEmployeeAccountFields(
  user: AppSessionUser,
  data: AccountPatchFields
): string | null {
  if (data.portalEnabled !== undefined && !canHrAccountAccessEdit(user)) {
    return 'Forbidden';
  }
  if (
    data.provisionNow === true &&
    data.provisionLogin !== false &&
    !canHrAccountAccessCreate(user)
  ) {
    return 'Forbidden';
  }
  return null;
}
