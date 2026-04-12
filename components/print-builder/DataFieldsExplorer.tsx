'use client';

import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getFieldsForItemType, type FieldDef } from '@/lib/utils/itemTypeFields';
import type { AnyTemplateDataContext } from '@/lib/utils/templateData';
import { resolveField } from '@/lib/utils/templateData';

interface DataFieldsExplorerProps {
  itemType: string;
  sampleData: AnyTemplateDataContext;
}

/**
 * ERP-style data dictionary: every bindable path for the template’s item type,
 * with live sample values from preview mock (or real context when wired).
 */
export function DataFieldsExplorer({ itemType, sampleData }: DataFieldsExplorerProps) {
  const [q, setQ] = useState('');
  const fields = useMemo(() => getFieldsForItemType(itemType), [itemType]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return fields;
    return fields.filter(
      (f) =>
        f.path.toLowerCase().includes(s) ||
        f.label.toLowerCase().includes(s) ||
        f.category.toLowerCase().includes(s)
    );
  }, [fields, q]);

  const byCat = useMemo(() => {
    const m = new Map<string, FieldDef[]>();
    for (const f of filtered) {
      const arr = m.get(f.category) ?? [];
      arr.push(f);
      m.set(f.category, arr);
    }
    return m;
  }, [filtered]);

  const copyPath = (path: string) => {
    void navigator.clipboard.writeText(path);
    toast.success(`Copied: ${path}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">
        Data fields
      </p>
      <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
        Paths bind to document context (job, customer, company, …). Use in field rows, grids, headings,
        or images (URL fields). New item types: add entries in{' '}
        <code className="text-emerald-400/90">lib/utils/itemTypeFields.ts</code> or call{' '}
        <code className="text-emerald-400/90">registerPrintItemTypeFields</code>.
      </p>
      <input
        type="search"
        placeholder="Search path or label…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-500 mb-2"
      />
      <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
        {Array.from(byCat.entries()).map(([category, catFields]) => (
          <div key={category}>
            <p className="text-[10px] font-semibold text-emerald-500/90 mb-1.5 sticky top-0 bg-slate-900 py-0.5">
              {category}
            </p>
            <ul className="space-y-1">
              {catFields.map((f) => {
                const preview = resolveField(f.path, sampleData);
                const truncated =
                  preview.length > 48 ? `${preview.slice(0, 45)}…` : preview || '—';
                return (
                  <li
                    key={f.path}
                    className="rounded border border-slate-700/80 bg-slate-800/40 px-2 py-1.5 hover:border-slate-500/80 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-slate-200 font-medium truncate" title={f.label}>
                          {f.label}
                        </p>
                        <code className="text-[10px] text-cyan-400/90 break-all">{f.path}</code>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyPath(f.path)}
                        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 hover:bg-emerald-700"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 truncate" title={preview}>
                      Sample: <span className="text-slate-400">{truncated}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-slate-800">
        {fields.length} paths · item type <code className="text-slate-400">{itemType}</code>
      </p>
    </div>
  );
}
