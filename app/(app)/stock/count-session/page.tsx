'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import {
  buildManualAdjustmentLinesFromCount,
  buildStockCountDraftLines,
  updateStockCountVariance,
  type StockCountDraftLine,
} from '@/lib/utils/stockCountSession';
import {
  DEFAULT_STOCK_CONTROL_SETTINGS,
  readStockControlSettingsFromCompanySettings,
  type StockControlSettings,
} from '@/lib/stock-control/settings';
import {
  useGetMaterialsQuery,
  useGetStockCountSessionByIdQuery,
  useGetStockCountSessionsQuery,
  useGetWarehousesQuery,
  useCreateStockCountSessionMutation,
  useSubmitStockCountSessionMutation,
  useUpdateStockCountSessionMutation,
} from '@/store/hooks';

type DraftState = {
  sessionId?: string | null;
  status?: 'DRAFT' | 'ADJUSTMENT_PENDING' | 'ADJUSTMENT_APPROVED' | 'ADJUSTMENT_REJECTED' | 'CANCELLED' | null;
  currentRevision?: number;
  linkedAdjustmentReferenceNumber?: string | null;
  warehouseId: string;
  sessionTitle: string;
  evidenceReference: string;
  evidenceNotes: string;
  notes: string;
  lines: StockCountDraftLine[];
};

function formatQty(value: number) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function emptyDraft(): DraftState {
  return {
    sessionId: null,
    status: null,
    currentRevision: 0,
    linkedAdjustmentReferenceNumber: null,
    warehouseId: '',
    sessionTitle: '',
    evidenceReference: '',
    evidenceNotes: '',
    notes: '',
    lines: [],
  };
}

export default function StockCountSessionPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canAdjust = isSA || perms.includes('transaction.adjust');
  const canViewMaterials = isSA || perms.includes('material.view') || perms.includes('transaction.adjust');

  const { data: materials = [] } = useGetMaterialsQuery(undefined, {
    skip: !canViewMaterials,
  });
  const { data: warehouses = [] } = useGetWarehousesQuery(undefined, {
    skip: !canAdjust,
  });
  const { data: savedSessions = [] } = useGetStockCountSessionsQuery(undefined, {
    skip: !canAdjust,
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const { data: selectedSession } = useGetStockCountSessionByIdQuery(selectedSessionId ?? '', {
    skip: !canAdjust || !selectedSessionId,
  });
  const [createSession, { isLoading: isCreating }] = useCreateStockCountSessionMutation();
  const [updateSession, { isLoading: isUpdating }] = useUpdateStockCountSessionMutation();
  const [submitSession, { isLoading: isSubmitting }] = useSubmitStockCountSessionMutation();

  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [stockControlSettings, setStockControlSettings] = useState<StockControlSettings>(DEFAULT_STOCK_CONTROL_SETTINGS);
  const [search, setSearch] = useState('');
  const [showVarianceOnly, setShowVarianceOnly] = useState(false);

  const storageKey = useMemo(
    () => (session?.user?.activeCompanyId ? `stock-count-session:${session.user.activeCompanyId}` : null),
    [session?.user?.activeCompanyId]
  );

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as DraftState;
      setDraft(parsed);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const loadCompanySettings = async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setStockControlSettings(readStockControlSettingsFromCompanySettings(data?.data?.jobCostingSettings));
      } catch {
        // keep defaults
      }
    };
    void loadCompanySettings();
  }, [session?.user?.activeCompanyId]);

  const activeWarehouses = useMemo(() => warehouses.filter((warehouse) => warehouse.isActive), [warehouses]);
  const activeMaterials = useMemo(() => materials.filter((material) => material.isActive), [materials]);

  const filteredLines = useMemo(() => {
    const query = search.trim().toLowerCase();
    return draft.lines.filter((line) => {
      if (showVarianceOnly && Math.abs(line.varianceQty) < 0.001) return false;
      if (!query) return true;
      return `${line.materialName} ${line.unit}`.toLowerCase().includes(query);
    });
  }, [draft.lines, search, showVarianceOnly]);

  const adjustmentLines = useMemo(() => buildManualAdjustmentLinesFromCount(draft.lines), [draft.lines]);
  const maxNegativeVariance = useMemo(
    () => adjustmentLines.reduce((max, line) => (line.quantityDelta < 0 ? Math.max(max, Math.abs(line.quantityDelta)) : max), 0),
    [adjustmentLines]
  );
  const isSaving = isCreating || isUpdating;
  const isLoading = isSubmitting || isSaving;

  useEffect(() => {
    if (!selectedSession) return;
    setDraft({
      sessionId: selectedSession.id,
      status: selectedSession.status,
      currentRevision: selectedSession.currentRevision,
      linkedAdjustmentReferenceNumber: selectedSession.linkedAdjustmentReferenceNumber,
      warehouseId: selectedSession.warehouseId,
      sessionTitle: selectedSession.title,
      evidenceReference: selectedSession.evidenceReference ?? '',
      evidenceNotes: selectedSession.evidenceNotes ?? '',
      notes: selectedSession.notes ?? '',
      lines:
        selectedSession.lines?.map((line) => ({
          materialId: line.materialId,
          materialName: line.materialName,
          unit: line.unit,
          warehouseId: line.warehouseId,
          systemQty: line.systemQty,
          countedQty: line.countedQty == null ? '' : line.countedQty.toString(),
          varianceQty: line.varianceQty,
          unitCost: line.unitCost,
        })) ?? [],
    });
  }, [selectedSession]);

  function loadWarehouseSheet() {
    if (!draft.warehouseId) {
      toast.error('Select a warehouse first.');
      return;
    }
    const lines = buildStockCountDraftLines(activeMaterials, draft.warehouseId);
    if (lines.length === 0) {
      toast.error('No active materials were found for this warehouse.');
      return;
    }
    const warehouseName = activeWarehouses.find((warehouse) => warehouse.id === draft.warehouseId)?.name || 'warehouse';
    setDraft((current) => ({
      ...current,
      sessionTitle: current.sessionTitle || `${warehouseName} stock count`,
      lines,
    }));
    toast.success(`${lines.length} count lines loaded.`);
  }

  function resetDraft() {
    setDraft(emptyDraft());
    setSelectedSessionId(null);
    setSearch('');
    setShowVarianceOnly(false);
    if (storageKey && typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey);
    }
  }

  async function saveSession() {
    if (!draft.warehouseId) {
      toast.error('Select a warehouse first.');
      return null;
    }
    if (draft.lines.length === 0) {
      toast.error('Load a count sheet first.');
      return null;
    }
    if (!draft.sessionTitle.trim()) {
      toast.error('Enter a session title.');
      return null;
    }

    const body = {
      warehouseId: draft.warehouseId,
      title: draft.sessionTitle.trim(),
      ...(draft.evidenceReference.trim() ? { evidenceReference: draft.evidenceReference.trim() } : {}),
      ...(draft.evidenceNotes.trim() ? { evidenceNotes: draft.evidenceNotes.trim() } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      lines: draft.lines.map((line, index) => ({
        materialId: line.materialId,
        materialName: line.materialName,
        unit: line.unit,
        warehouseId: line.warehouseId,
        systemQty: line.systemQty,
        countedQty: line.countedQty.trim().length > 0 ? Number(line.countedQty) : null,
        varianceQty: line.varianceQty,
        unitCost: line.unitCost,
        sortOrder: index,
      })),
    };

    try {
      const saved = draft.sessionId
        ? await updateSession({ id: draft.sessionId, body }).unwrap()
        : await createSession(body).unwrap();
      setSelectedSessionId(saved.id);
      setDraft((current) => ({
        ...current,
        sessionId: saved.id,
        status: saved.status,
        currentRevision: saved.currentRevision,
        linkedAdjustmentReferenceNumber: saved.linkedAdjustmentReferenceNumber,
      }));
      toast.success(draft.sessionId ? 'Count session saved.' : 'Count session created.');
      return saved;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save count session');
      return null;
    }
  }

  async function submitCountAdjustment() {
    if (!draft.warehouseId) {
      toast.error('Select a warehouse first.');
      return;
    }
    if (adjustmentLines.length === 0) {
      toast.error('Enter counted quantities that produce a variance first.');
      return;
    }
    if (!draft.evidenceReference.trim()) {
      toast.error('Enter the count sheet reference.');
      return;
    }
    if (maxNegativeVariance >= stockControlSettings.negativeEvidenceQtyThreshold && draft.evidenceNotes.trim().length < 12) {
      toast.error('Large negative variances require detailed evidence notes.');
      return;
    }
    let sessionId = draft.sessionId;
    if (!sessionId) {
      const saved = await saveSession();
      if (!saved?.id) return;
      sessionId = saved.id;
    }

    try {
      const response = await submitSession(sessionId).unwrap();
      setDraft((current) => ({
        ...current,
        sessionId: response.sessionId,
        status: response.status,
        linkedAdjustmentReferenceNumber: response.linkedAdjustmentReferenceNumber,
      }));

      toast.success(
        response.approvalStatus === 'APPROVED'
          ? 'Stock count adjustment posted.'
          : 'Stock count adjustment request submitted for approval.'
      );
      setSelectedSessionId(response.sessionId);
      return;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit stock count adjustment');
    }
  }

  if (!canAdjust) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock count session</h1>
        <div className="py-12 text-center">
          <p className="text-slate-500 dark:text-slate-400">You do not have permission to create stock count adjustments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300/80">
            Stock control
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Stock count session</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            Load a warehouse count sheet from live stock, enter counted quantities, review variances, then send only the
            variance lines into the controlled bulk adjustment workflow.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Warehouse</label>
            <select
              value={draft.warehouseId}
              onChange={(event) => setDraft((current) => ({ ...current, warehouseId: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Select warehouse</option>
              {activeWarehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Session title</label>
            <input
              type="text"
              value={draft.sessionTitle}
              onChange={(event) => setDraft((current) => ({ ...current, sessionTitle: event.target.value }))}
              placeholder="Main warehouse monthly count"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={loadWarehouseSheet}>
            Load Count Sheet
          </Button>
          <Button type="button" variant="outline" onClick={saveSession} loading={isSaving}>
            {draft.sessionId ? 'Save Session' : 'Create Session'}
          </Button>
          <Button type="button" variant="outline" onClick={resetDraft}>
            Reset Draft
          </Button>
          <Link
            href="/stock/manual-adjustments"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Open Manual Adjustments
          </Link>
          <Link
            href="/reports/stock-count-sessions"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Open Count Report
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Saved count sessions</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Reload a prior draft, follow its adjustment link, or continue a rejected recount.
            </p>
          </div>
          {draft.sessionId ? (
            <div className="text-xs text-slate-500 dark:text-slate-500">
              Revision {draft.currentRevision ?? 0}
              {draft.status ? ` | ${draft.status}` : ''}
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                <th className="px-3 py-3">Updated</th>
                <th className="px-3 py-3">Title</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Variance lines</th>
                <th className="px-3 py-3">Adjustment</th>
              </tr>
            </thead>
            <tbody>
              {savedSessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    No saved count sessions yet.
                  </td>
                </tr>
              ) : (
                savedSessions.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40 ${selectedSessionId === row.id ? 'ring-1 ring-emerald-500' : ''}`}
                    onClick={() => setSelectedSessionId(row.id)}
                  >
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{new Date(row.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-slate-900 dark:text-white">{row.title}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.warehouseName}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.status}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.varianceLineCount ?? 0}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{row.linkedAdjustmentReferenceNumber || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Count lines</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{draft.lines.length}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Variance lines</p>
            <p className="mt-2 text-xl font-semibold text-amber-900 dark:text-amber-100">{adjustmentLines.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Largest negative</p>
            <p className="mt-2 text-xl font-semibold text-slate-900 dark:text-white">{formatQty(maxNegativeVariance)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">Draft persistence</p>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">Saved in browser</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_220px_auto]">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Search material</label>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Material name..."
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showVarianceOnly}
                onChange={(event) => setShowVarianceOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Show variances only
            </label>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Enter counted quantity. Variance is calculated as counted minus system quantity.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                <th className="min-w-[240px] px-3 py-3">Material</th>
                <th className="min-w-[120px] px-3 py-3 text-right">System qty</th>
                <th className="min-w-[140px] px-3 py-3">Counted qty</th>
                <th className="min-w-[120px] px-3 py-3 text-right">Variance</th>
                <th className="min-w-[120px] px-3 py-3 text-right">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    {draft.lines.length === 0 ? 'Load a warehouse count sheet to begin.' : 'No lines match your filters.'}
                  </td>
                </tr>
              ) : (
                filteredLines.map((line) => (
                  <tr key={line.materialId} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-white">{line.materialName}</div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">{line.unit}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(line.systemQty)}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        step="0.001"
                        value={line.countedQty}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            lines: current.lines.map((item) =>
                              item.materialId === line.materialId ? updateStockCountVariance(item, event.target.value) : item
                            ),
                          }))
                        }
                        placeholder="Enter counted qty"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${line.varianceQty > 0.0005 ? 'text-emerald-700 dark:text-emerald-300' : line.varianceQty < -0.0005 ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}>
                      {formatQty(line.varianceQty)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{formatQty(line.unitCost)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedSession?.revisions?.length ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Session history</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Recount saves, submit events, and approval outcomes for the selected session.
              </p>
            </div>
            {selectedSession.linkedAdjustmentReferenceNumber ? (
              <div className="text-xs text-slate-500 dark:text-slate-500">
                Adjustment {selectedSession.linkedAdjustmentReferenceNumber}
              </div>
            ) : null}
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                  <th className="px-3 py-3">Revision</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">By</th>
                  <th className="px-3 py-3">At</th>
                </tr>
              </thead>
              <tbody>
                {selectedSession.revisions.map((revision) => (
                  <tr key={revision.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800/80 dark:odd:bg-slate-950 dark:even:bg-slate-900/40">
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{revision.revisionNumber}</td>
                    <td className="px-3 py-2.5 text-slate-900 dark:text-white">{revision.action}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{revision.savedByName || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-300">{new Date(revision.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="max-w-3xl">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Variance to adjustment request</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            This submits only the variance lines into the existing manual adjustment approval flow with `Physical count` evidence.
          </p>
        </div>

        {maxNegativeVariance >= stockControlSettings.negativeEvidenceQtyThreshold ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
            Largest negative variance: {formatQty(maxNegativeVariance)}. Detailed evidence notes are required.
            {maxNegativeVariance >= stockControlSettings.negativeDecisionNoteQtyThreshold
              ? ' Approval will also require a decision note.'
              : ''}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Count sheet reference</label>
            <input
              type="text"
              value={draft.evidenceReference}
              onChange={(event) => setDraft((current) => ({ ...current, evidenceReference: event.target.value }))}
              placeholder="COUNT-APR-WH1"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Session notes</label>
            <input
              type="text"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Optional approval note"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Evidence notes</label>
          <textarea
            value={draft.evidenceNotes}
            onChange={(event) => setDraft((current) => ({ ...current, evidenceNotes: event.target.value }))}
            rows={4}
            placeholder="Who counted, when, and what variance sheet supports this count?"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-emerald-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" loading={isLoading} onClick={submitCountAdjustment}>
            {isSA ? 'Post Count Adjustment' : 'Submit Count Adjustment'}
          </Button>
        </div>
      </section>
    </div>
  );
}
