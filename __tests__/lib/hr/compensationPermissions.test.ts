import { P } from '@/lib/permissions';
import {
  canHrCompensationCreate,
  canHrCompensationDelete,
  canHrCompensationEdit,
  canHrCompensationRecordPackage,
  canHrCompensationView,
  hasLegacyHrCompensationFullAccess,
} from '@/lib/hr/compensationPermissions';

describe('compensationPermissions', () => {
  const user = (permissions: string[]) => ({
    isSuperAdmin: false,
    permissions,
  });

  it('grants full CRUD to legacy hr.payroll.compensation', () => {
    const perms = [P.HR_PAYROLL_COMPENSATION];
    expect(hasLegacyHrCompensationFullAccess(perms)).toBe(true);
    expect(canHrCompensationView(user(perms))).toBe(true);
    expect(canHrCompensationCreate(user(perms))).toBe(true);
    expect(canHrCompensationEdit(user(perms))).toBe(true);
    expect(canHrCompensationDelete(user(perms))).toBe(true);
    expect(canHrCompensationRecordPackage(user(perms))).toBe(true);
  });

  it('allows view with payroll settings only', () => {
    const perms = [P.HR_PAYROLL_SETTINGS];
    expect(canHrCompensationView(user(perms))).toBe(true);
    expect(canHrCompensationCreate(user(perms))).toBe(false);
  });

  it('splits granular compensation permissions', () => {
    const viewOnly = user([P.HR_COMPENSATION_VIEW]);
    expect(canHrCompensationView(viewOnly)).toBe(true);
    expect(canHrCompensationRecordPackage(viewOnly)).toBe(false);
    expect(canHrCompensationDelete(viewOnly)).toBe(false);

    const editor = user([P.HR_COMPENSATION_VIEW, P.HR_COMPENSATION_EDIT]);
    expect(canHrCompensationRecordPackage(editor)).toBe(true);
    expect(canHrCompensationDelete(editor)).toBe(false);

    const deleter = user([P.HR_COMPENSATION_VIEW, P.HR_COMPENSATION_DELETE]);
    expect(canHrCompensationDelete(deleter)).toBe(true);
    expect(canHrCompensationRecordPackage(deleter)).toBe(false);
  });
});
