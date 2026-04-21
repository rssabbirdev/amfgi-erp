type SelfServiceCandidate = {
  isSuperAdmin?: boolean | null;
  permissions?: string[] | null;
  linkedEmployeeId?: string | null;
};

export function isEmployeeSelfServiceUser(user: SelfServiceCandidate | null | undefined) {
  if (!user) return false;
  if (user.isSuperAdmin) return false;
  if (!user.linkedEmployeeId) return false;
  return true;
}
