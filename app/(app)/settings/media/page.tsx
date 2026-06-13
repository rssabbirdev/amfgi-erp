'use client';

import { Suspense } from 'react';

import { MediaLibraryPanel } from '@/components/settings/MediaLibraryPanel';
import { Skeleton } from '@/components/ui/shadcn/skeleton';

function MediaPageSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-56 max-w-full" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-8 w-28 shrink-0 self-start sm:self-end" />
      </div>
      <Skeleton className="h-72 w-full rounded-lg border border-border" />
    </div>
  );
}

function SettingsMediaPageContent() {
  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Media library</h1>
          <p className="text-sm text-muted-foreground">
            Browse uploads for the active company: profile photos, signatures, and other assets. Filter by name or
            category to see what is linked to records.
          </p>
        </div>
      </header>

      <MediaLibraryPanel />
    </div>
  );
}

export default function SettingsMediaPage() {
  return (
    <Suspense fallback={<MediaPageSkeleton />}>
      <SettingsMediaPageContent />
    </Suspense>
  );
}
