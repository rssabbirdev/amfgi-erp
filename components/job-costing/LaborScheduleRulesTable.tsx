'use client';

import { ChevronDown, ChevronUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LaborScheduleRuleRow = {
  id: string;
  expertiseName: string;
  quantityExpression: string;
  crewSizeExpression: string;
  productivityPerWorkerPerDay: string;
  scheduleDaysExpression: string;
  preview: string;
};

type BuilderActions = {
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
};

function toneClasses() {
  return {
    shell: 'w-full overflow-x-auto rounded-xl border border-amber-100 bg-white dark:border-amber-500/20 dark:bg-slate-950/70',
    head: 'bg-amber-50 text-[11px] uppercase tracking-[0.16em] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200',
    formulaMono: 'font-mono text-amber-700 dark:text-amber-300',
  };
}

export function LaborScheduleRulesTable({
  rows,
  builderActions,
}: {
  rows: LaborScheduleRuleRow[];
  builderActions: BuilderActions;
}) {
  const classes = toneClasses();

  if (rows.length === 0) return null;

  return (
    <div className={classes.shell}>
      <table className="w-full min-w-208 text-left text-sm">
        <thead className={classes.head}>
          <tr>
            <th className="w-10 px-3 py-2.5 font-semibold">#</th>
            <th className="min-w-40 px-3 py-2.5 font-semibold">Expertise</th>
            <th className="min-w-56 px-3 py-2.5 font-semibold">Work quantity</th>
            <th className="min-w-36 px-3 py-2.5 font-semibold">Crew size</th>
            <th className="min-w-40 px-3 py-2.5 font-semibold">Productivity / day</th>
            <th className="min-w-44 px-3 py-2.5 font-semibold">Schedule days</th>
            <th className="min-w-40 px-3 py-2.5 font-semibold">Preview</th>
            <th className="w-36 px-3 py-2.5 text-right font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t border-amber-100 dark:border-amber-500/15">
              <td className="px-3 py-2.5 text-muted-foreground">{index + 1}</td>
              <td className="px-3 py-2.5 font-medium text-foreground">{row.expertiseName || 'Unnamed expertise'}</td>
              <td className={cn('px-3 py-2.5 text-xs', classes.formulaMono)}>
                <span className="line-clamp-2 break-all">{row.quantityExpression || '—'}</span>
              </td>
              <td className={cn('px-3 py-2.5 text-xs', classes.formulaMono)}>
                <span className="line-clamp-2 break-all">{row.crewSizeExpression || '—'}</span>
              </td>
              <td className={cn('px-3 py-2.5 text-xs', classes.formulaMono)}>
                <span className="line-clamp-2 break-all">{row.productivityPerWorkerPerDay || '—'}</span>
              </td>
              <td className={cn('px-3 py-2.5 text-xs', classes.formulaMono)}>
                <span className="line-clamp-2 break-all">{row.scheduleDaysExpression || 'auto'}</span>
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                <span className="line-clamp-2">{row.preview || '—'}</span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    onClick={() => builderActions.onEdit(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => builderActions.onDuplicate(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!builderActions.canMoveUp(row.id)}
                    onClick={() => builderActions.onMoveUp(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={!builderActions.canMoveDown(row.id)}
                    onClick={() => builderActions.onMoveDown(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    title="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => builderActions.onRemove(row.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
