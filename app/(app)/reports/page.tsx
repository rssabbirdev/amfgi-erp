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
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';

type ReportItem = {
  href: string;
  title: string;
  description: string;
  badge: string;
  tone: WorkspaceHubTone;
};

const REPORT_SECTIONS: Array<{
  id: string;
  title: string;
  description: string;
  reports: ReportItem[];
}> = [
  {
    id: 'jobs-profitability',
    title: 'Jobs & profitability',
    description: 'Material cost, production output, and supplier flow tied to customer jobs.',
    reports: [
      {
        href: '/reports/monthly-job-summary',
        title: 'Monthly job summary',
        description:
          'Pick a month and generate. Jobs with stock transactions or work assignments in that month are listed automatically. Export one Excel file with a sheet per job.',
        badge: 'Monthly',
        tone: 'emerald',
      },
      {
        href: '/reports/job-profitability',
        title: 'Customer and job profitability',
        description:
          'Variation jobs rolled up with customer, parent job, material budget, issued cost, returns, and reconcile-linked consumption.',
        badge: 'Profitability',
        tone: 'emerald',
      },
      {
        href: '/reports/supplier-traceability',
        title: 'Supplier traceability',
        description:
          'Follow each receipt batch from supplier and receipt number into warehouse stock, dispatch usage, linked jobs, and customer delivery flow.',
        badge: 'Traceability',
        tone: 'amber',
      },
    ],
  },
  {
    id: 'stock-control',
    title: 'Stock & inventory control',
    description: 'Exceptions, manual corrections, and physical count session outcomes.',
    reports: [
      {
        href: '/reports/stock-exceptions',
        title: 'Stock exception dashboard',
        description:
          'Dispatch overrides, receipt cancellations, approved receipt adjustments, and the current stock-integrity drift signal.',
        badge: 'Exceptions',
        tone: 'amber',
      },
      {
        href: '/reports/stock-adjustments',
        title: 'Stock adjustment report',
        description:
          'Bulk manual adjustments grouped by request, with evidence, requester, approver, warehouse coverage, and quantity and value impact.',
        badge: 'Adjustments',
        tone: 'emerald',
      },
      {
        href: '/reports/stock-count-sessions',
        title: 'Stock count session report',
        description:
          'Recount sessions, linked adjustment decisions, approval timing, and repeated variance patterns by material.',
        badge: 'Count sessions',
        tone: 'muted',
      },
    ],
  },
];

export default function ReportsHubPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const permissions = (session?.user?.permissions ?? []) as string[];
  const canView = isSuperAdmin || permissions.includes('report.view');

  const sections: WorkspaceHubSectionData[] = REPORT_SECTIONS.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    links: section.reports.map(({ href, title, description, badge, tone }) => ({
      href,
      title,
      description,
      badge,
      tone,
    })),
  }));

  const totalReports = sections.reduce((sum, section) => sum + section.links.length, 0);

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>You do not have permission to view reports.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <WorkspaceHubHeader
        eyebrow="Insights"
        title="Reports"
        description="Open operational and analytical reports for jobs, material consumption, supplier traceability, and stock control."
        trailing={`${totalReports} report${totalReports === 1 ? '' : 's'}`}
      />

      {sections.length === 0 ? (
        <Alert>
          <AlertTitle>No reports available</AlertTitle>
          <AlertDescription>Your account does not currently have report permissions for this company.</AlertDescription>
        </Alert>
      ) : (
        <WorkspaceHubSectionsGrid columns={2}>
          {sections.map((section) => (
            <WorkspaceHubSection key={section.id} section={section} />
          ))}
        </WorkspaceHubSectionsGrid>
      )}
    </div>
  );
}
