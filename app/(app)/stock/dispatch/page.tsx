'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { buttonVariants } from '@/components/ui/shadcn/button';
import { Card, CardContent } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Skeleton } from '@/components/ui/shadcn/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import DirectoryListPagination from '@/components/ui/DirectoryListPagination';
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

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

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

  const [filterType, setFilterType] = useState<'day' | 'month' | 'all'>('month');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [noteTypeFilter, setNoteTypeFilter] = useState<'all' | 'dispatch' | 'delivery'>('all');
  const [jobSearch, setJobSearch] = useState('');
  const [deliveryNoteSearch, setDeliveryNoteSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_LIST_PAGE_SIZE);
  const deferredJobSearch = useDeferredValue(jobSearch);
  const deferredDeliveryNoteSearch = useDeferredValue(deliveryNoteSearch);

  // Load filter state from URL on mount
  useEffect(() => {
    const urlFilterType = searchParams.get('filterType') as 'day' | 'month' | 'all' | null;
    const urlDate = searchParams.get('date');

    if (urlFilterType && ['day', 'month', 'all'].includes(urlFilterType)) {
      setFilterType(urlFilterType);
    }
    if (urlDate) {
      setSelectedDate(urlDate);
    }
  }, []);

  const [viewModal, setViewModal] = useState<{ open: boolean; entry: Entry | null }>({
    open: false,
    entry: null,
  });
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; entry: Entry | null; loading: boolean }>({
    open: false,
    entry: null,
    loading: false,
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
      date: selectedDate,
      noteType: noteTypeFilter,
      jobSearch: deferredJobSearch,
      deliveryNoteSearch: deferredDeliveryNoteSearch,
    }),
    [filterType, selectedDate, noteTypeFilter, deferredJobSearch, deferredDeliveryNoteSearch],
  );

  useEffect(() => {
    setPage(1);
  }, [listQueryArgs, pageSize]);

  const { data: dispatchPage, isLoading, isFetching } = useGetDispatchEntriesPageQuery(listQueryArgs, {
    skip: !canView,
    refetchOnMountOrArgChange: 300,
  });

  const allEntries = (dispatchPage?.entries ?? []) as Entry[];
  const totalEntries = dispatchPage?.total ?? allEntries.length;
  const entries = useMemo(
    () => allEntries.slice((page - 1) * pageSize, page * pageSize),
    [allEntries, page, pageSize],
  );
  const loading = isLoading;
  const isRefreshing = isFetching && !isLoading;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
  const pageStart = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, totalEntries);

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
        const dn = raw.filter((t) => String(t.itemType) === 'delivery-note');
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

  // Parse custom items from notes (for delivery notes)
  const parseCustomItems = (notes?: string): Array<{ name: string; description: string; unit: string; qty: string }> => {
    if (!notes) return [];
    const match = notes.match(/--- DELIVERY NOTE ITEMS \(For Printing\) ---\n([\s\S]*?)(?=\n--- |$)/);
    if (!match) return [];
    const itemsText = match[1];
    const items = itemsText.split('\n').filter(line => line.startsWith('• '));
    return items.map(item => {
      const cleanItem = item.replace('• ', '');
      const [leftPart, rightPart] = cleanItem.split(' | ');
      const [name, description] = leftPart.includes(' - ')
        ? leftPart.split(' - ')
        : [leftPart, ''];
      const [qtyStr, unit] = rightPart?.trim().split(' ') || ['', ''];
      return {
        name: name?.trim() || '',
        description: description?.trim() || '',
        unit: unit?.trim() || '',
        qty: qtyStr?.trim() || '',
      };
    });
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

  function parseCustomItemsFromEntry(entry: Entry): Array<{ name: string; description: string; unit: string; qty: string }> {
    if (Array.isArray(entry.customItemsJson)) {
      return (entry.customItemsJson as Array<Record<string, unknown>>).map((row) => ({
        name: String(row.name ?? ''),
        description: typeof row.description === 'string' ? row.description : '',
        unit: String(row.unit ?? ''),
        qty: String(row.qty ?? ''),
      }));
    }
    return parseCustomItems(entry.notes);
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

  const totalDispatchValuation = entries.reduce((sum, e) => sum + e.totalValuation, 0);
  const totalMaterials = new Set(entries.flatMap((e) => e.materials.map((m) => m.materialId))).size;
  const deliveryNoteCount = entries.filter((e) => e.isDeliveryNote === true).length;
  const dispatchNoteCount = entries.filter((e) => e.isDeliveryNote !== true).length;

  const handleFilterTypeChange = (newFilterType: 'day' | 'month' | 'all') => {
    setFilterType(newFilterType);
    // Update URL
    const params = new URLSearchParams();
    params.set('filterType', newFilterType);
    if (newFilterType !== 'all') {
      params.set('date', selectedDate);
    }
    router.push(`?${params.toString()}`);
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    // Update URL
    const params = new URLSearchParams();
    params.set('filterType', filterType);
    params.set('date', newDate);
    router.push(`?${params.toString()}`);
  };

  const handleDelete = async (entry: Entry) => {
    setDeleteModal({ open: true, entry, loading: false });
  };

  const confirmDelete = async () => {
    if (!deleteModal.entry) return;
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      const entry = deleteModal.entry;
      if (entry.isDeliveryNote && entry.transactionIds.length === 0 && entry.deliveryNoteId) {
        await deleteDeliveryNote(entry.deliveryNoteId).unwrap();
      } else {
        for (const txnId of entry.transactionIds) {
          await deleteTransaction(txnId).unwrap();
        }
      }
      toast.success('Entry deleted successfully');
      setDeleteModal({ open: false, entry: null, loading: false });
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to delete entry');
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

  const handleRowContextMenu = useCallback((entry: Entry, e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedRowId(entry.id);
    const dateStr = typeof entry.dispatchDate === 'string'
      ? entry.dispatchDate.split('T')[0]
      : new Date(entry.dispatchDate).toISOString().split('T')[0];
    const editPath = entry.isDeliveryNote
      ? deliveryNoteEditHref(entry)
      : `/stock/dispatch/entry?jobId=${entry.jobId}&date=${dateStr}`;
    const options: any[] = [
      { label: 'View', action: () => setViewModal({ open: true, entry }) },
    ];
    if (canEdit) {
      options.push({ label: 'Edit', action: () => router.push(editPath) });
    }
    if (canEdit && entry.isDeliveryNote) {
      options.push({
        label: 'Duplicate',
        action: () => router.push(deliveryNoteDuplicateHref(entry)),
      });
    }
    if (canDelete) {
      options.push({ divider: true });
      options.push({ label: 'Delete', action: () => handleDelete(entry), danger: true });
    }
    openContextMenu(e.clientX, e.clientY, options);
  }, [canEdit, canDelete, openContextMenu, router]);

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
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dispatch desk</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Stock-out history and note control</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Review every dispatch and delivery note, reopen any row for editing, and keep signed-copy follow-up visible
            from one compact ledger.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/stock/dispatch/entry" className={cn(buttonVariants({ size: 'sm' }))}>
            New dispatch
          </Link>
          <Link href="/stock/dispatch/delivery-note" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
            New delivery note
          </Link>
        </div>
      </header>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total entries</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{formatCount(totalEntries)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dispatch notes (page)</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{dispatchNoteCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Delivery notes (page)</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{deliveryNoteCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Materials touched (page)</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{totalMaterials}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total valuation</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
              {formatCurrency(totalDispatchValuation)}
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all' as const, label: 'All entries' },
                { value: 'month' as const, label: 'Month' },
                { value: 'day' as const, label: 'Day' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleFilterTypeChange(option.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                    filterType === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all' as const, label: 'All types' },
                { value: 'dispatch' as const, label: 'Dispatch only' },
                { value: 'delivery' as const, label: 'Delivery notes only' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNoteTypeFilter(option.value)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
                    noteTypeFilter === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-muted/40 text-muted-foreground hover:bg-muted/60',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-2 lg:w-auto lg:min-w-[280px]">
            {filterType !== 'all' ? (
              <input
                type={filterType === 'day' ? 'date' : 'month'}
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder="Search job # or description"
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
                className="h-9 min-w-0 sm:max-w-[220px]"
              />
              <Input
                placeholder="Delivery note #"
                value={deliveryNoteSearch}
                onChange={(e) => setDeliveryNoteSearch(e.target.value)}
                className="h-9 min-w-0 sm:max-w-[140px]"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border">
          {isRefreshing ? (
            <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">Refreshing list…</p>
          ) : null}
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No dispatch entries found for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Dispatch date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Signed copy</TableHead>
                  <TableHead className="text-right">Materials</TableHead>
                  <TableHead className="text-right">Total value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const dnNumber = e.isDeliveryNote ? getDeliveryNoteNumber(e.notes, e.deliveryNoteNumber) : null;
                  return (
                    <TableRow
                      key={e.id}
                      data-state={selectedRowId === e.id ? 'selected' : undefined}
                      className={cn('cursor-pointer', selectedRowId === e.id && 'bg-muted/60')}
                      onClick={() => handleRowClick(e)}
                      onDoubleClick={() => handleRowDoubleClick(e)}
                      onContextMenu={(ev) => handleRowContextMenu(e, ev)}
                    >
                      <TableCell>
                        <div>
                          <p className="font-medium text-primary">{e.jobNumber}</p>
                          <p className="max-w-[10rem] truncate text-xs text-muted-foreground sm:max-w-[14rem]">
                            {e.jobDescription}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-foreground">{formatDateTime(e.dispatchDate)}</TableCell>
                      <TableCell>
                        {e.isDeliveryNote ? (
                          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                            DN #{dnNumber ?? 'N/A'}
                          </span>
                        ) : (
                          <Badge label="Dispatch" variant="gray" />
                        )}
                      </TableCell>
                      <TableCell>
                        {!e.isDeliveryNote ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : e.signedCopyUrl ? (
                          <Badge label="Uploaded" variant="green" />
                        ) : (
                          <Badge label="Not uploaded" variant="gray" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {e.isDeliveryNote && e.materialsCount === 0 ? (
                          <span className="text-xs font-medium text-muted-foreground">Print only</span>
                        ) : (
                          <Badge label={`${e.materialsCount}`} variant="blue" />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(e.totalValuation)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        {totalEntries > 0 ? (
          <DirectoryListPagination
            className="border-t border-border px-4 py-3"
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            total={totalEntries}
            pageStart={pageStart}
            pageEnd={pageEnd}
            pageSizeOptions={DISPATCH_ENTRY_PAGE_SIZE_OPTIONS}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </section>

      {/* View Modal */}
      {viewModal.open && viewModal.entry && (() => {
        const entry = viewModal.entry;
        const isDeliveryNote = entry.isDeliveryNote === true;
        const dnNumber = isDeliveryNote ? getDeliveryNoteNumber(entry.notes, entry.deliveryNoteNumber) : null;
        const customItems = isDeliveryNote ? parseCustomItemsFromEntry(entry) : [];
        const parsedContacts = parseJobContacts(entry.jobContactsJson);
        const primaryContact = entry.jobContactPerson?.trim() || parsedContacts[0]?.name || '';
        const primaryContactRow = parsedContacts.find((c) => c.name === primaryContact) ?? parsedContacts[0];
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
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100">
                        DN #{dnNumber || 'N/A'}
                      </span>
                    ) : (
                      <Badge label="Dispatch" variant="gray" />
                    )}
                  </div>
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
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase w-8">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Item Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground uppercase w-24">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customItems.map((item, idx) => (
                            <tr key={idx} className="border-b border-border/50 last:border-b-0">
                              <td className="px-3 py-2.5 text-muted-foreground text-xs font-mono">{idx + 1}</td>
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
                  const q = selectedPrintTplId
                    ? `&templateId=${encodeURIComponent(selectedPrintTplId)}`
                    : '';
                  if (tid) {
                    window.open(`/print/delivery-note?id=${encodeURIComponent(tid)}${q}`, '_blank');
                  } else if (dnid) {
                    window.open(
                      `/print/delivery-note?deliveryNoteId=${encodeURIComponent(dnid)}${q}`,
                      '_blank'
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
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setDeleteModal({ open: false, entry: null, loading: false })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-xl p-6 max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-2">Delete Dispatch Entry?</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Delete dispatch entry for job <strong>{deleteModal.entry.jobNumber}</strong> on{' '}
              <strong>{formatDate(deleteModal.entry.dispatchDate)}</strong>?
            </p>

            <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs font-medium text-red-800 dark:text-red-300 mb-2">This action will:</p>
              <ul className="text-xs text-red-800 dark:text-red-300 space-y-1 list-disc list-inside">
                {deleteModal.entry.isDeliveryNote &&
                deleteModal.entry.transactionIds.length === 0 &&
                deleteModal.entry.deliveryNoteId ? (
                  <li>Remove delivery note #{getDeliveryNoteNumber(deleteModal.entry.notes, deleteModal.entry.deliveryNoteNumber) ?? '—'} (custom items only)</li>
                ) : (
                  <>
                    <li>Delete all {deleteModal.entry.materialsCount} material dispatch records</li>
                    <li>Remove {deleteModal.entry.transactionCount} transaction(s)</li>
                  </>
                )}
                <li>Cannot be undone</li>
              </ul>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, entry: null, loading: false })}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteModal.loading ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
