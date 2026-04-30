// ── Permission keys ───────────────────────────────────────────────────────────
export const P = {
  // Company
  COMPANY_VIEW:   'company.view',
  COMPANY_CREATE: 'company.create',
  COMPANY_EDIT:   'company.edit',

  // Users
  USER_VIEW:   'user.view',
  USER_CREATE: 'user.create',
  USER_EDIT:   'user.edit',
  USER_DELETE: 'user.delete',

  // Roles
  ROLE_MANAGE: 'role.manage',

  // Materials
  MATERIAL_VIEW:   'material.view',
  MATERIAL_CREATE: 'material.create',
  MATERIAL_EDIT:   'material.edit',
  MATERIAL_DELETE: 'material.delete',

  // Jobs
  JOB_VIEW:   'job.view',
  JOB_CREATE: 'job.create',
  JOB_EDIT:   'job.edit',
  JOB_DELETE: 'job.delete',

  // Customers
  CUSTOMER_VIEW:   'customer.view',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_EDIT:   'customer.edit',
  CUSTOMER_DELETE: 'customer.delete',

  // Transactions
  TXN_STOCK_IN:  'transaction.stock_in',
  TXN_STOCK_OUT: 'transaction.stock_out',
  TXN_RETURN:    'transaction.return',
  TXN_TRANSFER:  'transaction.transfer',
  TXN_RECONCILE: 'transaction.reconcile',
  TXN_ADJUST:    'transaction.adjust',

  // Reports
  REPORT_VIEW: 'report.view',

  // Settings
  SETTINGS_MANAGE: 'settings.manage',

  // HR / Workforce
  HR_EMPLOYEE_VIEW: 'hr.employee.view',
  HR_EMPLOYEE_EDIT: 'hr.employee.edit',
  HR_DOCUMENT_VIEW: 'hr.document.view',
  HR_DOCUMENT_EDIT: 'hr.document.edit',
  HR_SCHEDULE_VIEW: 'hr.schedule.view',
  HR_SCHEDULE_EDIT: 'hr.schedule.edit',
  HR_SCHEDULE_PUBLISH: 'hr.schedule.publish',
  HR_ATTENDANCE_VIEW: 'hr.attendance.view',
  HR_ATTENDANCE_EDIT: 'hr.attendance.edit',
  HR_ATTENDANCE_APPROVE: 'hr.attendance.approve',
  HR_GEOFENCE_VIEW: 'hr.geofence.view',
  HR_GEOFENCE_EDIT: 'hr.geofence.edit',
  HR_SETTINGS_DOC_TYPES: 'hr.settings.document_types',

  // Employee self-service (linked User.linkedEmployeeId)
  SELF_EMPLOYEE_VIEW: 'self.employee.view',
  SELF_EMPLOYEE_DOCUMENTS: 'self.employee.documents',
  SELF_EMPLOYEE_SCHEDULE: 'self.employee.schedule',
  SELF_EMPLOYEE_ATTENDANCE: 'self.employee.attendance',
} as const;

export type Permission = (typeof P)[keyof typeof P];
export const ALL_PERMISSIONS = Object.values(P) as Permission[];

// ── Predefined role permission sets ───────────────────────────────────────────
export const ROLE_PRESETS: Record<string, Permission[]> = {
  super_admin: ALL_PERMISSIONS,

  manager: [
    P.MATERIAL_VIEW, P.MATERIAL_CREATE, P.MATERIAL_EDIT,
    P.JOB_VIEW,      P.JOB_CREATE,      P.JOB_EDIT,
    P.CUSTOMER_VIEW, P.CUSTOMER_CREATE, P.CUSTOMER_EDIT,
    P.TXN_STOCK_IN,  P.TXN_STOCK_OUT,   P.TXN_RETURN, P.TXN_TRANSFER, P.TXN_RECONCILE, P.TXN_ADJUST,
    P.REPORT_VIEW,
    P.USER_VIEW,
    P.SETTINGS_MANAGE,
    P.HR_EMPLOYEE_VIEW, P.HR_EMPLOYEE_EDIT,
    P.HR_DOCUMENT_VIEW, P.HR_DOCUMENT_EDIT,
    P.HR_SCHEDULE_VIEW, P.HR_SCHEDULE_EDIT, P.HR_SCHEDULE_PUBLISH,
    P.HR_ATTENDANCE_VIEW, P.HR_ATTENDANCE_EDIT, P.HR_ATTENDANCE_APPROVE,
    P.HR_GEOFENCE_VIEW, P.HR_GEOFENCE_EDIT,
    P.HR_SETTINGS_DOC_TYPES,
  ],

  store_keeper: [
    P.MATERIAL_VIEW,
    P.JOB_VIEW,
    P.TXN_STOCK_OUT,
    P.TXN_RETURN,
  ],
};

// ── Permission group labels (for UI checkboxes) ───────────────────────────────
export const PERMISSION_GROUPS: Array<{
  group:   string;
  perms: Array<{ key: Permission; label: string }>;
}> = [
  {
    group: 'Materials',
    perms: [
      { key: P.MATERIAL_VIEW,   label: 'View'   },
      { key: P.MATERIAL_CREATE, label: 'Create' },
      { key: P.MATERIAL_EDIT,   label: 'Edit'   },
      { key: P.MATERIAL_DELETE, label: 'Delete' },
    ],
  },
  {
    group: 'Jobs',
    perms: [
      { key: P.JOB_VIEW,   label: 'View'   },
      { key: P.JOB_CREATE, label: 'Create' },
      { key: P.JOB_EDIT,   label: 'Edit'   },
      { key: P.JOB_DELETE, label: 'Delete' },
    ],
  },
  {
    group: 'Customers',
    perms: [
      { key: P.CUSTOMER_VIEW,   label: 'View'   },
      { key: P.CUSTOMER_CREATE, label: 'Create' },
      { key: P.CUSTOMER_EDIT,   label: 'Edit'   },
      { key: P.CUSTOMER_DELETE, label: 'Delete' },
    ],
  },
  {
    group: 'Transactions',
    perms: [
      { key: P.TXN_STOCK_IN,  label: 'Receive Stock'    },
      { key: P.TXN_STOCK_OUT, label: 'Dispatch'         },
      { key: P.TXN_RETURN,    label: 'Return'           },
      { key: P.TXN_TRANSFER,  label: 'Inter-Company Transfer' },
      { key: P.TXN_RECONCILE, label: 'Issue Reconcile'  },
      { key: P.TXN_ADJUST,    label: 'Manual Adjustment' },
    ],
  },
  {
    group: 'Reports',
    perms: [{ key: P.REPORT_VIEW, label: 'View Reports' }],
  },
  {
    group: 'User Management',
    perms: [
      { key: P.USER_VIEW,   label: 'View'   },
      { key: P.USER_CREATE, label: 'Create' },
      { key: P.USER_EDIT,   label: 'Edit'   },
      { key: P.USER_DELETE, label: 'Delete' },
    ],
  },
  {
    group: 'Role Management',
    perms: [{ key: P.ROLE_MANAGE, label: 'Manage Roles' }],
  },
  {
    group: 'Settings',
    perms: [{ key: P.SETTINGS_MANAGE, label: 'Manage Master Data' }],
  },
  {
    group: 'Company Management',
    perms: [
      { key: P.COMPANY_VIEW,   label: 'View'   },
      { key: P.COMPANY_CREATE, label: 'Create' },
      { key: P.COMPANY_EDIT,   label: 'Edit'   },
    ],
  },
  {
    group: 'HR — Employees',
    perms: [
      { key: P.HR_EMPLOYEE_VIEW, label: 'View' },
      { key: P.HR_EMPLOYEE_EDIT, label: 'Edit' },
    ],
  },
  {
    group: 'HR — Documents',
    perms: [
      { key: P.HR_DOCUMENT_VIEW, label: 'View' },
      { key: P.HR_DOCUMENT_EDIT, label: 'Edit' },
    ],
  },
  {
    group: 'HR — Schedule',
    perms: [
      { key: P.HR_SCHEDULE_VIEW, label: 'View' },
      { key: P.HR_SCHEDULE_EDIT, label: 'Edit' },
      { key: P.HR_SCHEDULE_PUBLISH, label: 'Publish / lock' },
    ],
  },
  {
    group: 'HR — Attendance',
    perms: [
      { key: P.HR_ATTENDANCE_VIEW, label: 'View' },
      { key: P.HR_ATTENDANCE_EDIT, label: 'Edit' },
      { key: P.HR_ATTENDANCE_APPROVE, label: 'Approve' },
    ],
  },
  {
    group: 'HR — Geofence Attendance',
    perms: [
      { key: P.HR_GEOFENCE_VIEW, label: 'View' },
      { key: P.HR_GEOFENCE_EDIT, label: 'Edit' },
    ],
  },
  {
    group: 'HR — Settings',
    perms: [{ key: P.HR_SETTINGS_DOC_TYPES, label: 'Document types' }],
  },
  {
    group: 'Employee self-service',
    perms: [
      { key: P.SELF_EMPLOYEE_VIEW, label: 'View own profile' },
      { key: P.SELF_EMPLOYEE_DOCUMENTS, label: 'View own documents' },
      { key: P.SELF_EMPLOYEE_SCHEDULE, label: 'View own schedule' },
      { key: P.SELF_EMPLOYEE_ATTENDANCE, label: 'View own attendance' },
    ],
  },
];

// ── Runtime helpers ───────────────────────────────────────────────────────────
export function can(permissions: string[], perm: Permission): boolean {
  return permissions.includes(perm);
}

export function canAny(permissions: string[], perms: Permission[]): boolean {
  return perms.some((p) => permissions.includes(p));
}
