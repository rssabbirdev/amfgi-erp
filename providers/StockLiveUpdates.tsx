'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useStore } from 'react-redux';
import { appApi } from '@/store/api/appApi';
import { adminApi } from '@/store/api/adminApi';
import { useAppDispatch } from '@/store/hooks';
import type { RootState } from '@/store/store';

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
  const { data: session, status } = useSession();
  const activeCompanyId = session?.user?.activeCompanyId;
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
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
    const state = store.getState();

    const materialListArgs = selectCachedArgs(appApi, state, 'getMaterials');
    const materialByIdArgs = selectCachedArgs(appApi, state, 'getMaterialById');
    const dispatchEntriesArgs = selectCachedArgs(appApi, state, 'getDispatchEntries');
    const receiptEntriesArgs = selectCachedArgs(appApi, state, 'getReceiptEntries');
    const stockBatchesArgs = selectCachedArgs(appApi, state, 'getStockBatches');
    const stockValuationArgs = selectCachedArgs(appApi, state, 'getStockValuation');
    const consumptionArgs = selectCachedArgs(appApi, state, 'getConsumption');
    const transferLedgerArgs = selectCachedArgs(appApi, state, 'getTransferLedger');
    const materialLogsArgs = selectCachedArgs(appApi, state, 'getMaterialLogs');
    const priceLogsArgs = selectCachedArgs(appApi, state, 'getPriceLogs');
    const inventoryByWarehouseArgs = selectCachedArgs(appApi, state, 'getInventoryByWarehouse');
    const transactionsByJobArgs = selectCachedArgs(appApi, state, 'getTransactionsByJob');
    const dispatchEntryArgs = selectCachedArgs(appApi, state, 'getDispatchEntry');

    await Promise.allSettled([
      ...materialListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/materials');
        upsertQueryData(appApi, 'getMaterials', arg, json.data);
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
      ...stockValuationArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/reports/stock-valuation');
        upsertQueryData(appApi, 'getStockValuation', arg, json.data);
      }),
      ...consumptionArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/reports/consumption');
        upsertQueryData(appApi, 'getConsumption', arg, json.data);
      }),
      ...transferLedgerArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/transactions/transfers');
        upsertQueryData(appApi, 'getTransferLedger', arg, json.data);
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
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedCustomerQueries = useCallback(async () => {
    const state = store.getState();
    const customerListArgs = selectCachedArgs(appApi, state, 'getCustomers');

    await Promise.allSettled(
      customerListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/customers');
        upsertQueryData(appApi, 'getCustomers', arg, json.data);
      })
    );
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedSupplierQueries = useCallback(async () => {
    const state = store.getState();
    const supplierListArgs = selectCachedArgs(appApi, state, 'getSuppliers');
    const supplierByIdArgs = selectCachedArgs(appApi, state, 'getSupplierById');

    await Promise.allSettled([
      ...supplierListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/suppliers');
        upsertQueryData(appApi, 'getSuppliers', arg, json.data);
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
    const jobByIdArgs = selectCachedArgs(appApi, state, 'getJobById');
    const jobMaterialsArgs = selectCachedArgs(appApi, state, 'getJobMaterials');

    await Promise.allSettled([
      ...jobListArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/jobs');
        upsertQueryData(appApi, 'getJobs', arg, json.data);
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

  const refreshCachedAdminQueries = useCallback(async () => {
    const state = store.getState();
    const companyArgs = selectCachedArgs(adminApi, state, 'getCompanies');
    const companyProfileArgs = selectCachedArgs(adminApi, state, 'getCompanyProfiles');
    const userArgs = selectCachedArgs(adminApi, state, 'getUsers');
    const roleArgs = selectCachedArgs(adminApi, state, 'getRoles');

    await Promise.allSettled([
      ...companyArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/companies');
        upsertQueryData(adminApi, 'getCompanies', arg, json.data);
      }),
      ...companyProfileArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/company-profiles');
        upsertQueryData(adminApi, 'getCompanyProfiles', arg, json.data);
      }),
      ...userArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/users');
        upsertQueryData(adminApi, 'getUsers', arg, json.data);
      }),
      ...roleArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/roles');
        upsertQueryData(adminApi, 'getRoles', arg, json.data);
      }),
    ]);
  }, [fetchJson, selectCachedArgs, store, upsertQueryData]);

  const refreshCachedHrQueries = useCallback(async () => {
    const state = store.getState();
    const employeeArgs = selectCachedArgs(appApi, state, 'getHrEmployees');
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
      ...scheduleArgs.map(async (arg) => {
        const json = await fetchJson<{ data: unknown }>('/api/hr/schedule');
        upsertQueryData(appApi, 'getHrSchedules', arg, json.data);
      }),
      ...attendanceOverviewArgs.map(async (arg) => {
        if (typeof arg !== 'string' || !arg) return;
        const json = await fetchJson<{ data: unknown }>(
          `/api/hr/attendance/overview?workDate=${encodeURIComponent(arg)}`
        );
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
          await refreshCachedAdminQueries();
          return;
        case 'hr':
          await refreshCachedHrQueries();
          return;
      }
    },
    [
      refreshCachedAdminQueries,
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
    if (status !== 'authenticated' || !activeCompanyId) return;

    const source = new EventSource('/api/live-updates');

    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as LiveUpdateMessage;
        if (payload.type === 'connected') return;
        if (!payload.channel) return;
        if (payload.companyId !== activeCompanyId && payload.companyId !== 'GLOBAL') return;

        queueSilentRefresh(payload.channel);
      } catch {}
    };

    return () => {
      source.close();
    };
  }, [activeCompanyId, queueSilentRefresh, status]);

  return null;
}
