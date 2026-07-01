import { P } from '@/lib/permissions';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building,
  Building2,
  Calendar,
  LayoutDashboard,
  Package,
  Settings,
  ShieldCheck,
  User,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react';

export type SidebarNavPermission = {
  perm?: string;
  anyPerms?: string[];
  allPerms?: string[];
  adminOnly?: boolean;
  linkedEmployeeOnly?: boolean;
};

export type SidebarNavLink = SidebarNavPermission & {
  type: 'link';
  href: string;
  label: string;
  icon: LucideIcon;
};

export type SidebarNavGroup = SidebarNavPermission & {
  type: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  /** Hub route; also used to detect active section */
  href?: string;
  children: Omit<SidebarNavLink, 'type' | 'icon'>[];
};

export type SidebarNavEntry = SidebarNavLink | SidebarNavGroup;

export const SIDEBAR_NAV_ENTRIES: SidebarNavEntry[] = [
	{
		type: 'link',
		href: '/dashboard',
		label: 'Dashboard',
		icon: LayoutDashboard,
	},
	{
		type: 'group',
		id: 'stock',
		label: 'Stock',
		icon: Package,
		href: '/stock',
		anyPerms: [
			'material.view',
			'job.view',
			'transaction.stock_in',
			'transaction.stock_out',
			'transaction.reconcile',
			'transaction.adjust',
			'transaction.transfer',
			P.STOCK_JOB_BUDGET_VIEW,
			P.STOCK_FORMULA_VIEW,
			P.STOCK_PRODUCTION_LOG_VIEW,
			P.STOCK_WAREHOUSE_TRANSFER_VIEW,
			P.STOCK_COUNT_SESSION_VIEW,
		],
		children: [
			{
				href: '/stock/materials',
				label: 'Materials',
				perm: 'material.view',
			},
			{
				href: '/stock/goods-receipt',
				label: 'Goods Receipt',
				perm: 'transaction.stock_in',
			},
			{
				href: '/stock/dispatch',
				label: 'Dispatch',
				perm: 'transaction.stock_out',
			},
			{
				href: '/stock/daily-quantity-log',
				label: 'Production Log',
				perm: P.STOCK_PRODUCTION_LOG_VIEW,
			},
			{
				href: '/stock/job-budget',
				label: 'Job Budget',
				perm: P.STOCK_JOB_BUDGET_VIEW,
			},
		],
	},
	{
		type: 'link',
		href: '/suppliers',
		label: 'Suppliers',
		icon: Building2,
		anyPerms: [P.SUPPLIER_VIEW, P.TXN_STOCK_IN],
	},
	{
		type: 'group',
		id: 'customers',
		label: 'Customers',
		icon: Users,
		anyPerms: ['customer.view', 'job.view'],
		children: [
			{ href: '/customers', label: 'Customers', perm: 'customer.view' },
			{ href: '/customers/jobs', label: 'Jobs', perm: 'job.view' },
		],
	},
	{
		type: 'group',
		id: 'hr',
		label: 'HR',
		icon: UserCircle,
		href: '/hr',
		anyPerms: [
			'hr.employee.view',
			'hr.schedule.view',
			'hr.attendance.view',
			'hr.leave.view',
			'hr.payroll.compensation',
			P.HR_DOCUMENT_TYPE_VIEW,
			P.HR_SETTINGS_DOC_TYPES,
		],
		children: [
			{
				href: '/hr/schedule',
				label: 'Schedule planning',
				perm: 'hr.schedule.view',
			},
			{
				href: '/hr/attendance',
				label: 'Attendance management',
				perm: 'hr.attendance.view',
			},
			{
				href: '/hr/attendance/employee',
				label: 'Employee attendance',
				perm: 'hr.attendance.view',
			},
			{ href: '/hr/leave', label: 'Leave management', perm: 'hr.leave.view' },
			{
				href: '/hr/employees',
				label: 'Employees',
				perm: 'hr.employee.view',
			},
			{
				href: '/hr/settings/document-types',
				label: 'Document types',
				anyPerms: [P.HR_DOCUMENT_TYPE_VIEW, P.HR_SETTINGS_DOC_TYPES],
			},
			{
				href: '/hr/payroll/preview',
				label: 'Payroll preview',
				perm: 'hr.payroll.compensation',
			},
			{
				href: '/hr/payroll/runs',
				label: 'Pay runs',
				perm: 'hr.payroll.compensation',
			},
		],
	},
	{
		type: 'link',
		href: '/me',
		label: 'My HR',
		icon: User,
		linkedEmployeeOnly: true,
	},
	{
		type: 'link',
		href: '/reports',
		label: 'Reports',
		icon: BarChart3,
		perm: 'report.view',
	},
	{
		type: 'link',
		href: '/admin/users',
		label: 'Users',
		icon: UserCog,
		perm: 'user.view',
	},
	{
		type: 'link',
		href: '/admin/roles',
		label: 'Roles',
		icon: ShieldCheck,
		perm: 'role.manage',
	},
	{
		type: 'link',
		href: '/admin/companies',
		label: 'Companies',
		icon: Building,
		adminOnly: true,
	},
	{
		type: 'group',
		id: 'settings',
		label: 'Settings',
		icon: Settings,
		anyPerms: [
			P.SETTINGS_PRINT_FORMAT,
			P.SETTINGS_STORAGE,
			P.SETTINGS_MEDIA,
			P.SETTINGS_EMAIL,
			P.SETTINGS_API,
			P.SETTINGS_MANAGE,
		],
		children: [
			{
				href: '/settings/print-format',
				label: 'Print format',
				anyPerms: [P.SETTINGS_PRINT_FORMAT, P.SETTINGS_MANAGE],
			},
			{
				href: '/settings/storage',
				label: 'Storage',
				anyPerms: [P.SETTINGS_STORAGE, P.SETTINGS_MANAGE],
			},
			{
				href: '/settings/media',
				label: 'Media',
				anyPerms: [P.SETTINGS_MEDIA, P.SETTINGS_MANAGE],
			},
			{
				href: '/settings/email',
				label: 'Email',
				anyPerms: [P.SETTINGS_EMAIL, P.SETTINGS_MANAGE],
			},
			{
				href: '/settings/api',
				label: 'API center',
				anyPerms: [P.SETTINGS_API, P.SETTINGS_MANAGE],
			},
		],
	},
];

export const SIDEBAR_SELF_SERVICE_ENTRIES: SidebarNavEntry[] = [
  { type: 'link', href: '/me', label: 'My Profile', icon: User, linkedEmployeeOnly: true },
  { type: 'link', href: '/me/attendance', label: 'My Attendance', icon: Calendar, linkedEmployeeOnly: true },
  { type: 'link', href: '/me/leave', label: 'My Leave', icon: Calendar, linkedEmployeeOnly: true },
  { type: 'link', href: '/me/documents', label: 'My Documents', icon: User, linkedEmployeeOnly: true },
];

export type SidebarNavVisibility = {
  permissions: string[];
  isSuperAdmin: boolean;
  linkedEmployeeId?: string | null;
  selfServiceOnly?: boolean;
};

function canSeeItem(
  item: SidebarNavPermission,
  options: SidebarNavVisibility,
): boolean {
  if (options.selfServiceOnly && !item.linkedEmployeeOnly) return false;
  if (!options.selfServiceOnly && item.linkedEmployeeOnly && !options.linkedEmployeeId) {
    return false;
  }
  if (item.adminOnly) return options.isSuperAdmin;
  if (item.linkedEmployeeOnly) return Boolean(options.linkedEmployeeId);
  if (item.allPerms?.length) {
    return options.isSuperAdmin || item.allPerms.every((p) => options.permissions.includes(p));
  }
  if (item.anyPerms?.length) {
    return options.isSuperAdmin || item.anyPerms.some((p) => options.permissions.includes(p));
  }
  if (item.perm) return options.isSuperAdmin || options.permissions.includes(item.perm);
  return true;
}

export function filterSidebarNavEntries(
  entries: SidebarNavEntry[],
  options: SidebarNavVisibility,
): SidebarNavEntry[] {
  const result: SidebarNavEntry[] = [];

  for (const entry of entries) {
    if (entry.type === 'link') {
      if (canSeeItem(entry, options)) result.push(entry);
      continue;
    }

    const children = entry.children.filter((child) => canSeeItem(child, options));
    const parentVisible = canSeeItem(entry, options);
    if (children.length === 0 && !parentVisible) continue;

    result.push({ ...entry, children });
  }

  return result;
}

/** Active when path equals href or continues under href/, unless a longer sibling matches. */
export function isSidebarPathActive(
  pathname: string,
  href: string,
  siblingHrefs: string[] = [],
): boolean {
  const matches =
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
  if (!matches) return false;

  const longerSibling = siblingHrefs.find(
    (s) => s.length > href.length && (pathname === s || pathname.startsWith(`${s}/`)),
  );
  return !longerSibling;
}

export function isSidebarGroupActive(
  pathname: string,
  group: SidebarNavGroup,
): boolean {
  if (group.href && isSidebarPathActive(pathname, group.href)) return true;
  const childHrefs = group.children.map((c) => c.href);
  return group.children.some((child) =>
    isSidebarPathActive(pathname, child.href, childHrefs),
  );
}
