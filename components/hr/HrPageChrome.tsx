'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function prettifyDateSegment(segment: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segment)) return null;
  try {
    return new Date(`${segment}T00:00:00`).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return segment;
  }
}

function labelForSegment(segment: string, previous?: string) {
  const mapped: Record<string, string> = {
    hr: 'HR',
    employees: 'Employees',
    new: 'New Employee',
    schedule: 'Schedule',
    attendance: 'Attendance',
    create: 'Create Attendance',
    boilerplate: 'Attendance Boilerplate',
    reports: 'Reports',
    builder: 'Builder',
    settings: 'Settings',
    'document-types': 'Document Types',
    expertises: 'Expertises',
    'employee-types': 'Employee Types',
  };

  const dateLabel = prettifyDateSegment(segment);
  if (dateLabel) return dateLabel;
  if (mapped[segment]) return mapped[segment];
  if (previous === 'employees') return 'Profile';
  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join('/')}`,
    label: labelForSegment(segment, segments[index - 1]),
  }));
}

const CLICKABLE_HR_ROUTES = new Set([
  '/hr',
  '/hr/employees',
  '/hr/schedule',
  '/hr/attendance',
  '/hr/reports/attendance',
]);

export default function HrPageChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const isClickable = CLICKABLE_HR_ROUTES.has(crumb.href);
          return (
            <span key={crumb.href} className="flex items-center gap-2">
              {index > 0 ? <span className="text-slate-600">/</span> : null}
              {isLast || !isClickable ? (
                <span className="font-medium text-white">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="hover:text-slate-200">
                  {crumb.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
