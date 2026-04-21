'use client';

import React, { useMemo, useState, useRef, useEffect, useId } from 'react';
import { getFieldsForItemType, type FieldDef } from '@/lib/utils/itemTypeFields';

export interface SearchableFieldSelectProps {
  itemType: string;
  value: string;
  onChange: (path: string) => void;
  label?: string;
  placeholder?: string;
  /** Row keys for tables, etc. - listed first in the dropdown */
  extraOptions?: FieldDef[];
  allowEmpty?: boolean;
  /** Smaller text for dense panels (e.g. page chrome) */
  dense?: boolean;
}

function mergeFieldDefs(base: FieldDef[], extra?: FieldDef[]): FieldDef[] {
  const seen = new Set<string>();
  const out: FieldDef[] = [];
  for (const f of [...(extra ?? []), ...base]) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    out.push(f);
  }
  return out;
}

export function SearchableFieldSelect({
  itemType,
  value,
  onChange,
  label,
  placeholder = 'Search or pick a field...',
  extraOptions,
  allowEmpty = true,
  dense = false,
}: SearchableFieldSelectProps) {
  const baseFields = useMemo(() => getFieldsForItemType(itemType), [itemType]);
  const allFields = useMemo(() => mergeFieldDefs(baseFields, extraOptions), [baseFields, extraOptions]);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return allFields;
    return allFields.filter(
      (f) =>
        f.path.toLowerCase().includes(s) ||
        f.label.toLowerCase().includes(s) ||
        f.category.toLowerCase().includes(s)
    );
  }, [allFields, q]);

  const displayText = useMemo(() => {
    if (!value) return '';
    const hit = allFields.find((f) => f.path === value);
    return hit ? `${hit.label} | ${hit.path}` : value;
  }, [value, allFields]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!open || !el) return;
    const close = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const inputCls = dense
    ? 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500'
    : 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500';
  const labelCls = dense
    ? 'mb-1 block text-[10px] text-slate-600 dark:text-slate-400'
    : 'mb-1 block text-xs text-slate-600 dark:text-slate-400';

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className={labelCls}>{label}</label>}
      <div className="flex gap-1">
        <input
          type="text"
          role="combobox"
          aria-controls={listboxId}
          aria-expanded={open}
          value={open ? q : displayText}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          placeholder={placeholder}
          className={`${inputCls} min-w-0 flex-1 font-mono`}
        />
        <button
          type="button"
          aria-label="Toggle field list"
          onClick={() => setOpen((o) => !o)}
          onMouseDown={() => {
            if (open) setQ('');
          }}
          className="shrink-0 rounded border border-slate-300 bg-white px-2 text-xs text-slate-500 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          v
        </button>
      </div>
      {open && (
        <ul
          id={listboxId}
          className="absolute z-[100] mt-1 max-h-52 w-full overflow-y-auto rounded border border-slate-300 bg-white py-1 shadow-xl dark:border-slate-600 dark:bg-slate-900"
          role="listbox"
        >
          {allowEmpty && (
            <li>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange('');
                  setQ('');
                  setOpen(false);
                }}
              >
                - None -
              </button>
            </li>
          )}
          {filtered.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className="w-full border-b border-slate-200 px-2 py-1.5 text-left text-xs hover:bg-slate-100 last:border-0 dark:border-slate-800/80 dark:hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(f.path);
                  setQ('');
                  setOpen(false);
                }}
              >
                <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{f.label}</span>
                <code className="break-all text-[10px] text-cyan-600 dark:text-cyan-400/90">{f.path}</code>
                <span className="block text-[9px] text-slate-500 dark:text-slate-500">{f.category}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && q.trim() !== '' && (
            <li>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs text-amber-700 hover:bg-slate-100 dark:text-amber-400/90 dark:hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(q.trim());
                  setQ('');
                  setOpen(false);
                }}
              >
                Use custom path: <code className="text-cyan-600 dark:text-cyan-400">{q.trim()}</code>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
