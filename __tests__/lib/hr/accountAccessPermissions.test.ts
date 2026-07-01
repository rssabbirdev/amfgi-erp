import { P } from '@/lib/permissions';
import {
  assertCanPatchEmployeeAccountFields,
  canHrAccountAccessCreate,
  canHrAccountAccessDelete,
  canHrAccountAccessEdit,
  canHrAccountAccessView,
  hasLegacyHrAccountAccessFullAccess,
} from '@/lib/hr/accountAccessPermissions';

describe('accountAccessPermissions', () => {
  const user = (permissions: string[]) => ({
    isSuperAdmin: false,
    permissions,
  });

  it('grants full access to legacy hr.employee.edit without granular account perms', () => {
    const perms = [P.HR_EMPLOYEE_EDIT];
    expect(hasLegacyHrAccountAccessFullAccess(perms)).toBe(true);
    expect(canHrAccountAccessCreate(user(perms))).toBe(true);
    expect(canHrAccountAccessDelete(user(perms))).toBe(true);
  });

  it('does not elevate employee.edit when granular account view is assigned', () => {
    const perms = [P.HR_EMPLOYEE_EDIT, P.HR_ACCOUNT_ACCESS_VIEW];
    expect(hasLegacyHrAccountAccessFullAccess(perms)).toBe(false);
    expect(canHrAccountAccessView(user(perms))).toBe(true);
    expect(canHrAccountAccessEdit(user(perms))).toBe(false);
    expect(canHrAccountAccessCreate(user(perms))).toBe(false);
    expect(canHrAccountAccessDelete(user(perms))).toBe(false);
  });

  it('gates portal patch fields by granular permission', () => {
    const viewOnly = user([P.HR_ACCOUNT_ACCESS_VIEW]);
    expect(assertCanPatchEmployeeAccountFields(viewOnly, { portalEnabled: true })).toBe('Forbidden');

    const editor = user([P.HR_ACCOUNT_ACCESS_EDIT]);
    expect(assertCanPatchEmployeeAccountFields(editor, { portalEnabled: false })).toBeNull();

    const creator = user([P.HR_ACCOUNT_ACCESS_CREATE]);
    expect(assertCanPatchEmployeeAccountFields(creator, { provisionNow: true })).toBeNull();
  });
});
