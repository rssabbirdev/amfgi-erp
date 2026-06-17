/** Admin live-update events that can change the signed-in user's effective permissions. */
export function isPermissionAffectingLiveUpdate(payload: {
  channel?: string;
  entity?: string;
}): boolean {
  return payload.channel === 'admin' && (payload.entity === 'user' || payload.entity === 'role');
}
