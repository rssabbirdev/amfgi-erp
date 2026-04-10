'use client';

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ElementType } from '@/lib/types/printTemplate';

interface PaletteItem {
  type: ElementType;
  label: string;
  icon: string;
  defaultW: number;
  defaultH: number;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'text', label: 'Text', icon: 'T', defaultW: 60, defaultH: 10 },
  { type: 'field', label: 'Dynamic Field', icon: '{}', defaultW: 60, defaultH: 10 },
  { type: 'letterhead', label: 'Letterhead', icon: '🖼', defaultW: 180, defaultH: 50 },
  { type: 'table', label: 'Items Table', icon: '⊞', defaultW: 180, defaultH: 60 },
  { type: 'line', label: 'Horizontal Line', icon: '—', defaultW: 180, defaultH: 2 },
  { type: 'signature', label: 'Signature Box', icon: '✎', defaultW: 55, defaultH: 25 },
  { type: 'box', label: 'Bordered Box', icon: '□', defaultW: 80, defaultH: 30 },
];

interface PaletteTileProps {
  item: PaletteItem;
}

function PaletteTile({ item }: PaletteTileProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${item.type}`,
    data: { paletteItem: item },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-slate-600
                  bg-slate-800 hover:bg-slate-700 cursor-grab active:cursor-grabbing select-none
                  text-slate-300 transition-colors ${isDragging ? 'opacity-40 ring-2 ring-emerald-500' : ''}`}
      role="button"
      tabIndex={0}
      title={`Drag ${item.label} to canvas`}
    >
      <span className="text-lg">{item.icon}</span>
      <span className="text-xs text-center font-medium">{item.label}</span>
    </div>
  );
}

export function ElementPalette() {
  return (
    <div className="w-44 bg-slate-900 border-r border-slate-700 p-3 flex flex-col gap-2 overflow-y-auto">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
        Elements
      </p>
      {PALETTE_ITEMS.map((item) => (
        <PaletteTile key={item.type} item={item} />
      ))}
      <div className="mt-4 pt-3 border-t border-slate-700 text-xs text-slate-400">
        <p className="font-semibold mb-2">Tips:</p>
        <ul className="space-y-1 text-xs leading-relaxed">
          <li>• Drag elements onto the canvas</li>
          <li>• Click to select, drag to move</li>
          <li>• Drag corners to resize</li>
          <li>• Delete key to remove</li>
        </ul>
      </div>
    </div>
  );
}
