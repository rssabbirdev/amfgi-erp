type AuditActorUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
};

export function buildTransactionActorFields(
  user: AuditActorUser | null | undefined,
  fallbackName = 'System'
) {
  const userId = user?.id?.trim() || null;
  const displayName =
    user?.name?.trim() || user?.email?.trim() || userId || fallbackName;

  return {
    performedBy: userId ?? displayName,
    performedByUserId: userId,
    performedByName: displayName,
  };
}
