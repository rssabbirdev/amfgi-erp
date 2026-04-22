type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange';

const variants: Record<BadgeVariant, string> = {
  green:  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:ring-emerald-500/30',
  red:    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/50 dark:text-red-300 dark:ring-red-500/30',
  yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:ring-yellow-500/30',
  blue:   'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:ring-blue-500/30',
  gray:   'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-500/30',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:ring-orange-500/30',
};

export function Badge({ label, variant = 'gray' }: { label: string; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${variants[variant]}`}>
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    ACTIVE:    { label: 'Active',     variant: 'green'  },
    COMPLETED: { label: 'Completed',  variant: 'blue'   },
    ON_HOLD:   { label: 'On Hold',    variant: 'yellow' },
    CANCELLED: { label: 'Cancelled',  variant: 'red'    },
    STOCK_IN:  { label: 'Stock In',   variant: 'green'  },
    STOCK_OUT: { label: 'Dispatched', variant: 'orange' },
    RETURN:    { label: 'Return',     variant: 'blue'   },
    ON_LEAVE:  { label: 'On leave',   variant: 'yellow' },
    SUSPENDED: { label: 'Suspended',  variant: 'orange' },
    EXITED:    { label: 'Exited',     variant: 'gray'   },
  };
  const cfg = map[status] ?? { label: status, variant: 'gray' as BadgeVariant };
  return <Badge label={cfg.label} variant={cfg.variant} />;
}
