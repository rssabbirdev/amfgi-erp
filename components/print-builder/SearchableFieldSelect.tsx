'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { getFieldsForItemType, type FieldDef } from '@/lib/utils/itemTypeFields';

export interface SearchableFieldSelectProps {
  itemType: string;
  value: string;
  onChange: (path: string) => void;
  label?: string;
  placeholder?: string;
  /** Row keys for tables, etc. — listed first in the dropdown */
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
  placeholder = 'Search or pick a field…',
  extraOptions,
  allowEmpty = true,
  dense = false,
}: SearchableFieldSelectProps) {
  const baseFields = useMemo(() => getFieldsForItemType(itemType), [itemType]);
  const allFields = useMemo(
    () => mergeFieldDefs(baseFields, extraOptions),
    [baseFields, extraOptions]
  );

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

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
    return hit ? `${hit.label} · ${hit.path}` : value;
  }, [value, allFields]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

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
    ? 'w-full px-2 py-1.5 text-[11px] bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-600'
    : 'w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-500';
  const labelCls = dense ? 'block text-[10px] text-slate-400 mb-1' : 'block text-xs text-slate-400 mb-1';

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className={labelCls}>{label}</label>}
      <div className="flex gap-1">
        <input
          type="text"
          role="combobox"
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
          className="shrink-0 px-2 rounded border border-slate-600 bg-slate-800 text-slate-400 hover:text-white text-xs"
        >
          ▾
        </button>
      </div>
      {open && (
        <ul
          className="absolute z-[100] mt-1 w-full max-h-52 overflow-y-auto rounded border border-slate-600 bg-slate-900 shadow-xl py-1"
          role="listbox"
        >
          {allowEmpty && (
            <li>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                — None —
              </button>
            </li>
          )}
          {filtered.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-slate-800 border-b border-slate-800/80 last:border-0"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(f.path);
                  setOpen(false);
                }}
              >
                <span className="text-slate-200 font-medium block truncate">{f.label}</span>
                <code className="text-[10px] text-cyan-400/90 break-all">{f.path}</code>
                <span className="text-[9px] text-slate-600 block">{f.category}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && q.trim() !== '' && (
            <li>
              <button
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs text-amber-400/90 hover:bg-slate-800"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(q.trim());
                  setOpen(false);
                }}
              >
                Use custom path: <code className="text-cyan-400">{q.trim()}</code>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
