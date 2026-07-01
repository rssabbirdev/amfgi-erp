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

  // Suppliers
  SUPPLIER_VIEW:   'supplier.view',
  SUPPLIER_CREATE: 'supplier.create',
  SUPPLIER_EDIT:   'supplier.edit',
  SUPPLIER_DELETE: 'supplier.delete',

  // Transactions
  TXN_STOCK_IN:  'transaction.stock_in',
  TXN_STOCK_OUT: 'transaction.stock_out',
  TXN_RETURN:    'transaction.return',
  TXN_TRANSFER:  'transaction.transfer',
  TXN_RECONCILE: 'transaction.reconcile',
  TXN_ADJUST:    'transaction.adjust',

  // Stock modules (assign per role in Admin → Roles; not separate system roles)
  STOCK_JOB_BUDGET_VIEW: 'stock.job_budget.view',
  STOCK_JOB_BUDGET_EDIT: 'stock.job_budget.edit',
  STOCK_FORMULA_VIEW: 'stock.formula.view',
  STOCK_FORMULA_EDIT: 'stock.formula.edit',
  STOCK_PRODUCTION_LOG_VIEW: 'stock.production_log.view',
  STOCK_PRODUCTION_LOG_EDIT: 'stock.production_log.edit',
  STOCK_WAREHOUSE_TRANSFER_VIEW: 'stock.warehouse_transfer.view',
  STOCK_WAREHOUSE_TRANSFER_TRANSFER: 'stock.warehouse_transfer.transfer',
  STOCK_COUNT_SESSION_VIEW: 'stock.count_session.view',
  STOCK_COUNT_SESSION_EDIT: 'stock.count_session.edit',

  // Reports
  REPORT_VIEW: 'report.view',

  // Settings
  SETTINGS_MANAGE: 'settings.manage',
  SETTINGS_PRINT_FORMAT: 'settings.print_format',
  SETTINGS_STORAGE: 'settings.storage',
  SETTINGS_MEDIA: 'settings.media',
  SETTINGS_EMAIL: 'settings.email',
  SETTINGS_API: 'settings.api',

  // HR / Workforce
  HR_EMPLOYEE_VIEW: 'hr.employee.view',
  HR_EMPLOYEE_EDIT: 'hr.employee.edit',
  HR_DOCUMENT_VIEW: 'hr.document.view',
  HR_DOCUMENT_CREATE: 'hr.document.create',
  HR_DOCUMENT_EDIT: 'hr.document.edit',
  HR_DOCUMENT_DELETE: 'hr.document.delete',
  HR_SCHEDULE_VIEW: 'hr.schedule.view',
  HR_SCHEDULE_EDIT: 'hr.schedule.edit',
  HR_SCHEDULE_PUBLISH: 'hr.schedule.publish',
  HR_ATTENDANCE_VIEW: 'hr.attendance.view',
  HR_ATTENDANCE_EDIT: 'hr.attendance.edit',
  HR_ATTENDANCE_APPROVE: 'hr.attendance.approve',
  HR_SETTINGS_DOC_TYPES: 'hr.settings.document_types',
  HR_LEAVE_VIEW: 'hr.leave.view',
  HR_LEAVE_APPROVE: 'hr.leave.approve',
  HR_LEAVE_EDIT: 'hr.leave.edit',
  HR_LEAVE_DELETE: 'hr.leave.delete',
  HR_PAYROLL_SETTINGS: 'hr.payroll.settings',
  HR_PAYROLL_COMPENSATION: 'hr.payroll.compensation',
  HR_COMPENSATION_VIEW: 'hr.compensation.view',
  HR_COMPENSATION_CREATE: 'hr.compensation.create',
  HR_COMPENSATION_EDIT: 'hr.compensation.edit',
  HR_COMPENSATION_DELETE: 'hr.compensation.delete',
  HR_VISA_VIEW: 'hr.visa.view',
  HR_VISA_CREATE: 'hr.visa.create',
  HR_VISA_EDIT: 'hr.visa.edit',
  HR_VISA_DELETE: 'hr.visa.delete',

  // Employee self-service (linked User.linkedEmployeeId)
  SELF_EMPLOYEE_VIEW: 'self.employee.view',
  SELF_EMPLOYEE_DOCUMENTS: 'self.employee.documents',
  SELF_EMPLOYEE_SCHEDULE: 'self.employee.schedule',
  SELF_EMPLOYEE_ATTENDANCE: 'self.employee.attendance',
  SELF_LEAVE_REQUEST: 'self.leave.request',
} as const;

export type Permission = (typeof P)[keyof typeof P];
export const ALL_PERMISSIONS = Object.values(P) as Permission[];

/** System role slug for HR employee portal logins (`User.linkedEmployeeId`). */
export const EMPLOYEE_SELF_ROLE_SLUG = 'employee-self';

/** Slug used by custom HR roles (not a protected system role). */
export const HR_ROLE_SLUG = 'hr';

// ── Predefined role permission sets ───────────────────────────────────────────
export const ROLE_PRESETS: Record<string, Permission[]> = {
  super_admin: ALL_PERMISSIONS,

  manager: [
    P.MATERIAL_VIEW, P.MATERIAL_CREATE, P.MATERIAL_EDIT,
    P.JOB_VIEW,      P.JOB_CREATE,      P.JOB_EDIT,
    P.CUSTOMER_VIEW, P.CUSTOMER_CREATE, P.CUSTOMER_EDIT,
    P.SUPPLIER_VIEW, P.SUPPLIER_CREATE, P.SUPPLIER_EDIT,
    P.TXN_STOCK_IN,  P.TXN_STOCK_OUT,   P.TXN_RETURN, P.TXN_TRANSFER, P.TXN_RECONCILE, P.TXN_ADJUST,
    P.REPORT_VIEW,
    P.USER_VIEW,
    P.SETTINGS_MANAGE,
    P.SETTINGS_PRINT_FORMAT,
    P.SETTINGS_STORAGE,
    P.SETTINGS_MEDIA,
    P.SETTINGS_EMAIL,
    P.SETTINGS_API,
    P.HR_EMPLOYEE_VIEW, P.HR_EMPLOYEE_EDIT,
    P.HR_DOCUMENT_VIEW, P.HR_DOCUMENT_CREATE, P.HR_DOCUMENT_EDIT, P.HR_DOCUMENT_DELETE,
    P.HR_SCHEDULE_VIEW, P.HR_SCHEDULE_EDIT, P.HR_SCHEDULE_PUBLISH,
    P.HR_ATTENDANCE_VIEW, P.HR_ATTENDANCE_EDIT, P.HR_ATTENDANCE_APPROVE,
    P.HR_SETTINGS_DOC_TYPES,
    P.HR_LEAVE_VIEW, P.HR_LEAVE_APPROVE, P.HR_LEAVE_EDIT, P.HR_LEAVE_DELETE,
    P.HR_PAYROLL_SETTINGS, P.HR_PAYROLL_COMPENSATION,
    P.HR_COMPENSATION_VIEW, P.HR_COMPENSATION_CREATE, P.HR_COMPENSATION_EDIT, P.HR_COMPENSATION_DELETE,
    P.HR_VISA_VIEW, P.HR_VISA_CREATE, P.HR_VISA_EDIT, P.HR_VISA_DELETE,
    P.STOCK_JOB_BUDGET_VIEW,
    P.STOCK_JOB_BUDGET_EDIT,
    P.STOCK_FORMULA_VIEW,
    P.STOCK_FORMULA_EDIT,
    P.STOCK_PRODUCTION_LOG_VIEW,
    P.STOCK_PRODUCTION_LOG_EDIT,
    P.STOCK_WAREHOUSE_TRANSFER_VIEW,
    P.STOCK_WAREHOUSE_TRANSFER_TRANSFER,
    P.STOCK_COUNT_SESSION_VIEW,
    P.STOCK_COUNT_SESSION_EDIT,
  ],

  store_keeper: [
    P.MATERIAL_VIEW,
    P.JOB_VIEW,
    P.TXN_STOCK_OUT,
    P.TXN_RETURN,
  ],

  employee_self: [
    P.SELF_EMPLOYEE_VIEW,
    P.SELF_EMPLOYEE_DOCUMENTS,
    P.SELF_EMPLOYEE_SCHEDULE,
    P.SELF_EMPLOYEE_ATTENDANCE,
    P.SELF_LEAVE_REQUEST,
  ],

  /** HR workforce preset for custom roles (create via Admin → Roles). */
  hr: [
    P.HR_EMPLOYEE_VIEW,
    P.HR_EMPLOYEE_EDIT,
    P.HR_DOCUMENT_VIEW,
    P.HR_DOCUMENT_CREATE,
    P.HR_DOCUMENT_EDIT,
    P.HR_DOCUMENT_DELETE,
    P.HR_SCHEDULE_VIEW,
    P.HR_SCHEDULE_EDIT,
    P.HR_SCHEDULE_PUBLISH,
    P.HR_ATTENDANCE_VIEW,
    P.HR_ATTENDANCE_EDIT,
    P.HR_ATTENDANCE_APPROVE,
    P.HR_SETTINGS_DOC_TYPES,
    P.HR_LEAVE_VIEW,
    P.HR_LEAVE_APPROVE,
    P.HR_LEAVE_EDIT,
    P.HR_LEAVE_DELETE,
    P.HR_PAYROLL_SETTINGS,
    P.HR_PAYROLL_COMPENSATION,
    P.HR_COMPENSATION_VIEW,
    P.HR_COMPENSATION_CREATE,
    P.HR_COMPENSATION_EDIT,
    P.HR_COMPENSATION_DELETE,
    P.HR_VISA_VIEW,
    P.HR_VISA_CREATE,
    P.HR_VISA_EDIT,
    P.HR_VISA_DELETE,
  ],
};

export const ROLE_PRESET_LABELS: Record<keyof typeof ROLE_PRESETS, string> = {
  super_admin: 'Admin (full access)',
  manager: 'Manager',
  store_keeper: 'Store keeper',
  employee_self: 'Employee self-service',
  hr: 'HR',
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
    group: 'Suppliers',
    perms: [
      { key: P.SUPPLIER_VIEW,   label: 'View'   },
      { key: P.SUPPLIER_CREATE, label: 'Create' },
      { key: P.SUPPLIER_EDIT,   label: 'Edit'   },
      { key: P.SUPPLIER_DELETE, label: 'Delete' },
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
    group: 'Stock — Job budget',
    perms: [
      { key: P.STOCK_JOB_BUDGET_VIEW, label: 'View' },
      { key: P.STOCK_JOB_BUDGET_EDIT, label: 'Edit' },
    ],
  },
  {
    group: 'Stock — Formula',
    perms: [
      { key: P.STOCK_FORMULA_VIEW, label: 'View' },
      { key: P.STOCK_FORMULA_EDIT, label: 'Edit' },
    ],
  },
  {
    group: 'Stock — Production log',
    perms: [
      { key: P.STOCK_PRODUCTION_LOG_VIEW, label: 'View' },
      { key: P.STOCK_PRODUCTION_LOG_EDIT, label: 'Edit / finalize' },
    ],
  },
  {
    group: 'Stock — Warehouse transfer',
    perms: [
      { key: P.STOCK_WAREHOUSE_TRANSFER_VIEW, label: 'View' },
      { key: P.STOCK_WAREHOUSE_TRANSFER_TRANSFER, label: 'Transfer' },
    ],
  },
  {
    group: 'Stock — Count session',
    perms: [
      { key: P.STOCK_COUNT_SESSION_VIEW, label: 'View' },
      { key: P.STOCK_COUNT_SESSION_EDIT, label: 'Edit / submit' },
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
    group: 'Settings — Workspace',
    perms: [
      { key: P.SETTINGS_PRINT_FORMAT, label: 'Print formats' },
      { key: P.SETTINGS_STORAGE, label: 'Storage (Google Drive)' },
      { key: P.SETTINGS_MEDIA, label: 'Media library' },
      { key: P.SETTINGS_EMAIL, label: 'Email delivery' },
      { key: P.SETTINGS_API, label: 'API center' },
    ],
  },
  {
    group: 'Settings — Master data',
    perms: [{ key: P.SETTINGS_MANAGE, label: 'Manage master data (full legacy access)' }],
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
      { key: P.HR_DOCUMENT_CREATE, label: 'Create' },
      { key: P.HR_DOCUMENT_EDIT, label: 'Edit' },
      { key: P.HR_DOCUMENT_DELETE, label: 'Delete' },
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
    group: 'HR — Settings',
    perms: [{ key: P.HR_SETTINGS_DOC_TYPES, label: 'Document types' }],
  },
  {
    group: 'HR — Leave',
    perms: [
      { key: P.HR_LEAVE_VIEW, label: 'View leave requests' },
      { key: P.HR_LEAVE_APPROVE, label: 'Approve / reject leave' },
      { key: P.HR_LEAVE_EDIT, label: 'Edit leave requests' },
      { key: P.HR_LEAVE_DELETE, label: 'Delete / cancel leave' },
    ],
  },
  {
    group: 'HR — Payroll setup',
    perms: [
      { key: P.HR_PAYROLL_SETTINGS, label: 'Manage salary structure' },
      { key: P.HR_PAYROLL_COMPENSATION, label: 'Payroll preview & runs (legacy full access)' },
    ],
  },
  {
    group: 'HR — Compensation',
    perms: [
      { key: P.HR_COMPENSATION_VIEW, label: 'View' },
      { key: P.HR_COMPENSATION_CREATE, label: 'Create' },
      { key: P.HR_COMPENSATION_EDIT, label: 'Edit' },
      { key: P.HR_COMPENSATION_DELETE, label: 'Delete' },
    ],
  },
  {
    group: 'HR — Visa & Contract',
    perms: [
      { key: P.HR_VISA_VIEW, label: 'View' },
      { key: P.HR_VISA_CREATE, label: 'Create' },
      { key: P.HR_VISA_EDIT, label: 'Edit' },
      { key: P.HR_VISA_DELETE, label: 'Delete' },
    ],
  },
  {
    group: 'Employee self-service',
    perms: [
      { key: P.SELF_EMPLOYEE_VIEW, label: 'View own profile' },
      { key: P.SELF_EMPLOYEE_DOCUMENTS, label: 'View own documents in portal' },
      { key: P.SELF_EMPLOYEE_SCHEDULE, label: 'View own schedule' },
      { key: P.SELF_EMPLOYEE_ATTENDANCE, label: 'View own attendance' },
      { key: P.SELF_LEAVE_REQUEST, label: 'Submit leave requests' },
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
