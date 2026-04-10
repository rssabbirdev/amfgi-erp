'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { PrintTemplate, PrintElement, ItemType } from '@/lib/types/printTemplate';
import { TemplateRenderer } from './TemplateRenderer';
import {
  A4_W,
  A4_H,
  SCALE,
  CANVAS_PX_W,
  pxToMm,
  mmToPx,
  snapToGrid,
  clampX,
  clampY,
  GRID_SIZE_MM,
  MIN_ELEMENT_SIZE,
} from './canvasConstants';
import { getMockData } from '@/lib/utils/templateData';

interface CanvasElementProps {
  element: PrintElement;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (anchor: string, dx: number, dy: number) => void;
  onDelete: () => void;
}

function CanvasElement({
  element,
  isSelected,
  onSelect,
  onMove,
  onResize,
  onDelete,
}: CanvasElementProps) {
  const moveState = useRef<{ startX: number; startY: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Don't start drag if clicking a resize handle
    if (target.dataset.resizeHandle) return;

    e.stopPropagation();
    onSelect();

    moveState.current = { startX: e.clientX, startY: e.clientY };

    const onMouseMove = (mv: MouseEvent) => {
      if (!moveState.current) return;
      const dx = pxToMm(mv.clientX - moveState.current.startX);
      const dy = pxToMm(mv.clientY - moveState.current.startY);
      moveState.current = { startX: mv.clientX, startY: mv.clientY };
      onMove(dx, dy);
    };

    const onMouseUp = () => {
      moveState.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, anchor: string) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;

    const onMouseMove = (mv: MouseEvent) => {
      const dx = pxToMm(mv.clientX - startX);
      const dy = pxToMm(mv.clientY - startY);
      onResize(anchor, dx, dy);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const resizeHandleSize = 8; // px
  const resizeHandles = isSelected ? [
    'nw',
    'n',
    'ne',
    'e',
    'se',
    's',
    'sw',
    'w',
  ] : [];

  return (
    <div
      style={{
        position: 'absolute',
        left: mmToPx(element.x),
        top: mmToPx(element.y),
        width: mmToPx(element.width),
        height: mmToPx(element.height),
        cursor: 'move',
        boxSizing: 'border-box',
        outline: isSelected ? '2px solid #3b82f6' : 'none',
        outlineOffset: '1px',
        zIndex: (element.zIndex ?? 0) + 10,
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Resize handles */}
      {resizeHandles.map((anchor) => {
        const posMap: Record<string, React.CSSProperties> = {
          nw: { top: `-${resizeHandleSize / 2}px`, left: `-${resizeHandleSize / 2}px` },
          n: { top: `-${resizeHandleSize / 2}px`, left: '50%', transform: 'translateX(-50%)' },
          ne: { top: `-${resizeHandleSize / 2}px`, right: `-${resizeHandleSize / 2}px` },
          e: { top: '50%', right: `-${resizeHandleSize / 2}px`, transform: 'translateY(-50%)' },
          se: { bottom: `-${resizeHandleSize / 2}px`, right: `-${resizeHandleSize / 2}px` },
          s: { bottom: `-${resizeHandleSize / 2}px`, left: '50%', transform: 'translateX(-50%)' },
          sw: { bottom: `-${resizeHandleSize / 2}px`, left: `-${resizeHandleSize / 2}px` },
          w: { top: '50%', left: `-${resizeHandleSize / 2}px`, transform: 'translateY(-50%)' },
        };

        return (
          <div
            key={anchor}
            data-resize-handle={anchor}
            style={{
              position: 'absolute',
              width: resizeHandleSize,
              height: resizeHandleSize,
              backgroundColor: '#3b82f6',
              border: '1px solid white',
              borderRadius: '2px',
              cursor: `${anchor}-resize`,
              ...posMap[anchor],
            }}
            onMouseDown={(e) => handleResizeMouseDown(e, anchor)}
          />
        );
      })}
    </div>
  );
}

interface BuilderCanvasProps {
  template: PrintTemplate;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onElementsChange: (elements: PrintElement[]) => void;
  onDeleteElement: (id: string) => void;
  letterheadUrl?: string;
  canvasRef?: React.Ref<HTMLDivElement>;
  itemType?: ItemType;
}

export function BuilderCanvas({
  template,
  selectedId,
  onSelect,
  onElementsChange,
  onDeleteElement,
  letterheadUrl,
  itemType = 'delivery-note',
}: BuilderCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop-zone' });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Handle Delete key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        // Only if focus is not in an input
        const activeEl = document.activeElement;
        if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA') return;
        onDeleteElement(selectedId);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedId, onDeleteElement]);

  const handleMove = (id: string, dx: number, dy: number) => {
    onElementsChange(
      template.elements.map((el) => {
        if (el.id !== id) return el;
        const newX = snapToGrid(clampX(el.x + dx, el.width));
        const newY = snapToGrid(clampY(el.y + dy, el.height));
        return { ...el, x: newX, y: newY };
      })
    );
  };

  const handleResize = (id: string, anchor: string, dx: number, dy: number) => {
    onElementsChange(
      template.elements.map((el) => {
        if (el.id !== id) return el;

        let newX = el.x;
        let newY = el.y;
        let newW = el.width;
        let newH = el.height;

        // Handle different anchors
        if (anchor.includes('w')) {
          const delta = dx;
          newX = clampX(el.x + delta, el.width - delta);
          newW = Math.max(MIN_ELEMENT_SIZE, el.width - delta);
        }
        if (anchor.includes('e')) {
          newW = Math.max(MIN_ELEMENT_SIZE, clampX(el.x, el.width + dx) - el.x);
        }
        if (anchor.includes('n')) {
          const delta = dy;
          newY = clampY(el.y + delta, el.height - delta);
          newH = Math.max(MIN_ELEMENT_SIZE, el.height - delta);
        }
        if (anchor.includes('s')) {
          newH = Math.max(MIN_ELEMENT_SIZE, clampY(el.y, el.height + dy) - el.y);
        }

        newX = snapToGrid(newX);
        newY = snapToGrid(newY);
        newW = snapToGrid(newW);
        newH = snapToGrid(newH);

        return { ...el, x: newX, y: newY, width: newW, height: newH };
      })
    );
  };

  // Create mock data with letterhead
  const mockData = getMockData(itemType);
  const mockDataWithLetterhead = { ...(mockData as any), company: { ...(mockData as any).company, letterheadUrl: letterheadUrl || '' } };

  const canvasHeightPx = mmToPx(A4_H);

  return (
    <div
      ref={(node) => {
        canvasRef.current = node;
        setNodeRef(node);
      }}
      className={`relative bg-white shadow-2xl border-2 ${isOver ? 'border-emerald-500 ring-2 ring-emerald-500' : 'border-slate-300'} transition-colors`}
      style={{
        width: CANVAS_PX_W,
        height: canvasHeightPx,
        flexShrink: 0,
      }}
      onClick={() => onSelect(null)}
    >
      {/* A4 content */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Rendered template (view-only) */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <TemplateRenderer
            template={template}
            data={mockDataWithLetterhead}
            scale={SCALE}
            useCSSUnits={false}
            isBuilder
          />
        </div>

        {/* Interactive element overlays */}
        <div style={{ position: 'absolute', inset: 0 }}>
          {template.elements.map((el) => (
            <CanvasElement
              key={el.id}
              element={el}
              isSelected={selectedId === el.id}
              onSelect={() => onSelect(el.id)}
              onMove={(dx, dy) => handleMove(el.id, dx, dy)}
              onResize={(anchor, dx, dy) => handleResize(el.id, anchor, dx, dy)}
              onDelete={() => onDeleteElement(el.id)}
            />
          ))}
        </div>
      </div>

      {/* Grid background (optional visual aid) */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.05,
          zIndex: 0,
        }}
        width="100%"
        height="100%"
      >
        <defs>
          <pattern
            id="grid"
            width={mmToPx(GRID_SIZE_MM)}
            height={mmToPx(GRID_SIZE_MM)}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${mmToPx(GRID_SIZE_MM)} 0 L 0 0 0 ${mmToPx(GRID_SIZE_MM)}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}
