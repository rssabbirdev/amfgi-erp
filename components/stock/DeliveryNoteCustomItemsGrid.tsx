'use client';

import { Copy, ListOrdered, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeliveryNoteCustomItem {
  id: string;
  lineNo: string;
  name: string;
  description: string;
  unit: string;
  qty: string;
}

const GRID_TEMPLATE_COLUMNS = '88px minmax(200px, 1.4fr) minmax(220px, 1.6fr) 100px 100px 72px';

const cellInputClassName =
  'w-full border-0 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0';

const multilineCellClassName = cn(
  cellInputClassName,
  'min-h-[3.25rem] resize-y leading-snug whitespace-pre-wrap'
);

interface DeliveryNoteCustomItemsGridProps {
  items: DeliveryNoteCustomItem[];
  lineNoAuto: boolean;
  onLineNoAutoChange: (auto: boolean) => void;
  onUpdateItem: (id: string, field: keyof Omit<DeliveryNoteCustomItem, 'id'>, value: string) => void;
  onDuplicateItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
}

export default function DeliveryNoteCustomItemsGrid({
  items,
  lineNoAuto,
  onLineNoAutoChange,
  onUpdateItem,
  onDuplicateItem,
  onRemoveItem,
}: DeliveryNoteCustomItemsGridProps) {
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div className="min-w-max bg-card">
        <div
          className="grid border-b border-border bg-muted/50"
          style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
        >
          {[
            { key: 'line', label: 'No.', align: 'center' as const },
            { key: 'name', label: 'Item name', align: 'left' as const },
            { key: 'description', label: 'Description', align: 'left' as const },
            { key: 'unit', label: 'Unit', align: 'center' as const },
            { key: 'qty', label: 'Qty', align: 'right' as const },
            { key: 'actions', label: '', align: 'center' as const },
          ].map((column) => (
            <div
              key={column.key}
              className={cn(
                'flex min-w-0 items-center border-r border-border py-1 pl-2 pr-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground last:border-r-0',
                column.align === 'right' && 'justify-end',
                column.align === 'center' && 'justify-center'
              )}
            >
              {column.key === 'line' ? (
                <div className="flex w-full flex-col items-center gap-1 py-0.5">
                  <span className="min-w-0 truncate normal-case tracking-normal">{column.label}</span>
                  <button
                    type="button"
                    onClick={() => onLineNoAutoChange(!lineNoAuto)}
                    title={
                      lineNoAuto
                        ? 'Auto numbering (1, 2, 3…). Click for manual entry.'
                        : 'Manual numbering. Click for auto serial numbers.'
                    }
                    className={cn(
                      'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal transition-colors',
                      lineNoAuto
                        ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <ListOrdered className="h-3 w-3 shrink-0" />
                    {lineNoAuto ? 'Auto' : 'Manual'}
                  </button>
                </div>
              ) : (
                <span className="min-w-0 truncate">{column.label}</span>
              )}
            </div>
          ))}
        </div>

        {items.map((item, index) => (
            <div
              key={item.id}
              className="grid items-start border-b border-border hover:bg-muted/40"
              style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
            >
              <div className="border-r border-border">
                {lineNoAuto ? (
                  <div className="px-2 py-3 text-center font-mono text-xs text-muted-foreground">{index + 1}</div>
                ) : (
                  <input
                    type="text"
                    value={item.lineNo}
                    onChange={(e) => onUpdateItem(item.id, 'lineNo', e.target.value)}
                    placeholder="No."
                    className={cn(cellInputClassName, 'text-center font-mono text-xs')}
                  />
                )}
              </div>
              <div className="min-w-0 border-r border-border">
                <textarea
                  value={item.name}
                  onChange={(e) => onUpdateItem(item.id, 'name', e.target.value)}
                  placeholder="e.g. Steel pipe"
                  rows={2}
                  className={multilineCellClassName}
                />
              </div>
              <div className="min-w-0 border-r border-border">
                <textarea
                  value={item.description}
                  onChange={(e) => onUpdateItem(item.id, 'description', e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  className={multilineCellClassName}
                />
              </div>
              <div className="border-r border-border">
                <input
                  type="text"
                  value={item.unit}
                  onChange={(e) => onUpdateItem(item.id, 'unit', e.target.value)}
                  placeholder="Unit"
                  className={cn(cellInputClassName, 'text-center')}
                />
              </div>
              <div className="border-r border-border">
                <input
                  type="text"
                  value={item.qty}
                  onChange={(e) => onUpdateItem(item.id, 'qty', e.target.value)}
                  placeholder="Qty"
                  className={cn(cellInputClassName, 'text-right')}
                />
              </div>
              <div className="flex items-center justify-center gap-0.5 px-1 py-2">
                <button
                  type="button"
                  onClick={() => onDuplicateItem(item.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                  title="Duplicate row"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  title="Remove row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
