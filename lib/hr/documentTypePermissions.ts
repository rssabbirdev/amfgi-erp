import { P } from '@/lib/permissions';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';

function userPerms(user: AppSessionUser): string[] {
  return user.permissions ?? [];
}

function hasGranularHrDocumentTypePermissions(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_DOCUMENT_TYPE_VIEW) ||
    permissions.includes(P.HR_DOCUMENT_TYPE_CREATE) ||
    permissions.includes(P.HR_DOCUMENT_TYPE_EDIT) ||
    permissions.includes(P.HR_DOCUMENT_TYPE_DELETE)
  );
}

/** Legacy `hr.settings.document_types` grants full document-type catalog CRUD. */
export function hasLegacyHrDocumentTypeFullAccess(permissions: string[]): boolean {
  return (
    permissions.includes(P.HR_SETTINGS_DOC_TYPES) && !hasGranularHrDocumentTypePermissions(permissions)
  );
}

export function canHrDocumentTypeView(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return (
    perms.includes(P.HR_DOCUMENT_TYPE_VIEW) ||
    hasLegacyHrDocumentTypeFullAccess(perms) ||
    perms.includes(P.HR_DOCUMENT_VIEW)
  );
}

export function canHrDocumentTypeCreate(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_DOCUMENT_TYPE_CREATE) || hasLegacyHrDocumentTypeFullAccess(perms);
}

export function canHrDocumentTypeEdit(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_DOCUMENT_TYPE_EDIT) || hasLegacyHrDocumentTypeFullAccess(perms);
}

export function canHrDocumentTypeDelete(user: AppSessionUser): boolean {
  if (user.isSuperAdmin) return true;
  const perms = userPerms(user);
  return perms.includes(P.HR_DOCUMENT_TYPE_DELETE) || hasLegacyHrDocumentTypeFullAccess(perms);
}
