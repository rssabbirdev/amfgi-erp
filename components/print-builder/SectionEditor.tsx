'use client';

import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { DocumentSection, ItemType, SectionCanvasRect } from '@/lib/types/documentTemplate';
import {
  getSectionTypeLabel,
  getSectionCustomNameInputValue,
} from '@/lib/types/documentTemplate';
import { getTableColumnFieldsForDataSource } from '@/lib/utils/itemTypeFields';
import { SearchableFieldSelect } from './SearchableFieldSelect';
import { SectionAdvancedStyleEditor } from './SectionAdvancedStyleEditor';

/** Module-level helpers so React does not remount inputs every parent render (stable component identity). */
function EditorInput({
  label,
  value,
  onChange: onInput,
  type = 'text',
  ...props
}: {
  label: string;
  value: string | number | '';
  onChange: (v: any) => void;
  type?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onInput(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
        {...props}
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
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
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
  return (
    <div className="flex gap-1">
      {['left', 'center', 'right'].map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onAlignChange(a)}
          className={`rounded px-2 py-1 text-xs ${value === a ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}
        >
          {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
        </button>
      ))}
    </div>
  );
}

interface SectionEditorProps {
  section: DocumentSection;
  /** Built-in or custom ERP document kind — drives field picker & explorer */
  itemType: ItemType;
  onChange: (updated: DocumentSection) => void;
  /** When true, all fields are read-only (block is locked in the builder). */
  locked?: boolean;
  /** Active company — required for template image upload to Drive */
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
      if (section.imageDriveId) {
        formData.append('replaceDriveId', section.imageDriveId);
      }
      const res = await fetch('/api/upload/template-image', { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Upload failed');
        return;
      }
      const url = json.data?.url as string | undefined;
      const driveId = json.data?.driveId as string | undefined;
      if (!url) {
        toast.error('Invalid upload response');
        return;
      }
      onChange({ ...section, imageUrl: url, imageDriveId: driveId });
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
            ...(s ? {} : { imageDriveId: undefined }),
          });
        }}
        placeholder="https://… or Google Drive link"
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
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
        {(section.imageUrl || section.imageDriveId) && (
          <button
            type="button"
            disabled={locked}
            onClick={() => onChange({ ...section, imageUrl: undefined, imageDriveId: undefined })}
            className="rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 disabled:opacity-40"
          >
            Clear
          </button>
        )}
      </div>
      {!companyId && (
        <p className="text-[10px] text-amber-500/90">Save company context missing — upload unavailable.</p>
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
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
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

  const content = (() => {
    switch (section.type) {
    case 'image':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Image</p>
          <TemplateImageUpload section={section} onChange={onChange} companyId={companyId} locked={locked} />
          <div>
            <label className="mb-1 block text-xs text-slate-400">Source</label>
            <select
              value={section.source}
              onChange={(e) =>
                onChange({
                  ...section,
                  source: e.target.value as 'url' | 'field',
                })
              }
              disabled={locked}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
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
              onChange={(v) => onChange({ ...section, url: v })}
              disabled={locked}
            />
          )}
          <EditorCheckBox
            label="Fallback: use company letterhead URL when nothing else resolves"
            checked={section.useCompanyLetterheadFallback !== false}
            onChange={(v) => onChange({ ...section, useCompanyLetterheadFallback: v })}
          />
          <div>
            <label className="mb-1 block text-xs text-slate-400">Layout</label>
            <select
              value={section.layout ?? 'inline'}
              onChange={(e) =>
                onChange({ ...section, layout: e.target.value as 'inline' | 'fill' })
              }
              disabled={locked}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
            >
              <option value="inline">Inline (row, width auto)</option>
              <option value="fill">Fill cell width (banner)</option>
            </select>
          </div>
          <EditorInput
            label="Height (mm)"
            type="number"
            value={section.heightMm}
            onChange={(v) => onChange({ ...section, heightMm: v })}
            min={8}
            max={120}
            disabled={locked}
          />
          <EditorInput
            label="Margin below (mm)"
            type="number"
            value={section.marginBottomMm ?? ''}
            onChange={(v) => onChange({ ...section, marginBottomMm: v || undefined })}
            min={0}
            max={20}
            disabled={locked}
          />
          <div>
            <label className="mb-1 block text-xs text-slate-400">Object fit</label>
            <select
              value={section.objectFit}
              onChange={(e) =>
                onChange({
                  ...section,
                  objectFit: e.target.value as 'contain' | 'cover' | 'fill',
                })
              }
              disabled={locked}
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
            >
              <option value="contain">contain</option>
              <option value="cover">cover</option>
              <option value="fill">fill (stretch)</option>
            </select>
          </div>
          <EditorInput
            label="Object position (CSS)"
            value={section.objectPosition ?? ''}
            onChange={(v) => onChange({ ...section, objectPosition: v.trim() || undefined })}
            placeholder="e.g. center top, 50% 30%"
            disabled={locked}
          />
          <div>
            <label className="mb-1 block text-xs text-slate-400">Align (inline layout)</label>
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
          <EditorInput label="Static text" value={section.text} onChange={(v) => onChange({ ...section, text: v })} />
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={48} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Align</label>
            <EditorAlignSelect value={section.align} onAlignChange={(v) => onChange({ ...section, align: v as any })} />
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
            <label className="mb-1 block text-xs text-slate-400">Layout</label>
            <select
              value={section.layout ?? 'flex'}
              onChange={(e) =>
                onChange({
                  ...section,
                  layout: e.target.value as 'flex' | 'grid',
                  gridColumns: e.target.value === 'grid' ? section.gridColumns ?? 2 : undefined,
                })
              }
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
            >
              <option value="flex">Flex row (cell widths %)</option>
              <option value="grid">CSS grid (equal columns)</option>
            </select>
          </div>
          {section.layout === 'grid' && (
            <div>
              <label className="mb-1 block text-xs text-slate-400">Grid columns</label>
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
                <EditorInput label="Label" value={cell.label ?? ''} onChange={(v) => {
                  const cells = [...section.cells];
                  cells[ci] = { ...cells[ci], label: v };
                  onChange({ ...section, cells });
                }} />
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
                <EditorInput label="Static Text (if no field)" value={cell.text ?? ''} onChange={(v) => {
                  const cells = [...section.cells];
                  cells[ci] = { ...cells[ci], text: v };
                  onChange({ ...section, cells });
                }} />
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
              onChange={(e) => onChange({ ...section, dataSource: e.target.value as any })}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white"
            >
              <option value="customItems">Custom Items</option>
              <option value="batches">Batches</option>
              <option value="items">Items</option>
            </select>
          </div>
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={18} />
          <EditorInput label="Min Rows" type="number" value={section.minRows} onChange={(v) => onChange({ ...section, minRows: v })} min={0} max={50} />
          <EditorInput label="Row Padding (mm)" type="number" value={section.rowPadding} onChange={(v) => onChange({ ...section, rowPadding: v })} min={0} max={10} />
          <EditorCheckBox label="Show Borders" checked={section.showBorders} onChange={(v) => onChange({ ...section, showBorders: v })} />
          <EditorCheckBox label="Repeat Header on New Page" checked={section.repeatHeaderOnNewPage} onChange={(v) => onChange({ ...section, repeatHeaderOnNewPage: v })} />
          <EditorInput label="Header Background" type="color" value={section.headerBg} onChange={(v) => onChange({ ...section, headerBg: v })} />

          {/* Column editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400 font-bold">Columns ({section.columns.length})</label>
              <button
                type="button"
                className="text-xs text-emerald-400 hover:text-emerald-300"
                onClick={() => onChange({ ...section, columns: [...section.columns, { header: 'New', field: '', width: undefined, align: 'left' }] })}
              >
                + Add Column
              </button>
            </div>
            {section.columns.map((col, ci) => (
              <div key={ci} className="p-2 bg-slate-800/50 rounded border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Col {ci + 1}</span>
                  {section.columns.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-300"
                      onClick={() => onChange({ ...section, columns: section.columns.filter((_, i) => i !== ci) })}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <EditorInput label="Header" value={col.header} onChange={(v) => {
                  const columns = [...section.columns];
                  columns[ci] = { ...columns[ci], header: v };
                  onChange({ ...section, columns });
                }} />
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
                  placeholder="Search row keys (name, qty, slno…)…"
                />
                <div className="flex gap-2">
                  <EditorInput label="Width (%)" type="number" value={col.width ?? ''} onChange={(v) => {
                    const columns = [...section.columns];
                    columns[ci] = { ...columns[ci], width: v || undefined };
                    onChange({ ...section, columns });
                  }} min={0} max={100} />
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Align</label>
                    <EditorAlignSelect value={col.align} onAlignChange={(v) => {
                      const columns = [...section.columns];
                      columns[ci] = { ...columns[ci], align: v as any };
                      onChange({ ...section, columns });
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'text':
      return (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-300 uppercase">Text Block</p>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Content</label>
            <textarea
              value={section.content}
              onChange={(e) => onChange({ ...section, content: e.target.value })}
              rows={3}
              className="w-full px-2 py-1.5 text-xs bg-slate-800 border border-slate-600 rounded text-white resize-y"
            />
          </div>
          <EditorInput label="Font Size (pt)" type="number" value={section.fontSize} onChange={(v) => onChange({ ...section, fontSize: v })} min={6} max={24} />
          <div>
            <label className="block text-xs text-slate-400 mb-1">Align</label>
            <EditorAlignSelect value={section.align} onAlignChange={(v) => onChange({ ...section, align: v as any })} />
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
            <label className="mb-1 block text-xs text-slate-400">Columns</label>
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
                <EditorInput label="Label" value={item.label} onChange={(v) => {
                  const items = [...section.items];
                  items[ii] = { ...items[ii], label: v };
                  onChange({ ...section, items });
                }} />
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
                <input
                  value={sig.label}
                  onChange={(e) => {
                    const items = [...section.items];
                    items[si] = { label: e.target.value };
                    onChange({ ...section, items });
                  }}
                  className="flex-1 px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white"
                />
                {section.items.length > 1 && (
                  <button type="button" className="text-xs text-red-400" onClick={() => onChange({ ...section, items: section.items.filter((_, i) => i !== si) })}>×</button>
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
            <label className="mb-1 block text-xs text-slate-400">Shape</label>
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
              className="w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-xs text-white"
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
          <EditorInput label="Static label" type="text" value={section.label ?? ''} onChange={(v) => onChange({ ...section, label: v })} />
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
