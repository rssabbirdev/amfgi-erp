import { isPermissionAffectingLiveUpdate } from '@/lib/live-updates/client';

describe('isPermissionAffectingLiveUpdate', () => {
  it('returns true for admin user and role events', () => {
    expect(isPermissionAffectingLiveUpdate({ channel: 'admin', entity: 'user' })).toBe(true);
    expect(isPermissionAffectingLiveUpdate({ channel: 'admin', entity: 'role' })).toBe(true);
  });

  it('returns false for unrelated admin or channel events', () => {
    expect(isPermissionAffectingLiveUpdate({ channel: 'admin', entity: 'company' })).toBe(false);
    expect(isPermissionAffectingLiveUpdate({ channel: 'stock', entity: 'user' })).toBe(false);
    expect(isPermissionAffectingLiveUpdate({})).toBe(false);
  });
});
