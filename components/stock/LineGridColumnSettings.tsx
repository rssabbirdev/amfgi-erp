'use client';

import { useEffect, useRef, useState } from 'react';

export interface LineGridColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width: number;
  minWidth?: number;
  maxWidth?: number;
}

interface LineGridColumnSettingsProps {
  columns: LineGridColumnConfig[];
  onToggle: (key: string) => void;
  onMove: (key: string, direction: 'left' | 'right') => void;
  onResize: (key: string, width: number) => void;
}

export default function LineGridColumnSettings({
  columns,
  onToggle,
  onMove,
  onResize,
}: LineGridColumnSettingsProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Columns
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 border border-slate-300 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-950">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Grid Settings
          </div>
          <div className="space-y-3">
            {columns.map((column, index) => (
              <div key={column.key} className="border border-slate-200 p-2 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={column.visible}
                      onChange={() => onToggle(column.key)}
                      className="h-3.5 w-3.5"
                    />
                    <span>{column.label}</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onMove(column.key, 'left')}
                      disabled={index === 0}
                      className="border border-slate-300 px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                    >
                      Left
                    </button>
                    <button
                      type="button"
                      onClick={() => onMove(column.key, 'right')}
                      disabled={index === columns.length - 1}
                      className="border border-slate-300 px-2 py-1 text-[11px] text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                    >
                      Right
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={column.minWidth ?? 64}
                    max={column.maxWidth ?? 420}
                    step={4}
                    value={column.width}
                    onChange={(event) => onResize(column.key, Number(event.target.value))}
                    className="w-full"
                  />
                  <span className="w-12 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {column.width}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
