'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import DataTable from '@/components/ui/DataTable';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import { Badge } from '@/components/ui/Badge';
import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination/serverList';
import { cn } from '@/lib/utils';
import { formatDateTime, formatDate, formatCurrency } from '@/lib/utils/formatters';
import {
  useGetDispatchEntriesPageQuery,
  DISPATCH_ENTRY_PAGE_SIZE_OPTIONS,
  useDeleteTransactionMutation,
  useDeleteDeliveryNoteMutation,
  type DispatchEntry as DispatchEntryRecord,
} from '@/store/hooks';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { DocumentTemplate } from '@/lib/types/documentTemplate';
import { openDeliveryNotePrint } from '@/lib/print/openDeliveryNotePrint';
import {
  customItemsFromJson,
  parseDeliveryNoteCustomItemsFromNotes,
  type DeliveryNoteCustomItemPrint,
} from '@/lib/utils/deliveryNoteCustomItems';

interface Material {
  materialId: string;
  materialName: string;
  materialUnit: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  quantity: number;
  unitCost: number;
  transactionIds: string[];
}

type Entry = Omit<DispatchEntryRecord, 'materials'> & { materials: Material[] };
type NoteTypeFilter = 'all' | 'dispatch' | 'delivery' | 'transit';

const NOTE_TYPE_TABS: Array<{ value: NoteTypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'dispatch', label: 'Dispatches' },
  { value: 'delivery', label: 'Delivery notes' },
  { value: 'transit', label: 'In transit' },
];

function parseJobContacts(value: unknown): Array<{ name: string; number?: string; email?: string; designation?: string; label?: string }> {
  if (!Array.isArray(value)) return [];
  const contacts: Array<{ name: string; number?: string; email?: string; designation?: string; label?: string }> = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name) continue;
    contacts.push({
      name,
      number: typeof r.number === 'string' ? r.number.trim() : undefined,
      email: typeof r.email === 'string' ? r.email.trim() : undefined,
      designation: typeof r.designation === 'string' ? r.designation.trim() : undefined,
      label: typeof r.label === 'string' ? r.label.trim() : undefined,
    });
  }
  return contacts;
}

export default function DispatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { openMenu: openContextMenu } = useGlobalContextMenu();
  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('transaction.stock_out');
  const canEdit = isSA || perms.includes('transaction.stock_out');
  const canDelete = isSA || perms.includes('transaction.stock_out');

  const [filterType, setFilterType] = useState<'day' | 'month' | 'all'>('all');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const deferredSearch = useDeferredValue(searchQuery);

  // Load filter state from URL on mount
  useEffect(() => {
    const urlFilterType = searchParams.get('filterType') as 'day' | 'month' | 'all' | null;
    const urlDate = searchParams.get('date');
    const urlNoteType = searchParams.get('noteType') as NoteTypeFilter | null;
    const urlSearch = searchParams.get('search');

    if (urlFilterType && ['day', 'month', 'all'].includes(urlFilterType)) {
      setFilterType(urlFilterType);
    }
    if (urlDate) {
      if (urlDate.length === 7 && /^\d{4}-\d{2}$/.test(urlDate)) {
        setSelectedDate(`${urlDate}-01`);
      } else {
        setSelectedDate(urlDate.slice(0, 10));
      }
    }
    if (urlNoteType && ['all', 'dispatch', 'delivery', 'transit'].includes(urlNoteType)) {
      setNoteTypeFilter(urlNoteType);
    }
    if (urlSearch) setSearchQuery(urlSearch);
  }, [searchParams]);

  const [viewModal, setViewModal] = useState<{ open: boolean; entry: Entry | null }>({
    open: false,
    entry: null,
  });
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    entry: Entry | null;
    loading: boolean;
    step: 1 | 2;
    confirmText: string;
  }>({
    open: false,
    entry: null,
    loading: false,
    step: 1,
    confirmText: '',
  });

  const [printModalEntry, setPrintModalEntry] = useState<Entry | null>(null);
  const [printTemplates, setPrintTemplates] = useState<DocumentTemplate[]>([]);
  const [printTplLoading, setPrintTplLoading] = useState(false);
  const [selectedPrintTplId, setSelectedPrintTplId] = useState('');

  const [deleteTransaction] = useDeleteTransactionMutation();
  const [deleteDeliveryNote] = useDeleteDeliveryNoteMutation();
  const listQueryArgs = useMemo(
    () => ({
      filterType,
      date: filterType === 'all' ? undefined : selectedDate,
      noteType: noteTypeFilter,
      search: deferredSearch.trim() || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    [filterType, selectedDate, noteTypeFilter, deferredSearch, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [filterType, selectedDate, noteTypeFilter, deferredSearch, pageSize]);

  const { data: dispatchPage, isLoading, isFetching } = useGetDispatchEntriesPageQuery(listQueryArgs, {
    skip: !canView,
    refetchOnMountOrArgChange: 300,
  });

  const entries = (dispatchPage?.entries ?? []) as Entry[];
  const totalEntries = dispatchPage?.total ?? 0;
  const loading = isLoading;
  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (!printModalEntry || !session?.user?.activeCompanyId) return;
    let cancelled = false;
    (async () => {
      setPrintTplLoading(true);
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`);
        if (!res.ok) return;
        const json = await res.json();
        const company = json.data as { printTemplates?: DocumentTemplate[] | null };
        const raw = Array.isArray(company.printTemplates) ? company.printTemplates : [];
        const preferredType =
          printModalEntry.deliveryType === 'SUBCONTRACT'
            ? 'subcontract-delivery-note'
            : 'delivery-note';
        let dn = raw.filter((t) => String(t.itemType) === preferredType);
        if (dn.length === 0 && preferredType === 'subcontract-delivery-note') {
          dn = raw.filter((t) => String(t.itemType) === 'delivery-note');
        }
        if (cancelled) return;
        setPrintTemplates(dn);
        const def = dn.find((t) => t.isDefault);
        setSelectedPrintTplId(def?.id ?? dn[0]?.id ?? '');
      } finally {
        if (!cancelled) setPrintTplLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [printModalEntry, session?.user?.activeCompanyId]);

  // Helper function to parse delivery note number from notes
  const getDeliveryNoteNumber = (notes?: string, deliveryNoteNumber?: number | null) => {
    if (deliveryNoteNumber != null && Number.isFinite(deliveryNoteNumber)) {
      return deliveryNoteNumber;
    }
    if (!notes) return null;
    const match = notes.match(/--- DELIVERY NOTE #(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };


  // Extract base notes (without delivery note headers and custom items)
  const getBaseNotes = (notes?: string): string => {
    if (!notes) return '';
    return notes
      .replace(/--- DELIVERY NOTE #\d+\n?/g, '')
      .replace(/--- DELIVERY CONTACT PERSON:[^\n\r]*\r?\n?/g, '')
      .replace(/--- DELIVERY NOTE ITEMS \(For Printing\) ---[\s\S]*?(?=\n--- |$)/g, '')
      .trim();
  };

  function parseCustomItemsFromEntry(entry: Entry): DeliveryNoteCustomItemPrint[] {
    const fromJson = customItemsFromJson(entry.customItemsJson);
    if (fromJson.length > 0) return fromJson;
    return parseDeliveryNoteCustomItemsFromNotes(entry.notes);
  }

  function getBaseNotesForEntry(entry: Entry): string {
    const fromDoc = entry.documentNotes?.trim();
    if (fromDoc) return fromDoc;
    return getBaseNotes(entry.notes);
  }

  function deliveryNoteEditHref(entry: Entry): string {
    if (entry.transactionIds[0]) {
      return `/stock/dispatch/delivery-note?transactionId=${entry.transactionIds[0]}`;
    }
    if (entry.deliveryNoteId) {
      return `/stock/dispatch/delivery-note?deliveryNoteId=${entry.deliveryNoteId}`;
    }
    return '/stock/dispatch/delivery-note';
  }

  function deliveryNoteDuplicateHref(entry: Entry): string {
    if (entry.transactionIds[0]) {
      return `/stock/dispatch/delivery-note?duplicateFrom=${entry.transactionIds[0]}`;
    }
    if (entry.deliveryNoteId) {
      return `/stock/dispatch/delivery-note?duplicateDeliveryNoteId=${entry.deliveryNoteId}`;
    }
    return '/stock/dispatch/delivery-note';
  }

  const syncUrl = useCallback(
    (next: {
      filterType?: 'day' | 'month' | 'all';
      date?: string;
      noteType?: NoteTypeFilter;
      search?: string;
    }) => {
      const params = new URLSearchParams();
      const ft = next.filterType ?? filterType;
      const dt = next.date ?? selectedDate;
      const nt = next.noteType ?? noteTypeFilter;
      const sq = next.search ?? searchQuery;

      params.set('filterType', ft);
      if (ft !== 'all') params.set('date', dt);
      if (nt !== 'all') params.set('noteType', nt);
      if (sq.trim()) params.set('search', sq.trim());
      router.push(`?${params.toString()}`);
    },
    [filterType, selectedDate, noteTypeFilter, searchQuery, router],
  );

  const handleFilterTypeChange = useCallback(
    (newFilterType: 'day' | 'month' | 'all') => {
      if (newFilterType === 'all') {
        setFilterType('all');
        syncUrl({ filterType: 'all' });
        return;
      }

      let nextDate = selectedDate;
      if (newFilterType === 'month') {
        const base =
          selectedDate.length >= 10 ? selectedDate.slice(0, 10) : new Date().toISOString().split('T')[0];
        nextDate = `${base.slice(0, 7)}-01`;
      } else {
        nextDate =
          selectedDate.length >= 10 ? selectedDate.slice(0, 10) : new Date().toISOString().split('T')[0];
      }

      setFilterType(newFilterType);
      setSelectedDate(nextDate);
      syncUrl({ filterType: newFilterType, date: nextDate });
    },
    [selectedDate, syncUrl],
  );

  const handleDateChange = useCallback(
    (value: string) => {
      const normalized =
        filterType === 'month'
          ? value.length === 7
            ? `${value}-01`
            : value.slice(0, 10)
          : value.slice(0, 10);
      setSelectedDate(normalized);
      syncUrl({ date: normalized });
    },
    [filterType, syncUrl],
  );

  const handleNoteTypeChange = useCallback(
    (value: NoteTypeFilter) => {
      setNoteTypeFilter(value);
      syncUrl({ noteType: value });
    },
    [syncUrl],
  );

  const clearFilters = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    setFilterType('all');
    setSelectedDate(today);
    setNoteTypeFilter('all');
    setSearchQuery('');
    setPage(1);
    router.push('?filterType=all');
  }, [router]);

  const hasActiveFilters =
    noteTypeFilter !== 'all' || filterType !== 'all' || searchQuery.trim().length > 0;

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, entry: null, loading: false, step: 1, confirmText: '' });
  };

  const handleDelete = (entry: Entry) => {
    setDeleteModal({ open: true, entry, loading: false, step: 1, confirmText: '' });
  };

  const confirmDelete = async () => {
    if (!deleteModal.entry) return;
    if (deleteModal.step === 1) {
      setDeleteModal((prev) => ({ ...prev, step: 2 }));
      return;
    }
    if (deleteModal.confirmText.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }

    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      const entry = deleteModal.entry;
      if (entry.isDeliveryNote && entry.deliveryNoteId) {
        await deleteDeliveryNote(entry.deliveryNoteId).unwrap();
      } else {
        for (const txnId of entry.transactionIds) {
          await deleteTransaction(txnId).unwrap();
        }
      }
      toast.success('Entry deleted successfully');
      closeDeleteModal();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data?: { error?: string } }).data?.error ?? 'Failed to delete entry')
          : 'Failed to delete entry';
      toast.error(message);
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleRowClick = useCallback((entry: Entry) => {
    setSelectedRowId(entry.id);
  }, []);

  const handleRowDoubleClick = useCallback((entry: Entry) => {
    setSelectedRowId(entry.id);
    setViewModal({ open: true, entry });
  }, []);

  const isSubcontractEntry = (entry: Entry) => entry.deliveryType === 'SUBCONTRACT';

  const transitStatusLabel = (status?: string | null) => {
    if (!status) return null;
    return status.replace(/_/g, ' ');
  };

  const buildRowContextMenu = useCallback(
    (entry: Entry): ContextMenuOption[] => {
      const dateStr =
        typeof entry.dispatchDate === 'string'
          ? entry.dispatchDate.split('T')[0]
          : new Date(entry.dispatchDate).toISOString().split('T')[0];
      const editPath = entry.isDeliveryNote
        ? deliveryNoteEditHref(entry)
        : `/stock/dispatch/entry?jobId=${entry.jobId}&date=${dateStr}`;
      const options: ContextMenuOption[] = [
        { label: 'View details', action: () => setViewModal({ open: true, entry }) },
      ];
      if (canEdit) {
        options.push({ label: 'Edit', action: () => router.push(editPath) });
      }
      if (canEdit && entry.isDeliveryNote && isSubcontractEntry(entry) && entry.deliveryNoteId) {
        options.push({
          label: 'Receive material',
          action: () => router.push(`/stock/dispatch/delivery-note?deliveryNoteId=${entry.deliveryNoteId}`),
        });
      }
      if (canEdit && entry.isDeliveryNote) {
        options.push({
          label: 'Duplicate',
          action: () => router.push(deliveryNoteDuplicateHref(entry)),
        });
      }
      if (entry.isDeliveryNote && (entry.transactionIds[0] || entry.deliveryNoteId)) {
        options.push({
          label: 'Print',
          action: () => setPrintModalEntry(entry),
        });
      }
      if (canDelete) {
        options.push({ divider: true });
        options.push({ label: 'Delete', action: () => handleDelete(entry), danger: true });
      }
      return options;
    },
    [canEdit, canDelete, router],
  );

  const columns = useMemo<Column<Entry>[]>(
    () => [
      {
        key: 'job',
        header: 'Job / project',
        sortable: false,
        render: (entry) => (
          <div className="min-w-40">
            <p className="font-medium text-primary">{entry.jobNumber}</p>
            {entry.jobDescription ? (
              <p className="max-w-56 truncate text-xs text-muted-foreground">{entry.jobDescription}</p>
            ) : null}
            {isSubcontractEntry(entry) && entry.supplierName ? (
              <p className="mt-0.5 truncate text-xs text-amber-700 dark:text-amber-300">{entry.supplierName}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'date',
        header: 'Date',
        render: (entry) => (
          <span className="whitespace-nowrap text-sm text-foreground">{formatDateTime(entry.dispatchDate)}</span>
        ),
      },
      {
        key: 'type',
        header: 'Document',
        render: (entry) => {
          if (!entry.isDeliveryNote) {
            return <Badge label="Dispatch" variant="gray" />;
          }
          const dnNumber = getDeliveryNoteNumber(entry.notes, entry.deliveryNoteNumber);
          return (
            <div className="flex flex-col items-start gap-1">
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                DN #{dnNumber ?? '—'}
              </span>
              {isSubcontractEntry(entry) && entry.transitStatus ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {transitStatusLabel(entry.transitStatus)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: 'signed',
        header: 'Signed copy',
        className: 'hidden lg:table-cell',
        render: (entry) => {
          if (!entry.isDeliveryNote) return <span className="text-xs text-muted-foreground">—</span>;
          return entry.signedCopyUrl ? (
            <Badge label="Uploaded" variant="green" />
          ) : (
            <Badge label="Pending" variant="gray" />
          );
        },
      },
      {
        key: 'materials',
        header: 'Lines',
        className: 'text-right',
        render: (entry) =>
          entry.isDeliveryNote && entry.materialsCount === 0 ? (
            <span className="text-xs font-medium text-muted-foreground">Print only</span>
          ) : (
            <Badge label={String(entry.materialsCount)} variant="blue" />
          ),
      },
      {
        key: 'value',
        header: 'Value',
        className: 'text-right',
        render: (entry) => (
          <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(entry.totalValuation)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        className: 'w-[1%] whitespace-nowrap text-right',
        render: (entry) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setViewModal({ open: true, entry });
              }}
            >
              View
            </Button>
            {entry.isDeliveryNote && (entry.transactionIds[0] || entry.deliveryNoteId) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-emerald-700 dark:text-emerald-300"
                onClick={(e) => {
                  e.stopPropagation();
                  setPrintModalEntry(entry);
                }}
              >
                Print
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to view dispatch history.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Dispatch</h1>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/stock/dispatch/entry" className={cn(buttonVariants({ size: 'sm' }))}>
            New dispatch
          </Link>
          <Link
            href="/stock/dispatch/delivery-note"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            New delivery note
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex border-b border-border px-2 pt-2 sm:px-3">
          <div className="flex gap-0.5 overflow-x-auto" role="tablist" aria-label="Entry type">
            {NOTE_TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={noteTypeFilter === tab.value}
                onClick={() => handleNoteTypeChange(tab.value)}
                className={cn(
                  'shrink-0 rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition-colors',
                  noteTypeFilter === tab.value
                    ? 'border-border bg-card text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <Input
              id="dispatch-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search job, supplier, or note #…"
              className="h-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Time range"
              value={filterType}
              onChange={(e) => handleFilterTypeChange(e.target.value as 'day' | 'month' | 'all')}
              className="h-9 w-32 shrink-0"
            >
              <option value="all">All time</option>
              <option value="month">By month</option>
              <option value="day">By day</option>
            </Select>
            {filterType !== 'all' ? (
              <input
                aria-label={filterType === 'day' ? 'Day' : 'Month'}
                type={filterType === 'day' ? 'date' : 'month'}
                value={filterType === 'day' ? selectedDate.slice(0, 10) : selectedDate.slice(0, 7)}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-9 shrink-0 rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : null}
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-xs">
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground sm:px-5">
          <span>
            {totalEntries} entr{totalEntries === 1 ? 'y' : 'ies'}
            {noteTypeFilter === 'transit' ? ' awaiting receive' : ''}
            {isRefreshing ? ' · updating…' : ''}
          </span>
          <span className="hidden sm:inline">Double-click a row for details · right-click for actions</span>
        </div>

        <div className="px-2 pb-2 pt-1 sm:px-3">
        <DataTable
          columns={columns}
          data={entries}
          loading={loading && entries.length === 0}
          emptyText={
            noteTypeFilter === 'transit'
              ? 'No delivery notes with material still in transit.'
              : 'No dispatch or delivery note entries match these filters.'
          }
          enableColumnDisplayOptions
          preferenceKey="stock-dispatch-table"
          selectedRowId={selectedRowId}
          onRowClick={(entry) => handleRowClick(entry)}
          onRowDoubleClick={(entry) => handleRowDoubleClick(entry)}
          onRowContextMenu={(entry, e) => {
            setSelectedRowId(entry.id);
            openContextMenu(e.clientX, e.clientY, buildRowContextMenu(entry));
          }}
          serverPagination={{
            page,
            pageSize,
            total: totalEntries,
            pageSizeOptions: DISPATCH_ENTRY_PAGE_SIZE_OPTIONS,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(1);
            },
          }}
        />
        </div>
      </section>

      {/* View Modal */}
      {viewModal.open && viewModal.entry && (() => {
        const entry = viewModal.entry;
        const isDeliveryNote = entry.isDeliveryNote === true;
        const dnNumber = isDeliveryNote ? getDeliveryNoteNumber(entry.notes, entry.deliveryNoteNumber) : null;
        const customItems = isDeliveryNote ? parseCustomItemsFromEntry(entry) : [];
        const parsedContacts = parseJobContacts(entry.jobContactsJson);
        const deliveryContactFromNotes = (() => {
          if (!entry.notes) return '';
          const match = entry.notes.match(/--- DELIVERY CONTACT PERSON:([^\n\r]+)/);
          return match?.[1]?.trim() ?? '';
        })();
        const primaryContact = isDeliveryNote
          ? entry.deliveryNoteContactPerson?.trim() ||
            deliveryContactFromNotes ||
            entry.jobContactPerson?.trim() ||
            parsedContacts[0]?.name ||
            ''
          : entry.jobContactPerson?.trim() || parsedContacts[0]?.name || '';
        const primaryContactRow =
          parsedContacts.find((c) => c.name.toLowerCase() === primaryContact.toLowerCase()) ??
          parsedContacts[0];
        const baseNotes = getBaseNotesForEntry(entry);
        const customerName = entry.jobDescription || '';
        const dateStr = typeof entry.dispatchDate === 'string'
          ? entry.dispatchDate.split('T')[0]
          : new Date(entry.dispatchDate).toISOString().split('T')[0];
        const editPath = isDeliveryNote
          ? deliveryNoteEditHref(entry)
          : `/stock/dispatch/entry?jobId=${entry.jobId}&date=${dateStr}`;

        return (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={() => setViewModal({ open: false, entry: null })}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-xl max-w-3xl w-[90vw] max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              {/* Header */}
              <div className={`px-6 py-4 border-b border-border ${isDeliveryNote ? 'bg-blue-500/10' : 'bg-muted/40'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {isDeliveryNote ? (
                      <div className="w-10 h-10 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-700 dark:text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted/40 border border-border flex items-center justify-center">
                        <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold text-foreground">
                        {isDeliveryNote ? `Delivery Note #${dnNumber || 'N/A'}` : 'Dispatch Entry'}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isDeliveryNote ? 'Delivery for printing & dispatch' : 'Material dispatch entry'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewModal({ open: false, entry: null })}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Meta info grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-muted/30 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Job Number</p>
                    <p className="text-sm font-semibold text-primary">{entry.jobNumber}</p>
                    {customerName && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{customerName}</p>
                    )}
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Date & Time</p>
                    <p className="text-sm font-semibold text-foreground">{formatDateTime(entry.dispatchDate)}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Type</p>
                    {isDeliveryNote ? (
                      <div className="space-y-1">
                        <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                          DN #{dnNumber || 'N/A'}
                        </span>
                        {isSubcontractEntry(entry) && entry.transitStatus ? (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            {transitStatusLabel(entry.transitStatus)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <Badge label="Dispatch" variant="gray" />
                    )}
                  </div>
                  {isDeliveryNote && isSubcontractEntry(entry) ? (
                    <div className="bg-muted/30 rounded-lg p-3 border border-border sm:col-span-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Subcontractor</p>
                      <p className="text-sm font-semibold text-foreground">{entry.supplierName || '—'}</p>
                    </div>
                  ) : null}
                  <div className="bg-muted/30 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Contact Person</p>
                    <p className="text-sm font-semibold text-foreground">{primaryContact || '—'}</p>
                    {(primaryContactRow?.designation || primaryContactRow?.label) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {primaryContactRow?.designation || primaryContactRow?.label}
                      </p>
                    )}
                    {primaryContactRow?.number && (
                      <p className="text-xs text-muted-foreground mt-0.5">{primaryContactRow.number}</p>
                    )}
                    {primaryContactRow?.email && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">{primaryContactRow.email}</p>
                    )}
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 border border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created By</p>
                    <p className="text-sm font-semibold text-foreground">{entry.createdByName || '—'}</p>
                    {entry.createdByEmail && (
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">{entry.createdByEmail}</p>
                    )}
                  </div>
                </div>

                {/* Materials Section */}
                {entry.materials.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        Materials Dispatched
                      </h3>
                      <span className="text-xs text-muted-foreground">{entry.materials.length} item{entry.materials.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-card/80 border-b border-border">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase w-8">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Material</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Warehouse</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase w-24">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase w-24">Unit Cost</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase w-28">Valuation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.materials.map((material, idx) => {
                            const valuation = material.quantity * material.unitCost;
                            return (
                              <tr key={idx} className="border-b border-border/50 last:border-b-0">
                                <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{idx + 1}</td>
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-foreground">{material.materialName}</p>
                                </td>
                                <td className="px-3 py-2.5 text-muted-foreground">
                                  {material.warehouseName || 'Fallback'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-foreground">
                                  {material.quantity.toFixed(3)} <span className="text-muted-foreground text-xs">{material.materialUnit}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                                  {formatCurrency(material.unitCost)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(valuation)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Custom Items Section — delivery notes only */}
                {isDeliveryNote && customItems.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                        </svg>
                        Custom Items (For Printing)
                      </h3>
                      <span className="text-xs text-muted-foreground">{customItems.length} item{customItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-card/80 border-b border-border">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase w-12">No.</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Item Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase w-24">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customItems.map((item, idx) => (
                            <tr key={idx} className="border-b border-border/50 last:border-b-0">
                              <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">
                                {item.lineNo?.trim() || '—'}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-foreground">{item.name || '—'}</td>
                              <td className="px-3 py-2.5 text-muted-foreground text-xs">{item.description || '—'}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-foreground">
                                {item.qty || '—'} {item.unit && <span className="text-muted-foreground text-xs">{item.unit}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Empty state — delivery note with no materials and no custom items */}
                {isDeliveryNote && entry.materials.length === 0 && customItems.length === 0 && (
                  <div className="bg-muted/30 rounded-lg border border-border p-6 text-center">
                    <p className="text-muted-foreground text-sm">No materials or custom items in this delivery note.</p>
                  </div>
                )}

                {/* Notes */}
                {baseNotes && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>
                    <div className="bg-muted/30 rounded-lg p-3 border border-border">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{baseNotes}</p>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="bg-muted/50 border border-border rounded-lg p-4">
                  <div className={`grid ${isDeliveryNote ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Materials</p>
                      <p className="text-xl font-bold text-foreground mt-1">{entry.materialsCount}</p>
                    </div>
                    {isDeliveryNote && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Custom Items</p>
                        <p className="text-xl font-bold text-blue-400 mt-1">{customItems.length}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Valuation</p>
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-300 mt-1 tabular-nums">
                        {formatCurrency(entry.totalValuation)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border bg-card/80 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Double-click any row to view details</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewModal({ open: false, entry: null })}
                    className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                  {isDeliveryNote && (entry.transactionIds[0] || entry.deliveryNoteId) ? (
                    <button
                      onClick={() => setPrintModalEntry(entry)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4H9a2 2 0 00-2 2v2a2 2 0 002 2h10a2 2 0 002-2v-2a2 2 0 00-2-2h-2m-4-4V9m0 4v6m0-6a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                      Print
                    </button>
                  ) : null}
                  {canEdit && isDeliveryNote && isSubcontractEntry(entry) && entry.deliveryNoteId ? (
                    <button
                      onClick={() => {
                        setViewModal({ open: false, entry: null });
                        router.push(`/stock/dispatch/delivery-note?deliveryNoteId=${entry.deliveryNoteId}`);
                      }}
                      className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                    >
                      Receive
                    </button>
                  ) : null}
                  {canEdit && isDeliveryNote && (
                    <button
                      onClick={() => {
                        setViewModal({ open: false, entry: null });
                        router.push(deliveryNoteDuplicateHref(entry));
                      }}
                      className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-500 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Duplicate
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => {
                        setViewModal({ open: false, entry: null });
                        router.push(editPath);
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Print format picker (delivery notes) */}
      {printModalEntry && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setPrintModalEntry(null)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-1">Print delivery note</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Job {printModalEntry.jobNumber} · choose a layout (from Settings → Print templates).
            </p>
            {printTplLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading formats…</p>
            ) : printTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-4">
                No delivery-note templates saved. Print will use the built-in default layout.
              </p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto mb-4">
                {printTemplates.map((tpl) => (
                  <li key={tpl.id}>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/10">
                      <input
                        type="radio"
                        name="print-tpl"
                        checked={selectedPrintTplId === tpl.id}
                        onChange={() => setSelectedPrintTplId(tpl.id)}
                        className="accent-primary"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                        {tpl.isDefault && (
                          <span className="text-xs text-emerald-400">Default</span>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setPrintModalEntry(null)}
                className="px-4 py-2 rounded-lg bg-muted text-foreground text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const tid = printModalEntry.transactionIds[0];
                  const dnid = printModalEntry.deliveryNoteId;
                  const templateId = selectedPrintTplId || undefined;
                  if (tid) {
                    openDeliveryNotePrint(
                      { transactionId: tid, templateId },
                      { onError: (msg) => toast.error(msg) }
                    );
                  } else if (dnid) {
                    openDeliveryNotePrint(
                      { deliveryNoteId: dnid, templateId },
                      { onError: (msg) => toast.error(msg) }
                    );
                  } else {
                    toast.error('Nothing to print for this entry.');
                  }
                  setPrintModalEntry(null);
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500"
              >
                Print
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && deleteModal.entry && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={closeDeleteModal} />
          <div className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              {deleteModal.step === 1 ? 'Delete this entry?' : 'Confirm deletion'}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {deleteModal.entry.isDeliveryNote ? (
                <>
                  Delivery note #{getDeliveryNoteNumber(deleteModal.entry.notes, deleteModal.entry.deliveryNoteNumber) ?? '—'}
                  {deleteModal.entry.deliveryType === 'SUBCONTRACT' ? ' (subcontract)' : ''} · job{' '}
                  <strong>{deleteModal.entry.jobNumber}</strong>
                </>
              ) : (
                <>
                  Dispatch entry for job <strong>{deleteModal.entry.jobNumber}</strong> on{' '}
                  <strong>{formatDate(deleteModal.entry.dispatchDate)}</strong>
                </>
              )}
            </p>

            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-600/15 p-3">
              <p className="mb-2 text-xs font-medium text-red-800 dark:text-red-300">This will permanently:</p>
              <ul className="list-inside list-disc space-y-1 text-xs text-red-800 dark:text-red-300">
                <li>Delete the {deleteModal.entry.isDeliveryNote ? 'delivery note' : 'dispatch entry'}</li>
                <li>
                  Reverse and remove{' '}
                  {deleteModal.entry.isDeliveryNote && deleteModal.entry.deliveryNoteId
                    ? 'all linked stock transactions (including subcontract receive/issue transfers)'
                    : `${deleteModal.entry.transactionCount} stock transaction(s)`}
                </li>
                {deleteModal.entry.isDeliveryNote &&
                isSubcontractEntry(deleteModal.entry) &&
                deleteModal.entry.transitStatus &&
                deleteModal.entry.transitStatus !== 'ON_TRANSIT' ? (
                  <li>
                    Unwind received material ({deleteModal.entry.transitStatus.replace(/_/g, ' ').toLowerCase()})
                    back through warehouse transfers
                  </li>
                ) : null}
                <li>Cannot be undone</li>
              </ul>
              {!canDelete ? (
                <p className="mt-2 text-xs text-red-800 dark:text-red-300">
                  Your role does not have permission to delete (requires transaction.stock_out).
                </p>
              ) : null}
            </div>

            {deleteModal.step === 2 ? (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteModal.confirmText}
                  onChange={(e) => setDeleteModal((prev) => ({ ...prev, confirmText: e.target.value }))}
                  placeholder="DELETE"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
            ) : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModal.loading}
                className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={
                  deleteModal.loading ||
                  !canDelete ||
                  (deleteModal.step === 2 && deleteModal.confirmText.trim().toUpperCase() !== 'DELETE')
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {deleteModal.loading
                  ? 'Deleting…'
                  : deleteModal.step === 1
                    ? 'Continue'
                    : 'Delete permanently'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
