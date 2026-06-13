'use client';

import { Suspense } from 'react';

import { StorageSettingsPanel } from '@/components/settings/StorageSettingsPanel';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

function StoragePageSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Skeleton className="h-96 w-full rounded-lg border border-border" />
    </div>
  );
}

function SettingsStoragePageContent() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Storage</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Connect Google Drive and configure the global root folder used by all companies.
          </p>
        </div>
      </header>

      <StorageSettingsPanel />
    </div>
  );
}

export default function SettingsStoragePage() {
  return (
    <Suspense fallback={<StoragePageSkeleton />}>
      <SettingsStoragePageContent />
    </Suspense>
  );
}
