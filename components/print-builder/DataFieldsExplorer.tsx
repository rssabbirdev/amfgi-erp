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
 * ERP-style data dictionary: every bindable path for the template's item type,
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
    <div className="flex h-full min-h-0 flex-col">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Data fields
      </p>
      <p className="mb-2 text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
        Paths bind to document context (job, customer, company, ...). Use in field rows, grids, headings,
        or images (URL fields). New item types: add entries in{' '}
        <code className="text-emerald-600 dark:text-emerald-400/90">lib/utils/itemTypeFields.ts</code> or call{' '}
        <code className="text-emerald-600 dark:text-emerald-400/90">registerPrintItemTypeFields</code>.
      </p>
      <input
        type="search"
        placeholder="Search path or label..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
      />
      <div className="flex-1 space-y-3 overflow-y-auto pr-0.5">
        {Array.from(byCat.entries()).map(([category, catFields]) => (
          <div key={category}>
            <p className="sticky top-0 mb-1.5 bg-white py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-slate-900 dark:text-emerald-500/90">
              {category}
            </p>
            <ul className="space-y-1">
              {catFields.map((f) => {
                const preview = resolveField(f.path, sampleData);
                const truncated = preview.length > 48 ? `${preview.slice(0, 45)}...` : preview || '-';
                return (
                  <li
                    key={f.path}
                    className="rounded border border-slate-200 bg-white px-2 py-1.5 transition-colors hover:border-slate-300 dark:border-slate-700/80 dark:bg-slate-800/40 dark:hover:border-slate-500/80"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200" title={f.label}>
                          {f.label}
                        </p>
                        <code className="break-all text-[10px] text-cyan-600 dark:text-cyan-400/90">{f.path}</code>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyPath(f.path)}
                        className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-emerald-600 hover:text-white dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-emerald-700"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-slate-500 dark:text-slate-500" title={preview}>
                      Sample: <span className="text-slate-700 dark:text-slate-400">{truncated}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-600 dark:border-slate-800 dark:text-slate-500">
        {fields.length} paths | item type <code className="text-slate-700 dark:text-slate-400">{itemType}</code>
      </p>
    </div>
  );
}
