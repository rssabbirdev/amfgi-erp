'use client';

import React from 'react';
import type { DocumentSection, SectionStylePack } from '@/lib/types/documentTemplate';

interface Props {
  section: DocumentSection;
  onChange: (next: DocumentSection) => void;
}

export function SectionAdvancedStyleEditor({ section, onChange }: Props) {
  const s = section.style ?? {};

  const patch = (partial: Partial<SectionStylePack>) => {
    const base: Record<string, unknown> = { ...(section.style ?? {}) };
    for (const [k, v] of Object.entries(partial)) {
      if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
        delete base[k];
      } else {
        base[k] = v;
      }
    }
    const style = Object.keys(base).length ? (base as unknown as SectionStylePack) : undefined;
    onChange({ ...section, style });
  };

  const num = (label: string, key: keyof SectionStylePack, min?: number, max?: number, step?: number) => (
    <div>
      <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">{label}</label>
      <input
        type="number"
        value={s[key] !== undefined ? Number(s[key]) : ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') patch({ [key]: undefined } as Partial<SectionStylePack>);
          else patch({ [key]: Number(v) } as Partial<SectionStylePack>);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
      />
    </div>
  );

  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-500/90">
        Advanced appearance
      </p>
      <p className="mb-2 text-[10px] text-slate-600 dark:text-slate-500">
        Wrapper around this block: typography, box, spacing, optional fixed width/height (mm), background
        image.
      </p>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Text color</label>
            <input
              type="color"
              value={s.color || '#000000'}
              onChange={(e) => patch({ color: e.target.value })}
              className="h-8 w-full rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Background</label>
            <input
              type="color"
              value={s.backgroundColor || '#ffffff'}
              onChange={(e) => patch({ backgroundColor: e.target.value })}
              className="h-8 w-full rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Background image URL</label>
          <input
            type="text"
            value={s.backgroundImageUrl ?? ''}
            onChange={(e) => patch({ backgroundImageUrl: e.target.value.trim() || undefined })}
            placeholder="https://..."
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">BG size</label>
            <select
              value={s.backgroundSize ?? ''}
              onChange={(e) =>
                patch({
                  backgroundSize: (e.target.value || undefined) as SectionStylePack['backgroundSize'],
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">(default)</option>
              <option value="auto">auto</option>
              <option value="cover">cover</option>
              <option value="contain">contain</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">BG repeat</label>
            <select
              value={s.backgroundRepeat ?? ''}
              onChange={(e) =>
                patch({
                  backgroundRepeat: (e.target.value || undefined) as SectionStylePack['backgroundRepeat'],
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">(default)</option>
              <option value="no-repeat">no-repeat</option>
              <option value="repeat">repeat</option>
              <option value="repeat-x">repeat-x</option>
              <option value="repeat-y">repeat-y</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">BG position (CSS)</label>
          <input
            type="text"
            value={s.backgroundPosition ?? ''}
            onChange={(e) => patch({ backgroundPosition: e.target.value.trim() || undefined })}
            placeholder="e.g. center top, 50% 20%"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {num('Border width (px)', 'borderWidthPx', 0, 12)}
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Border color</label>
            <input
              type="color"
              value={s.borderColor || '#000000'}
              onChange={(e) => patch({ borderColor: e.target.value })}
              className="h-8 w-full rounded border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
        </div>
        {num('Border radius (px)', 'borderRadiusPx', 0, 48)}
        {num('Padding (mm)', 'paddingMm', 0, 40)}
        <div className="grid grid-cols-2 gap-2">
          {num('Margin top (mm)', 'marginTopMm', 0, 80)}
          {num('Margin bottom (mm)', 'marginBottomMm', 0, 80)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {num('Width (mm)', 'widthMm', 0, 200)}
          {num('Height (mm)', 'heightMm', 0, 280)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {num('Min height (mm)', 'minHeightMm', 0, 280)}
          {num('Max width (mm)', 'maxWidthMm', 0, 200)}
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Font family</label>
          <input
            type="text"
            value={s.fontFamily ?? ''}
            onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
            placeholder="e.g. Georgia, serif"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {num('Font size (pt)', 'fontSizePt', 6, 48)}
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Font weight</label>
            <select
              value={s.fontWeight ?? ''}
              onChange={(e) =>
                patch({
                  fontWeight: (e.target.value || undefined) as 'normal' | 'bold' | undefined,
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">(inherit)</option>
              <option value="normal">Normal</option>
              <option value="bold">Bold</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Font style</label>
            <select
              value={s.fontStyle ?? ''}
              onChange={(e) =>
                patch({
                  fontStyle: (e.target.value || undefined) as 'normal' | 'italic' | undefined,
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">(inherit)</option>
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Decoration</label>
            <select
              value={s.textDecoration ?? ''}
              onChange={(e) =>
                patch({
                  textDecoration: (e.target.value || undefined) as SectionStylePack['textDecoration'],
                })
              }
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">(inherit)</option>
              <option value="none">None</option>
              <option value="underline">Underline</option>
              <option value="line-through">Line-through</option>
              <option value="underline line-through">Underline + strike</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {num('Line height', 'lineHeight', 0.8, 3, 0.05)}
          {num('Opacity', 'opacity', 0, 1, 0.05)}
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-slate-600 dark:text-slate-500">Text align</label>
          <select
            value={s.textAlign ?? ''}
            onChange={(e) =>
              patch({
                textAlign: (e.target.value || undefined) as 'left' | 'center' | 'right' | undefined,
              })
            }
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            <option value="">(inherit)</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...section, style: undefined })}
          className="w-full rounded bg-slate-200 py-1.5 text-[10px] text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          Clear advanced styles
        </button>
      </div>
    </div>
  );
}
