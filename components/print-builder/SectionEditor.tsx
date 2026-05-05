'use client';

import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { DocumentSection, ItemType, SectionCanvasRect } from '@/lib/types/documentTemplate';
import {
  getSectionTypeLabel,
  getSectionCustomNameInputValue,
} from '@/lib/types/documentTemplate';
import { getFieldsForItemType, getTableColumnFieldsForDataSource } from '@/lib/utils/itemTypeFields';
import { SearchableFieldSelect } from './SearchableFieldSelect';
import { SectionAdvancedStyleEditor } from './SectionAdvancedStyleEditor';

/** Module-level helpers so React does not remount inputs every parent render (stable component identity). */
function EditorInput<T extends React.HTMLInputTypeAttribute = 'text'>(
  props: {
    label: string;
    value: T extends 'number' ? number | '' : string | number | '';
    onChange: (v: T extends 'number' ? number : string) => void;
    type?: T;
  } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>
) {
  const { label, value, onChange: onInput, type, ...rest } = props;
  const resolvedType = (type ?? 'text') as React.HTMLInputTypeAttribute;
  return (
      <div>
        <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">{label}</label>
        <input
          type={resolvedType}
          value={value}
          onChange={(e) => {
            if (resolvedType === 'number') {
              onInput(Number(e.target.value) as T extends 'number' ? number : string);
              return;
            }
            onInput(e.target.value as T extends 'number' ? number : string);
          }}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          {...rest}
        />
      </div>
  );
}

function EditorCheckBox({
  label,
  checked,
  onChange: onCheck,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
      <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="rounded" />
      {label}
    </label>
  );
}

function EditorAlignSelect({
  value,
  onAlignChange,
}: {
  value: string;
  onAlignChange: (v: string) => void;
}) {
  const options: Array<{
    value: 'left' | 'center' | 'right';
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      value: 'left',
      label: 'Left',
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h10M4 14h16M4 18h10" />
        </svg>
      ),
    },
    {
      value: 'center',
      label: 'Center',
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M7 10h10M4 14h16M7 18h10" />
        </svg>
      ),
    },
    {
      value: 'right',
      label: 'Right',
      icon: (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M10 10h10M4 14h16M10 18h10" />
        </svg>
      ),
    },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((a) => (
        <button
          key={a.value}
          type="button"
          onClick={() => onAlignChange(a.value)}
          title={a.label}
          className={`rounded px-2 py-1 text-xs ${
            value === a.value ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          {a.icon}
        </button>
      ))}
    </div>
  );
}

function EditorVerticalAlignSelect({
  value,
  onAlignChange,
}: {
  value: string;
  onAlignChange: (v: string) => void;
}) {
  const options: Array<{ value: 'top' | 'middle' | 'bottom'; label: string }> = [
    { value: 'top', label: 'Top' },
    { value: 'middle', label: 'Middle' },
    { value: 'bottom', label: 'Bottom' },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((a) => (
        <button
          key={a.value}
          type="button"
          onClick={() => onAlignChange(a.value)}
          title={a.label}
          className={`rounded px-2 py-1 text-xs ${
            value === a.value ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
          }`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

function moveArrayItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function detectTemplateToken(value: string, caret: number | null) {
  if (caret == null) return null;
  const left = value.slice(0, caret);
  const start = left.lastIndexOf('{{');
  if (start < 0) return null;
  const close = value.indexOf('}}', start + 2);
  if (close >= 0 && close < caret) return null;
  const query = value.slice(start + 2, caret).trim();
  return { start, close, query, caret };
}

function TemplateInput({
  label,
  value,
  onChange: onInput,
  itemType,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  itemType: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [token, setToken] = useState<{ start: number; close: number; query: string; caret: number } | null>(null);
  const fields = getFieldsForItemType(itemType);
  const picks = (token
    ? fields.filter((f) => {
        const q = token.query.toLowerCase();
        if (!q) return true;
        return f.path.toLowerCase().includes(q) || f.label.toLowerCase().includes(q);
      })
    : []
  ).slice(0, 12);

  const refreshToken = () => {
    const el = inputRef.current;
    if (!el) return;
    const t = detectTemplateToken(el.value, el.selectionStart);
    setToken(t);
    setOpen(Boolean(t));
    setHi(0);
  };

  const applySuggestion = (path: string) => {
    if (!token) return;
    const before = value.slice(0, token.start + 2);
    const hasClose = token.close >= 0;
    const after = hasClose ? value.slice(token.close) : `}}${value.slice(token.caret)}`;
    const next = `${before}${path}${after}`;
    onInput(next);
    setOpen(false);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      const newCaret = token.start + 2 + path.length;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(newCaret, newCaret);
    });
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onInput(e.target.value);
          requestAnimationFrame(refreshToken);
        }}
        onClick={refreshToken}
        onKeyUp={refreshToken}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={refreshToken}
        onKeyDown={(e) => {
          if (!open || picks.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((x) => (x + 1 < picks.length ? x + 1 : x));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((x) => (x > 0 ? x - 1 : 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            applySuggestion(picks[hi].path);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
      {open && picks.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded border border-slate-600 bg-slate-900 shadow-xl">
          {picks.map((p, idx) => (
            <button
              key={p.path}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(p.path)}
              className={`block w-full px-2 py-1.5 text-left text-xs ${
                idx === hi ? 'bg-emerald-700/30 text-emerald-200' : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-cyan-300/90">{p.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateTextarea({
  label,
  value,
  onChange: onInput,
  itemType,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  itemType: string;
  rows?: number;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [token, setToken] = useState<{ start: number; close: number; query: string; caret: number } | null>(null);
  const fields = getFieldsForItemType(itemType);
  const picks = (token
    ? fields.filter((f) => {
        const q = token.query.toLowerCase();
        if (!q) return true;
        return f.path.toLowerCase().includes(q) || f.label.toLowerCase().includes(q);
      })
    : []
  ).slice(0, 12);

  const refreshToken = () => {
    const el = areaRef.current;
    if (!el) return;
    const t = detectTemplateToken(el.value, el.selectionStart);
    setToken(t);
    setOpen(Boolean(t));
    setHi(0);
  };

  const applySuggestion = (path: string) => {
    if (!token) return;
    const before = value.slice(0, token.start + 2);
    const hasClose = token.close >= 0;
    const after = hasClose ? value.slice(token.close) : `}}${value.slice(token.caret)}`;
    const next = `${before}${path}${after}`;
    onInput(next);
    setOpen(false);
    requestAnimationFrame(() => {
      if (!areaRef.current) return;
      const newCaret = token.start + 2 + path.length;
      areaRef.current.focus();
      areaRef.current.setSelectionRange(newCaret, newCaret);
    });
  };

  return (
    <div className="relative">
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => {
          onInput(e.target.value);
          requestAnimationFrame(refreshToken);
        }}
        onClick={refreshToken}
        onKeyUp={refreshToken}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={refreshToken}
        onKeyDown={(e) => {
          if (!open || picks.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((x) => (x + 1 < picks.length ? x + 1 : x));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((x) => (x > 0 ? x - 1 : 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            applySuggestion(picks[hi].path);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        rows={rows}
        className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white resize-y"
      />
      {open && picks.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded border border-slate-600 bg-slate-900 shadow-xl">
          {picks.map((p, idx) => (
            <button
              key={p.path}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(p.path)}
              className={`block w-full px-2 py-1.5 text-left text-xs ${
                idx === hi ? 'bg-emerald-700/30 text-emerald-200' : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-cyan-300/90">{p.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SectionEditorProps {
  section: DocumentSection;
  /** Built-in or custom ERP document kind â€” drives field picker & explorer */
  itemType: ItemType;
  onChange: (updated: DocumentSection) => void;
  /** When true, all fields are read-only (block is locked in the builder). */
  locked?: boolean;
  /** Active company â€” required for template image upload to Drive */
  companyId?: string;
  /** Canvas layout (when block selected in freeform mode) */
  canvasRect?: SectionCanvasRect | null;
  canvasRectIndex?: number | null;
  contentWidthMm?: number;
  contentHeightMm?: number;
  onCanvasRectChange?: (idx: number, rect: SectionCanvasRect) => void;
}

/**
 * Property editor for a single section.
 * Renders different controls based on section type.
 */
function TemplateImageUpload({
  section,
  onChange,
  companyId,
  locked,
}: {
  section: Extract<DocumentSection, { type: 'image' }>;
  onChange: (updated: DocumentSection) => void;
  companyId?: string;
  locked: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !companyId || locked) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId);
      if (section.imageUrl) {
        formData.append('replaceUrl', section.imageUrl);
      }
      const res = await fetch('/api/upload/template-image', { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Upload failed');
        return;
      }
      const url = json.data?.url as string | undefined;
      if (!url) {
        toast.error('Invalid upload response');
        return;
      }
      onChange({ ...section, imageUrl: url });
      toast.success('Image uploaded');
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded border border-slate-700 bg-slate-800/40 p-2">
      <p className="text-[10px] text-slate-500">
        Upload stores URL on this block (overrides fixed URL / field below when set).
      </p>
      <EditorInput
        label="Image URL"
        value={section.imageUrl ?? ''}
        onChange={(v) => {
          const s = String(v).trim();
          onChange({
            ...section,
            imageUrl: s ? s : undefined,
          });
        }}
        placeholder="https://â€¦ or Google Drive link"
        disabled={locked}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={locked || !companyId}
        onChange={onPickFile}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={locked || !companyId || uploading}
          onClick={() => fileRef.current?.click()}
          className="rounded bg-emerald-700 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          {uploading ? 'Uploadingâ€¦' : 'Upload image'}
        </button>
        {section.imageUrl && (
          <button
            type="button"
            disabled={locked}
            onClick={() => onChange({ ...section, imageUrl: undefined })}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
      {!companyId && (
        <p className="text-[10px] text-amber-500/90">Save company context missing â€” upload unavailable.</p>
      )}
      {section.imageUrl ? (
        <div className="mt-1 max-h-24 overflow-hidden rounded border border-slate-600 bg-slate-900 p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={section.imageUrl} alt="" className="mx-auto max-h-20 object-contain" />
        </div>
      ) : null}
    </div>
  );
}

function BlockBleedAndCanvasControls({
  section,
  onChange,
  locked,
  canvasRect,
  canvasRectIndex,
  contentWidthMm,
  contentHeightMm,
  onCanvasRectChange,
}: {
  section: DocumentSection;
  onChange: (s: DocumentSection) => void;
  locked: boolean;
  canvasRect?: SectionCanvasRect | null;
  canvasRectIndex?: number | null;
  contentWidthMm?: number;
  contentHeightMm?: number;
  onCanvasRectChange?: (idx: number, rect: SectionCanvasRect) => void;
}) {
  const bleed = Boolean(section.allowMarginBleed);
  const patchRect = (partial: Partial<SectionCanvasRect>) => {
    if (canvasRectIndex == null || !canvasRect || !onCanvasRectChange) return;
    onCanvasRectChange(canvasRectIndex, { ...canvasRect, ...partial });
  };

  return (
    <div className="space-y-3 border-t border-slate-700 pt-3">
      <p className="text-xs font-bold uppercase text-sky-400/90">Canvas &amp; bleed</p>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={bleed}
          disabled={locked}
          onChange={(e) => onChange({ ...section, allowMarginBleed: e.target.checked })}
          className="rounded"
        />
        Allow margin bleed (block can extend into page margins)
      </label>
      <p className="text-[10px] text-slate-600">
        Drag on the page still works; use fields for precise mm. Arrow keys nudge on the page.
      </p>
      {canvasRect != null &&
        canvasRectIndex != null &&
        onCanvasRectChange &&
        contentWidthMm != null &&
        contentHeightMm != null && (
          <div className="grid grid-cols-2 gap-2">
            <EditorInput
              label="X (mm)"
              type="number"
              value={Math.round(canvasRect.xMm * 10) / 10}
              onChange={(v) => patchRect({ xMm: Number(v) })}
              disabled={locked}
            />
            <EditorInput
              label="Y (mm)"
              type="number"
              value={Math.round(canvasRect.yMm * 10) / 10}
              onChange={(v) => patchRect({ yMm: Number(v) })}
              disabled={locked}
            />
            <EditorInput
              label="Width (mm)"
              type="number"
              value={Math.round(canvasRect.widthMm * 10) / 10}
              onChange={(v) => patchRect({ widthMm: Math.max(8, Number(v)) })}
              disabled={locked}
            />
            <EditorInput
              label="Height (mm)"
              type="number"
              value={Math.round(canvasRect.heightMm * 10) / 10}
              onChange={(v) => patchRect({ heightMm: Math.max(6, Number(v)) })}
              disabled={locked}
            />
            <EditorInput
              label="Z-index"
              type="number"
              value={canvasRect.zIndex ?? canvasRectIndex}
              onChange={(v) => patchRect({ zIndex: Number(v) })}
              disabled={locked}
            />
          </div>
        )}
    </div>
  );
}

export function SectionEditor({
  section,
  itemType,
  onChange,
  locked = false,
  companyId,
  canvasRect,
  canvasRectIndex,
  contentWidthMm,
  contentHeightMm,
  onCanvasRectChange,
}: SectionEditorProps) {
  const it = String(itemType);
  const [draggingTableColumnIndex, setDraggingTableColumnIndex] = useState<number | null>(null);
  const [collapsedTableColumns, setCollapsedTableColumns] = useState<Record<number, boolean>>({});

  const setTableColumnCollapsed = (index: number, collapsed: boolean) => {
    setCollapsedTableColumns((current) => {
      if (!collapsed) {
        const next = { ...current };
        delete next[index];
        return next;
      }
      return { ...current, [index]: true };
    });
  };

  const content = (() => {
    switch (section.type) {
    case 'image':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Image</p>
          <TemplateImageUpload section={section} onChange={onChange} companyId={companyId} locked={locked} />
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Source</label>
            <select
              value={section.source}
              onChange={(e) =>
                onChange({
                  ...section,
                  source: e.target.value as 'url' | 'field',
                })
              }
              disabled={locked}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="field">Data field (URL)</option>
              <option value="url">Fixed URL</option>
            </select>
          </div>
          {section.source === 'field' ? (
            <SearchableFieldSelect
              itemType={it}
              label="Image URL field"
              value={section.field ?? ''}
              onChange={(v) => onChange({ ...section, field: v })}
              placeholder="e.g. company.letterheadUrl"
            />
          ) : (
            <EditorInput
              label="Fixed URL"
              value={section.url ?? ''}
              onChange={(v) => onChange({ ...section, url: String(v) })}
              disabled={locked}
            />
          )}
          <EditorCheckBox
            label="Fallback: use company letterhead URL when nothing else resolves"
            checked={section.useCompanyLetterheadFallback !== false}
            onChange={(v) => onChange({ ...section, useCompanyLetterheadFallback: v })}
          />
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Layout</label>
            <select
              value={section.layout ?? 'inline'}
              onChange={(e) =>
                onChange({ ...section, layout: e.target.value as 'inline' | 'fill' })
              }
              disabled={locked}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="inline">Inline (row, width auto)</option>
              <option value="fill">Fill cell width (banner)</option>
            </select>
          </div>
          <EditorInput
            label="Height (mm)"
            type="number"
            value={section.heightMm}
            onChange={(v) => onChange({ ...section, heightMm: Number(v) })}
            min={8}
            max={120}
            disabled={locked}
          />
          <EditorInput
            label="Margin below (mm)"
            type="number"
            value={section.marginBottomMm ?? ''}
            onChange={(v) =>
              onChange({
                ...section,
                marginBottomMm: String(v).trim() === '' ? undefined : Number(v),
              })
            }
            min={0}
            max={20}
            disabled={locked}
          />
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Object fit</label>
            <select
              value={section.objectFit}
              onChange={(e) =>
                onChange({
                  ...section,
                  objectFit: e.target.value as 'contain' | 'cover' | 'fill',
                })
              }
              disabled={locked}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="contain">contain</option>
              <option value="cover">cover</option>
              <option value="fill">fill (stretch)</option>
            </select>
          </div>
          <EditorInput
            label="Object position (CSS)"
            value={section.objectPosition ?? ''}
            onChange={(v) => {
              const next = String(v).trim();
              onChange({ ...section, objectPosition: next || undefined });
            }}
            placeholder="e.g. center top, 50% 30%"
            disabled={locked}
          />
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Align (inline layout)</label>
            <EditorAlignSelect
              value={section.align}
              onAlignChange={(v) => onChange({ ...section, align: v as 'left' | 'center' | 'right' })}
            />
          </div>
          <EditorInput
            label="Opacity"
            type="number"
            value={section.opacity}
            onChange={(v) => onChange({ ...section, opacity: v })}
            min={0}
            max={1}
            step={0.05}
            disabled={locked}
          />
        </div>
      );

    case 'heading':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Heading</p>
          <SearchableFieldSelect
            itemType={it}
            label="Dynamic field (optional)"
            value={section.field ?? ''}
            onChange={(v) => onChange({ ...section, field: v || undefined })}
          />
          <p className="text-[10px] text-slate-500">If set, overrides static text below.</p>
          <TemplateInput label="Static text" value={section.text} onChange={(v) => onChange({ ...section, text: v })} itemType={it} />
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={48} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Align</label>
            <EditorAlignSelect value={section.align} onAlignChange={(v) => onChange({ ...section, align: v as 'left' | 'center' | 'right' })} />
          </div>
          <EditorCheckBox label="Bold" checked={section.bold} onChange={(v) => onChange({ ...section, bold: v })} />
          <EditorInput label="Color" type="color" value={section.color} onChange={(v) => onChange({ ...section, color: v })} />
        </div>
      );

    case 'field-row':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Field Row</p>
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Layout</label>
            <select
              value={section.layout ?? 'flex'}
              onChange={(e) =>
                onChange({
                  ...section,
                  layout: e.target.value as 'flex' | 'grid',
                  gridColumns: e.target.value === 'grid' ? section.gridColumns ?? 2 : undefined,
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="flex">Flex row (cell widths %)</option>
              <option value="grid">CSS grid (equal columns)</option>
            </select>
          </div>
          {section.layout === 'grid' && (
            <div>
              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Grid columns</label>
              <div className="flex flex-wrap gap-2">
                {([1, 2, 3, 4] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onChange({ ...section, gridColumns: n })}
                    className={`rounded px-3 py-1 text-xs ${
                      (section.gridColumns ?? 2) === n ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          <EditorCheckBox label="Bordered" checked={section.bordered} onChange={(v) => onChange({ ...section, bordered: v })} />
          <EditorInput label="Min Height (mm)" type="number" value={section.minHeight ?? 0} onChange={(v) => onChange({ ...section, minHeight: v || undefined })} min={0} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-bold">Cells ({section.cells.length})</label>
              <button
                type="button"
                className="text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => onChange({ ...section, cells: [...section.cells, { label: 'Label:', field: '', width: undefined, bold: false, fontSize: 10 }] })}
              >
                + Add Cell
              </button>
            </div>
            {section.cells.map((cell, ci) => (
              <div key={ci} className="p-2 bg-slate-800/50 rounded border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Cell {ci + 1}</span>
                  {section.cells.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-300"
                      onClick={() => onChange({ ...section, cells: section.cells.filter((_, i) => i !== ci) })}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <TemplateInput label="Label" value={cell.label ?? ''} onChange={(v) => {
                  const cells = [...section.cells];
                  cells[ci] = { ...cells[ci], label: v };
                  onChange({ ...section, cells });
                }} itemType={it} />
                <SearchableFieldSelect
                  itemType={it}
                  label="Data field"
                  value={cell.field ?? ''}
                  onChange={(v) => {
                    const cells = [...section.cells];
                    cells[ci] = { ...cells[ci], field: v };
                    onChange({ ...section, cells });
                  }}
                />
                <TemplateInput
                  label="Inline Multi-Value Template"
                  value={cell.valueTemplate ?? ''}
                  onChange={(v) => {
                    const cells = [...section.cells];
                    cells[ci] = { ...cells[ci], valueTemplate: v };
                    onChange({ ...section, cells });
                  }}
                  itemType={it}
                  placeholder="{{job.contactPerson}} / {{job.contactPhone}} / {{job.contactEmail}}"
                />
                <p className="text-[10px] text-slate-500">
                  Supports multiple dynamic fields in one line using {'{{field.path}}'}.
                  This overrides Data field and Static Text when filled.
                </p>
                <TemplateInput label="Static Text (if no field)" value={cell.text ?? ''} onChange={(v) => {
                  const cells = [...section.cells];
                  cells[ci] = { ...cells[ci], text: v };
                  onChange({ ...section, cells });
                }} itemType={it} />
                <div className="flex gap-2">
                  <EditorInput label="Width (%)" type="number" value={cell.width ?? ''} onChange={(v) => {
                    const cells = [...section.cells];
                    cells[ci] = { ...cells[ci], width: v || undefined };
                    onChange({ ...section, cells });
                  }} min={0} max={100} />
                  <EditorInput label="Font (pt)" type="number" value={cell.fontSize ?? 10} onChange={(v) => {
                    const cells = [...section.cells];
                    cells[ci] = { ...cells[ci], fontSize: v };
                    onChange({ ...section, cells });
                  }} min={6} max={24} />
                </div>
                <EditorCheckBox label="Bold" checked={cell.bold ?? false} onChange={(v) => {
                  const cells = [...section.cells];
                  cells[ci] = { ...cells[ci], bold: v };
                  onChange({ ...section, cells });
                }} />
              </div>
            ))}
          </div>
        </div>
      );

    case 'table':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Items Table</p>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Data Source</label>
            <select
              value={section.dataSource}
              onChange={(e) => onChange({ ...section, dataSource: e.target.value as 'customItems' | 'batches' | 'items' | 'scheduleGroups' | 'driverTrips' })}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
            >
              <option value="customItems">Custom Items</option>
              <option value="batches">Batches</option>
              <option value="items">Items</option>
              <option value="scheduleGroups">Schedule Groups</option>
              <option value="driverTrips">Driver Trips</option>
            </select>
          </div>
          {section.dataSource === 'scheduleGroups' && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Schedule layout</label>
              <select
                value={section.layoutMode ?? 'table'}
                onChange={(e) =>
                  onChange({
                    ...section,
                    layoutMode: e.target.value as 'table' | 'group-columns',
                  })
                }
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="table">Standard table</option>
                <option value="group-columns">Group columns matrix</option>
              </select>
            </div>
          )}
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={18} />
          <EditorInput label="Min Rows" type="number" value={section.minRows} onChange={(v) => onChange({ ...section, minRows: v })} min={0} max={50} />
          <div className="grid grid-cols-2 gap-2">
            <EditorInput label="Row Padding (mm)" type="number" value={section.rowPadding} onChange={(v) => onChange({ ...section, rowPadding: v })} min={0} max={10} />
            <EditorInput label="Row Min Height (mm)" type="number" value={section.rowMinHeightMm ?? 0} onChange={(v) => onChange({ ...section, rowMinHeightMm: Number(v) })} min={0} max={40} />
          </div>
          <EditorCheckBox label="Show Borders" checked={section.showBorders} onChange={(v) => onChange({ ...section, showBorders: v })} />
          <EditorCheckBox label="Repeat Header on New Page" checked={section.repeatHeaderOnNewPage} onChange={(v) => onChange({ ...section, repeatHeaderOnNewPage: v })} />
          <div className="space-y-2 rounded border border-slate-700 bg-slate-800/40 p-2">
            <p className="text-xs font-bold text-slate-300 uppercase">Global Header Style</p>
            <div className="grid grid-cols-2 gap-2">
              <EditorInput label="Header Background" type="color" value={section.headerBg} onChange={(v) => onChange({ ...section, headerBg: String(v) })} />
              <EditorInput label="Header Text" type="color" value={section.headerColor} onChange={(v) => onChange({ ...section, headerColor: String(v) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Header weight</label>
                <select
                  value={section.headerFontWeight ?? 'bold'}
                  onChange={(e) =>
                    onChange({
                      ...section,
                      headerFontWeight: e.target.value as 'normal' | 'bold',
                    })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Header style</label>
                <select
                  value={section.headerFontStyle ?? 'normal'}
                  onChange={(e) =>
                    onChange({
                      ...section,
                      headerFontStyle: e.target.value as 'normal' | 'italic',
                    })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="normal">Normal</option>
                  <option value="italic">Italic</option>
                </select>
              </div>
            </div>
          </div>

          {/* Column editor */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs text-slate-400 font-bold">Columns ({section.columns.length})</label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                  onClick={() =>
                    setCollapsedTableColumns(
                      Object.fromEntries(section.columns.map((_, index) => [index, true])),
                    )
                  }
                >
                  Collapse all
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700"
                  onClick={() => setCollapsedTableColumns({})}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                  onClick={() =>
                    onChange({
                      ...section,
                      columns: [
                        ...section.columns,
                        {
                          header: 'New',
                          field: '',
                          width: undefined,
                          align: 'left',
                          verticalAlign: 'top',
                          useGlobalHeaderStyle: true,
                          headerBg: section.headerBg,
                          headerColor: section.headerColor,
                          headerFontWeight: section.headerFontWeight ?? 'bold',
                          headerFontStyle: section.headerFontStyle ?? 'normal',
                        },
                      ],
                    })
                  }
                >
                  + Add Column
                </button>
              </div>
            </div>
            {section.columns.map((col, ci) => (
              <div
                key={ci}
                draggable
                onDragStart={() => setDraggingTableColumnIndex(ci)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingTableColumnIndex == null || draggingTableColumnIndex === ci) return;
                  onChange({
                    ...section,
                    columns: moveArrayItem(section.columns, draggingTableColumnIndex, ci),
                  });
                  setDraggingTableColumnIndex(null);
                }}
                onDragEnd={() => setDraggingTableColumnIndex(null)}
                className={`space-y-2 rounded border p-2 ${
                  draggingTableColumnIndex === ci
                    ? 'border-emerald-500 bg-emerald-950/20'
                    : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setTableColumnCollapsed(ci, !collapsedTableColumns[ci])}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-600 text-[10px] text-slate-300">
                        {collapsedTableColumns[ci] ? '+' : '-'}
                      </span>
                      <span className="truncate text-xs font-semibold text-slate-200">
                        Col {ci + 1}: {col.header || 'Untitled'}
                      </span>
                    </div>
                    <p className="mt-1 truncate pl-7 text-[11px] text-slate-500">
                      {col.field || 'No field selected'}
                    </p>
                  </button>
                  <div className="flex items-center gap-1">
                    <span
                      className="cursor-grab rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-400"
                      title="Drag to reorder"
                    >
                      Drag
                    </span>
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                      disabled={ci === 0}
                      onClick={() =>
                        onChange({ ...section, columns: moveArrayItem(section.columns, ci, ci - 1) })
                      }
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-30"
                      disabled={ci === section.columns.length - 1}
                      onClick={() =>
                        onChange({ ...section, columns: moveArrayItem(section.columns, ci, ci + 1) })
                      }
                    >
                      Down
                    </button>
                    {section.columns.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:text-red-300"
                        onClick={() =>
                          onChange({ ...section, columns: section.columns.filter((_, i) => i !== ci) })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {!collapsedTableColumns[ci] && (
                  <>
                    <TemplateInput label="Header" value={col.header} onChange={(v) => {
                      const columns = [...section.columns];
                      columns[ci] = { ...columns[ci], header: v };
                      onChange({ ...section, columns });
                    }} itemType={it} />
                    <SearchableFieldSelect
                      itemType={it}
                      label="Row field key"
                      value={col.field}
                      onChange={(v) => {
                        const columns = [...section.columns];
                        columns[ci] = { ...columns[ci], field: v };
                        onChange({ ...section, columns });
                      }}
                      extraOptions={getTableColumnFieldsForDataSource(section.dataSource)}
                      allowEmpty={false}
                      placeholder="Search row keys (name, qty, slno...)..."
                    />
                    <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                      <EditorInput label="Width (%)" type="number" value={col.width ?? ''} onChange={(v) => {
                        const columns = [...section.columns];
                        columns[ci] = { ...columns[ci], width: v || undefined };
                        onChange({ ...section, columns });
                      }} min={0} max={100} />
                      <EditorInput label="Min Height (mm)" type="number" value={col.rowMinHeightMm ?? ''} onChange={(v) => {
                        const columns = [...section.columns];
                        columns[ci] = { ...columns[ci], rowMinHeightMm: v || undefined };
                        onChange({ ...section, columns });
                      }} min={0} max={40} />
                    </div>
                    <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                      <div className="min-w-0">
                        <label className="block text-xs text-slate-400 mb-1">Horizontal Align</label>
                        <EditorAlignSelect value={col.align} onAlignChange={(v) => {
                          const columns = [...section.columns];
                          columns[ci] = { ...columns[ci], align: v as 'left' | 'center' | 'right' };
                          onChange({ ...section, columns });
                        }} />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-xs text-slate-400 mb-1">Vertical Align</label>
                        <EditorVerticalAlignSelect value={col.verticalAlign ?? 'top'} onAlignChange={(v) => {
                          const columns = [...section.columns];
                          columns[ci] = { ...columns[ci], verticalAlign: v as 'top' | 'middle' | 'bottom' };
                          onChange({ ...section, columns });
                        }} />
                      </div>
                    </div>
                    <div className="rounded border border-slate-700 bg-slate-900/30 p-2 space-y-2">
                      <EditorCheckBox
                        label="Use global header style"
                        checked={col.useGlobalHeaderStyle !== false}
                        onChange={(v) => {
                          const columns = [...section.columns];
                          columns[ci] = { ...columns[ci], useGlobalHeaderStyle: v };
                          onChange({ ...section, columns });
                        }}
                      />
                      {col.useGlobalHeaderStyle === false && (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <EditorInput
                              label="Header BG"
                              type="color"
                              value={col.headerBg ?? section.headerBg}
                              onChange={(v) => {
                                const columns = [...section.columns];
                                columns[ci] = { ...columns[ci], headerBg: String(v) };
                                onChange({ ...section, columns });
                              }}
                            />
                            <EditorInput
                              label="Header text"
                              type="color"
                              value={col.headerColor ?? section.headerColor}
                              onChange={(v) => {
                                const columns = [...section.columns];
                                columns[ci] = { ...columns[ci], headerColor: String(v) };
                                onChange({ ...section, columns });
                              }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Header weight</label>
                              <select
                                value={col.headerFontWeight ?? section.headerFontWeight ?? 'bold'}
                                onChange={(e) => {
                                  const columns = [...section.columns];
                                  columns[ci] = {
                                    ...columns[ci],
                                    headerFontWeight: e.target.value as 'normal' | 'bold',
                                  };
                                  onChange({ ...section, columns });
                                }}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              >
                                <option value="normal">Normal</option>
                                <option value="bold">Bold</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Header style</label>
                              <select
                                value={col.headerFontStyle ?? section.headerFontStyle ?? 'normal'}
                                onChange={(e) => {
                                  const columns = [...section.columns];
                                  columns[ci] = {
                                    ...columns[ci],
                                    headerFontStyle: e.target.value as 'normal' | 'italic',
                                  };
                                  onChange({ ...section, columns });
                                }}
                                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                              >
                                <option value="normal">Normal</option>
                                <option value="italic">Italic</option>
                              </select>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <EditorInput
                        label="Row BG"
                        type="color"
                        value={col.cellBg ?? '#ffffff'}
                        onChange={(v) => {
                          const columns = [...section.columns];
                          columns[ci] = { ...columns[ci], cellBg: String(v) };
                          onChange({ ...section, columns });
                        }}
                      />
                      <EditorInput
                        label="Row text"
                        type="color"
                        value={col.cellColor ?? '#000000'}
                        onChange={(v) => {
                          const columns = [...section.columns];
                          columns[ci] = { ...columns[ci], cellColor: String(v) };
                          onChange({ ...section, columns });
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Font weight</label>
                        <select
                          value={col.fontWeight ?? 'normal'}
                          onChange={(e) => {
                            const columns = [...section.columns];
                            columns[ci] = {
                              ...columns[ci],
                              fontWeight: e.target.value as 'normal' | 'bold',
                            };
                            onChange({ ...section, columns });
                          }}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="bold">Bold</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Font style</label>
                        <select
                          value={col.fontStyle ?? 'normal'}
                          onChange={(e) => {
                            const columns = [...section.columns];
                            columns[ci] = {
                              ...columns[ci],
                              fontStyle: e.target.value as 'normal' | 'italic',
                            };
                            onChange({ ...section, columns });
                          }}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="normal">Normal</option>
                          <option value="italic">Italic</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      );

    case 'text':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Text Block</p>
          <TemplateTextarea
            label="Content"
            value={section.content}
            onChange={(v) => onChange({ ...section, content: v })}
            itemType={it}
            rows={3}
          />
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={24} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Align</label>
            <EditorAlignSelect value={section.align} onAlignChange={(v) => onChange({ ...section, align: v as 'left' | 'center' | 'right' })} />
          </div>
          <EditorCheckBox label="Bold" checked={section.bold} onChange={(v) => onChange({ ...section, bold: v })} />
          <EditorInput label="Color" type="color" value={section.color} onChange={(v) => onChange({ ...section, color: v })} />
        </div>
      );

    case 'spacer':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Spacer</p>
          <EditorInput label="Height (mm)" type="number" value={section.height} onChange={(v) => onChange({ ...section, height: v })} min={1} max={50} />
        </div>
      );

    case 'divider':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Divider</p>
          <EditorInput label="Thickness (px)" type="number" value={section.thickness} onChange={(v) => onChange({ ...section, thickness: v })} min={1} max={5} />
          <EditorInput label="Color" type="color" value={section.color} onChange={(v) => onChange({ ...section, color: v })} />
          <EditorInput label="Margin Top (mm)" type="number" value={section.marginTop} onChange={(v) => onChange({ ...section, marginTop: v })} min={0} />
          <EditorInput label="Margin Bottom (mm)" type="number" value={section.marginBottom} onChange={(v) => onChange({ ...section, marginBottom: v })} min={0} />
        </div>
      );

    case 'info-grid':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Info Grid</p>
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Columns</label>
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ ...section, columns: n })}
                  className={`rounded px-3 py-1 text-xs ${
                    section.columns === n ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <EditorCheckBox label="Bordered" checked={section.bordered} onChange={(v) => onChange({ ...section, bordered: v })} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-bold">Items ({section.items.length})</label>
              <button
                type="button"
                className="text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => onChange({ ...section, items: [...section.items, { label: 'Label', field: '' }] })}
              >
                + Add
              </button>
            </div>
            {section.items.map((item, ii) => (
              <div key={ii} className="p-2 bg-slate-800/50 rounded border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">#{ii + 1}</span>
                  <button type="button" className="text-xs text-red-400" onClick={() => onChange({ ...section, items: section.items.filter((_, i) => i !== ii) })}>Remove</button>
                </div>
                <TemplateInput label="Label" value={item.label} onChange={(v) => {
                  const items = [...section.items];
                  items[ii] = { ...items[ii], label: v };
                  onChange({ ...section, items });
                }} itemType={it} />
                <SearchableFieldSelect
                  itemType={it}
                  label="Field"
                  value={item.field}
                  onChange={(v) => {
                    const items = [...section.items];
                    items[ii] = { ...items[ii], field: v };
                    onChange({ ...section, items });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      );

    case 'signatures':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Signatures</p>
          <EditorInput label="Line Height (mm)" type="number" value={section.lineHeight} onChange={(v) => onChange({ ...section, lineHeight: v })} min={10} max={50} />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-bold">Signers ({section.items.length})</label>
              <button
                type="button"
                className="text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => onChange({ ...section, items: [...section.items, { label: 'Name' }] })}
              >
                + Add
              </button>
            </div>
            {section.items.map((sig, si) => (
              <div key={si} className="flex items-center gap-2">
                <div className="flex-1">
                  <TemplateInput
                    label={`Signer ${si + 1}`}
                    value={sig.label}
                    onChange={(v) => {
                      const items = [...section.items];
                      items[si] = { label: v };
                      onChange({ ...section, items });
                    }}
                    itemType={it}
                  />
                </div>
                {section.items.length > 1 && (
                  <button type="button" className="text-xs text-red-400" onClick={() => onChange({ ...section, items: section.items.filter((_, i) => i !== si) })}>Ã—</button>
                )}
              </div>
            ))}
          </div>
        </div>
      );

    case 'box':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Shape / box</p>
          <div>
            <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Shape</label>
            <select
              value={section.shape ?? 'rectangle'}
              onChange={(e) =>
                onChange({
                  ...section,
                  shape: e.target.value as
                    | 'rectangle'
                    | 'ellipse'
                    | 'circle'
                    | 'diamond'
                    | 'triangle',
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="circle">Circle</option>
              <option value="diamond">Diamond</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>
          <EditorInput label="Width (mm)" type="number" value={section.width ?? ''} onChange={(v) => onChange({ ...section, width: v || undefined })} />
          <EditorInput label="Height (mm)" type="number" value={section.height} onChange={(v) => onChange({ ...section, height: v })} min={5} max={100} />
          <EditorInput label="Border Width (px)" type="number" value={section.borderWidth} onChange={(v) => onChange({ ...section, borderWidth: v })} min={0} max={10} />
          <EditorInput label="Border Color" type="color" value={section.borderColor} onChange={(v) => onChange({ ...section, borderColor: v })} />
          <EditorInput label="Background Color" type="color" value={section.backgroundColor ?? '#ffffff'} onChange={(v) => onChange({ ...section, backgroundColor: v })} />
          <EditorInput label="Border Radius (px)" type="number" value={section.borderRadius} onChange={(v) => onChange({ ...section, borderRadius: v })} min={0} max={50} />
          <SearchableFieldSelect
            itemType={it}
            label="Dynamic label field (optional)"
            value={section.labelField ?? ''}
            onChange={(v) => onChange({ ...section, labelField: v || undefined })}
          />
          <TemplateInput label="Static label" value={section.label ?? ''} onChange={(v) => onChange({ ...section, label: v })} itemType={it} />
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize ?? 10} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={24} />
        </div>
      );

    case 'line':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Line Shape</p>
          <EditorInput label="Thickness (px)" type="number" value={section.thickness} onChange={(v) => onChange({ ...section, thickness: v })} min={1} max={10} />
          <EditorInput label="Color" type="color" value={section.color} onChange={(v) => onChange({ ...section, color: v })} />
          <EditorInput label="Width (%)" type="number" value={section.width ?? 100} onChange={(v) => onChange({ ...section, width: v })} min={10} max={100} step={10} />
          <EditorInput label="Margin Top (mm)" type="number" value={section.marginTop} onChange={(v) => onChange({ ...section, marginTop: v })} min={0} max={20} />
          <EditorInput label="Margin Bottom (mm)" type="number" value={section.marginBottom} onChange={(v) => onChange({ ...section, marginBottom: v })} min={0} max={20} />
        </div>
      );

    default:
      return <p className="text-xs text-slate-400">No properties for this section.</p>;
    }
  })();

  return (
    <>
      {locked && (
        <p className="mb-2 rounded border border-amber-700/50 bg-amber-950/35 px-2 py-1.5 text-[10px] leading-relaxed text-amber-100/90">
          This block is locked. Unlock it under <span className="text-amber-200">Blocks</span> using the
          lock control.
        </p>
      )}
      <div className={locked ? 'pointer-events-none select-none opacity-[0.48]' : ''}>
        <div className="mb-3 space-y-1.5 border-b border-slate-700 pb-3">
          <label className="block text-xs text-slate-400">Block name</label>
          <div className="flex min-w-0 items-center gap-1.5 rounded border border-slate-600 bg-slate-800/80 px-2 py-1.5">
            <span className="shrink-0 text-xs font-medium text-slate-300">
              {getSectionTypeLabel(section.type)}
            </span>
            <span className="shrink-0 text-slate-600">-</span>
            <input
              type="text"
              value={getSectionCustomNameInputValue(section)}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...section,
                  customBlockName: v.length ? v : undefined,
                  blockName: undefined,
                });
              }}
              placeholder="Custom name"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
            />
          </div>
          <p className="text-[10px] leading-relaxed text-slate-600">
            Fixed type on the left; optional suffix in the order list only (not printed).
          </p>
          <div className="mt-2 space-y-2 rounded border border-slate-700 bg-slate-800/40 p-2">
            <EditorCheckBox
              label="Use as repeating header/footer"
              checked={Boolean(section.repeatOnEveryPage)}
              onChange={(v) =>
                onChange({
                  ...section,
                  repeatOnEveryPage: v || undefined,
                  repeatRole: v ? (section.repeatRole ?? 'header') : undefined,
                })
              }
            />
            {section.repeatOnEveryPage && (
              <div>
                <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">Repeat as</label>
                <select
                  value={section.repeatRole ?? 'header'}
                  onChange={(e) =>
                    onChange({
                      ...section,
                      repeatRole: e.target.value as 'header' | 'footer',
                    })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="header">Header (repeat every page)</option>
                  <option value="footer">Footer (repeat every page)</option>
                </select>
              </div>
            )}
            {!section.repeatOnEveryPage && (
              <div>
                <label className="mb-1 block text-xs text-slate-600 dark:text-slate-400">One-time page anchor</label>
                <select
                  value={section.pageAnchor ?? ''}
                  onChange={(e) =>
                    onChange({
                      ...section,
                      pageAnchor: (e.target.value || undefined) as 'top' | 'bottom' | undefined,
                    })
                  }
                  className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Normal flow</option>
                  <option value="top">Top (once)</option>
                  <option value="bottom">Bottom (once)</option>
                </select>
              </div>
            )}
          </div>
        </div>
        {content}
        <BlockBleedAndCanvasControls
          section={section}
          onChange={onChange}
          locked={locked}
          canvasRect={canvasRect}
          canvasRectIndex={canvasRectIndex}
          contentWidthMm={contentWidthMm}
          contentHeightMm={contentHeightMm}
          onCanvasRectChange={onCanvasRectChange}
        />
        <SectionAdvancedStyleEditor section={section} onChange={onChange} />
      </div>
    </>
  );
}
