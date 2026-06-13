'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';

import {
  buildHubLinks,
  WorkspaceHubHeader,
  WorkspaceHubQuickActions,
  WorkspaceHubSection,
  WorkspaceHubSectionHeader,
  WorkspaceHubSectionsGrid,
  type WorkspaceHubSectionData,
  type WorkspaceHubTone,
} from '@/components/workspace';
import { Badge } from '@/components/ui/shadcn/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import {
  canTransferWarehouse,
  canViewJobBudget,
  canViewProductionLog,
  canViewStockCountSession,
  canViewWarehouseTransfer,
} from '@/lib/permissions/stockModuleAccess';
import { useGetStockIntegrityQuery, useGetStockValuationQuery } from '@/store/hooks';

function splitMoney(value: number, currencyCode: string) {
  const formatted = value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return { currency: currencyCode, amount: formatted };
}

function formatMoney(value: number, currencyCode: string) {
  return `${currencyCode} ${value.toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}


function ValuationPanel({
  valuationLoading,
  preferredMoney,
  preferredMethod,
  currentMoney,
  warehouseBreakdown,
  fallbackWarehouseName,
  currencyCode,
}: {
  valuationLoading: boolean;
  preferredMoney: { currency: string; amount: string };
  preferredMethod: string;
  currentMoney: { currency: string; amount: string };
  warehouseBreakdown: { warehouseId: string | number; warehouseName: string; stockValue: number }[];
  fallbackWarehouseName: string | null;
  currencyCode: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-labelledby="stock-valuation-heading"
    >
      <WorkspaceHubSectionHeader
        headingId="stock-valuation-heading"
        title="Valuation"
        description="Company preferred method versus current material cost, then warehouse value coverage."
      />

      <div className="space-y-4 p-3 sm:p-4">
        <div className="grid max-w-2xl grid-cols-2 gap-2 sm:gap-3">
          <Card className="border-border bg-muted/20 shadow-none">
            <CardHeader className="gap-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-primary">Preferred</p>
                <span className="text-[10px] font-medium text-muted-foreground">{preferredMoney.currency}</span>
              </div>
              <CardTitle className="text-base font-semibold tabular-nums leading-tight tracking-tight sm:text-lg">
                {valuationLoading ? '…' : preferredMoney.amount}
              </CardTitle>
              <CardDescription className="text-[10px] leading-snug">{preferredMethod} stock value</CardDescription>
              <Badge variant="secondary" className="mt-0.5 h-5 w-fit px-1.5 text-[9px] uppercase tracking-wide">
                Company preferred
              </Badge>
            </CardHeader>
          </Card>
          <Card className="border-border bg-muted/20 shadow-none">
            <CardHeader className="gap-1 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Comparison</p>
                <span className="text-[10px] font-medium text-muted-foreground">{currentMoney.currency}</span>
              </div>
              <CardTitle className="text-base font-semibold tabular-nums leading-tight tracking-tight sm:text-lg">
                {valuationLoading ? '…' : currentMoney.amount}
              </CardTitle>
              <CardDescription className="text-[10px] leading-snug">Current material cost value</CardDescription>
            </CardHeader>
          </Card>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Warehouse coverage</p>
          {warehouseBreakdown.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {fallbackWarehouseName
                ? `No warehouse balances yet. System reference: ${fallbackWarehouseName}.`
                : 'No warehouse balances yet.'}
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {warehouseBreakdown.slice(0, 6).map((warehouse) => (
                <div
                  key={String(warehouse.warehouseId)}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-foreground">{warehouse.warehouseName}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatMoney(warehouse.stockValue, currencyCode)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function StockPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;

  const canSeeMaterials = isSA || perms.includes('material.view');
  const canSeeReceipts = isSA || perms.includes('transaction.stock_in');
  const canSeeDispatch = isSA || perms.includes('transaction.stock_out');
  const canSeeBatches = isSA || perms.includes('material.view') || perms.includes('transaction.stock_in');
  const canSeeInterCoTransfers = isSA || perms.includes('transaction.transfer');
  const canSeeWarehouseTransfers = canViewWarehouseTransfer(perms, isSA);
  const canSeeReconcile = isSA || perms.includes('transaction.reconcile');
  const canSeeManualAdjustments = isSA || perms.includes('transaction.adjust');
  const canSeeCountSessions = canViewStockCountSession(perms, isSA);
  const canSeeJobBudget = canViewJobBudget(perms, isSA);
  const canSeeProductionLog = canViewProductionLog(perms, isSA);
  const canViewStock =
    canSeeMaterials ||
    canSeeReceipts ||
    canSeeDispatch ||
    canSeeBatches ||
    canSeeInterCoTransfers ||
    canSeeWarehouseTransfers ||
    canSeeReconcile ||
    canSeeManualAdjustments ||
    canSeeCountSessions ||
    canSeeJobBudget ||
    canSeeProductionLog;
  const canSeeMasterData = isSA || perms.includes('settings.manage') || perms.includes('material.view');

  const { data: valuation, isFetching: valuationLoading } = useGetStockValuationQuery(undefined, {
    skip: !canViewStock,
  });
  const { data: stockIntegrity, isFetching: integrityLoading } = useGetStockIntegrityQuery(undefined, {
    skip: !canViewStock,
  });

  const integrityExceptionCount = stockIntegrity?.summary.materialsWithExceptions ?? 0;

  const preferredValue = valuation?.summary.totalStockValue ?? 0;
  const currencyCode = valuation?.summary.currencyCode ?? 'AED';
  const preferredMethod = valuation?.summary.preferredMethod ?? 'FIFO';
  const currentValue = valuation?.summary.currentStockValue ?? 0;
  const fallbackWarehouseName = valuation?.summary.fallbackWarehouseName ?? null;
  const warehouseBreakdown = valuation?.warehouseBreakdown ?? [];
  const preferredMoney = splitMoney(preferredValue, currencyCode);
  const currentMoney = splitMoney(currentValue, currencyCode);

  const quickActions = useMemo(() => {
    const actions: { href: string; label: string }[] = [];
    if (canSeeReceipts) {
      actions.push({ href: '/stock/goods-receipt/receive', label: 'New receipt' });
    }
    if (canSeeDispatch) {
      actions.push({ href: '/stock/dispatch/entry', label: 'New dispatch' });
      actions.push({ href: '/stock/dispatch/delivery-note', label: 'Delivery note' });
    }
    if (canTransferWarehouse(perms, isSA)) {
      actions.push({ href: '/stock/warehouse-transfers/new', label: 'Warehouse transfer' });
    }
    return actions;
  }, [canSeeReceipts, canSeeDispatch, isSA, perms]);

  const sections: WorkspaceHubSectionData[] = [
    {
      id: 'master-data',
      title: 'Materials & master data',
      description: 'Item master, units, categories, and warehouse setup.',
      links: [
        ...buildHubLinks(
          canSeeMaterials
            ? [
                {
                  href: '/stock/materials',
                  title: 'Materials',
                  description: 'Maintain items, UOM, stock definitions, and current balance.',
                  tone: 'emerald',
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeMasterData
            ? [
                {
                  href: '/stock/master-data',
                  title: 'Master data',
                  description: 'Units, material categories, and warehouses used across stock.',
                  badge: 'Setup',
                  tone: 'muted',
                },
              ]
            : [],
        ),
      ],
    },
    {
      id: 'receipt-dispatch',
      title: 'Receipt & dispatch',
      description: 'Post incoming stock and issue material to jobs.',
      links: [
        ...buildHubLinks(
          canSeeReceipts
            ? [
                {
                  href: '/stock/goods-receipt',
                  title: 'Goods receipt',
                  description: 'Create receipts, reopen bills, and trace incoming stock.',
                  tone: 'sky',
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeDispatch
            ? [
                {
                  href: '/stock/dispatch',
                  title: 'Dispatch',
                  description: 'Browse dispatch history, delivery notes, and stock-out status.',
                  tone: 'amber',
                },
              ]
            : [],
        ),
      ],
    },
    {
      id: 'production',
      title: 'Production & planning',
      description: 'Daily production progress and job material budgets.',
      links: [
        ...buildHubLinks(
          canSeeProductionLog
            ? [
                {
                  href: '/stock/daily-quantity-log',
                  title: 'Production log',
                  description: 'Record daily production quantities from the work schedule for tracked jobs.',
                  badge: 'Production',
                  tone: 'sky',
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeJobBudget
            ? [
                {
                  href: '/stock/job-budget',
                  title: 'Job budget & formulas',
                  description: 'Formula templates and variation job material budgets before dispatch.',
                  badge: 'Plan',
                  tone: 'muted',
                },
              ]
            : [],
        ),
      ],
    },
    {
      id: 'inventory',
      title: 'Inventory layers',
      description: 'FIFO batches and warehouse-level balances.',
      links: [
        ...buildHubLinks(
          canSeeBatches
            ? [
                {
                  href: '/stock/stock-batches',
                  title: 'Stock batches',
                  description: 'Inspect FIFO layers, remaining balance, and receipt-by-receipt cost.',
                  tone: 'sky',
                },
                {
                  href: '/stock/inventory-by-warehouse',
                  title: 'Inventory by warehouse',
                  description: 'See each material’s quantity split across warehouses from live balances.',
                  badge: 'Warehouses',
                  tone: 'amber',
                },
              ]
            : [],
        ),
      ],
    },
    {
      id: 'transfers',
      title: 'Transfers',
      description: 'Move stock between companies, warehouses, or non-stock job allocations.',
      links: [
        ...buildHubLinks(
          canSeeInterCoTransfers
            ? [
                {
                  href: '/stock/inter-company-transfers',
                  title: 'Inter-company transfers',
                  description: 'Move stock between companies and review transfer history.',
                  badge: 'Inter-co',
                  tone: 'muted',
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeWarehouseTransfers
            ? [
                {
                  href: '/stock/warehouse-transfers',
                  title: 'Warehouse transfers',
                  description: 'Move FIFO stock between warehouses within the active company.',
                  badge: 'Warehouse',
                  tone: 'emerald',
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeReconcile
            ? [
                {
                  href: '/stock/issue-reconcile',
                  title: 'Issue reconcile',
                  description: 'Allocate non-stock material quantities to variation jobs and review past entries.',
                  badge: 'Non-stock',
                  tone: 'sky',
                },
              ]
            : [],
        ),
      ],
    },
    {
      id: 'review',
      title: 'Review & control',
      description: 'Validate balances, approve corrections, and run physical stock counts.',
      links: [
        ...buildHubLinks(
          canViewStock
            ? [
                {
                  href: '/stock/integrity',
                  title: 'Stock integrity',
                  description: 'Compare company stock, warehouse balances, and open FIFO batches.',
                  badge: integrityLoading ? '…' : `${formatCount(integrityExceptionCount)} issues`,
                  tone: (integrityExceptionCount > 0 ? 'amber' : 'muted') satisfies WorkspaceHubTone,
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeManualAdjustments
            ? [
                {
                  href: '/stock/manual-adjustments',
                  title: 'Manual adjustments',
                  description: 'Controlled corrections with approval before balances change.',
                  badge: 'Adjust',
                  tone: 'emerald',
                },
              ]
            : [],
        ),
        ...buildHubLinks(
          canSeeCountSessions
            ? [
                {
                  href: '/stock/count-session',
                  title: 'Stock count session',
                  description: 'Warehouse count sheet, variances, and adjustment requests.',
                  badge: 'Count',
                  tone: 'amber',
                },
              ]
            : [],
        ),
      ],
    },
  ];

  const linkModuleCount =
    quickActions.length + sections.reduce((n, s) => n + s.links.length, 0);

  if (!canViewStock) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stock</CardTitle>
          <CardDescription>You do not have permission to view the stock workspace.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <WorkspaceHubHeader
        eyebrow="Stock workspace"
        title="Stock"
        description="Materials, receipts, production, inventory, transfers, and review. Valuation figures update from live materials and batches."
        trailing={
          valuationLoading || integrityLoading ? 'Refreshing…' : `${linkModuleCount} destinations`
        }
      />

      <ValuationPanel
        valuationLoading={valuationLoading}
        preferredMoney={preferredMoney}
        preferredMethod={preferredMethod}
        currentMoney={currentMoney}
        warehouseBreakdown={warehouseBreakdown}
        fallbackWarehouseName={fallbackWarehouseName}
        currencyCode={currencyCode}
      />

      <WorkspaceHubQuickActions
        actions={quickActions}
        headingId="stock-quick-actions-heading"
        description="Start a receive, dispatch, delivery note, or warehouse transfer."
      />

      <WorkspaceHubSectionsGrid columns={3}>
        {sections.map((section) => (
          <WorkspaceHubSection key={section.id} section={section} />
        ))}
      </WorkspaceHubSectionsGrid>
    </div>
  );
}
