'use client';

import { Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DeliveryNoteCustomItem {
  id: string;
  name: string;
  description: string;
  unit: string;
  qty: string;
}

const GRID_TEMPLATE_COLUMNS = '48px minmax(200px, 1.4fr) minmax(220px, 1.6fr) 100px 100px 72px';

const cellInputClassName =
  'h-full w-full border-0 bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0';

interface DeliveryNoteCustomItemsGridProps {
  items: DeliveryNoteCustomItem[];
  onUpdateItem: (id: string, field: keyof Omit<DeliveryNoteCustomItem, 'id'>, value: string) => void;
  onDuplicateItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
}

export default function DeliveryNoteCustomItemsGrid({
  items,
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
            { key: 'line', label: '#', align: 'left' },
            { key: 'name', label: 'Item name', align: 'left' },
            { key: 'description', label: 'Description', align: 'left' },
            { key: 'unit', label: 'Unit', align: 'center' },
            { key: 'qty', label: 'Qty', align: 'right' },
            { key: 'actions', label: '', align: 'center' },
          ].map((column) => (
            <div
              key={column.key}
              className={cn(
                'flex min-w-0 items-center border-r border-border py-1 pl-2 pr-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground last:border-r-0',
                column.align === 'right' && 'justify-end',
                column.align === 'center' && 'justify-center'
              )}
            >
              <span className="min-w-0 truncate">{column.label}</span>
            </div>
          ))}
        </div>

        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No custom items yet. Click &quot;+ Add row&quot; below to start.
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={item.id}
              className="grid border-b border-border hover:bg-muted/40"
              style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
            >
              <div className="border-r border-border px-2 py-3 font-mono text-xs text-muted-foreground">{idx + 1}</div>
              <div className="min-w-0 border-r border-border">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => onUpdateItem(item.id, 'name', e.target.value)}
                  placeholder="e.g. Steel pipe"
                  className={cellInputClassName}
                />
              </div>
              <div className="min-w-0 border-r border-border">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => onUpdateItem(item.id, 'description', e.target.value)}
                  placeholder="Optional description"
                  className={cellInputClassName}
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
              <div className="flex items-center justify-center gap-0.5 px-1">
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
                  disabled={items.length === 1}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
                  title="Remove row"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
