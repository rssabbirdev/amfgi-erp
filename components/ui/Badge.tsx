type BadgeVariant = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange';

const variants: Record<BadgeVariant, string> = {
  green:  'bg-emerald-900/50 text-emerald-300 ring-emerald-500/30',
  red:    'bg-red-900/50 text-red-300 ring-red-500/30',
  yellow: 'bg-yellow-900/50 text-yellow-300 ring-yellow-500/30',
  blue:   'bg-blue-900/50 text-blue-300 ring-blue-500/30',
  gray:   'bg-slate-700/50 text-slate-300 ring-slate-500/30',
  orange: 'bg-orange-900/50 text-orange-300 ring-orange-500/30',
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
