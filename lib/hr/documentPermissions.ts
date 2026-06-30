import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

/** Legacy roles with only `hr.document.edit` retain full create / edit / delete access. */
export function hasLegacyHrDocumentFullAccess(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_DOCUMENT_EDIT) &&
    !permissions.includes(P.HR_DOCUMENT_CREATE) &&
    !permissions.includes(P.HR_DOCUMENT_DELETE)
  );
}

export function canHrDocumentView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  return userPerms(user).includes(P.HR_DOCUMENT_VIEW);
}

export function canHrDocumentCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_DOCUMENT_CREATE) || hasLegacyHrDocumentFullAccess(perms);
}

export function canHrDocumentEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_DOCUMENT_EDIT) || hasLegacyHrDocumentFullAccess(perms);
}

export function canHrDocumentDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_DOCUMENT_DELETE) || hasLegacyHrDocumentFullAccess(perms);
}
