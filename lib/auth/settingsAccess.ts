import { P, type Permission } from '@/lib/permissions';

export type SettingsAccessUser = {
  isSuperAdmin: boolean;
  permissions: string[];
};

const SETTINGS_PAGE_PERMISSIONS = [
  P.SETTINGS_PRINT_FORMAT,
  P.SETTINGS_STORAGE,
  P.SETTINGS_MEDIA,
  P.SETTINGS_EMAIL,
  P.SETTINGS_API,
] as const;

function hasLegacySettingsManage(permissions: string[]): boolean {
  return permissions.includes(P.SETTINGS_MANAGE);
}

function hasPermission(permissions: string[], perm: Permission): boolean {
  return permissions.includes(perm) || hasLegacySettingsManage(permissions);
}

export function canAccessSettingsPrintFormat(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  return hasPermission(user.permissions, P.SETTINGS_PRINT_FORMAT);
}

export function canAccessSettingsStorage(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  return hasPermission(user.permissions, P.SETTINGS_STORAGE);
}

export function canAccessSettingsMedia(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  return hasPermission(user.permissions, P.SETTINGS_MEDIA);
}

export function canAccessSettingsEmail(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  return hasPermission(user.permissions, P.SETTINGS_EMAIL);
}

export function canAccessSettingsApi(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  return hasPermission(user.permissions, P.SETTINGS_API);
}

export function canAccessAnySettingsPage(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  if (hasLegacySettingsManage(user.permissions)) return true;
  return SETTINGS_PAGE_PERMISSIONS.some((perm) => user.permissions.includes(perm));
}

export type SettingsNavItem = {
  href: string;
  label: string;
  description: string;
  canAccess: (user: SettingsAccessUser) => boolean;
};

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    href: '/settings/print-format',
    label: 'Print format',
    description: 'Document layouts and default print templates',
    canAccess: canAccessSettingsPrintFormat,
  },
  {
    href: '/settings/storage',
    label: 'Storage',
    description: 'Google Drive connection and root folder',
    canAccess: canAccessSettingsStorage,
  },
  {
    href: '/settings/media',
    label: 'Media',
    description: 'Uploaded files and asset library',
    canAccess: canAccessSettingsMedia,
  },
  {
    href: '/settings/email',
    label: 'Email',
    description: 'Outbound email provider configuration',
    canAccess: canAccessSettingsEmail,
  },
  {
    href: '/settings/api',
    label: 'API center',
    description: 'Integration keys and sync logs',
    canAccess: canAccessSettingsApi,
  },
];

export function visibleSettingsNavItems(user: SettingsAccessUser): SettingsNavItem[] {
  return SETTINGS_NAV_ITEMS.filter((item) => item.canAccess(user));
}

/** Route guard helper — settings.manage still grants all workspace pages. */
export function canManageSettingsMasterData(user: SettingsAccessUser): boolean {
  if (user.isSuperAdmin) return true;
  return user.permissions.includes(P.SETTINGS_MANAGE);
}
