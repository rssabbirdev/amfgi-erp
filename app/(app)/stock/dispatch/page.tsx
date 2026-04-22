'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import { formatDateTime, formatDate } from '@/lib/utils/formatters';
import type { Column } from '@/components/ui/DataTable';
import { useGetDispatchEntriesQuery, useDeleteTransactionMutation } from '@/store/hooks';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import type { DocumentTemplate } from '@/lib/types/documentTemplate';

interface Material {
  materialId: string;
  materialName: string;
  materialUnit: string;
  quantity: number;
  unitCost: number;
  transactionIds: string[];
}

interface Entry {
  id: string;
  _id?: string;
  entryId: string;
  jobId: string;
  jobNumber: string;
  jobDescription: string;
  jobContactPerson?: string;
  jobContactsJson?: unknown;
  dispatchDate: string;
  totalQuantity: number;
  totalValuation: number;
  materialsCount: number;
  materials: Material[];
  transactionIds: string[];
  transactionCount: number;
  notes?: string;
  isDeliveryNote?: boolean;
  signedCopyUrl?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdByEmail?: string;
  createdBySignatureUrl?: string;
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
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);

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
  const getDeliveryNoteNumber = (notes?: string) => {
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

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        filterType,
        date: selectedDate,
      });
      const res = await fetch(`/api/materials/dispatch-history-entries?${params}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setEntries(json.data.entries);
      } else {
        toast.error(json.error ?? 'Failed to fetch entries');
      }
    } catch (err) {
      toast.error('Error loading entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      fetchEntries();
    }
  }, [filterType, selectedDate, canView]);

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
      // Delete all transactions in this entry
      for (const txnId of deleteModal.entry.transactionIds) {
        await deleteTransaction(txnId).unwrap();
      }
      toast.success('Entry deleted successfully');
      setDeleteModal({ open: false, entry: null, loading: false });
      fetchEntries();
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
    // For delivery notes, route with transactionId to load the specific note for editing
    // For dispatch notes, route with jobId and date
    const editPath = entry.isDeliveryNote
      ? `/stock/dispatch/delivery-note?transactionId=${entry.transactionIds[0]}`
      : `/stock/dispatch/entry?jobId=${entry.jobId}&date=${dateStr}`;
    const options: any[] = [
      { label: 'View', action: () => setViewModal({ open: true, entry }) },
    ];
    if (canEdit) {
      options.push({ label: 'Edit', action: () => router.push(editPath) });
    }
    // Duplicate option only for delivery notes
    if (canEdit && entry.isDeliveryNote) {
      options.push({
        label: 'Duplicate',
        action: () => router.push(`/stock/dispatch/delivery-note?duplicateFrom=${entry.transactionIds[0]}`),
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
      <div className="text-center py-12">
        <p className="text-slate-400">You don't have permission to view dispatch history.</p>
      </div>
    );
  }

  // Filter entries based on note type
  const filteredEntries = entries.filter(e => {
    if (noteTypeFilter === 'delivery') return e.isDeliveryNote === true;
    if (noteTypeFilter === 'dispatch') return e.isDeliveryNote !== true;
    return true;
  });

  const columns: Column<Entry>[] = [
    {
      key: 'jobNumber',
      header: 'Job',
      sortable: true,
      render: (e: Entry) => (
        <div>
          <p className="font-medium text-cyan-400">{e.jobNumber}</p>
          <p className="text-xs text-slate-400 max-w-40 truncate">{e.jobDescription}</p>
        </div>
      ),
    },
    {
      key: 'dispatchDate',
      header: 'Dispatch Date',
      sortable: true,
      render: (e: Entry) => formatDateTime(e.dispatchDate),
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (e: Entry) => {
        if (e.isDeliveryNote) {
          const dnNumber = getDeliveryNoteNumber(e.notes);
          return (
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-blue-600/30 border border-blue-500/50 rounded-full text-xs font-semibold text-blue-300">
                DN #{dnNumber || 'N/A'}
              </span>
            </div>
          );
        }
        return <Badge label="Dispatch" variant="gray" />;
      },
    },
    {
      key: 'signedCopy',
      header: 'Signed Copy',
      render: (e: Entry) => {
        if (!e.isDeliveryNote) return <span className="text-slate-600 text-xs">—</span>;
        return e.signedCopyUrl ? (
          <Badge label="Uploaded" variant="green" />
        ) : (
          <Badge label="Not uploaded" variant="gray" />
        );
      },
    },
    {
      key: 'materialsCount',
      header: 'Materials',
      sortable: true,
      render: (e: Entry) => <Badge label={`${e.materialsCount}`} variant="blue" />,
    },
    {
      key: 'totalValuation',
      header: 'Total Value',
      sortable: true,
      render: (e: Entry) => <span className="font-semibold text-emerald-400">{e.totalValuation.toFixed(2)}</span>,
    },
  ];

  const totalEntries = filteredEntries.length;
  const totalDispatchValuation = filteredEntries.reduce((sum, e) => sum + e.totalValuation, 0);
  const totalMaterials = new Set(filteredEntries.flatMap(e => e.materials.map(m => m.materialId))).size;
  const deliveryNoteCount = filteredEntries.filter(e => e.isDeliveryNote === true).length;
  const dispatchNoteCount = filteredEntries.filter(e => e.isDeliveryNote !== true).length;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.09),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-5 py-5 dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
                Dispatch Desk
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">
                Stock-out history and note control
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
                Review every dispatch and delivery note, reopen any row for editing, and keep signed-copy follow-up visible from one compact ledger.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/stock/dispatch/entry">
                <Button>New Dispatch</Button>
              </Link>
              <Link href="/stock/dispatch/delivery-note">
                <Button variant="secondary">New Delivery Note</Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-5">
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Total entries</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{totalEntries}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Dispatch notes</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{dispatchNoteCount}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Delivery notes</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{deliveryNoteCount}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Materials touched</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{totalMaterials}</p>
          </div>
          <div className="bg-white px-5 py-4 dark:bg-slate-950/80">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Total valuation</p>
            <p className="mt-2 text-xl font-semibold text-emerald-700 dark:text-emerald-300">{totalDispatchValuation.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-5">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
            {[
              { value: 'all' as const, label: 'All Entries' },
              { value: 'month' as const, label: 'Month' },
              { value: 'day' as const, label: 'Day' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleFilterTypeChange(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                  filterType === option.value
                    ? 'bg-emerald-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
            </div>

            <div className="flex flex-wrap gap-2">
            {[
              { value: 'all' as const, label: 'All Types' },
              { value: 'dispatch' as const, label: 'Dispatch Only' },
              { value: 'delivery' as const, label: 'Delivery Notes Only' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setNoteTypeFilter(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                  noteTypeFilter === option.value
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterType !== 'all' ? (
            <input
              type={filterType === 'day' ? 'date' : 'month'}
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          ) : null}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-transparent dark:text-slate-500">
            Search by job number or description
          </span>
        </div>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns as any}
          data={filteredEntries as any}
          loading={loading}
          emptyText="No dispatch entries found for this period."
          searchKeys={['jobNumber', 'jobDescription'] as any}
          onRowClick={handleRowClick as any}
          onRowContextMenu={handleRowContextMenu}
          onRowDoubleClick={handleRowDoubleClick as any}
          selectedRowId={selectedRowId}
        />
      </div>
    </section>

      {/* View Modal */}
      {viewModal.open && viewModal.entry && (() => {
        const entry = viewModal.entry;
        const isDeliveryNote = entry.isDeliveryNote === true;
        const dnNumber = isDeliveryNote ? getDeliveryNoteNumber(entry.notes) : null;
        const customItems = isDeliveryNote ? parseCustomItems(entry.notes) : [];
        const parsedContacts = parseJobContacts(entry.jobContactsJson);
        const primaryContact = entry.jobContactPerson?.trim() || parsedContacts[0]?.name || '';
        const primaryContactRow = parsedContacts.find((c) => c.name === primaryContact) ?? parsedContacts[0];
        const baseNotes = getBaseNotes(entry.notes);
        const customerName = entry.jobDescription || '';
        const dateStr = typeof entry.dispatchDate === 'string'
          ? entry.dispatchDate.split('T')[0]
          : new Date(entry.dispatchDate).toISOString().split('T')[0];
        const editPath = isDeliveryNote
          ? `/stock/dispatch/delivery-note?transactionId=${entry.transactionIds[0]}`
          : `/stock/dispatch/entry?jobId=${entry.jobId}&date=${dateStr}`;

        return (
          <>
            <div
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={() => setViewModal({ open: false, entry: null })}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-[90vw] max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              {/* Header */}
              <div className={`px-6 py-4 border-b border-slate-700 ${isDeliveryNote ? 'bg-gradient-to-r from-blue-900/40 to-slate-800' : 'bg-gradient-to-r from-slate-700/40 to-slate-800'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {isDeliveryNote ? (
                      <div className="w-10 h-10 rounded-lg bg-blue-600/30 border border-blue-500/50 flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-600/40 border border-slate-500/50 flex items-center justify-center">
                        <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-bold text-white">
                        {isDeliveryNote ? `Delivery Note #${dnNumber || 'N/A'}` : 'Dispatch Entry'}
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isDeliveryNote ? 'Delivery for printing & dispatch' : 'Material dispatch entry'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewModal({ open: false, entry: null })}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors"
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
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Job Number</p>
                    <p className="text-sm font-semibold text-cyan-400">{entry.jobNumber}</p>
                    {customerName && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{customerName}</p>
                    )}
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Date & Time</p>
                    <p className="text-sm font-semibold text-white">{formatDateTime(entry.dispatchDate)}</p>
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Type</p>
                    {isDeliveryNote ? (
                      <span className="inline-flex px-2 py-0.5 bg-blue-600/30 border border-blue-500/50 rounded-full text-xs font-semibold text-blue-300">
                        DN #{dnNumber || 'N/A'}
                      </span>
                    ) : (
                      <Badge label="Dispatch" variant="gray" />
                    )}
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Contact Person</p>
                    <p className="text-sm font-semibold text-white">{primaryContact || '—'}</p>
                    {(primaryContactRow?.designation || primaryContactRow?.label) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {primaryContactRow?.designation || primaryContactRow?.label}
                      </p>
                    )}
                    {primaryContactRow?.number && (
                      <p className="text-xs text-slate-400 mt-0.5">{primaryContactRow.number}</p>
                    )}
                    {primaryContactRow?.email && (
                      <p className="text-xs text-slate-400 mt-0.5 break-all">{primaryContactRow.email}</p>
                    )}
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Created By</p>
                    <p className="text-sm font-semibold text-white">{entry.createdByName || '—'}</p>
                    {entry.createdByEmail && (
                      <p className="text-xs text-slate-400 mt-0.5 break-all">{entry.createdByEmail}</p>
                    )}
                  </div>
                </div>

                {/* Materials Section */}
                {entry.materials.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        Materials Dispatched
                      </h3>
                      <span className="text-xs text-slate-400">{entry.materials.length} item{entry.materials.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="bg-slate-900/60 rounded-lg border border-slate-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800/80 border-b border-slate-700">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase w-8">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Material</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase w-24">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase w-24">Unit Cost</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase w-28">Valuation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.materials.map((material, idx) => {
                            const valuation = material.quantity * material.unitCost;
                            return (
                              <tr key={idx} className="border-b border-slate-700/50 last:border-b-0">
                                <td className="px-3 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>
                                <td className="px-3 py-2.5">
                                  <p className="font-medium text-white">{material.materialName}</p>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                                  {material.quantity.toFixed(3)} <span className="text-slate-500 text-xs">{material.materialUnit}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                                  {material.unitCost.toFixed(2)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-400">
                                  {valuation.toFixed(2)}
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
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                        </svg>
                        Custom Items (For Printing)
                      </h3>
                      <span className="text-xs text-slate-400">{customItems.length} item{customItems.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="bg-slate-900/60 rounded-lg border border-slate-700 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800/80 border-b border-slate-700">
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase w-8">#</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Item Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 uppercase">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 uppercase w-24">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customItems.map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-700/50 last:border-b-0">
                              <td className="px-3 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>
                              <td className="px-3 py-2.5 font-medium text-white">{item.name || '—'}</td>
                              <td className="px-3 py-2.5 text-slate-400 text-xs">{item.description || '—'}</td>
                              <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                                {item.qty || '—'} {item.unit && <span className="text-slate-500 text-xs">{item.unit}</span>}
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
                  <div className="bg-slate-900/60 rounded-lg border border-slate-700 p-6 text-center">
                    <p className="text-slate-500 text-sm">No materials or custom items in this delivery note.</p>
                  </div>
                )}

                {/* Notes */}
                {baseNotes && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Notes</h3>
                    <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">{baseNotes}</p>
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="bg-slate-700/30 border border-slate-600 rounded-lg p-4">
                  <div className={`grid ${isDeliveryNote ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Total Materials</p>
                      <p className="text-xl font-bold text-white mt-1">{entry.materialsCount}</p>
                    </div>
                    {isDeliveryNote && (
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-wide">Custom Items</p>
                        <p className="text-xl font-bold text-blue-400 mt-1">{customItems.length}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wide">Total Valuation</p>
                      <p className="text-xl font-bold text-emerald-400 mt-1">{entry.totalValuation.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-700 bg-slate-800/80 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Double-click any row to view details</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewModal({ open: false, entry: null })}
                    className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                  {isDeliveryNote && (
                    <button
                      onClick={() => setPrintModalEntry(entry)}
                      className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-sm font-medium transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4H9a2 2 0 00-2 2v2a2 2 0 002 2h10a2 2 0 002-2v-2a2 2 0 00-2-2h-2m-4-4V9m0 4v6m0-6a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                      Print
                    </button>
                  )}
                  {canEdit && isDeliveryNote && (
                    <button
                      onClick={() => {
                        setViewModal({ open: false, entry: null });
                        router.push(`/stock/dispatch/delivery-note?duplicateFrom=${entry.transactionIds[0]}`);
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Print delivery note</h2>
            <p className="text-sm text-slate-400 mb-4">
              Job {printModalEntry.jobNumber} · choose a layout (from Settings → Print templates).
            </p>
            {printTplLoading ? (
              <p className="text-sm text-slate-500 py-4">Loading formats…</p>
            ) : printTemplates.length === 0 ? (
              <p className="text-sm text-slate-500 mb-4">
                No delivery-note templates saved. Print will use the built-in default layout.
              </p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto mb-4">
                {printTemplates.map((tpl) => (
                  <li key={tpl.id}>
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-600 cursor-pointer hover:bg-slate-700/50 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-950/30">
                      <input
                        type="radio"
                        name="print-tpl"
                        checked={selectedPrintTplId === tpl.id}
                        onChange={() => setSelectedPrintTplId(tpl.id)}
                        className="text-emerald-600"
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{tpl.name}</p>
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
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const tid = printModalEntry.transactionIds[0];
                  const q = selectedPrintTplId
                    ? `&templateId=${encodeURIComponent(selectedPrintTplId)}`
                    : '';
                  window.open(`/print/delivery-note?id=${tid}${q}`, '_blank');
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Dispatch Entry?</h2>
            <p className="text-slate-300 text-sm mb-4">
              Delete dispatch entry for job <strong>{deleteModal.entry.jobNumber}</strong> on{' '}
              <strong>{formatDate(deleteModal.entry.dispatchDate)}</strong>?
            </p>

            <div className="bg-red-600/15 border border-red-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-red-300 font-medium mb-2">This action will:</p>
              <ul className="text-xs text-red-300 space-y-1 list-disc list-inside">
                <li>Delete all {deleteModal.entry.materialsCount} material dispatch records</li>
                <li>Remove {deleteModal.entry.transactionCount} transaction(s)</li>
                <li>Cannot be undone</li>
              </ul>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal({ open: false, entry: null, loading: false })}
                disabled={deleteModal.loading}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors disabled:opacity-50"
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
