'use client';

import React from 'react';
import type { DocumentPageStyle, DocumentTemplate } from '@/lib/types/documentTemplate';
import { SearchableFieldSelect } from './SearchableFieldSelect';

interface PageChromeEditorProps {
  pageStyle: DocumentPageStyle | undefined;
  onChange: (next: DocumentPageStyle | undefined) => void;
  /** Drives which data paths appear in field pickers */
  itemType: string;
  pageMargins: DocumentTemplate['pageMargins'];
  onMarginsChange: (next: DocumentTemplate['pageMargins']) => void;
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
}: PageChromeEditorProps) {
  const ps = pageStyle ?? empty;

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
    pageFaceMode === 'custom' && pageFaceRaw?.trim()
      ? pageFaceRaw.trim()
      : DEFAULT_PAGE_FACE;

  const wmColor = ps.watermarkColor?.trim() || DEFAULT_WM_COLOR;
  const wmColorPicker = /^#[0-9a-fA-F]{6}$/.test(wmColor) ? wmColor : DEFAULT_WM_COLOR;

  return (
    <div className="space-y-3 border border-slate-700 rounded-lg p-3 bg-slate-900/50">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Page chrome</p>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Margins, background, and watermark apply to the whole A4 page. Use low opacity for readability.
      </p>

      <div className="rounded-md border border-slate-700 bg-slate-900/80 p-2 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400">Page margins (mm)</p>
        <p className="text-[9px] text-slate-600 leading-relaxed">
          Inset of the printable content area from the sheet edge. Same in preview and print.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <div key={side} className="flex items-center gap-1">
              <label className="w-5 text-[10px] text-slate-500">{side[0].toUpperCase()}</label>
              <input
                type="number"
                value={pageMargins[side]}
                onChange={(e) =>
                  onMarginsChange({ ...pageMargins, [side]: Number(e.target.value) })
                }
                className="w-full rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-[10px] text-white"
                min={0}
                max={50}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-slate-700 bg-slate-900/80 p-2 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400">Body font (global)</p>
        <p className="text-[9px] text-slate-600 leading-relaxed">
          Default typeface for section content. Blocks can override in Advanced appearance.
        </p>
        <input
          type="text"
          value={ps.bodyFontFamily ?? ''}
          onChange={(e) => patch({ bodyFontFamily: e.target.value.trim() || undefined })}
          placeholder="Arial, Helvetica, sans-serif"
          className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-[11px] text-white placeholder:text-slate-600"
        />
      </div>

      <div className="rounded-md border border-slate-700 bg-slate-900/80 p-2 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400">Page face color</p>
        <p className="text-[9px] text-slate-600 leading-relaxed">
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
          className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
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
              className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800"
            />
            <input
              type="text"
              value={pageFaceCustom}
              onChange={(e) => patch({ pageBackgroundColor: e.target.value || DEFAULT_PAGE_FACE })}
              className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-[11px] text-white"
              placeholder="#fffef5"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-[10px] text-slate-400 mb-1">Background image URL</label>
        <input
          type="text"
          value={ps.backgroundImageUrl ?? ''}
          onChange={(e) => patch({ backgroundImageUrl: e.target.value || undefined })}
          placeholder="https://…"
          className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
        />
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
          <label className="block text-[10px] text-slate-400 mb-1">Bg image opacity</label>
          <input
            type="number"
            value={ps.backgroundOpacity ?? 0.14}
            onChange={(e) => patch({ backgroundOpacity: Number(e.target.value) })}
            min={0}
            max={1}
            step={0.02}
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Bg fit</label>
          <select
            value={ps.backgroundFit ?? 'cover'}
            onChange={(e) =>
              patch({ backgroundFit: e.target.value as DocumentPageStyle['backgroundFit'] })
            }
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
          >
            <option value="cover">cover</option>
            <option value="contain">contain</option>
            <option value="auto">auto / tile</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-slate-400 mb-1">
          White paper layer over background (0–1)
        </label>
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
          className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white placeholder:text-slate-600"
        />
        <p className="text-[9px] text-slate-600 mt-1 leading-relaxed">
          Use <strong className="text-slate-400">0</strong> to see the background image at full strength (with Bg image
          opacity = 1). Higher values add a white wash for readability.
        </p>
      </div>

      <div className="border-t border-slate-700 pt-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400">Watermark</p>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Watermark text</label>
          <input
            type="text"
            value={ps.watermarkText ?? ''}
            onChange={(e) => patch({ watermarkText: e.target.value || undefined })}
            placeholder="e.g. DRAFT or company name"
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
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
          <label className="block text-[10px] text-slate-400 mb-1">Watermark image URL</label>
          <input
            type="text"
            value={ps.watermarkImageUrl ?? ''}
            onChange={(e) => patch({ watermarkImageUrl: e.target.value || undefined })}
            className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Wm opacity</label>
            <input
              type="number"
              value={ps.watermarkOpacity ?? 0.08}
              onChange={(e) => patch({ watermarkOpacity: Number(e.target.value) })}
              min={0}
              max={1}
              step={0.02}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Angle °</label>
            <input
              type="number"
              value={ps.watermarkAngle ?? -35}
              onChange={(e) => patch({ watermarkAngle: Number(e.target.value) })}
              step={5}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">Font (pt)</label>
            <input
              type="number"
              value={ps.watermarkFontSizePt ?? 56}
              onChange={(e) => patch({ watermarkFontSizePt: Number(e.target.value) })}
              min={12}
              max={120}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-slate-400 mb-1">Text watermark color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={wmColorPicker}
              onChange={(e) => patch({ watermarkColor: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800"
            />
            <input
              type="text"
              value={wmColor}
              onChange={(e) =>
                patch({ watermarkColor: e.target.value.trim() || undefined })
              }
              className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-[11px] text-white"
              placeholder="#888888"
            />
          </div>
          <p className="text-[9px] text-slate-600 mt-1">Ignored when using a watermark image.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="w-full text-xs py-1.5 rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700"
      >
        Clear page chrome
      </button>
    </div>
  );
}
