'use client';

import { Suspense } from 'react';

import { PrintFormatSettingsPanel } from '@/components/settings/PrintFormatSettingsPanel';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

function PrintFormatPageSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-lg border border-border" />
    </div>
  );
}

function SettingsPrintFormatPageContent() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Print format</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Create, edit, and assign default document layouts for delivery notes and other print outputs.
          </p>
        </div>
      </header>

      <PrintFormatSettingsPanel />
    </div>
  );
}

export default function SettingsPrintFormatPage() {
  return (
    <Suspense fallback={<PrintFormatPageSkeleton />}>
      <SettingsPrintFormatPageContent />
    </Suspense>
  );
}
