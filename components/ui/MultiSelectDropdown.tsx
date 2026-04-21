'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyLabel?: string;
}

export default function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled,
  emptyLabel = 'No options found',
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => options.filter((o) => selectedSet.has(o.value)),
    [options, selectedSet]
  );
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const toggleValue = (v: string) => {
    if (selectedSet.has(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-left text-sm text-white shadow-inner focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50"
      >
        {selectedOptions.length === 0 ? (
          <span className="text-slate-500">{placeholder}</span>
        ) : (
          selectedOptions.map((o) => (
            <span key={o.value} className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/25">
              {o.label}
            </span>
          ))
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-slate-900 shadow-xl">
          <div className="border-b border-white/10 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-md border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-500">{emptyLabel}</p>
            ) : (
              filteredOptions.map((o) => {
                const selected = selectedSet.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggleValue(o.value)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                      selected ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    <span>{o.label}</span>
                    <span className="text-[10px]">{selected ? '✓' : ''}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
