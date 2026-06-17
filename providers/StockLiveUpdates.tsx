'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from 'react-redux';
import { appApi } from '@/store/api/appApi';
import { adminApi } from '@/store/api/adminApi';
import { STOCK_LEDGER_INVALIDATES } from '@/store/api/stockInvalidation';
import { useAppDispatch } from '@/store/hooks';
import { switchActiveCompany } from '@/store/slices/companySlice';
import type { RootState } from '@/store/store';
import { isPermissionAffectingLiveUpdate } from '@/lib/live-updates/client';
import type { Permission } from '@/lib/permissions';

type LiveUpdateChannel =
  | 'stock'
  | 'customers'
  | 'suppliers'
  | 'jobs'
  | 'settings'
  | 'admin'
  | 'hr';

interface LiveUpdateMessage {
  companyId?: string;
  channel?: LiveUpdateChannel;
  action?: string;
  entity?: string;
  type?: string;
  at?: string;
}

type ApiWithUtils = typeof appApi | typeof adminApi;

export default function StockLiveUpdates() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const { data: session, status, update } = useSession();
  const activeCompanyId = session?.user?.activeCompanyId;
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const sessionRefreshInFlightRef = useRef(false);
  const pendingChannelsRef = useRef(new Set<LiveUpdateChannel>());

  const fetchJson = useCallback(async <T,>(url: string) => {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) {
      throw new Error(`Failed to refresh ${url}`);
    }
    return (await response.json()) as T;
  }, []);

  const selectCachedArgs = useCallback(
    (api: ApiWithUtils, state: RootState, endpointName: string) => {
      return ((api.util as unknown as {
        selectCachedArgsForQuery: (s: RootState, e: string) => unknown[];
      }).selectCachedArgsForQuery(state, endpointName) ?? []) as unknown[];
    },
    []
  );

  const upsertQueryData = useCallback(
    (api: ApiWithUtils, endpointName: string, arg: unknown, data: unknown) => {
      (dispatch as unknown as (action: unknown) => void)(
        (api.util as unknown as {
          upsertQueryData: (endpoint: string, queryArg: unknown, value: unknown) => unknown;
        }).upsertQueryData(endpointName, arg, data)
      );
    },
    [dispatch]
  );

  const refreshCachedStockQueries = useCallback(async () => {
    dispatch(appApi.util.invalidateTags(STOCK_LEDGER_INVALIDATES));

    const state = store.getState();

    const materialListArgs = selectCachedArgs(appApi, state, 'getMaterials');
    const materialPageArgs = selectCachedArgs(appApi, state, 'getMaterialsPage');
    const materialByIdArgs = selectCachedArgs(appApi, state, 'getMaterialById');
    const dispatchEntriesArgs = selectCachedArgs(appApi, state, 'getDispatchEntries');
    const dispatchEntriesPageArgs = selectCachedArgs(appApi, state, 'getDispatchEntriesPage');
    const receiptEntriesArgs = selectCachedArgs(appApi, state, 'getReceiptEntries');
    const receiptEntriesPageArgs = selectCachedArgs(appApi, state, 'getReceiptEntriesPage');
    const stockBatchesArgs = selectCachedArgs(appApi, state, 'getStockBatches');
    const stockBatchesPageArgs = selectCachedArgs(appApi, state, 'getStockBatchesPage');
    const stockValuationArgs = selectCachedArgs(appApi, state, 'getStockValuation');
    const stockDashboardStatsArgs = selectCachedArgs(appApi, state, 'getStockDashboardStats');
    const consumptionArgs = selectCachedArgs(appApi, state, 'getConsumption');
    const transferLedgerArgs = selectCachedArgs(appApi, state, 'getTransferLedger');
    const transferLedgerPageArgs = selectCachedArgs(appApi, state, 'getTransferLedgerPage');
    const warehouseTransferPageArgs = selectCachedArgs(appApi, state, 'getWarehouseTransferLedgerPage');
    const materialLogsArgs = selectCachedArgs(appApi, state, 'getMaterialLogs');
    const priceLogsArgs = selectCachedArgs(appApi, state, 'getPriceLogs');
    const inventoryByWarehouseArgs = selectCachedArgs(appApi, state, 'getInventoryByWarehouse');
    const inventoryByWarehousePageArgs = selectCachedArgs(appApi, state, 'getInventoryByWarehousePage');
    const stockIntegrityPageArgs = selectCachedArgs(appApi, state, 'getStockIntegrityPage');
    const transactionsByJobArgs = selectCachedArgs(appApi, state, 'getTransactionsByJob');
    const dispatchEntryArgs = selectCachedArgs(appApi, state, 'getDispatchEntry');

    await Promise.allSettled([
      ...materialListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/materials');
        upsertQueryData(appApi, 'getMaterials', arg, json.data);
      }),
      ...materialPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          limit: number;
          offset: number;
          search?: string;
          sortBy?: string;
          sortDir?: 'asc' | 'desc';
        };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        if (params.sortBy?.trim()) searchParams.set('sortBy', params.sortBy.trim());
        if (params.sortDir) searchParams.set('sortDir', params.sortDir);
        const json = await fetchJson<{ data: unknown }>(`/api/materials?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getMaterialsPage', arg, json.data);
      }),
      ...materialByIdArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data: unknown }>(`/api/materials/${encodeURIComponent(arg)}`);
        upsertQueryData(appApi, 'getMaterialById', arg, json.data);
      }),
      ...dispatchEntriesArgs.map(async (arg) => {
        const params = new URLSearchParams();
        if (arg && typeof arg === 'object' && 'filterType' in arg && typeof arg.filterType === 'string') {
          params.set('filterType', arg.filterType);
        }
        if (arg && typeof arg === 'object' && 'date' in arg && typeof arg.date === 'string') {
          params.set('date', arg.date);
        }
        const query = params.toString();
        const json = await fetchJson<{ data: unknown }>(`/api/materials/dispatch-history-entries${query ? `?${query}` : ''}`);
        upsertQueryData(appApi, 'getDispatchEntries', arg, json.data);
      }),
      ...dispatchEntriesPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          filterType?: string;
          date?: string;
          limit: number;
          offset: number;
          noteType?: string;
          jobSearch?: string;
          deliveryNoteSearch?: string;
        };
        const searchParams = new URLSearchParams();
        if (params.filterType) searchParams.set('filterType', params.filterType);
        if (params.date) searchParams.set('date', params.date);
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.noteType && params.noteType !== 'all') searchParams.set('noteType', params.noteType);
        if (params.jobSearch?.trim()) searchParams.set('jobSearch', params.jobSearch.trim());
        if (params.deliveryNoteSearch?.trim()) {
          searchParams.set('deliveryNoteSearch', params.deliveryNoteSearch.trim());
        }
        const json = await fetchJson<{ data: { entries: unknown; total: number } }>(
          `/api/materials/dispatch-history-entries?${searchParams.toString()}`,
        );
        upsertQueryData(appApi, 'getDispatchEntriesPage', arg, json.data);
      }),
      ...receiptEntriesArgs.map(async (arg) => {
        const params = new URLSearchParams();
        if (arg && typeof arg === 'object' && 'filterType' in arg && typeof arg.filterType === 'string') {
          params.set('filterType', arg.filterType);
        }
        if (arg && typeof arg === 'object' && 'date' in arg && typeof arg.date === 'string') {
          params.set('date', arg.date);
        }
        const query = params.toString();
        const json = await fetchJson<{ data: { entries: unknown } }>(
          `/api/materials/receipt-history-entries${query ? `?${query}` : ''}`
        );
        upsertQueryData(appApi, 'getReceiptEntries', arg, json.data.entries);
      }),
      ...stockBatchesArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/stock-batches');
        upsertQueryData(appApi, 'getStockBatches', arg, json.data);
      }),
      ...stockBatchesPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as { limit: number; offset: number; search?: string };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        const json = await fetchJson<{ data: unknown }>(`/api/stock-batches?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getStockBatchesPage', arg, json.data);
      }),
      ...receiptEntriesPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          filterType: string;
          date: string;
          limit: number;
          offset: number;
          search?: string;
        };
        const searchParams = new URLSearchParams();
        searchParams.set('filterType', params.filterType);
        searchParams.set('date', params.date);
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        const json = await fetchJson<{ data: { entries: unknown; total: number } }>(
          `/api/materials/receipt-history-entries?${searchParams.toString()}`,
        );
        upsertQueryData(appApi, 'getReceiptEntriesPage', arg, {
          items: json.data.entries,
          total: json.data.total,
        });
      }),
      ...stockValuationArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/reports/stock-valuation');
        upsertQueryData(appApi, 'getStockValuation', arg, json.data);
      }),
      ...stockDashboardStatsArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/stock/dashboard-stats');
        upsertQueryData(appApi, 'getStockDashboardStats', arg, json.data);
      }),
      ...consumptionArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/reports/consumption');
        upsertQueryData(appApi, 'getConsumption', arg, json.data);
      }),
      ...transferLedgerArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/transactions/transfers');
        upsertQueryData(appApi, 'getTransferLedger', arg, json.data);
      }),
      ...transferLedgerPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as { limit: number; offset: number; search?: string };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        const json = await fetchJson<{ data: unknown }>(`/api/transactions/transfers?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getTransferLedgerPage', arg, json.data);
      }),
      ...warehouseTransferPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as { limit: number; offset: number; search?: string };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        const json = await fetchJson<{ data: unknown }>(
          `/api/transactions/warehouse-transfers?${searchParams.toString()}`,
        );
        upsertQueryData(appApi, 'getWarehouseTransferLedgerPage', arg, json.data);
      }),
      ...materialLogsArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data?: unknown } | unknown>(`/api/materials/${encodeURIComponent(arg)}/logs`);
        const data = Array.isArray(json)
          ? json
          : 'data' in (json as Record<string, unknown>)
            ? (json as { data?: unknown }).data ?? []
            : [];
        upsertQueryData(appApi, 'getMaterialLogs', arg, data);
      }),
      ...priceLogsArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data?: unknown } | unknown>(`/api/materials/${encodeURIComponent(arg)}/price-logs`);
        const data = Array.isArray(json)
          ? json
          : 'data' in (json as Record<string, unknown>)
            ? (json as { data?: unknown }).data ?? []
            : [];
        upsertQueryData(appApi, 'getPriceLogs', arg, data);
      }),
      ...inventoryByWarehouseArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/reports/inventory-by-warehouse');
        upsertQueryData(appApi, 'getInventoryByWarehouse', arg, json.data);
      }),
      ...inventoryByWarehousePageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as { limit: number; offset: number; search?: string; warehouseId?: string };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        if (params.warehouseId && params.warehouseId !== 'all') {
          searchParams.set('warehouseId', params.warehouseId);
        }
        const json = await fetchJson<{
          data: { warehouseColumns: unknown; items: unknown; total: number };
        }>(`/api/reports/inventory-by-warehouse?${searchParams.toString()}`);
        const data = json.data;
        upsertQueryData(appApi, 'getInventoryByWarehousePage', arg, {
          warehouseColumns: data.warehouseColumns,
          rows: data.items,
          total: data.total,
        });
      }),
      ...stockIntegrityPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as { limit: number; offset: number; search?: string; filter?: string };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        if (params.filter && params.filter !== 'all') searchParams.set('filter', params.filter);
        const json = await fetchJson<{
          data: { summary: unknown; items: unknown; total: number };
        }>(`/api/reports/stock-integrity?${searchParams.toString()}`);
        const data = json.data;
        upsertQueryData(appApi, 'getStockIntegrityPage', arg, {
          summary: data.summary,
          rows: data.items,
          total: data.total,
        });
      }),
      ...transactionsByJobArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object' || !('jobId' in arg) || typeof arg.jobId !== 'string') return;
        const params = new URLSearchParams();
        params.set('jobId', arg.jobId);
        if ('limit' in arg && typeof arg.limit === 'number') {
          params.set('limit', String(arg.limit));
        }
        const json = await fetchJson<{ data: unknown }>(`/api/transactions?${params.toString()}`);
        upsertQueryData(appApi, 'getTransactionsByJob', arg, json.data);
      }),
      ...dispatchEntryArgs.map(async (arg) => {
        if (
          !arg ||
          typeof arg !== 'object' ||
          !('jobId' in arg) ||
          typeof arg.jobId !== 'string' ||
          !('date' in arg) ||
          typeof arg.date !== 'string'
        ) {
          return;
        }
        const params = new URLSearchParams({ jobId: arg.jobId, date: arg.date });
        const json = await fetchJson<{ data: unknown }>(`/api/transactions/dispatch-entry?${params.toString()}`);
        upsertQueryData(appApi, 'getDispatchEntry', arg, json.data);
      }),
    ]);
  }, [dispatch, fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedCustomerQueries = useCallback(async () => {
    const state = store.getState();
    const customerListArgs = selectCachedArgs(appApi, state, 'getCustomers');
    const customerPageArgs = selectCachedArgs(appApi, state, 'getCustomersPage');

    await Promise.allSettled([
      ...customerListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/customers');
        upsertQueryData(appApi, 'getCustomers', arg, json.data);
      }),
      ...customerPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          limit: number;
          offset: number;
          search?: string;
          status?: string;
        };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        if (params.status && params.status !== 'all') searchParams.set('status', params.status);
        const json = await fetchJson<{ data: unknown }>(`/api/customers?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getCustomersPage', arg, json.data);
      }),
    ]);
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedSupplierQueries = useCallback(async () => {
    const state = store.getState();
    const supplierListArgs = selectCachedArgs(appApi, state, 'getSuppliers');
    const supplierPageArgs = selectCachedArgs(appApi, state, 'getSuppliersPage');
    const supplierByIdArgs = selectCachedArgs(appApi, state, 'getSupplierById');

    await Promise.allSettled([
      ...supplierListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/suppliers');
        upsertQueryData(appApi, 'getSuppliers', arg, json.data);
      }),
      ...supplierPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          limit: number;
          offset: number;
          search?: string;
          source?: string;
        };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        if (params.source && params.source !== 'all') searchParams.set('source', params.source);
        const json = await fetchJson<{ data: unknown }>(`/api/suppliers?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getSuppliersPage', arg, json.data);
      }),
      ...supplierByIdArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data: unknown }>(`/api/suppliers/${encodeURIComponent(arg)}`);
        upsertQueryData(appApi, 'getSupplierById', arg, json.data);
      }),
    ]);
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedJobQueries = useCallback(async () => {
    const state = store.getState();
    const jobListArgs = selectCachedArgs(appApi, state, 'getJobs');
    const jobPageArgs = selectCachedArgs(appApi, state, 'getJobsPage');
    const jobByIdArgs = selectCachedArgs(appApi, state, 'getJobById');
    const jobMaterialsArgs = selectCachedArgs(appApi, state, 'getJobMaterials');
    const dailyQuantityLogPendingPageArgs = selectCachedArgs(appApi, state, 'getDailyQuantityLogPendingPage');

    await Promise.allSettled([
      ...jobListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/jobs');
        upsertQueryData(appApi, 'getJobs', arg, json.data);
      }),
      ...jobPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          limit: number;
          offset: number;
          search?: string;
          status?: string;
          scope?: string;
        };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.search?.trim()) searchParams.set('search', params.search.trim());
        if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
        if (params.scope && params.scope !== 'ALL') searchParams.set('scope', params.scope);
        const json = await fetchJson<{ data: unknown }>(`/api/jobs?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getJobsPage', arg, json.data);
      }),
      ...jobByIdArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data: unknown }>(`/api/jobs/${encodeURIComponent(arg)}`);
        upsertQueryData(appApi, 'getJobById', arg, json.data);
      }),
      ...jobMaterialsArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data: unknown }>(`/api/jobs/${encodeURIComponent(arg)}/materials`);
        upsertQueryData(appApi, 'getJobMaterials', arg, json.data);
      }),
      ...dailyQuantityLogPendingPageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as { limit: number; offset: number; status?: string };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
        const json = await fetchJson<{ data: unknown }>(
          `/api/stock/daily-quantity-log/pending?${searchParams.toString()}`,
        );
        upsertQueryData(appApi, 'getDailyQuantityLogPendingPage', arg, json.data);
      }),
    ]);
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedSettingsQueries = useCallback(async () => {
    const state = store.getState();
    const unitArgs = selectCachedArgs(appApi, state, 'getUnits');
    const categoryArgs = selectCachedArgs(appApi, state, 'getCategories');
    const warehouseArgs = selectCachedArgs(appApi, state, 'getWarehouses');

    await Promise.allSettled([
      ...unitArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/units');
        upsertQueryData(appApi, 'getUnits', arg, json.data);
      }),
      ...categoryArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/categories');
        upsertQueryData(appApi, 'getCategories', arg, json.data);
      }),
      ...warehouseArgs.map(async (arg) => {
        const query =
          typeof arg === 'string' && arg.trim().length > 0
            ? `?companyId=${encodeURIComponent(arg)}`
            : '';
        const json = await fetchJson<{ data: unknown }>(`/api/warehouses${query}`);
        upsertQueryData(appApi, 'getWarehouses', arg, json.data);
      }),
    ]);
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshSessionPermissions = useCallback(async () => {
    if (sessionRefreshInFlightRef.current) return;
    sessionRefreshInFlightRef.current = true;
    try {
      const previous = (session?.user?.permissions ?? []) as Permission[];
      const updated = await update();
      const user = updated?.user;
      if (!user) return;

      dispatch(
        switchActiveCompany({
          activeCompanyId: user.activeCompanyId ?? null,
          activeCompanySlug: user.activeCompanySlug ?? null,
          activeCompanyName: user.activeCompanyName ?? null,
          permissions: user.permissions ?? [],
        }),
      );

      const next = (user.permissions ?? []) as Permission[];
      const permissionsChanged =
        previous.length !== next.length ||
        previous.some((permission) => !next.includes(permission));

      if (permissionsChanged) {
        dispatch(appApi.util.resetApiState());
      }
    } finally {
      sessionRefreshInFlightRef.current = false;
    }
  }, [dispatch, session?.user?.permissions, update]);

  const refreshCachedHrQueries = useCallback(async () => {
    const state = store.getState();
    const employeeArgs = selectCachedArgs(appApi, state, 'getHrEmployees');
    const employeePageArgs = selectCachedArgs(appApi, state, 'getHrEmployeesPage');
    const scheduleArgs = selectCachedArgs(appApi, state, 'getHrSchedules');
    const attendanceOverviewArgs = selectCachedArgs(appApi, state, 'getHrAttendanceOverview');
    const documentTypeArgs = selectCachedArgs(appApi, state, 'getHrDocumentTypes');
    const employeeTypeSettingsArgs = selectCachedArgs(appApi, state, 'getHrEmployeeTypeSettings');
    const expertiseArgs = selectCachedArgs(appApi, state, 'getHrExpertises');

    await Promise.allSettled([
      ...employeeArgs.map(async (arg) => {
        const params = new URLSearchParams();
        if (arg && typeof arg === 'object' && 'q' in arg && typeof arg.q === 'string' && arg.q.trim()) {
          params.set('q', arg.q.trim());
        }
        if (
          arg &&
          typeof arg === 'object' &&
          'status' in arg &&
          typeof arg.status === 'string' &&
          arg.status !== 'ALL'
        ) {
          params.set('status', arg.status);
        }
        const query = params.toString();
        const json = await fetchJson<{ data: unknown }>(`/api/hr/employees${query ? `?${query}` : ''}`);
        upsertQueryData(appApi, 'getHrEmployees', arg, json.data);
      }),
      ...employeePageArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object') return;
        const params = arg as {
          limit: number;
          offset: number;
          q?: string;
          status?: string;
          employeeType?: string;
          portal?: string;
        };
        const searchParams = new URLSearchParams();
        searchParams.set('limit', String(params.limit));
        searchParams.set('offset', String(params.offset));
        if (params.q?.trim()) searchParams.set('q', params.q.trim());
        if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
        if (params.employeeType && params.employeeType !== 'ALL') {
          searchParams.set('employeeType', params.employeeType);
        }
        if (params.portal && params.portal !== 'ALL') searchParams.set('portal', params.portal);
        const json = await fetchJson<{ data: unknown }>(`/api/hr/employees?${searchParams.toString()}`);
        upsertQueryData(appApi, 'getHrEmployeesPage', arg, json.data);
      }),
      ...scheduleArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/hr/schedule');
        upsertQueryData(appApi, 'getHrSchedules', arg, json.data);
      }),
      ...attendanceOverviewArgs.map(async (arg) => {
        if (!arg || typeof arg !== 'object' || !('month' in arg)) return;
        const overviewArg = arg as { month: string };
        if (!overviewArg.month) return;
        const params = new URLSearchParams();
        params.set('month', overviewArg.month);
        const json = await fetchJson<{ data: unknown }>(`/api/hr/attendance/overview?${params.toString()}`);
        upsertQueryData(appApi, 'getHrAttendanceOverview', arg, json.data);
      }),
      ...documentTypeArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/hr/document-types');
        upsertQueryData(appApi, 'getHrDocumentTypes', arg, json.data);
      }),
      ...employeeTypeSettingsArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/hr/employee-type-settings');
        upsertQueryData(appApi, 'getHrEmployeeTypeSettings', arg, json.data);
      }),
      ...expertiseArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/hr/expertises');
        upsertQueryData(appApi, 'getHrExpertises', arg, json.data);
      }),
    ]);
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshByChannel = useCallback(
    async (channel: LiveUpdateChannel) => {
      switch (channel) {
        case 'stock':
          await refreshCachedStockQueries();
          return;
        case 'customers':
          await refreshCachedCustomerQueries();
          await refreshCachedJobQueries();
          return;
        case 'suppliers':
          await refreshCachedSupplierQueries();
          return;
        case 'jobs':
          await refreshCachedJobQueries();
          return;
        case 'settings':
          await Promise.allSettled([refreshCachedSettingsQueries(), refreshCachedStockQueries()]);
          return;
        case 'admin':
          dispatch(
            adminApi.util.invalidateTags(['User', 'Role', 'Company', 'CompanyProfile']),
          );
          return;
        case 'hr':
          await refreshCachedHrQueries();
          return;
      }
    },
    [
      dispatch,
      refreshCachedCustomerQueries,
      refreshCachedHrQueries,
      refreshCachedJobQueries,
      refreshCachedSettingsQueries,
      refreshCachedStockQueries,
      refreshCachedSupplierQueries,
    ]
  );

  const queueSilentRefresh = useCallback(
    (channel: LiveUpdateChannel) => {
      pendingChannelsRef.current.add(channel);

      if (refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = (async () => {
        try {
          while (pendingChannelsRef.current.size > 0) {
            const channels = Array.from(pendingChannelsRef.current);
            pendingChannelsRef.current.clear();
            await Promise.allSettled(channels.map((pendingChannel) => refreshByChannel(pendingChannel)));
          }
        } finally {
          refreshInFlightRef.current = null;
        }
      })();
    },
    [refreshByChannel]
  );

  useEffect(() => {
    if (status !== 'authenticated') return;

    const source = new EventSource('/api/live-updates');

    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as LiveUpdateMessage;
        if (payload.type === 'connected') return;
        if (!payload.channel) return;
        if (payload.companyId !== activeCompanyId && payload.companyId !== 'GLOBAL') return;

        if (isPermissionAffectingLiveUpdate(payload)) {
          void refreshSessionPermissions();
        }

        queueSilentRefresh(payload.channel);
      } catch {}
    };

    return () => {
      source.close();
    };
  }, [activeCompanyId, queueSilentRefresh, refreshSessionPermissions, status]);

  return null;
}
