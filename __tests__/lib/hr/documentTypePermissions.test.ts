import { P } from '@/lib/permissions';
import {
  canHrDocumentTypeCreate,
  canHrDocumentTypeDelete,
  canHrDocumentTypeEdit,
  canHrDocumentTypeView,
  hasLegacyHrDocumentTypeFullAccess,
} from '@/lib/hr/documentTypePermissions';

describe('documentTypePermissions', () => {
  const user = (permissions: string[]) => ({
    isSuperAdmin: false,
    permissions,
  });

  it('grants full CRUD to legacy hr.settings.document_types without granular perms', () => {
    const perms = [P.HR_SETTINGS_DOC_TYPES];
    expect(hasLegacyHrDocumentTypeFullAccess(perms)).toBe(true);
    expect(canHrDocumentTypeCreate(user(perms))).toBe(true);
    expect(canHrDocumentTypeEdit(user(perms))).toBe(true);
    expect(canHrDocumentTypeDelete(user(perms))).toBe(true);
  });

  it('allows catalog read with hr.document.view', () => {
    expect(canHrDocumentTypeView(user([P.HR_DOCUMENT_VIEW]))).toBe(true);
    expect(canHrDocumentTypeCreate(user([P.HR_DOCUMENT_VIEW]))).toBe(false);
  });

  it('splits granular document type permissions', () => {
    const viewOnly = user([P.HR_DOCUMENT_TYPE_VIEW]);
    expect(canHrDocumentTypeView(viewOnly)).toBe(true);
    expect(canHrDocumentTypeEdit(viewOnly)).toBe(false);

    const editor = user([P.HR_DOCUMENT_TYPE_VIEW, P.HR_DOCUMENT_TYPE_EDIT]);
    expect(canHrDocumentTypeEdit(editor)).toBe(true);
    expect(canHrDocumentTypeDelete(editor)).toBe(false);
  });

  it('does not elevate legacy settings perm when granular document type perms are assigned', () => {
    const perms = [P.HR_SETTINGS_DOC_TYPES, P.HR_DOCUMENT_TYPE_VIEW];
    expect(hasLegacyHrDocumentTypeFullAccess(perms)).toBe(false);
    expect(canHrDocumentTypeView(user(perms))).toBe(true);
    expect(canHrDocumentTypeCreate(user(perms))).toBe(false);
    expect(canHrDocumentTypeEdit(user(perms))).toBe(false);
    expect(canHrDocumentTypeDelete(user(perms))).toBe(false);
  });
});
