export const SUPER_ADMIN_SELF_DEACTIVATE_MESSAGE =
  'Super admins cannot deactivate or delete their own account';

export function isSuperAdminSelfTarget(
  actorId: string,
  target: { id: string; isSuperAdmin: boolean }
): boolean {
  return actorId === target.id && target.isSuperAdmin;
}

export function assertCanDeactivateUser(
  actorId: string,
  target: { id: string; isSuperAdmin: boolean }
): string | null {
  if (isSuperAdminSelfTarget(actorId, target)) {
    return SUPER_ADMIN_SELF_DEACTIVATE_MESSAGE;
  }
  return null;
}
