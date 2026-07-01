import { P } from '@/lib/permissions';
import {
  canHrVisaCreate,
  canHrVisaDelete,
  canHrVisaEdit,
  canHrVisaView,
  hasLegacyHrVisaFullAccess,
} from '@/lib/hr/visaPermissions';

describe('visaPermissions', () => {
  const user = (permissions: string[]) => ({
    isSuperAdmin: false,
    permissions,
  });

  it('grants full CRUD to legacy hr.employee.edit without granular visa perms', () => {
    const perms = [P.HR_EMPLOYEE_EDIT];
    expect(hasLegacyHrVisaFullAccess(perms)).toBe(true);
    expect(canHrVisaCreate(user(perms))).toBe(true);
    expect(canHrVisaEdit(user(perms))).toBe(true);
    expect(canHrVisaDelete(user(perms))).toBe(true);
  });

  it('allows view with hr.employee.view', () => {
    expect(canHrVisaView(user([P.HR_EMPLOYEE_VIEW]))).toBe(true);
    expect(canHrVisaCreate(user([P.HR_EMPLOYEE_VIEW]))).toBe(false);
  });

  it('splits granular visa permissions', () => {
    const viewOnly = user([P.HR_VISA_VIEW]);
    expect(canHrVisaView(viewOnly)).toBe(true);
    expect(canHrVisaEdit(viewOnly)).toBe(false);

    const editor = user([P.HR_VISA_VIEW, P.HR_VISA_EDIT]);
    expect(canHrVisaEdit(editor)).toBe(true);
    expect(canHrVisaDelete(editor)).toBe(false);
  });
});
