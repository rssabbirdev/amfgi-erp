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
    id: 'daily-operations',
    title: 'Daily Operations',
    description: 'Move through the core HR day from workforce planning into attendance confirmation.',
    cards: [
      {
        href: '/hr/schedule',
        title: 'Schedule Planning',
        description: 'Create team groups, assign drivers and workers, and prepare day timing before attendance opens.',
        badge: 'Planning',
        tone: 'emerald',
        perms: ['hr.schedule.view'],
      },
      {
        href: '/hr/attendance',
        title: 'Attendance Management',
        description: 'Review published schedules, generate attendance sheets, and correct daily worked-hour records.',
        badge: 'Attendance',
        tone: 'sky',
        perms: ['hr.attendance.view'],
      },
      {
        href: '/hr/reports/attendance',
        title: 'Monthly Attendance Reports',
        description: 'Review employee-wise monthly attendance and export Excel files for one employee or the full month.',
        badge: 'Reports',
        tone: 'amber',
        perms: ['hr.attendance.view'],
      },
    ],
  },
  {
    id: 'workforce',
    title: 'Workforce',
    description: 'Maintain the employee master file and monitor the people records that support planning and payroll.',
    cards: [
      {
        href: '/hr/employees',
        title: 'Employees',
        description: 'Manage employee records, profile details, default timing, documents, and workforce attributes.',
        badge: 'People',
        tone: 'emerald',
        perms: ['hr.employee.view'],
      },
      {
        href: '/hr/leave',
        title: 'Leave requests',
        description: 'Approve employee leave and manage annual leave balances.',
        badge: 'Leave',
        tone: 'amber',
        perms: ['hr.leave.view', 'hr.leave.approve'],
      },
    ],
  },
  {
    id: 'hr-setup',
    title: 'HR Setup',
    description: 'Configure the reference data that keeps the HR module structured and consistent across companies.',
    cards: [
      {
        href: '/hr/settings/document-types',
        title: 'Document Types',
        description: 'Define passport, visa, licence, and other tracked document categories with compliance rules.',
        badge: 'Compliance',
        tone: 'amber',
        perms: ['hr.settings.document_types', 'hr.document.view'],
      },
      {
        href: '/hr/settings/expertises',
        title: 'Expertise Catalog',
        description: 'Maintain the workforce skill catalog used when matching employees to jobs and teams.',
        badge: 'Skills',
        tone: 'sky',
        perms: ['hr.settings.expertise_catalog', 'hr.employee.view'],
      },
      {
        href: '/hr/settings/employee-types',
        title: 'Employee Type Timings',
        description: 'Set baseline timing and hours logic for office staff, drivers, hybrid roles, and labour teams.',
        badge: 'Timing Rules',
        tone: 'emerald',
        perms: ['hr.settings.employee_types', 'hr.employee.view'],
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
      {
        href: '/hr/settings/leave-types',
        title: 'Leave types',
        description: 'Configure leave categories and tiered pay rules (UAE sick leave, annual leave, etc.).',
        badge: 'Leave',
        tone: 'amber',
        perms: ['hr.payroll.settings'],
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll',
    description: 'Estimate monthly gross, finalize pay runs, and manage salary structures.',
    cards: [
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
        description: 'View finalized runs, print payslips (PDF), and export CSV.',
        badge: 'History',
        tone: 'sky',
        perms: ['hr.payroll.compensation'],
      },
      {
        href: '/hr/settings/salary-structure',
        title: 'Salary structure',
        description: 'Configure calculation templates, OT %, and working-day rules.',
        badge: 'Setup',
        tone: 'sky',
        perms: ['hr.payroll.settings'],
      },
      {
        href: '/hr/settings/salary-component',
        title: 'Salary components',
        description: 'Earnings and deductions (housing, transport, loans) assigned per employee.',
        badge: 'Setup',
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
        description="Run daily workforce planning, attendance control, employee records, and HR setup from one entry point for operations teams."
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
