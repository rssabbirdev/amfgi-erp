'use client';

export type ScheduleWorkerPoolEmployee = {
  id: string;
  preferredName: string | null;
  fullName: string;
  workforce: { expertises: string[] };
};

export function ScheduleWorkerPoolCard({ employee }: { employee: ScheduleWorkerPoolEmployee }) {
  return (
    <div className="rounded border border-border bg-background px-1.5 py-1">
      <p className="truncate text-xs font-semibold text-foreground">
        {employee.preferredName || employee.fullName}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {employee.workforce.expertises.length > 0
          ? employee.workforce.expertises.join(', ')
          : 'No expertise set'}
      </p>
    </div>
  );
}
