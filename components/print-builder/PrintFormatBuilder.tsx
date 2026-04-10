'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import type { PrintTemplate, PrintElement, ElementType, ItemType, NamedPrintTemplate } from '@/lib/types/printTemplate';
import { DEFAULT_TEMPLATE, getDefaultElements } from '@/lib/utils/printDefaults';
import { getMockData } from '@/lib/utils/templateData';
import { ITEM_TYPE_FIELDS } from '@/lib/utils/itemTypeFields';
import { ElementPalette } from './ElementPalette';
import { BuilderCanvas } from './BuilderCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { TemplateRenderer } from './TemplateRenderer';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { A4_H, SCALE, snapToGrid, clampX, clampY, pxToMm } from './canvasConstants';

interface PaletteItem {
  type: ElementType;
  defaultW: number;
  defaultH: number;
}

interface PrintFormatBuilderProps {
  itemType?: ItemType;
  initialTemplate?: NamedPrintTemplate | PrintTemplate | null;
  letterheadUrl?: string;
  onSave?: (template: NamedPrintTemplate) => Promise<void>;
  onClose?: () => void;
  saving?: boolean;
}

export function PrintFormatBuilder({
  itemType = 'delivery-note',
  initialTemplate,
  letterheadUrl,
  onSave,
  onClose,
  saving: savingProp = false,
}: PrintFormatBuilderProps) {
  // Determine the effective template to edit
  const effectiveTemplate = initialTemplate ?? DEFAULT_TEMPLATE;
  const isNamedTemplate = 'id' in effectiveTemplate;

  const [elements, setElements] = useState<PrintElement[]>(
    effectiveTemplate.elements ?? getDefaultElements(itemType)
  );
  const [margins, setMargins] = useState(
    effectiveTemplate.pageMargins ?? DEFAULT_TEMPLATE.pageMargins
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(savingProp);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [history, setHistory] = useState<PrintElement[][]>([]);
  const [future, setFuture] = useState<PrintElement[][]>([]);
  const [activePaletteItem, setActivePaletteItem] = useState<PaletteItem | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Commit changes to undo history
  const commit = (newElements: PrintElement[]) => {
    if (JSON.stringify(newElements) === JSON.stringify(elements)) return;
    setHistory((prev) => [...prev.slice(-30), elements]);
    setFuture([]);
    setElements(newElements);
  };

  const undo = () => {
    if (history.length === 0) return;
    setFuture((prev) => [elements, ...prev]);
    setElements(history[history.length - 1]);
    setHistory((prev) => prev.slice(0, -1));
  };

  const redo = () => {
    if (future.length === 0) return;
    setHistory((prev) => [...prev, elements]);
    setElements(future[0]);
    setFuture((prev) => prev.slice(1));
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Create default element
  function createDefaultElement(item: PaletteItem, xMm: number, yMm: number): PrintElement {
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const base = { id, x: xMm, y: yMm, width: item.defaultW, height: item.defaultH, zIndex: 1 };

    const result: PrintElement = (() => {
      switch (item.type) {
        case 'text':
          return { ...base, type: 'text' as const, content: 'Text block' };
        case 'field':
          return {
            ...base,
            type: 'field' as const,
            field: 'dn.number',
            format: 'text' as const,
          };
        case 'letterhead':
          return {
            ...base,
            type: 'letterhead' as const,
            objectFit: 'contain' as const,
            style: { opacity: 0.15 },
          };
        case 'table':
          return {
            ...base,
            type: 'table' as const,
            dataSource: 'customItems' as const,
            columns: [
              { header: 'SL.NO.', field: 'slno', width: 10, align: 'center' as const },
              { header: 'DESCRIPTION', field: 'name', width: 50 },
              { header: 'UNIT', field: 'unit', width: 15 },
              { header: 'QTY', field: 'qty', width: 25, align: 'right' as const },
            ],
          };
        case 'line':
          return {
            ...base,
            type: 'line' as const,
            color: '#000',
            thickness: 1,
          };
        case 'signature':
          return { ...base, type: 'signature' as const, label: 'SIGNATURE' };
        case 'box':
          return {
            ...base,
            type: 'box' as const,
            style: { borderWidth: 1, borderColor: '#000' },
          };
        default:
          return base as unknown as PrintElement;
      }
    })();
    return result;
  }

  const handleDragStart = (event: any) => {
    setActivePaletteItem(event.active.data.current?.paletteItem ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActivePaletteItem(null);
    const { active, over } = event;

    if (!over || over.id !== 'canvas-drop-zone') return;
    if (!active.data.current?.paletteItem) return;

    const item: PaletteItem = active.data.current.paletteItem;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const pointerEvent = event.activatorEvent as PointerEvent;
    const dropX = pointerEvent.clientX + (event.delta.x || 0) - canvasRect.left;
    const dropY = pointerEvent.clientY + (event.delta.y || 0) - canvasRect.top;

    const xMm = snapToGrid(
      clampX(pxToMm(dropX) - item.defaultW / 2, item.defaultW)
    );
    const yMm = snapToGrid(
      clampY(pxToMm(dropY) - item.defaultH / 2, item.defaultH)
    );

    const newEl = createDefaultElement(item, xMm, yMm);
    commit([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build the template object
      const template: NamedPrintTemplate = {
        id: isNamedTemplate ? (effectiveTemplate as NamedPrintTemplate).id : `template-${Date.now()}`,
        name: isNamedTemplate ? (effectiveTemplate as NamedPrintTemplate).name : 'Untitled Template',
        itemType,
        isDefault: isNamedTemplate ? (effectiveTemplate as NamedPrintTemplate).isDefault : false,
        version: 1,
        pageMargins: margins,
        elements,
      };

      // If onSave callback provided, use it; otherwise fetch API (backward compat for legacy settings tab)
      if (onSave) {
        await onSave(template);
        toast.success('Template saved successfully');
      } else {
        // Legacy: save single template directly to company (for backward compatibility)
        // This path should not be used in multi-template flow
        toast.error('Save callback not provided');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const template: PrintTemplate = { version: 1, pageMargins: margins, elements };
  const mockData = getMockData(itemType);
  const mockDataWithLetterhead = {
    ...(mockData as any),
    company: { ...(mockData as any).company, letterheadUrl: letterheadUrl || '' },
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-700">
        <Button size="sm" onClick={handleSave} loading={saving}>
          Save Template
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>
          Preview
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            commit(getDefaultElements(itemType));
            setMargins(DEFAULT_TEMPLATE.pageMargins);
          }}
        >
          Reset to Default
        </Button>
        <div className="flex-1" />
        {onClose && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            title="Close editor"
          >
            ✕
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={undo}
          disabled={history.length === 0}
          title="Undo (Ctrl+Z)"
        >
          ↩
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={redo}
          disabled={future.length === 0}
          title="Redo (Ctrl+Y)"
        >
          ↪
        </Button>
      </div>

      {/* Main content area */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 overflow-hidden">
          {/* Palette */}
          <ElementPalette />

          {/* Canvas scroll area */}
          <div className="flex-1 overflow-auto bg-slate-800 p-6 flex justify-center items-start">
            <BuilderCanvas
              canvasRef={canvasRef}
              template={template}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onElementsChange={commit}
              onDeleteElement={(id) => commit(elements.filter((el) => el.id !== id))}
              letterheadUrl={letterheadUrl}
              itemType={itemType}
            />
          </div>

          {/* Properties panel */}
          <PropertiesPanel
            element={elements.find((el) => el.id === selectedId) ?? null}
            onUpdate={(patch) => {
              commit(
                elements.map((el) =>
                  el.id === selectedId ? ({ ...el, ...patch } as PrintElement) : el
                ) as PrintElement[]
              );
            }}
            template={template}
            onUpdateMargins={setMargins}
            itemType={itemType}
          />
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activePaletteItem && (
            <div className="bg-slate-700 border border-emerald-500 rounded px-3 py-2 text-white text-sm opacity-90 shadow-lg">
              {activePaletteItem.type}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Preview Modal */}
      <Modal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Template Preview"
        size="xl"
      >
        <div className="bg-white p-6 rounded overflow-auto" style={{ maxHeight: '70vh' }}>
          <div className="flex justify-center">
            <TemplateRenderer
              template={template}
              data={mockDataWithLetterhead}
              scale={SCALE * 0.6}
              useCSSUnits={false}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
