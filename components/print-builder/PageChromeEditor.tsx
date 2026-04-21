'use client';

import React from 'react';
import toast from 'react-hot-toast';
import type { DocumentPageStyle, DocumentTemplate } from '@/lib/types/documentTemplate';
import { getFieldsForItemType } from '@/lib/utils/itemTypeFields';
import { SearchableFieldSelect } from './SearchableFieldSelect';

interface PageChromeEditorProps {
  pageStyle: DocumentPageStyle | undefined;
  onChange: (next: DocumentPageStyle | undefined) => void;
  itemType: string;
  pageMargins: DocumentTemplate['pageMargins'];
  onMarginsChange: (next: DocumentTemplate['pageMargins']) => void;
  companyId?: string;
}

const empty: DocumentPageStyle = {};
const DEFAULT_PAGE_FACE = '#ffffff';
const DEFAULT_WM_COLOR = '#888888';

export function PageChromeEditor({
  pageStyle,
  onChange,
  itemType,
  pageMargins,
  onMarginsChange,
  companyId,
}: PageChromeEditorProps) {
  const ps = pageStyle ?? empty;
  const fieldDefs = getFieldsForItemType(itemType);

  const patch = (partial: Partial<DocumentPageStyle>) => {
    onChange({ ...ps, ...partial });
  };

  const pageFaceRaw = ps.pageBackgroundColor;
  const pageFaceMode: 'default' | 'transparent' | 'custom' =
    pageFaceRaw === undefined || pageFaceRaw === ''
      ? 'default'
      : pageFaceRaw === 'transparent'
        ? 'transparent'
        : 'custom';
  const pageFaceCustom =
    pageFaceMode === 'custom' && pageFaceRaw?.trim() ? pageFaceRaw.trim() : DEFAULT_PAGE_FACE;

  const wmColor = ps.watermarkColor?.trim() || DEFAULT_WM_COLOR;
  const wmColorPicker = /^#[0-9a-fA-F]{6}$/.test(wmColor) ? wmColor : DEFAULT_WM_COLOR;
  const bgUploadRef = React.useRef<HTMLInputElement>(null);
  const [bgUploading, setBgUploading] = React.useState(false);

  const resolveTemplateToken = (
    raw: string,
    caret: number | null
  ): { query: string; start: number; close: number; caret: number } | null => {
    if (caret == null) return null;
    const left = raw.slice(0, caret);
    const start = left.lastIndexOf('{{');
    if (start < 0) return null;
    const close = raw.indexOf('}}', start + 2);
    if (close >= 0 && close < caret) return null;
    const query = raw.slice(start + 2, caret).trim();
    return { query, start, close, caret };
  };

  const uploadBackgroundImage = async (file: File) => {
    if (!companyId) {
      toast.error('Active company is required for upload');
      return;
    }
    setBgUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('companyId', companyId);
      const res = await fetch('/api/upload/template-image', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Background upload failed');
        return;
      }
      const url = json.data?.url as string | undefined;
      if (!url) {
        toast.error('Invalid upload response');
        return;
      }
      patch({ backgroundImageUrl: url });
      toast.success('Background image uploaded');
    } catch {
      toast.error('Background upload failed');
    } finally {
      setBgUploading(false);
    }
  };

  const fieldCls = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';
  const monoCls = 'w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500';
  const labelCls = 'mb-1 block text-[10px] text-slate-600 dark:text-slate-400';
  const hintCls = 'text-[9px] leading-relaxed text-slate-600 dark:text-slate-500';
  const cardCls = 'space-y-2 rounded-md border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/80';

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Page chrome</p>
      <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-500">
        Margins, background, and watermark apply to the whole A4 page. Use low opacity for readability.
      </p>

      <div className={cardCls}>
        <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-400">Page format</p>
        <p className={hintCls}>Choose the sheet direction for print and preview.</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Sheet direction</label>
            <select
              value={ps.pageOrientation ?? 'portrait'}
              onChange={(e) =>
                patch({
                  pageOrientation: e.target.value as 'portrait' | 'landscape',
                })
              }
              className={fieldCls}
            >
              <option value="portrait">A4 portrait</option>
              <option value="landscape">A4 landscape</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Content fitting</label>
            <select
              value={ps.contentFitMode ?? 'default'}
              onChange={(e) =>
                patch({
                  contentFitMode: e.target.value as DocumentPageStyle['contentFitMode'],
                })
              }
              className={fieldCls}
            >
              <option value="default">Default flow</option>
              <option value="single-page">Fit all content on one page</option>
            </select>
          </div>
        </div>
        <p className={hintCls}>
          Use fit mode when you want the whole document compressed onto a single printed sheet instead of spilling onto multiple pages.
        </p>
      </div>

      <div className={cardCls}>
        <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-400">Page margins (mm)</p>
        <p className={hintCls}>Inset of the printable content area from the sheet edge. Same in preview and print.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <div key={side} className="flex items-center gap-1">
              <label className="w-5 text-[10px] text-slate-500 dark:text-slate-500">{side[0].toUpperCase()}</label>
              <input
                type="number"
                value={pageMargins[side]}
                onChange={(e) => onMarginsChange({ ...pageMargins, [side]: Number(e.target.value) })}
                className="w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                min={0}
                max={50}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={cardCls}>
        <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-400">Body font (global)</p>
        <p className={hintCls}>Default typeface for section content. Blocks can override in Advanced appearance.</p>
        <input
          type="text"
          value={ps.bodyFontFamily ?? ''}
          onChange={(e) => patch({ bodyFontFamily: e.target.value.trim() || undefined })}
          placeholder="Arial, Helvetica, sans-serif"
          className={monoCls}
        />
      </div>

      <div className={cardCls}>
        <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-400">Page face color</p>
        <p className={hintCls}>
          Printed page background (not the editor workspace). With a background image, this shows at full
          opacity under the image and white wash.
        </p>
        <select
          value={pageFaceMode}
          onChange={(e) => {
            const v = e.target.value as 'default' | 'transparent' | 'custom';
            if (v === 'default') patch({ pageBackgroundColor: undefined });
            else if (v === 'transparent') patch({ pageBackgroundColor: 'transparent' });
            else patch({ pageBackgroundColor: pageFaceCustom });
          }}
          className={fieldCls}
        >
          <option value="default">White (default)</option>
          <option value="transparent">Transparent</option>
          <option value="custom">Custom color</option>
        </select>
        {pageFaceMode === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={pageFaceCustom.match(/^#[0-9a-fA-F]{6}$/) ? pageFaceCustom : DEFAULT_PAGE_FACE}
              onChange={(e) => patch({ pageBackgroundColor: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
            />
            <input
              type="text"
              value={pageFaceCustom}
              onChange={(e) => patch({ pageBackgroundColor: e.target.value || DEFAULT_PAGE_FACE })}
              className={monoCls}
              placeholder="#fffef5"
            />
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Background image URL</label>
        <TemplateInputWithSuggestions
          value={ps.backgroundImageUrl ?? ''}
          onChange={(v) => patch({ backgroundImageUrl: v || undefined })}
          placeholder="https://... or {{company.letterheadUrl}}"
          fieldDefs={fieldDefs}
          resolveTemplateToken={resolveTemplateToken}
        />
        <input
          ref={bgUploadRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={!companyId || bgUploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void uploadBackgroundImage(file);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => bgUploadRef.current?.click()}
            disabled={!companyId || bgUploading}
            className="rounded bg-emerald-700 px-2 py-1 text-[11px] text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {bgUploading ? 'Uploading...' : 'Upload background'}
          </button>
          {ps.backgroundImageUrl && (
            <button
              type="button"
              onClick={() => patch({ backgroundImageUrl: undefined })}
              className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Clear background
            </button>
          )}
        </div>
        {!companyId && <p className="mt-1 text-[10px] text-amber-500/90">Save company context missing - upload unavailable.</p>}
      </div>

      <SearchableFieldSelect
        itemType={itemType}
        dense
        label="Or background data field"
        value={ps.backgroundImageField ?? ''}
        onChange={(v) => patch({ backgroundImageField: v || undefined })}
        placeholder="e.g. company.letterheadUrl"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Bg image opacity</label>
          <input
            type="number"
            value={ps.backgroundOpacity ?? 0.14}
            onChange={(e) => patch({ backgroundOpacity: Number(e.target.value) })}
            min={0}
            max={1}
            step={0.02}
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>Bg fit</label>
          <select
            value={ps.backgroundFit ?? 'cover'}
            onChange={(e) => patch({ backgroundFit: e.target.value as DocumentPageStyle['backgroundFit'] })}
            className={fieldCls}
          >
            <option value="cover">cover</option>
            <option value="contain">contain</option>
            <option value="auto">auto / tile</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>White paper layer over background (0-1)</label>
        <input
          type="number"
          value={ps.contentLayerOpacity ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') patch({ contentLayerOpacity: undefined });
            else patch({ contentLayerOpacity: Number(v) });
          }}
          min={0}
          max={1}
          step={0.05}
          placeholder="0.88 default if bg set"
          className={monoCls}
        />
        <p className={`${hintCls} mt-1`}>
          Use <strong className="text-slate-700 dark:text-slate-400">0</strong> to see the background image at full strength (with Bg image opacity = 1). Higher values add a white wash for readability.
        </p>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <p className="text-[10px] font-semibold text-slate-700 dark:text-slate-400">Watermark</p>
        <div>
          <label className={labelCls}>Watermark text</label>
          <TemplateInputWithSuggestions
            value={ps.watermarkText ?? ''}
            onChange={(v) => patch({ watermarkText: v || undefined })}
            placeholder="e.g. DRAFT or {{company.name}}"
            fieldDefs={fieldDefs}
            resolveTemplateToken={resolveTemplateToken}
          />
        </div>
        <SearchableFieldSelect
          itemType={itemType}
          dense
          label="Or watermark data field"
          value={ps.watermarkField ?? ''}
          onChange={(v) => patch({ watermarkField: v || undefined })}
          placeholder="e.g. company.name"
        />
        <div>
          <label className={labelCls}>Watermark image URL</label>
          <TemplateInputWithSuggestions
            value={ps.watermarkImageUrl ?? ''}
            onChange={(v) => patch({ watermarkImageUrl: v || undefined })}
            placeholder="https://... or {{company.letterheadUrl}}"
            fieldDefs={fieldDefs}
            resolveTemplateToken={resolveTemplateToken}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className={labelCls}>Wm opacity</label>
            <input type="number" value={ps.watermarkOpacity ?? 0.08} onChange={(e) => patch({ watermarkOpacity: Number(e.target.value) })} min={0} max={1} step={0.02} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Angle deg</label>
            <input type="number" value={ps.watermarkAngle ?? -35} onChange={(e) => patch({ watermarkAngle: Number(e.target.value) })} step={5} className={fieldCls} />
          </div>
          <div>
            <label className={labelCls}>Font (pt)</label>
            <input type="number" value={ps.watermarkFontSizePt ?? 56} onChange={(e) => patch({ watermarkFontSizePt: Number(e.target.value) })} min={12} max={120} className={fieldCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Text watermark color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={wmColorPicker} onChange={(e) => patch({ watermarkColor: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800" />
            <input type="text" value={wmColor} onChange={(e) => patch({ watermarkColor: e.target.value.trim() || undefined })} className={monoCls} placeholder="#888888" />
          </div>
          <p className="mt-1 text-[9px] text-slate-600 dark:text-slate-500">Ignored when using a watermark image.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="w-full rounded bg-slate-200 py-1.5 text-xs text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        Clear page chrome
      </button>
    </div>
  );
}

function TemplateInputWithSuggestions({
  value,
  onChange,
  placeholder,
  fieldDefs,
  resolveTemplateToken,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fieldDefs: Array<{ path: string; label: string }>;
  resolveTemplateToken: (
    raw: string,
    caret: number | null
  ) => { query: string; start: number; close: number; caret: number } | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const [token, setToken] = React.useState<{
    query: string;
    start: number;
    close: number;
    caret: number;
  } | null>(null);
  const ref = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const t = resolveTemplateToken(el.value, el.selectionStart);
    setToken(t);
    setOpen(Boolean(t));
    setHi(0);
  }, [resolveTemplateToken]);

  const picks = React.useMemo(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    return fieldDefs.filter((f) => !q || f.path.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)).slice(0, 12);
  }, [fieldDefs, token]);

  const applyPick = (path: string) => {
    if (!token) return;
    const before = value.slice(0, token.start + 2);
    const hasClose = token.close >= 0;
    const after = hasClose ? value.slice(token.close) : `}}${value.slice(token.caret)}`;
    const next = `${before}${path}${after}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      if (!ref.current) return;
      const pos = token.start + 2 + path.length;
      ref.current.focus();
      ref.current.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          requestAnimationFrame(refresh);
        }}
        onKeyUp={refresh}
        onFocus={refresh}
        onClick={refresh}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
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
            applyPick(picks[hi].path);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
      />
      {open && picks.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
          {picks.map((p, idx) => (
            <button
              key={p.path}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyPick(p.path)}
              className={`block w-full px-2 py-1.5 text-left text-xs ${idx === hi ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-700/30 dark:text-emerald-200' : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'}`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-cyan-600 dark:text-cyan-300/90">{p.path}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
