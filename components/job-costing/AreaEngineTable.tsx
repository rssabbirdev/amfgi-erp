'use client';

import { Fragment, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AreaEngineRow = {
  id: string;
  label: string;
  key: string;
  dynamic: boolean;
  fieldCount: number;
  materialCount: number;
  laborCount: number;
};

type AreaRowActions = {
  onDuplicate: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onRemove: (id: string) => void;
  canMoveUp: (id: string) => boolean;
  canMoveDown: (id: string) => boolean;
};

export function AreaEngineTable({
  areas,
  collapsedAreaIds,
  onToggleCollapsed,
  onLabelChange,
  onKeyChange,
  onDynamicChange,
  rowActions,
  renderAreaDetail,
}: {
  areas: AreaEngineRow[];
  collapsedAreaIds: Record<string, boolean>;
  onToggleCollapsed: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onKeyChange: (id: string, key: string) => void;
  onDynamicChange: (id: string, dynamic: boolean) => void;
  rowActions: AreaRowActions;
  renderAreaDetail: (areaId: string) => ReactNode;
}) {
  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-emerald-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white';
  const monoInputClass = `${inputClass} font-mono`;

  if (areas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/45">
        No area sections yet. Add walls, floors, or other scoped formula groups.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="bg-slate-100 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="w-10 px-3 py-2.5 font-semibold">#</th>
            <th className="min-w-[10rem] px-3 py-2.5 font-semibold">Label</th>
            <th className="min-w-[9rem] px-3 py-2.5 font-semibold">Key</th>
            <th className="w-24 px-3 py-2.5 text-center font-semibold">Repeatable</th>
            <th className="w-20 px-3 py-2.5 text-right font-semibold">Inputs</th>
            <th className="w-24 px-3 py-2.5 text-right font-semibold">Materials</th>
            <th className="w-20 px-3 py-2.5 text-right font-semibold">Labor</th>
            <th className="w-32 px-3 py-2.5 text-right font-semibold" />
          </tr>
        </thead>
        <tbody>
          {areas.map((area, index) => {
            const expanded = !collapsedAreaIds[area.id];
            return (
              <Fragment key={area.id}>
                <tr className="border-t border-slate-200 dark:border-slate-800">
                  <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={area.label}
                      placeholder="Walls"
                      onChange={(event) => onLabelChange(area.id, event.target.value)}
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={area.key}
                      placeholder="walls"
                      onChange={(event) => onKeyChange(area.id, event.target.value)}
                      className={monoInputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={area.dynamic}
                        onChange={(event) => onDynamicChange(area.id, event.target.checked)}
                        className="h-4 w-4 rounded border-border text-emerald-600 focus:ring-emerald-500/20"
                        aria-label={`Repeatable ${area.label || area.key || 'area'}`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{area.fieldCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{area.materialCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{area.laborCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => onToggleCollapsed(area.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title={expanded ? 'Collapse area' : 'Expand area'}
                      >
                        <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded ? 'rotate-180' : '')} />
                      </button>
                      <button
                        type="button"
                        onClick={() => rowActions.onDuplicate(area.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Duplicate area"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!rowActions.canMoveUp(area.id)}
                        onClick={() => rowActions.onMoveUp(area.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        title="Move up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!rowActions.canMoveDown(area.id)}
                        onClick={() => rowActions.onMoveDown(area.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                        title="Move down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => rowActions.onRemove(area.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        title="Remove area"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded ? (
                  <tr className="border-t border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40">
                    <td colSpan={8} className="px-4 py-4">
                      {renderAreaDetail(area.id)}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
