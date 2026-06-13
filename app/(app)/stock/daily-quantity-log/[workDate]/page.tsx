'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import SearchSelect from '@/components/ui/SearchSelect';
import Spinner from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';
import {
  useAddJobItemProgressEntryMutation,
  useAddQuantityLogAdhocJobMutation,
  useFinalizeQuantityLogDayMutation,
  useGetDailyQuantityLogQuery,
  useRemoveQuantityLogAdhocJobMutation,
  useUnlockQuantityLogDayMutation,
  useUpdateJobItemProgressEntryMutation,
  type DailyQuantityLogAssignment,
  type DailyQuantityLogTeam,
  type DailyQuantityLogItem,
  type DailyQuantityLogTracker,
  type DailyQuantityLogExistingEntry,
} from '@/store/hooks';

function formatQty(value: number) {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function trackerKey(assignmentId: string, itemId: string, trackerId: string) {
  return `${assignmentId}::${itemId}::${trackerId}`;
}

function trackerLabel(item: DailyQuantityLogItem, trackerId: string | null) {
  if (!trackerId) return '—';
  const t = item.trackingItems.find((x) => x.id === trackerId);
  return t?.label ?? trackerId;
}

function trackerStockTargetLabel(tracker: DailyQuantityLogTracker | undefined | null) {
  if (!tracker?.finishedGoodMaterialId) return 'Progress only - no stock update';
  return `Stock in: ${tracker.finishedGoodMaterialName ?? 'Finished goods'} -> ${
    tracker.finishedGoodWarehouseName ?? 'warehouse'
  }`;
}

function remainingForTracker(item: DailyQuantityLogItem, tracker: DailyQuantityLogTracker): number | null {
  const target = Number(tracker.targetValue || 0);
  if (target <= 0) return null;
  const cumulative = Number(item.cumulativeByTracker?.[tracker.id] ?? 0);
  return Math.max(0, target - cumulative);
}

function collectAssignmentDrafts(
  assignment: DailyQuantityLogAssignment,
  drafts: Record<string, string>
) {
  const out: Array<{
    item: DailyQuantityLogItem;
    tracker: DailyQuantityLogTracker;
    quantity: number;
    key: string;
    overshoot: boolean;
  }> = [];
  for (const item of assignment.items) {
    for (const tracker of item.trackingItems) {
      const key = trackerKey(assignment.assignmentId, item.id, tracker.id);
      const raw = drafts[key];
      if (!raw || !raw.trim()) continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const remaining = remainingForTracker(item, tracker);
      const overshoot = remaining !== null && quantity > remaining;
      out.push({ item, tracker, quantity, key, overshoot });
    }
  }
  return out;
}

type AssignmentViewFilter = 'ALL' | 'OPEN' | 'DRAFTED' | 'COMPLETE';

function itemProgress(item: DailyQuantityLogItem) {
  let target = 0;
  let cumulative = 0;
  let openTrackers = 0;
  for (const tracker of item.trackingItems) {
    const trackerTarget = Number(tracker.targetValue || 0);
    const trackerCumulative = Number(item.cumulativeByTracker?.[tracker.id] ?? 0);
    target += trackerTarget;
    cumulative += trackerCumulative;
    if (trackerTarget <= 0 || trackerCumulative < trackerTarget) openTrackers += 1;
  }
  const percent = target > 0 ? Math.min(100, Math.round((cumulative / target) * 100)) : null;
  return { target, cumulative, openTrackers, percent };
}

function assignmentMetrics(assignment: DailyQuantityLogAssignment, drafts: Record<string, string>) {
  let trackerCount = 0;
  let openTrackers = 0;
  let completedItems = 0;
  let loggedCount = 0;
  let target = 0;
  let cumulative = 0;

  for (const item of assignment.items) {
    const progress = itemProgress(item);
    trackerCount += item.trackingItems.length;
    openTrackers += progress.openTrackers;
    loggedCount += item.existingEntries.length;
    target += progress.target;
    cumulative += progress.cumulative;
    if (item.trackingItems.length > 0 && progress.openTrackers === 0) completedItems += 1;
  }

  return {
    itemCount: assignment.items.length,
    trackerCount,
    openTrackers,
    completedItems,
    loggedCount,
    draftCount: collectAssignmentDrafts(assignment, drafts).length,
    percent: target > 0 ? Math.min(100, Math.round((cumulative / target) * 100)) : null,
  };
}

function assignmentMatchesSearch(assignment: DailyQuantityLogAssignment, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const job = assignment.job;
  const values = [
    assignment.label,
    job?.jobNumber,
    job?.customerName,
    job?.site,
    job?.description,
    job?.jobNumberSnapshot,
    job?.siteNameSnapshot,
    job?.clientNameSnapshot,
    job?.projectDetailsSnapshot,
    ...assignment.teams.flatMap((team) => [
      team.label,
      team.teamLeader?.fullName,
      team.remarks,
      team.job?.jobNumber,
      ...team.members.map((member) => member.fullName),
    ]),
    ...assignment.items.flatMap((item) => [
      item.name,
      item.description,
      ...item.trackingItems.map((tracker) => tracker.label),
    ]),
  ];
  return values.some((value) => String(value ?? '').toLowerCase().includes(q));
}

function editRemainingCapacity(item: DailyQuantityLogItem, entry: DailyQuantityLogExistingEntry) {
  if (!entry.trackerId) return null;
  const tracker = item.trackingItems.find((t) => t.id === entry.trackerId);
  if (!tracker) return null;
  const target = Number(tracker.targetValue || 0);
  if (target <= 0) return null;
  const cumulative = Number(item.cumulativeByTracker?.[tracker.id] ?? 0);
  return Math.max(0, target - cumulative + Number(entry.quantity || 0));
}

export default function DailyQuantityLogEntryPage() {
  const params = useParams();
  const router = useRouter();
  const workDateParam = typeof params.workDate === 'string' ? params.workDate : '';
  const workDateOk = /^\d{4}-\d{2}-\d{2}$/.test(workDateParam);

  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canView = isSA || perms.includes('job.view');
  const canEdit = isSA || perms.includes('job.edit');

  const { data, isLoading, isFetching, error, refetch } = useGetDailyQuantityLogQuery(workDateParam, {
    skip: !canView || !workDateOk,
  });
  const [addProgressEntry] = useAddJobItemProgressEntryMutation();
  const [updateProgressEntry] = useUpdateJobItemProgressEntryMutation();
  const [finalizeDay] = useFinalizeQuantityLogDayMutation();
  const [unlockDay] = useUnlockQuantityLogDayMutation();
  const [addAdhocJob] = useAddQuantityLogAdhocJobMutation();
  const [removeAdhocJob] = useRemoveQuantityLogAdhocJobMutation();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isFinalizingEmpty, setIsFinalizingEmpty] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [adhocJobId, setAdhocJobId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<AssignmentViewFilter>('ALL');

  const isFinalized = Boolean(data?.submission);
  const assignments = useMemo(() => data?.assignments ?? [], [data]);

  /** Derived seed: when data or date changes, reset new-entry drafts and seed
   *  edit drafts from existing entries (regardless of finalize state — the user
   *  can always edit/add). */
  useEffect(() => {
    setDrafts({});
    if (data) {
      const next: Record<string, string> = {};
      for (const a of data.assignments) {
        for (const item of a.items) {
          for (const entry of item.existingEntries) {
            next[entry.id] = String(entry.quantity);
          }
        }
      }
      setEditDrafts(next);
    } else {
      setEditDrafts({});
    }
  }, [data, workDateParam]);

  const summary = useMemo(() => {
    let totalAssignments = 0;
    let totalItems = 0;
    let totalTrackables = 0;
    let totalLoggedToday = 0;
    for (const assignment of assignments) {
      totalAssignments += 1;
      for (const item of assignment.items) {
        totalItems += 1;
        totalTrackables += item.trackingItems.length;
        totalLoggedToday += item.existingEntries.length;
      }
    }
    return { totalAssignments, totalItems, totalTrackables, totalLoggedToday };
  }, [assignments]);

  const draftedAcrossAll = useMemo(
    () => assignments.reduce((sum, assignment) => sum + collectAssignmentDrafts(assignment, drafts).length, 0),
    [assignments, drafts],
  );

  const overshootCount = useMemo(
    () =>
      assignments.reduce(
        (sum, assignment) => sum + collectAssignmentDrafts(assignment, drafts).filter((d) => d.overshoot).length,
        0
      ),
    [assignments, drafts]
  );

  const invalidDraftCount = useMemo(() => {
    let n = 0;
    for (const assignment of assignments) {
      for (const item of assignment.items) {
        for (const tracker of item.trackingItems) {
          const raw = drafts[trackerKey(assignment.assignmentId, item.id, tracker.id)];
          if (!raw?.trim()) continue;
          const q = Number(raw);
          if (!Number.isFinite(q) || q <= 0) n += 1;
        }
      }
    }
    return n;
  }, [assignments, drafts]);

  const editChangeCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const a of data.assignments) {
      for (const item of a.items) {
        for (const entry of item.existingEntries) {
          const raw = editDrafts[entry.id];
          if (raw === undefined) continue;
          const q = Number(raw);
          if (!Number.isFinite(q) || q <= 0) continue;
          if (q !== entry.quantity) n += 1;
        }
      }
    }
    return n;
  }, [data, editDrafts]);

  const invalidEditCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const a of data.assignments) {
      for (const item of a.items) {
        for (const entry of item.existingEntries) {
          const raw = editDrafts[entry.id];
          if (!raw?.trim()) continue;
          const q = Number(raw);
          if (!Number.isFinite(q) || q <= 0) n += 1;
        }
      }
    }
    return n;
  }, [data, editDrafts]);

  const editOvershootCount = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const a of data.assignments) {
      for (const item of a.items) {
        for (const entry of item.existingEntries) {
          const raw = editDrafts[entry.id];
          if (!raw?.trim()) continue;
          const q = Number(raw);
          if (!Number.isFinite(q) || q <= 0 || q === entry.quantity) continue;
          const capacity = editRemainingCapacity(item, entry);
          if (capacity !== null && q > capacity) n += 1;
        }
      }
    }
    return n;
  }, [data, editDrafts]);

  const assignmentRows = useMemo(
    () =>
      assignments.map((assignment) => ({
        assignment,
        metrics: assignmentMetrics(assignment, drafts),
      })),
    [assignments, drafts],
  );

  const filteredAssignments = useMemo(
    () =>
      assignmentRows.filter(({ assignment, metrics }) => {
        if (!assignmentMatchesSearch(assignment, searchQuery)) return false;
        if (viewFilter === 'OPEN') return metrics.openTrackers > 0;
        if (viewFilter === 'DRAFTED') return metrics.draftCount > 0;
        if (viewFilter === 'COMPLETE') return metrics.itemCount > 0 && metrics.openTrackers === 0;
        return true;
      }),
    [assignmentRows, searchQuery, viewFilter],
  );

  const viewCounts = useMemo(() => {
    let open = 0;
    let drafted = 0;
    let complete = 0;
    for (const row of assignmentRows) {
      if (row.metrics.openTrackers > 0) open += 1;
      if (row.metrics.draftCount > 0) drafted += 1;
      if (row.metrics.itemCount > 0 && row.metrics.openTrackers === 0) complete += 1;
    }
    return { all: assignmentRows.length, open, drafted, complete };
  }, [assignmentRows]);

  const errorMessage = useMemo(() => {
    if (!error) return null;
    if (typeof error === 'object' && error !== null && 'data' in error) {
      const errBody = (error as { data?: { error?: unknown } }).data;
      if (errBody && typeof errBody.error === 'string') return errBody.error;
    }
    return 'Failed to load production log';
  }, [error]);

  const jobsAlreadyOnSheet = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      if (a.job?.id) set.add(a.job.id);
    }
    return set;
  }, [assignments]);

  /** Server-side eligibility (jobs with ≥1 trackable budget item) minus jobs already on this day. */
  const adhocJobOptions = useMemo(() => {
    const list = data?.eligibleJobs ?? [];
    return list
      .filter((j) => !jobsAlreadyOnSheet.has(j.id))
      .map((j) => ({
        id: j.id,
        label: j.jobNumber,
        searchText: [j.customerName ?? '', j.site ?? '', j.projectName ?? '']
          .filter(Boolean)
          .join(' · '),
      }));
  }, [data?.eligibleJobs, jobsAlreadyOnSheet]);

  const handleSaveAll = async () => {
    if (!canEdit || !workDateOk) return;

    const invalidCount = invalidDraftCount + invalidEditCount;
    if (invalidCount > 0) {
      toast.error(`${invalidCount} ${invalidCount === 1 ? 'quantity is' : 'quantities are'} invalid. Use a number greater than zero.`);
      return;
    }

    if (overshootCount > 0) {
      toast.error(`${overshootCount} ${overshootCount === 1 ? 'entry exceeds' : 'entries exceed'} the remaining quantity. Adjust before saving.`);
      return;
    }

    if (editOvershootCount > 0) {
      toast.error(`${editOvershootCount} ${editOvershootCount === 1 ? 'edited entry exceeds' : 'edited entries exceed'} the available quantity. Adjust before saving.`);
      return;
    }

    type DraftRow = ReturnType<typeof collectAssignmentDrafts>[number] & { jobId: string };
    const newDrafts: DraftRow[] = [];
    for (const assignment of assignments) {
      if (!assignment.job) continue;
      for (const draft of collectAssignmentDrafts(assignment, drafts)) {
        newDrafts.push({ ...draft, jobId: assignment.job.id });
      }
    }

    type EditRow = {
      jobId: string;
      itemId: string;
      entryId: string;
      newQty: number;
      currentQty: number;
    };
    const edits: EditRow[] = [];
    for (const a of assignments) {
      if (!a.job) continue;
      for (const item of a.items) {
        for (const entry of item.existingEntries) {
          const raw = editDrafts[entry.id];
          if (raw === undefined) continue;
          const q = Number(raw);
          if (!Number.isFinite(q) || q <= 0) continue;
          if (q === entry.quantity) continue;
          edits.push({
            jobId: a.job.id,
            itemId: item.id,
            entryId: entry.id,
            newQty: q,
            currentQty: entry.quantity,
          });
        }
      }
    }

    if (newDrafts.length === 0 && edits.length === 0) {
      toast.error(isFinalized ? 'Edit a quantity or add a new entry to save' : 'Enter at least one quantity to log');
      return;
    }

    setIsSavingAll(true);
    let saved = 0;
    let failed = 0;
    let firstErr: string | null = null;
    const savedDraftKeys: string[] = [];

    /** PUT existing entry edits first — they reduce/raise cumulative before
     *  any new POSTs hit the over-quantity guard on the server. */
    for (const ed of edits) {
      try {
        await updateProgressEntry({
          jobId: ed.jobId,
          itemId: ed.itemId,
          entryId: ed.entryId,
          data: { quantity: ed.newQty },
        }).unwrap();
        saved += 1;
      } catch (err) {
        failed += 1;
        if (!firstErr && typeof err === 'object' && err !== null && 'data' in err) {
          const e = (err as { data?: { error?: unknown } }).data?.error;
          if (typeof e === 'string') firstErr = e;
        }
      }
    }

    for (const draft of newDrafts) {
      try {
        await addProgressEntry({
          jobId: draft.jobId,
          itemId: draft.item.id,
          data: {
            trackerId: draft.tracker.id,
            entryDate: workDateParam,
            quantity: draft.quantity,
          },
        }).unwrap();
        saved += 1;
        savedDraftKeys.push(draft.key);
      } catch (err) {
        failed += 1;
        if (!firstErr && typeof err === 'object' && err !== null && 'data' in err) {
          const e = (err as { data?: { error?: unknown } }).data?.error;
          if (typeof e === 'string') firstErr = e;
        }
      }
    }

    if (savedDraftKeys.length > 0) {
      setDrafts((current) => {
        const next = { ...current };
        for (const key of savedDraftKeys) delete next[key];
        return next;
      });
    }

    /** Auto-finalize the day on first save, but only if nothing failed and the
     *  day isn't already finalized. */
    let finalizedNow = false;
    if (!isFinalized && saved > 0 && failed === 0) {
      try {
        await finalizeDay(workDateParam).unwrap();
        finalizedNow = true;
      } catch {
        /** Don't fail the whole save just because finalization failed; the
         *  user can finalize later. */
      }
    }

    setIsSavingAll(false);

    if (saved > 0 && failed === 0) {
      const parts: string[] = [];
      if (edits.length > 0) parts.push(`${edits.length} updated`);
      if (newDrafts.length > 0) parts.push(`${newDrafts.length} added`);
      const summary = parts.length ? parts.join(', ') : `${saved} saved`;
      toast.success(finalizedNow ? `${summary} — day finalized` : summary);
      void refetch();
    } else if (saved > 0) {
      toast.error(`Saved ${saved}, ${failed} failed${firstErr ? ` — ${firstErr}` : ''}`);
      void refetch();
    } else if (firstErr) {
      toast.error(firstErr);
    }
  };

  const handleFinalizeEmpty = async () => {
    if (!canEdit || !workDateOk) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Finalize ${workDateParam} with no entries? You can still edit later only if entries become possible — but new entries will be blocked.`
      )
    ) {
      return;
    }
    setIsFinalizingEmpty(true);
    try {
      await finalizeDay({ workDate: workDateParam, allowEmpty: true }).unwrap();
      toast.success('Day finalized with no entries');
      void refetch();
    } catch (err) {
      const msg =
        typeof err === 'object' && err !== null && 'data' in err && typeof (err as { data?: { error?: unknown } }).data?.error === 'string'
          ? (err as { data: { error: string } }).data.error
          : 'Failed to finalize';
      toast.error(msg);
    } finally {
      setIsFinalizingEmpty(false);
    }
  };

  const handleUnlockDay = async () => {
    if (!canEdit || !workDateOk || !isFinalized) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Unlock ${workDateParam}? This will move the day back to pending so you can add jobs or new quantity entries.`)
    ) {
      return;
    }
    setIsUnlocking(true);
    try {
      await unlockDay(workDateParam).unwrap();
      toast.success('Day unlocked');
      void refetch();
    } catch (err) {
      const msg =
        typeof err === 'object' && err !== null && 'data' in err && typeof (err as { data?: { error?: unknown } }).data?.error === 'string'
          ? (err as { data: { error: string } }).data.error
          : 'Failed to unlock day';
      toast.error(msg);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleAddAdhoc = async () => {
    if (isFinalized) {
      toast.error('This day is finalized. Unlock the day before changing the job list.');
      return;
    }
    if (!adhocJobId.trim()) {
      toast.error('Select a job');
      return;
    }
    try {
      await addAdhocJob({ workDate: workDateParam, jobId: adhocJobId.trim() }).unwrap();
      toast.success('Job added to this day');
      setAdhocJobId('');
      void refetch();
    } catch (err) {
      const msg =
        typeof err === 'object' && err !== null && 'data' in err && typeof (err as { data?: { error?: unknown } }).data?.error === 'string'
          ? (err as { data: { error: string } }).data.error
          : 'Failed to add job';
      toast.error(msg);
    }
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view jobs.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!workDateOk) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert variant="destructive">
          <AlertDescription>Invalid date in URL.</AlertDescription>
        </Alert>
        <Button type="button" variant="secondary" size="sm" className="w-fit" onClick={() => router.push('/stock/daily-quantity-log')}>
          Back to list
        </Button>
      </div>
    );
  }

  const displayDate = new Date(`${workDateParam}T12:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalChangeCount = draftedAcrossAll + editChangeCount;
  const invalidQuantityCount = invalidDraftCount + invalidEditCount;
  const blockedQuantityCount = overshootCount + editOvershootCount;
  const saveLabel =
    invalidQuantityCount > 0
      ? `Fix ${invalidQuantityCount} invalid ${invalidQuantityCount === 1 ? 'quantity' : 'quantities'}`
      : blockedQuantityCount > 0
        ? `Fix ${blockedQuantityCount} over-quantity ${blockedQuantityCount === 1 ? 'entry' : 'entries'}`
      : isFinalized
        ? totalChangeCount > 0
          ? `Save ${totalChangeCount} ${totalChangeCount === 1 ? 'change' : 'changes'}`
          : 'Save changes'
        : totalChangeCount > 0
          ? `Save & finalize (${totalChangeCount})`
          : 'Save & finalize day';

  const saveDisabled = totalChangeCount === 0 || invalidQuantityCount > 0 || blockedQuantityCount > 0;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 pb-12">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/stock/daily-quantity-log"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 px-2')}
        >
          Production log
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground">{workDateParam}</span>
      </nav>

      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Production log entry</p>
            {isFinalized ? (
              <Badge label="Finalized" variant="green" />
            ) : (
              <Badge label="Pending" variant="yellow" />
            )}
            {data?.schedule ? (
              <Badge
                label={`Schedule ${data.schedule.status.toLowerCase()}`}
                variant={data.schedule.status === 'PUBLISHED' ? 'green' : data.schedule.status === 'LOCKED' ? 'gray' : 'yellow'}
              />
            ) : (
              <Badge label="No HR schedule" variant="gray" />
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{displayDate}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isFinalized
              ? 'This day is finalized. Existing logged quantities can still be corrected, but adding jobs or new quantity rows requires unlocking the day first.'
              : 'Enter quantities for each scheduled or ad-hoc job, then save once to log and finalize this calendar day.'}
          </p>
        </div>

        {canEdit ? (
          <div className="flex shrink-0 flex-col items-stretch gap-2 lg:items-end">
            {isFinalized ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleUnlockDay()}
                disabled={isUnlocking}
                className="lg:min-w-64"
              >
                {isUnlocking ? 'Unlocking…' : 'Unlock day'}
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              onClick={() => void handleSaveAll()}
              disabled={saveDisabled || isSavingAll}
              className="lg:min-w-64"
            >
              {isSavingAll ? 'Saving…' : saveLabel}
            </Button>
            {totalChangeCount === 0 ? (
              <p className="text-right text-[11px] text-muted-foreground">
                {isFinalized ? 'Edit an existing value to enable' : 'Enter at least one quantity to enable'}
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Jobs on sheet" value={summary.totalAssignments} hint="Schedule + ad-hoc" />
        <Stat label="Budget lines" value={summary.totalItems} hint="Tracking-enabled items" />
        <Stat label="Trackables" value={summary.totalTrackables} hint="Quantity targets" />
        <Stat label="Entries this date" value={summary.totalLoggedToday} hint="Posted rows" />
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* Add ad-hoc job */}
      {canEdit ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              {isFinalized ? 'Job list locked' : 'Add a job (not on schedule)'}
            </h2>
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {adhocJobOptions.length} available
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFinalized ? (
              <>
                This day is finalized. Use <strong className="font-medium text-foreground">Unlock day</strong> above before adding or
                removing jobs.
              </>
            ) : (
              <>
                Search by job number, customer, or site. Jobs already on this day are hidden. If a job has no trackable budget lines yet,
                open <strong className="font-medium text-foreground">Job costing</strong> from that job and add items with quantity tracking.
              </>
            )}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <SearchSelect
              items={adhocJobOptions}
              value={adhocJobId}
              onChange={setAdhocJobId}
              label="Job"
              placeholder="Search job number, customer, or site…"
              openOnFocus
              minCharactersToSearch={0}
              dropdownInPortal
              renderItem={(item, isHighlighted) => (
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{item.label}</span>
                    {isHighlighted ? (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                        ↵ Select
                      </span>
                    ) : null}
                  </div>
                  {item.searchText ? (
                    <div className="truncate text-xs text-muted-foreground">{item.searchText}</div>
                  ) : null}
                </div>
              )}
              disabled={isFinalized}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleAddAdhoc()} disabled={!adhocJobId || isFinalized}>
              {isFinalized ? 'Locked' : 'Add to day'}
            </Button>
          </div>
        </section>
      ) : null}

      {assignments.length > 0 ? (
        <section className="sticky top-0 z-20 rounded-lg border border-border bg-card/95 p-3 shadow-sm backdrop-blur sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="block">
              <span className="sr-only">Search jobs, teams, workers, or items</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search job, customer, site, team, worker, or item..."
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <QueueFilter label="All" count={viewCounts.all} active={viewFilter === 'ALL'} onClick={() => setViewFilter('ALL')} />
              <QueueFilter label="Open" count={viewCounts.open} active={viewFilter === 'OPEN'} onClick={() => setViewFilter('OPEN')} tone="amber" />
              <QueueFilter label="Drafted" count={viewCounts.drafted} active={viewFilter === 'DRAFTED'} onClick={() => setViewFilter('DRAFTED')} tone="emerald" />
              <QueueFilter label="Complete" count={viewCounts.complete} active={viewFilter === 'COMPLETE'} onClick={() => setViewFilter('COMPLETE')} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing <strong className="font-semibold text-foreground">{filteredAssignments.length}</strong> of{' '}
              <strong className="font-semibold text-foreground">{assignments.length}</strong> jobs
            </span>
            {totalChangeCount > 0 || invalidQuantityCount > 0 || blockedQuantityCount > 0 ? (
              <span className="font-medium text-foreground">
                {totalChangeCount} pending change{totalChangeCount === 1 ? '' : 's'}
                {invalidQuantityCount > 0 ? ` · ${invalidQuantityCount} invalid` : ''}
                {blockedQuantityCount > 0 ? ` · ${blockedQuantityCount} over limit` : ''}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Body */}
      {(isLoading || isFetching) && !data ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
          <Spinner size="lg" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <p className="text-base font-semibold text-foreground">
            {isFinalized ? 'This day was finalized with no entries' : 'Nothing to log for this day'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFinalized
              ? 'No progress entries were posted for this date.'
              : 'No published HR assignments and no eligible jobs to add ad-hoc — either no work happened, or the only jobs are already 100% complete.'}
          </p>
          {canEdit && !isFinalized ? (
            <div className="mt-6 flex flex-col items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleFinalizeEmpty()}
                disabled={isFinalizingEmpty}
              >
                {isFinalizingEmpty ? 'Finalizing…' : 'Mark day as finalized with no entries'}
              </Button>
              <p className="max-w-md text-xs text-muted-foreground">
                Closes this date in the production log so it stops appearing as pending. You can still re-open the day later if entries become
                possible (it will move to edit-only mode).
              </p>
            </div>
          ) : null}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">No jobs match this view.</p>
          <p className="mt-1 text-sm text-muted-foreground">Clear the search or switch the filter to All.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchQuery('');
              setViewFilter('ALL');
            }}
          >
            Reset view
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.map(({ assignment, metrics }, idx) => (
            <AssignmentCard
              key={assignment.assignmentId}
              index={idx}
              assignment={assignment}
              metrics={metrics}
              workDateYmd={workDateParam}
              canEditExisting={canEdit && !isSavingAll}
              canAddNew={canEdit && !isSavingAll && !isFinalized}
              drafts={drafts}
              editDrafts={editDrafts}
              onUpdateDraft={(key, v) => setDrafts((c) => ({ ...c, [key]: v }))}
              onUpdateEditDraft={(id, v) => setEditDrafts((c) => ({ ...c, [id]: v }))}
              onRemoveAdhoc={
                assignment.isAdhoc && canEdit && !isFinalized
                  ? async () => {
                      const adhocJobIds = Array.from(
                        new Set(
                          assignment.teams
                            .filter((t) => t.isAdhoc && t.job?.id)
                            .map((t) => t.job!.id)
                        )
                      );
                      if (adhocJobIds.length === 0) return;
                      let removed = 0;
                      let firstErr: string | null = null;
                      for (const jobId of adhocJobIds) {
                        try {
                          await removeAdhocJob({ workDate: workDateParam, jobId }).unwrap();
                          removed += 1;
                        } catch (err) {
                          if (!firstErr && typeof err === 'object' && err !== null && 'data' in err) {
                            const e = (err as { data?: { error?: unknown } }).data?.error;
                            if (typeof e === 'string') firstErr = e;
                          }
                        }
                      }
                      if (removed > 0) {
                        toast.success(removed === 1 ? 'Removed job from this day' : `Removed ${removed} jobs from this day`);
                        void refetch();
                      } else {
                        toast.error(firstErr ?? 'Failed to remove');
                      }
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{new Intl.NumberFormat('en-US').format(value)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function QueueFilter({
  label,
  count,
  active,
  onClick,
  tone = 'slate',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'slate' | 'amber' | 'emerald';
}) {
  const activeClass =
    tone === 'emerald'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100'
      : tone === 'amber'
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
        : 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors',
        active
          ? activeClass
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900',
      ].join(' ')}
    >
      <span>{label}</span>
      <span className="rounded bg-white/70 px-1.5 py-0.5 text-[11px] tabular-nums dark:bg-slate-900/70">{count}</span>
    </button>
  );
}

function AssignmentCard({
  index,
  assignment,
  metrics,
  workDateYmd,
  canEditExisting,
  canAddNew,
  drafts,
  editDrafts,
  onUpdateDraft,
  onUpdateEditDraft,
  onRemoveAdhoc,
}: {
  index: number;
  assignment: DailyQuantityLogAssignment;
  metrics: ReturnType<typeof assignmentMetrics>;
  workDateYmd: string;
  canEditExisting: boolean;
  canAddNew: boolean;
  drafts: Record<string, string>;
  editDrafts: Record<string, string>;
  onUpdateDraft: (key: string, value: string) => void;
  onUpdateEditDraft: (entryId: string, value: string) => void;
  onRemoveAdhoc?: () => void | Promise<void>;
}) {
  const job = assignment.job;
  const teams = assignment.teams ?? [];
  const hasMultipleTeams = teams.length > 1;
  const hasAnyVariationTeam = teams.some((t) => t.job?.isVariation);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white px-5 py-4 dark:border-slate-800 dark:from-slate-900/60 dark:to-slate-950/40 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
            {String(index + 1).padStart(2, '0')}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                {hasMultipleTeams ? `${teams.length} teams` : assignment.label}
              </span>
              {assignment.isAdhoc ? <Badge label="Ad-hoc" variant="orange" /> : null}
              {hasAnyVariationTeam ? <Badge label="Includes variations" variant="blue" /> : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              {job ? (
                <Link
                  href={`/customers/jobs/${job.id}`}
                  className="text-base font-semibold text-slate-900 underline-offset-4 hover:underline dark:text-white"
                >
                  {job.jobNumber}
                </Link>
              ) : (
                <span className="text-base font-semibold text-slate-900 dark:text-white">No job linked</span>
              )}
              {job?.customerName ? (
                <span className="text-sm text-slate-600 dark:text-slate-400">· {job.customerName}</span>
              ) : null}
            </div>
            {job?.site ? (
              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-500">{job.site}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {metrics.percent !== null ? (
            <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {metrics.percent}% done
            </span>
          ) : null}
          {metrics.draftCount > 0 ? (
            <Badge label={`${metrics.draftCount} pending`} variant="yellow" />
          ) : null}
          {metrics.loggedCount > 0 ? (
            <Badge label={`${metrics.loggedCount} logged`} variant="green" />
          ) : null}
          {job ? (
            <Link
              href={`/customers/jobs/${job.id}`}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-emerald-200"
            >
              Open ledger →
            </Link>
          ) : null}
          {onRemoveAdhoc ? (
            <Button type="button" size="sm" variant="ghost" onClick={() => void onRemoveAdhoc()}>
              Remove
            </Button>
          ) : null}
        </div>
      </header>

      {teams.length > 0 ? (
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {teams.map((team) => (
              <TeamSummary key={team.assignmentId} team={team} />
            ))}
          </div>
        </div>
      ) : null}

      {assignment.items.length === 0 ? (
        <div className="space-y-3 px-5 py-8 text-sm text-slate-500 dark:text-slate-500">
          <p>No tracking-enabled budget lines on this job yet. Add budget items with quantity tracking on the job costing screen, then return here.</p>
          {job ? (
            <Link
              href={`/jobs/${job.id}/cost-engine`}
              className="inline-flex text-sm font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
            >
              Open job costing →
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {assignment.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              assignmentId={assignment.assignmentId}
              workDateYmd={workDateYmd}
              canEditExisting={canEditExisting}
              canAddNew={canAddNew}
              drafts={drafts}
              editDrafts={editDrafts}
              onUpdateDraft={onUpdateDraft}
              onUpdateEditDraft={onUpdateEditDraft}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ItemRow({
  item,
  assignmentId,
  workDateYmd,
  canEditExisting,
  canAddNew,
  drafts,
  editDrafts,
  onUpdateDraft,
  onUpdateEditDraft,
}: {
  item: DailyQuantityLogItem;
  assignmentId: string;
  workDateYmd: string;
  canEditExisting: boolean;
  canAddNew: boolean;
  drafts: Record<string, string>;
  editDrafts: Record<string, string>;
  onUpdateDraft: (key: string, value: string) => void;
  onUpdateEditDraft: (entryId: string, value: string) => void;
}) {
  const { itemTarget, itemCumulative, itemPct, openTrackers } = useMemo(() => {
    const open: typeof item.trackingItems = [];
    for (const t of item.trackingItems) {
      const target = Number(t.targetValue || 0);
      const c = Number(item.cumulativeByTracker?.[t.id] ?? 0);
      if (target <= 0 || c < target) open.push(t);
    }
    const progress = itemProgress(item);
    return {
      itemTarget: progress.target,
      itemCumulative: progress.cumulative,
      itemPct: progress.percent,
      openTrackers: open,
    };
  }, [item]);

  const hasExistingToday = item.existingEntries.length > 0;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</h3>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
            {hasExistingToday ? (
              <>
                {item.existingEntries.length} logged{' '}
                {item.existingEntries.length === 1 ? 'row' : 'rows'}
                {openTrackers.length > 0 ? <> · {openTrackers.length} open</> : null}
              </>
            ) : (
              <>{openTrackers.length} of {item.trackingItems.length} trackable{item.trackingItems.length === 1 ? '' : 's'} open</>
            )}
          </p>
        </div>
        {itemPct !== null ? (
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/60">
              <div
                className={`h-full rounded-full transition-all ${itemPct >= 100 ? 'bg-emerald-600' : 'bg-emerald-500 dark:bg-emerald-400'}`}
                style={{ width: `${itemPct}%` }}
              />
            </div>
            <p className="text-[11px] tabular-nums text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white">{itemPct}%</span>
              <span className="mx-1.5 text-slate-300">·</span>
              {formatQty(itemCumulative)} / {formatQty(itemTarget)}
              {itemTarget > itemCumulative ? (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="text-amber-700 dark:text-amber-400">{formatQty(itemTarget - itemCumulative)} left</span>
                </>
              ) : (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">Complete</span>
                </>
              )}
            </p>
          </div>
        ) : null}
      </div>
      {item.description ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">{item.description}</p>
      ) : null}

      {/* Existing entries on this date — always editable so the user can
       *  correct values even after the item reaches 100%. */}
      {hasExistingToday ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
            Already logged on {workDateYmd}
          </p>
          {item.existingEntries.map((entry: DailyQuantityLogExistingEntry) => {
            const entryTracker = item.trackingItems.find((tracker) => tracker.id === entry.trackerId);
            const draftValue = editDrafts[entry.id] ?? '';
            const draftQty = Number(draftValue);
            const hasValue = draftValue.trim() !== '';
            const invalid = hasValue && (!Number.isFinite(draftQty) || draftQty <= 0);
            const max = editRemainingCapacity(item, entry);
            const overshoot = !invalid && max !== null && draftQty > max;
            const dirty = hasValue && !invalid && !overshoot && draftQty !== entry.quantity;
            return (
              <div
                key={entry.id}
                className={`grid grid-cols-1 gap-3 rounded-xl border px-3 py-3 dark:bg-slate-900/40 sm:grid-cols-[minmax(0,1.6fr)_180px] ${
                  invalid || overshoot
                    ? 'border-red-300 bg-red-50/60 dark:border-red-700/60 dark:bg-red-950/20'
                    : dirty
                    ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700/60 dark:bg-amber-950/20'
                    : 'border-slate-200 bg-slate-50/60 dark:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{trackerLabel(item, entry.trackerId)}</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    Logged · {entry.entryDate}
                    {dirty ? (
                      <span className="ml-1 font-semibold text-amber-700 dark:text-amber-300">· edited</span>
                    ) : null}
                    {invalid ? (
                      <span className="ml-1 font-semibold text-red-700 dark:text-red-300"> invalid</span>
                    ) : overshoot ? (
                      <span className="ml-1 font-semibold text-red-700 dark:text-red-300"> over limit</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    {trackerStockTargetLabel(entryTracker)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <NumberInput
                    value={draftValue}
                    onChange={(v) => onUpdateEditDraft(entry.id, v)}
                    disabled={!canEditExisting}
                    max={max ?? undefined}
                    invalid={invalid || overshoot}
                  />
                  {max !== null ? (
                    <p className="text-right text-[10px] text-slate-500 dark:text-slate-500">
                      Max <span className="tabular-nums">{formatQty(max)}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* New-entry inputs for trackers that still have remaining target.
       *  Hidden once every tracker is at 100% (and not already logged today). */}
      {openTrackers.length === 0 ? (
        !hasExistingToday ? (
          <p className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            All trackers on this item are at 100%. Nothing left to log.
          </p>
        ) : null
      ) : (
        <div className="mt-3 space-y-2">
          {hasExistingToday ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">
              Add a new entry
            </p>
          ) : null}
          {openTrackers.map((tracker: DailyQuantityLogTracker) => {
            const key = trackerKey(assignmentId, item.id, tracker.id);
            const draftValue = drafts[key] ?? '';
            const draftQty = Number(draftValue);
            const draftValid = draftValue.trim() === '' || (Number.isFinite(draftQty) && draftQty > 0);
            const target = Number(tracker.targetValue || 0);
            const cumulative = Number(item.cumulativeByTracker?.[tracker.id] ?? 0);
            const today = item.existingEntries
              .filter((e) => e.trackerId === tracker.id)
              .reduce((s, e) => s + Number(e.quantity || 0), 0);
            const remaining = target > 0 ? Math.max(0, target - cumulative) : null;
            const progressPct = target > 0 ? Math.min(100, Math.round((cumulative / target) * 100)) : null;
            const invalid = draftValue.trim() !== '' && !draftValid;
            const overshoot = remaining !== null && draftValid && draftQty > remaining;
            return (
              <div
                key={tracker.id}
                className={`grid grid-cols-1 gap-3 rounded-xl border px-3 py-3 dark:bg-slate-900/40 sm:grid-cols-[minmax(0,1.6fr)_180px] ${
                  invalid || overshoot
                    ? 'border-red-300 bg-red-50/60 dark:border-red-700/60 dark:bg-red-950/20'
                    : 'border-slate-200 bg-slate-50/60 dark:border-slate-700'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{tracker.label}</p>
                    {tracker.unit ? (
                      <span className="rounded-full bg-slate-200/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600 dark:bg-slate-700/60 dark:text-slate-200">
                        {tracker.unit}
                      </span>
                    ) : null}
                    {progressPct !== null ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                          progressPct >= 75
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                            : progressPct >= 25
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200'
                        }`}
                      >
                        {progressPct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    <span className="tabular-nums">{formatQty(cumulative)}</span> /{' '}
                    <span className="tabular-nums">{formatQty(target)}</span>
                    {today > 0 ? (
                      <>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-emerald-700 dark:text-emerald-300">
                          Today <span className="tabular-nums">{formatQty(today)}</span>
                        </span>
                      </>
                    ) : null}
                    {remaining !== null && remaining > 0 ? (
                      <>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-medium tabular-nums text-amber-700 dark:text-amber-400">
                          {formatQty(remaining)} left
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                    {trackerStockTargetLabel(tracker)}
                  </p>
                  {progressPct !== null ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/60">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all dark:bg-emerald-400"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  ) : null}
                  {invalid ? (
                    <p className="mt-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                      Use a number greater than zero.
                    </p>
                  ) : overshoot ? (
                    <p className="mt-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                      Exceeds remaining by {formatQty(draftQty - (remaining ?? 0))}.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1">
                  <NumberInput
                    value={draftValue}
                    onChange={(v) => onUpdateDraft(key, v)}
                    disabled={!canAddNew}
                    placeholder="0"
                    max={remaining ?? undefined}
                    invalid={invalid || overshoot}
                  />
                  {remaining !== null ? (
                    <p className="text-right text-[10px] text-slate-500 dark:text-slate-500">
                      Max <span className="tabular-nums">{formatQty(remaining)}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamSummary({ team }: { team: DailyQuantityLogTeam }) {
  const tl = team.teamLeader?.fullName;
  const shift = [team.shiftStart, team.shiftEnd].filter(Boolean).join(' – ');
  const memberNames = team.members.map((m) => m.fullName).join(', ');
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-900 dark:text-white">{team.label}</span>
        {team.isAdhoc ? <Badge label="Ad-hoc" variant="orange" /> : null}
        {team.job?.isVariation ? <Badge label="Variation" variant="blue" /> : null}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        {tl ? <span>TL · {tl}</span> : null}
        {shift ? <span>Shift · {shift}</span> : null}
        {team.job ? (
          <span>
            Job ·{' '}
            <Link
              href={`/customers/jobs/${team.job.id}`}
              className="font-medium text-slate-700 underline-offset-4 hover:underline dark:text-slate-200"
            >
              {team.job.jobNumber}
            </Link>
          </span>
        ) : null}
      </div>
      {memberNames ? (
        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-500">Crew · {memberNames}</p>
      ) : null}
      {team.remarks ? (
        <p className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-500">{team.remarks}</p>
      ) : null}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  disabled,
  placeholder,
  max,
  invalid,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  max?: number;
  invalid?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={max}
      step="0.001"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onWheel={(e) => e.currentTarget.blur()}
      disabled={disabled}
      placeholder={placeholder}
      className={`w-full rounded-xl border bg-white px-3 py-2 text-right text-sm font-medium tabular-nums text-slate-900 outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-900 ${
        invalid
          ? 'border-red-400 focus:border-red-400 focus:ring-2 focus:ring-red-400/20 dark:border-red-700/60'
          : 'border-slate-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700'
      }`}
    />
  );
}
