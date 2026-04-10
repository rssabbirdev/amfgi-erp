'use client';

import React, { useState } from 'react';
import type { PrintElement, PrintTemplate, TableColumn, ItemType } from '@/lib/types/printTemplate';
import { AVAILABLE_FIELDS } from '@/lib/utils/templateData';
import { ITEM_TYPE_FIELDS } from '@/lib/utils/itemTypeFields';

interface PropertiesPanelProps {
  element: PrintElement | null;
  onUpdate: (patch: Partial<PrintElement>) => void;
  template: PrintTemplate;
  onUpdateMargins: (margins: { top: number; right: number; bottom: number; left: number }) => void;
  itemType?: ItemType;
}

function PropInput({
  label,
  value,
  onChange,
  type = 'text',
  min,
  max,
  step,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (val: string | number) => void;
  type?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="mb-2">
      <label className="block text-xs text-slate-400 font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          onChange(type === 'number' ? parseFloat(val) || 0 : val);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                   focus:ring-1 focus:ring-emerald-500 outline-none"
      />
    </div>
  );
}

function PositionSection({ element, onUpdate }: { element: PrintElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Position (mm)</p>
      <PropInput
        label="X"
        value={element.x}
        onChange={(v) => onUpdate({ x: v as number })}
        type="number"
        min={0}
        step={0.5}
      />
      <PropInput
        label="Y"
        value={element.y}
        onChange={(v) => onUpdate({ y: v as number })}
        type="number"
        min={0}
        step={0.5}
      />
    </div>
  );
}

function SizeSection({ element, onUpdate }: { element: PrintElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Size (mm)</p>
      <PropInput
        label="Width"
        value={element.width}
        onChange={(v) => onUpdate({ width: v as number })}
        type="number"
        min={5}
        step={0.5}
      />
      <PropInput
        label="Height"
        value={element.height}
        onChange={(v) => onUpdate({ height: v as number })}
        type="number"
        min={5}
        step={0.5}
      />
    </div>
  );
}

function StyleSection({ element, onUpdate }: { element: PrintElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const style = element.style || {};

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Style</p>
      <PropInput
        label="Font Size (pt)"
        value={style.fontSize}
        onChange={(v) => onUpdate({ style: { ...style, fontSize: v as number } })}
        type="number"
        min={6}
        max={72}
        step={0.5}
      />
      <div className="mb-2">
        <label className="block text-xs text-slate-400 font-medium mb-1">Font Weight</label>
        <select
          value={style.fontWeight ?? 'normal'}
          onChange={(e) => onUpdate({ style: { ...style, fontWeight: e.target.value as 'normal' | 'bold' } })}
          className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                     focus:ring-1 focus:ring-emerald-500 outline-none"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </select>
      </div>
      <div className="mb-2">
        <label className="block text-xs text-slate-400 font-medium mb-1">Text Align</label>
        <select
          value={style.textAlign ?? 'left'}
          onChange={(e) => onUpdate({ style: { ...style, textAlign: e.target.value as 'left' | 'center' | 'right' } })}
          className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                     focus:ring-1 focus:ring-emerald-500 outline-none"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <PropInput
        label="Color (hex)"
        value={style.color}
        onChange={(v) => onUpdate({ style: { ...style, color: v as string } })}
        type="text"
      />
      <PropInput
        label="Background (hex)"
        value={style.backgroundColor}
        onChange={(v) => onUpdate({ style: { ...style, backgroundColor: v as string } })}
        type="text"
      />
      <PropInput
        label="Border Color (hex)"
        value={style.borderColor}
        onChange={(v) => onUpdate({ style: { ...style, borderColor: v as string } })}
        type="text"
      />
      <PropInput
        label="Border Width (px)"
        value={style.borderWidth}
        onChange={(v) => onUpdate({ style: { ...style, borderWidth: v as number } })}
        type="number"
        min={0}
        max={5}
        step={0.5}
      />
      <PropInput
        label="Opacity (0-1)"
        value={style.opacity}
        onChange={(v) => onUpdate({ style: { ...style, opacity: v as number } })}
        type="number"
        min={0}
        max={1}
        step={0.1}
      />
    </div>
  );
}

function TextContentSection({ element, onUpdate }: { element: PrintElement & { type: 'text' }; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Content</p>
      <textarea
        value={element.content}
        onChange={(e) => onUpdate({ content: e.target.value })}
        className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                   focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
        rows={3}
      />
    </div>
  );
}

function FieldPickerSection({ element, onUpdate, itemType }: { element: PrintElement & { type: 'field' }; onUpdate: PropertiesPanelProps['onUpdate']; itemType?: ItemType }) {
  const el = element as any;

  // Group fields by category if using ITEM_TYPE_FIELDS, otherwise show flat list
  const groupedFields = itemType
    ? ITEM_TYPE_FIELDS[itemType].reduce((acc, f) => {
        if (!acc[f.category]) acc[f.category] = [];
        acc[f.category].push(f);
        return acc;
      }, {} as Record<string, typeof ITEM_TYPE_FIELDS[typeof itemType]>)
    : null;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Field</p>
      <div className="mb-2">
        <label className="block text-xs text-slate-400 font-medium mb-1">Select Field</label>
        <select
          value={el.field ?? ''}
          onChange={(e) => onUpdate({ field: e.target.value })}
          className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                     focus:ring-1 focus:ring-emerald-500 outline-none"
        >
          <option value="">-- Select --</option>
          {groupedFields ? (
            // Grouped by category for item types
            Object.entries(groupedFields).map(([category, categoryFields]) => (
              <optgroup key={category} label={category}>
                {categoryFields.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            ))
          ) : (
            // Flat list for backward compatibility (AVAILABLE_FIELDS)
            AVAILABLE_FIELDS.map((f) => (
              <option key={f.path} value={f.path}>
                {f.label}
              </option>
            ))
          )}
        </select>
      </div>
      <PropInput
        label="Label (optional)"
        value={el.label}
        onChange={(v) => onUpdate({ label: v as string })}
      />
      <div className="mb-2">
        <label className="block text-xs text-slate-400 font-medium mb-1">Format</label>
        <select
          value={el.format ?? 'text'}
          onChange={(e) => onUpdate({ format: e.target.value as any })}
          className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                     focus:ring-1 focus:ring-emerald-500 outline-none"
        >
          <option value="text">Text</option>
          <option value="date">Date</option>
          <option value="currency">Currency</option>
          <option value="number">Number</option>
        </select>
      </div>
    </div>
  );
}

function SignatureLabelSection({ element, onUpdate }: { element: PrintElement & { type: 'signature' }; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const el = element as any;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Label</p>
      <PropInput
        label="Label Text"
        value={el.label}
        onChange={(v) => onUpdate({ label: v as string })}
      />
    </div>
  );
}

function TableColumnsSection({ element, onUpdate }: { element: PrintElement & { type: 'table' }; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const el = element as any;
  const [columns, setColumns] = useState<TableColumn[]>(el.columns || []);
  const [dataSource, setDataSource] = useState<'customItems' | 'batches' | 'items'>(el.dataSource || 'customItems');

  const handleAddColumn = () => {
    const newCols = [...columns, { header: 'New Column', field: 'field', width: undefined, align: 'left' as const }];
    setColumns(newCols);
    onUpdate({ columns: newCols });
  };

  const handleRemoveColumn = (idx: number) => {
    const newCols = columns.filter((_, i) => i !== idx);
    setColumns(newCols);
    onUpdate({ columns: newCols });
  };

  const handleUpdateColumn = (idx: number, patch: Partial<TableColumn>) => {
    const newCols = columns.map((col, i) => (i === idx ? { ...col, ...patch } : col));
    setColumns(newCols);
    onUpdate({ columns: newCols });
  };

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Table</p>
      <div className="mb-2">
        <label className="block text-xs text-slate-400 font-medium mb-1">Data Source</label>
        <select
          value={dataSource}
          onChange={(e) => {
            const newSource = e.target.value as 'customItems' | 'batches' | 'items';
            setDataSource(newSource);
            onUpdate({ dataSource: newSource });
          }}
          className="w-full px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white
                     focus:ring-1 focus:ring-emerald-500 outline-none"
        >
          <option value="customItems">Custom Items</option>
          <option value="batches">Batches</option>
          <option value="items">Items</option>
        </select>
      </div>
      <p className="text-xs font-semibold text-slate-400 mb-2">Columns</p>
      <div className="space-y-3 max-h-40 overflow-y-auto mb-2">
        {columns.map((col, idx) => (
          <div key={idx} className="p-2 bg-slate-800 rounded border border-slate-600">
            <input
              type="text"
              placeholder="Header"
              value={col.header}
              onChange={(e) => handleUpdateColumn(idx, { header: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white mb-1
                         focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            <input
              type="text"
              placeholder="Field (e.g., name, qty, slno)"
              value={col.field}
              onChange={(e) => handleUpdateColumn(idx, { field: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white mb-1
                         focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            <input
              type="number"
              placeholder="Width %"
              value={col.width || ''}
              onChange={(e) => handleUpdateColumn(idx, { width: e.target.value ? parseFloat(e.target.value) : undefined })}
              className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white mb-1
                         focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            <select
              value={col.align || 'left'}
              onChange={(e) => handleUpdateColumn(idx, { align: e.target.value as 'left' | 'center' | 'right' })}
              className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white mb-1
                         focus:ring-1 focus:ring-emerald-500 outline-none"
            >
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
            <button
              onClick={() => handleRemoveColumn(idx)}
              className="w-full px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={handleAddColumn}
        className="w-full px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded"
      >
        + Add Column
      </button>
    </div>
  );
}

export function PropertiesPanel({
  element,
  onUpdate,
  template,
  onUpdateMargins,
  itemType,
}: PropertiesPanelProps) {
  if (!element) {
    return (
      <div className="w-56 bg-slate-900 border-l border-slate-700 p-3 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Page Margins (mm)
        </p>
        <PropInput
          label="Top"
          value={template.pageMargins.top}
          onChange={(v) => onUpdateMargins({ ...template.pageMargins, top: v as number })}
          type="number"
          min={0}
        />
        <PropInput
          label="Right"
          value={template.pageMargins.right}
          onChange={(v) => onUpdateMargins({ ...template.pageMargins, right: v as number })}
          type="number"
          min={0}
        />
        <PropInput
          label="Bottom"
          value={template.pageMargins.bottom}
          onChange={(v) => onUpdateMargins({ ...template.pageMargins, bottom: v as number })}
          type="number"
          min={0}
        />
        <PropInput
          label="Left"
          value={template.pageMargins.left}
          onChange={(v) => onUpdateMargins({ ...template.pageMargins, left: v as number })}
          type="number"
          min={0}
        />
      </div>
    );
  }

  return (
    <div className="w-56 bg-slate-900 border-l border-slate-700 p-3 overflow-y-auto space-y-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Properties</p>

      <div className="border-t border-slate-700 pt-2">
        <PositionSection element={element} onUpdate={onUpdate} />
      </div>

      <div className="border-t border-slate-700 pt-2">
        <SizeSection element={element} onUpdate={onUpdate} />
      </div>

      <div className="border-t border-slate-700 pt-2">
        <StyleSection element={element} onUpdate={onUpdate} />
      </div>

      {element.type === 'text' && (
        <div className="border-t border-slate-700 pt-2">
          <TextContentSection element={element as any} onUpdate={onUpdate} />
        </div>
      )}

      {element.type === 'field' && (
        <div className="border-t border-slate-700 pt-2">
          <FieldPickerSection element={element as any} onUpdate={onUpdate} itemType={itemType} />
        </div>
      )}

      {element.type === 'signature' && (
        <div className="border-t border-slate-700 pt-2">
          <SignatureLabelSection element={element as any} onUpdate={onUpdate} />
        </div>
      )}

      {element.type === 'table' && (
        <div className="border-t border-slate-700 pt-2">
          <TableColumnsSection element={element as any} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
