'use client';

import { useSession } from 'next-auth/react';

import {
  WorkspaceHubHeader,
  WorkspaceHubSection,
  WorkspaceHubSectionsGrid,
  type WorkspaceHubSectionData,
  type WorkspaceHubTone,
} from '@/components/workspace';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';

type HubItem = {
  href: string;
  title: string;
  description: string;
  badge: string;
  tone: WorkspaceHubTone;
  perms?: string[];
};

const HUB_SECTIONS: Array<{
  id: string;
  title: string;
  description: string;
  cards: HubItem[];
}> = [
  {
    id: 'schedule-attendance',
    title: 'Schedule & attendance',
    description: 'Plan daily work, manage attendance sheets, and export monthly records.',
    cards: [
      {
        href: '/hr/schedule',
        title: 'Schedule planning',
        description: 'Create team groups, assign drivers and workers, and prepare day timing before attendance opens.',
        badge: 'Planning',
        tone: 'emerald',
        perms: ['hr.schedule.view'],
      },
      {
        href: '/hr/attendance',
        title: 'Attendance management',
        description: 'Review published schedules, generate attendance sheets, and correct daily worked-hour records.',
        badge: 'Attendance',
        tone: 'sky',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/attendance/employee',
        title: 'Employee attendance',
        description: 'Add, edit, or delete individual attendance rows for one employee and month at a time.',
        badge: 'Individual',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/reports/attendance',
        title: 'Monthly attendance reports',
        description: 'Review employee-wise monthly attendance and export Excel files for one employee or the full month.',
        badge: 'Reports',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
    ],
  },
  {
    id: 'employees',
    title: 'Employees',
    description: 'Employee records, workforce attributes, documents, and profile setup.',
    cards: [
      {
        href: '/hr/employees',
        title: 'Employees',
        description: 'Manage employee records, profile details, default timing, documents, and portal access.',
        badge: 'People',
        tone: 'emerald',
        perms: ['hr.employee.view'],
      },
      {
        href: '/hr/settings/employment-options',
        title: 'Employment options',
        description: 'Manage designation, department, and employment type lists used on employee profiles.',
        badge: 'Catalog',
        tone: 'amber',
        perms: ['hr.employee.edit'],
      },
      {
        href: '/hr/settings/employee-types',
        title: 'Employee type timings',
        description: 'Set baseline timing and hours logic for office staff, drivers, hybrid roles, and labour teams.',
        badge: 'Timing',
        tone: 'emerald',
        perms: ['hr.settings.employee_types', 'hr.employee.view'],
      },
      {
        href: '/hr/settings/expertises',
        title: 'Expertise catalog',
        description: 'Maintain the workforce skill catalog used when matching employees to jobs and teams.',
        badge: 'Skills',
        tone: 'sky',
        perms: ['hr.settings.expertise_catalog', 'hr.employee.view'],
      },
      {
        href: '/hr/settings/document-types',
        title: 'Document types',
        description: 'Define passport, visa, licence, and other tracked document categories with compliance rules.',
        badge: 'Compliance',
        tone: 'amber',
        perms: ['hr.document_type.view', 'hr.settings.document_types'],
      },
    ],
  },
  {
    id: 'payroll-leave-holidays',
    title: 'Payroll, leave & holidays',
    description: 'Leave requests, pay preview and runs, holiday calendar, and payroll rules.',
    cards: [
      {
        href: '/hr/leave',
        title: 'Leave management',
        description: 'Review pending leave, record official leave for employees, and track balances from leave types setup.',
        badge: 'Leave',
        tone: 'amber',
        perms: ['hr.leave.view', 'hr.leave.approve', 'hr.leave.edit', 'hr.leave.delete'],
      },
      {
        href: '/hr/payroll/preview',
        title: 'Payroll preview',
        description: 'Estimate gross pay per employee for a month using compensation and approved attendance.',
        badge: 'Preview',
        tone: 'emerald',
        perms: ['hr.payroll.compensation'],
      },
      {
        href: '/hr/payroll/runs',
        title: 'Pay runs',
        description: 'View finalized runs and print payslips (PDF).',
        badge: 'History',
        tone: 'sky',
        perms: ['hr.payroll.compensation'],
      },
      {
        href: '/hr/settings/leave-types',
        title: 'Leave types',
        description: 'Configure leave categories, allocation rules, portal visibility, and tiered pay rules.',
        badge: 'Leave',
        tone: 'amber',
        perms: ['hr.payroll.settings'],
      },
      {
        href: '/hr/settings/company-holidays',
        title: 'Company holidays',
        description: 'Maintain the public holiday calendar used by payroll — separate from attendance and leave.',
        badge: 'Holidays',
        tone: 'sky',
        perms: ['hr.payroll.settings'],
      },
      {
        href: '/hr/settings/salary-structure',
        title: 'Salary structure',
        description: 'Configure payroll calculation templates, OT %, and working-day rules.',
        badge: 'Payroll',
        tone: 'sky',
        perms: ['hr.payroll.settings'],
      },
      {
        href: '/hr/settings/salary-component',
        title: 'Salary components',
        description: 'Define earnings and deductions (housing, transport, loans) and how they apply to pay.',
        badge: 'Payroll',
        tone: 'sky',
        perms: ['hr.payroll.settings'],
      },
    ],
  },
];

function canSeeItem(isSuperAdmin: boolean, permissions: string[], item: HubItem) {
  if (isSuperAdmin) return true;
  if (!item.perms || item.perms.length === 0) return true;
  return item.perms.some((perm) => permissions.includes(perm));
}

export default function HrHubPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const permissions = (session?.user?.permissions ?? []) as string[];

  const visibleSections: WorkspaceHubSectionData[] = HUB_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    links: section.cards
      .filter((item) => canSeeItem(isSuperAdmin, permissions, item))
      .map(({ href, title, description, badge, tone }) => ({ href, title, description, badge, tone })),
  })).filter((section) => section.links.length > 0);

  const totalVisibleLinks = visibleSections.reduce((sum, section) => sum + section.links.length, 0);

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <WorkspaceHubHeader
        eyebrow="People"
        title="HR operations hub"
        description="Schedule and attendance, employee records, payroll, leave, and holidays — grouped in three columns."
        trailing={`${totalVisibleLinks} link${totalVisibleLinks === 1 ? '' : 's'}`}
      />

      {visibleSections.length === 0 ? (
        <Alert>
          <AlertTitle>No HR sections available</AlertTitle>
          <AlertDescription>Your account does not currently have HR permissions for this company.</AlertDescription>
        </Alert>
      ) : (
        <WorkspaceHubSectionsGrid columns={3}>
          {visibleSections.map((section) => (
            <WorkspaceHubSection key={section.id} section={section} />
          ))}
        </WorkspaceHubSectionsGrid>
      )}
    </div>
  );
}
