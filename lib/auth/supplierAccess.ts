import { P, type Permission } from '@/lib/permissions';

type PermissionCheck = {
  isSuperAdmin: boolean;
  permissions: string[];
};

function hasAnyPermission(permissions: string[], keys: Permission[]): boolean {
  return keys.some((key) => permissions.includes(key));
}

/** List/read suppliers (goods receipt users with stock_in still allowed). */
export function canViewSuppliers({ isSuperAdmin, permissions }: PermissionCheck): boolean {
  if (isSuperAdmin) return true;
  return hasAnyPermission(permissions, [P.SUPPLIER_VIEW, P.TXN_STOCK_IN]);
}

export function canCreateSuppliers({ isSuperAdmin, permissions }: PermissionCheck): boolean {
  if (isSuperAdmin) return true;
  return hasAnyPermission(permissions, [P.SUPPLIER_CREATE, P.TXN_STOCK_IN]);
}

export function canEditSuppliers({ isSuperAdmin, permissions }: PermissionCheck): boolean {
  if (isSuperAdmin) return true;
  return permissions.includes(P.SUPPLIER_EDIT);
}

export function canDeleteSuppliers({ isSuperAdmin, permissions }: PermissionCheck): boolean {
  if (isSuperAdmin) return true;
  return permissions.includes(P.SUPPLIER_DELETE);
}

export function canImportSuppliers(session: PermissionCheck): boolean {
  return canCreateSuppliers(session) || canEditSuppliers(session);
}

export function canSyncSuppliers(session: PermissionCheck): boolean {
  return canEditSuppliers(session);
}
