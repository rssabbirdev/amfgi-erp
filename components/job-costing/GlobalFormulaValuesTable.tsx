'use client';

import { ChevronDown, ChevronUp, Copy, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type GlobalFormulaValueRow = {
  id: string;
  label: string;
  key: string;
  value: string;
  unit?: string;
  preview?: string;
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

function toneClasses(tone: 'default' | 'playground' | 'builder') {
  if (tone === 'playground') {
    return {
      shell: 'overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950',
      head: 'bg-slate-100 text-[11px] uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-900 dark:text-slate-400',
      input:
        'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white',
      mono: 'font-mono text-cyan-700 dark:text-cyan-300',
    };
  }
  if (tone === 'builder') {
    return {
      shell: 'overflow-x-auto rounded-xl border border-cyan-100 bg-white dark:border-cyan-500/20 dark:bg-slate-950/70',
      head: 'bg-cyan-50 text-[11px] uppercase tracking-[0.16em] text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-200',
      input:
        'w-full rounded-lg border border-cyan-100 bg-cyan-50/40 px-2.5 py-2 font-mono text-sm text-slate-900 outline-none focus:border-cyan-300 dark:border-cyan-500/20 dark:bg-slate-900 dark:text-white',
      mono: 'font-mono text-cyan-700 dark:text-cyan-300',
    };
  }
  return {
    shell: 'overflow-x-auto rounded-xl border border-border bg-white dark:border-border dark:bg-card',
    head: 'bg-muted/50 text-[11px] uppercase tracking-[0.16em] text-muted-foreground',
    input:
      'w-full rounded-lg border border-border bg-background px-2.5 py-2 font-mono text-sm text-foreground outline-none focus:border-emerald-300 dark:border-border dark:bg-background',
    mono: 'font-mono text-cyan-700 dark:text-cyan-300',
  };
}

export function GlobalFormulaValuesTable({
  rows,
  tone = 'default',
  mode,
  showOverrideColumn = false,
  getOverrideValue,
  onOverrideChange,
  builderActions,
  formatKeyToken,
}: {
  rows: GlobalFormulaValueRow[];
  tone?: 'default' | 'playground' | 'builder';
  mode: 'builder' | 'readonly' | 'override';
  showOverrideColumn?: boolean;
  getOverrideValue?: (key: string) => string;
  onOverrideChange?: (key: string, value: string) => void;
  builderActions?: BuilderActions;
  formatKeyToken?: (key: string) => string;
}) {
  const classes = toneClasses(tone);
  const showOverride = mode === 'override' || (mode === 'readonly' && showOverrideColumn);
  const keyToken = formatKeyToken ?? ((key: string) => (key ? `formula.${key}` : 'formula.key'));

  if (rows.length === 0) return null;

  return (
    <div className={classes.shell}>
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className={classes.head}>
          <tr>
            <th className="w-10 px-3 py-2.5 font-semibold">#</th>
            <th className="min-w-[10rem] px-3 py-2.5 font-semibold">Label</th>
            <th className="min-w-[9rem] px-3 py-2.5 font-semibold">Key</th>
            <th className="min-w-[12rem] px-3 py-2.5 font-semibold">
              {mode === 'builder' ? 'Formula / value' : 'Default'}
            </th>
            <th className="w-24 px-3 py-2.5 font-semibold">Unit</th>
            {mode === 'builder' ? (
              <th className="min-w-[8rem] px-3 py-2.5 font-semibold">Preview</th>
            ) : null}
            {showOverride ? (
              <th className="min-w-[12rem] px-3 py-2.5 font-semibold">Override</th>
            ) : null}
            {mode === 'builder' ? <th className="w-36 px-3 py-2.5 text-right font-semibold" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="border-t border-border dark:border-border">
              <td className="px-3 py-2 text-muted-foreground">{index + 1}</td>
              <td className="px-3 py-2 font-medium text-foreground">{row.label || 'Untitled value'}</td>
              <td className={cn('px-3 py-2 text-xs', classes.mono)}>{keyToken(row.key)}</td>
              <td className="px-3 py-2">
                <span className="break-all font-mono text-xs text-muted-foreground">{row.value || '0'}</span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.unit || '—'}</td>
              {mode === 'builder' ? (
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.preview ?? '—'}</td>
              ) : null}
              {showOverride ? (
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={getOverrideValue?.(row.key) ?? ''}
                    onChange={(event) => onOverrideChange?.(row.key, event.target.value)}
                    placeholder={`Default: ${row.value || '0'}`}
                    className={classes.input}
                  />
                </td>
              ) : null}
              {mode === 'builder' && builderActions ? (
                <td className="px-3 py-2">
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
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
