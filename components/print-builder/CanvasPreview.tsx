'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import type { DocumentTemplate, DocumentSection, SectionCanvasRect } from '@/lib/types/documentTemplate';
import { getCanvasMoveIndicesForSection, isSectionLocked } from '@/lib/types/documentTemplate';
import type { AnyTemplateDataContext } from '@/lib/utils/templateData';
import { DocumentRenderer } from './DocumentRenderer';
import {
  contentWidthMm,
  contentHeightMm,
  clampRectToContent,
  snapCanvasRect,
  marginBleedBox,
} from '@/lib/utils/canvasLayout';

/** Area behind the A4 page in the builder. `undefined` = default slate gray. */
export const DEFAULT_PREVIEW_WORKSPACE_BG = '#64748b';

interface CanvasPreviewProps {
  template: DocumentTemplate;
  data: AnyTemplateDataContext;
  selectedIdx: number | null;
  /** Select a block from the page (flow or canvas). Required for usable canvas editing. */
  onSelectSection?: (idx: number) => void;
  onUpdateSection: (idx: number, updated: DocumentSection) => void;
  /** When template.canvasMode, updates absolute rects */
  onCanvasRectsChange?: (rects: SectionCanvasRect[]) => void;
  /** After canvas drag/resize or flow resize ends (for undo batching) */
  onInteractionEnd?: () => void;
  scale?: number;
  /** `transparent` or any CSS color (e.g. hex). Omit for default gray. */
  workspaceBackground?: string;
  /** Show mm rulers along top/left of the page */
  showRuler?: boolean;
  /** Dashed bounds on each section in the preview (selection still shows a solid outline when off) */
  showSectionOutlines?: boolean;
  /** Section index hovered in the order list — highlights that block on the page */
  orderHoverIdx?: number | null;
  /** Snap edges to margins / sibling blocks while moving or resizing */
  snapEnabled?: boolean;
  /**
   * When true, blocks can be resized smaller than measured content (clip/scroll inside).
   * When false, width/height cannot go below the rendered content size in the preview.
   */
  allowShrinkBelowContent?: boolean;
}

interface SectionBounds {
  top: number;
  height: number;
}

type Interaction =
  | {
      kind: 'canvas-move';
      idx: number;
      startClientX: number;
      startClientY: number;
      startRect: SectionCanvasRect;
      moveGroupIndices: number[];
      startRects: SectionCanvasRect[];
    }
  | {
      kind: 'canvas-resize';
      idx: number;
      startClientX: number;
      startClientY: number;
      startRect: SectionCanvasRect;
    }
  | {
      kind: 'flow-resize';
      sectionIdx: number;
      startY: number;
      startHeight: number;
    };

const RULER_GUTTER = 18;

/**
 * Preview: flow layout with measured overlays, or canvas mode with drag + corner resize.
 */
export function CanvasPreview({
  template,
  data,
  selectedIdx,
  onSelectSection,
  onUpdateSection,
  onCanvasRectsChange,
  onInteractionEnd,
  scale = 2.35,
  workspaceBackground,
  showRuler = false,
  showSectionOutlines = true,
  orderHoverIdx = null,
  snapEnabled = true,
  allowShrinkBelowContent = false,
}: CanvasPreviewProps) {
  const outerBg =
    workspaceBackground === 'transparent'
      ? 'transparent'
      : workspaceBackground && workspaceBackground.trim() !== ''
        ? workspaceBackground.trim()
        : DEFAULT_PREVIEW_WORKSPACE_BG;
  const containerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const [sectionBounds, setSectionBounds] = useState<SectionBounds[]>([]);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ vx: number[]; hy: number[] }>({ vx: [], hy: [] });

  const m = template.pageMargins;
  const rects = template.canvasRects;
  const hasCanvas =
    Boolean(template.canvasMode) &&
    Array.isArray(rects) &&
    rects.length === template.sections.length &&
    template.sections.length > 0;

  const cw = contentWidthMm(m);
  const ch = contentHeightMm(m);

  const marginLeftPx = m.left * scale;
  const marginTopPx = m.top * scale;
  const pageW = 210 * scale;
  const pageH = 297 * scale;

  const rectsRef = useRef(rects);
  useEffect(() => {
    rectsRef.current = rects;
  }, [rects]);

  /** Measured min size (mm) per section index — canvas cells only */
  const measuredMinsRef = useRef<Record<number, { wMm: number; hMm: number }>>({});

  useLayoutEffect(() => {
    if (!hasCanvas || !docRef.current) return;
    const next: Record<number, { wMm: number; hMm: number }> = {};
    template.sections.forEach((_, idx) => {
      const el = docRef.current!.querySelector(
        `[data-canvas-cell-inner="${idx}"]`
      ) as HTMLElement | null;
      if (!el) return;
      const wPx = Math.max(el.scrollWidth, el.clientWidth);
      const hPx = Math.max(el.scrollHeight, el.clientHeight);
      next[idx] = { wMm: wPx / scale, hMm: hPx / scale };
    });
    measuredMinsRef.current = next;
  }, [
    hasCanvas,
    template.sections,
    template.pageMargins,
    template.pageStyle,
    rects,
    scale,
    data,
    allowShrinkBelowContent,
  ]);

  const pendingRectsRef = useRef<SectionCanvasRect[] | null>(null);
  const rafRef = useRef<number | null>(null);

  const flushRectRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pending = pendingRectsRef.current;
    pendingRectsRef.current = null;
    if (pending && onCanvasRectsChange) onCanvasRectsChange(pending);
  }, [onCanvasRectsChange]);

  // Flow: measure section positions inside the rendered document
  useEffect(() => {
    if (hasCanvas || !docRef.current) return;

    const sectionElements = Array.from(docRef.current.querySelectorAll('[data-section-idx]'));
    const bounds: SectionBounds[] = sectionElements.map((child) => {
      const rect = (child as HTMLElement).getBoundingClientRect();
      const containerRect = docRef.current!.getBoundingClientRect();
      return {
        top: rect.top - containerRect.top,
        height: rect.height,
      };
    });
    setSectionBounds(bounds);
  }, [
    template.sections,
    template.pageStyle,
    template.pageMargins,
    template.canvasMode,
    template.canvasRects,
    hasCanvas,
    scale,
    data,
  ]);

  const handleFlowResizeStart = (e: React.MouseEvent, sectionIdx: number) => {
    e.stopPropagation();
    if (isSectionLocked(template.sections[sectionIdx])) return;
    const section = template.sections[sectionIdx];
    let h = 0;
    if (section.type === 'spacer' || section.type === 'box') {
      h = section.height;
    } else if (section.type === 'image') {
      h = section.heightMm;
    } else if (section.type === 'table') {
      h = section.minRows;
    }
    setInteraction({ kind: 'flow-resize', sectionIdx, startY: e.clientY, startHeight: h });
  };

  useEffect(() => {
    if (!interaction) return;

    const onMove = (e: MouseEvent) => {
      if (interaction.kind === 'flow-resize') {
        if (isSectionLocked(template.sections[interaction.sectionIdx])) return;
        const delta = e.clientY - interaction.startY;
        const deltaInMm = delta / scale;
        const section = template.sections[interaction.sectionIdx];
        if (section.type === 'spacer' || section.type === 'box') {
          const newHeight = Math.max(5, interaction.startHeight + deltaInMm);
          onUpdateSection(interaction.sectionIdx, { ...section, height: newHeight });
        } else if (section.type === 'image') {
          const newHeight = Math.max(8, interaction.startHeight + deltaInMm);
          onUpdateSection(interaction.sectionIdx, { ...section, heightMm: newHeight });
        } else if (section.type === 'table') {
          const newMinRows = Math.max(1, Math.round(interaction.startHeight + deltaInMm / 5));
          onUpdateSection(interaction.sectionIdx, { ...section, minRows: newMinRows });
        }
        return;
      }

      const rlist = rectsRef.current;
      if (!rlist || !onCanvasRectsChange) return;
      const dxMm = (e.clientX - interaction.startClientX) / scale;
      const dyMm = (e.clientY - interaction.startClientY) / scale;

      let candidate: SectionCanvasRect[];
      let guides: { vx: number[]; hy: number[] };

      if (interaction.kind === 'canvas-move') {
        const { idx, moveGroupIndices, startRects } = interaction;
        candidate = rlist.map((r) => ({ ...r }));
        const m = template.pageMargins;
        for (const j of moveGroupIndices) {
          const b = startRects[j];
          candidate[j] = clampRectToContent(
            { ...b, xMm: b.xMm + dxMm, yMm: b.yMm + dyMm },
            cw,
            ch,
            8,
            6,
            marginBleedBox(template.sections[j], m)
          );
        }
        const moved = candidate[idx];
        const snappedPack = snapCanvasRect(
          moved,
          idx,
          candidate,
          cw,
          ch,
          'move',
          snapEnabled,
          template.sections,
          m
        );
        const snapped = snappedPack.rect;
        guides = snappedPack.guides;
        const deltaX = snapped.xMm - startRects[idx].xMm;
        const deltaY = snapped.yMm - startRects[idx].yMm;
        for (const j of moveGroupIndices) {
          const b = startRects[j];
          candidate[j] = clampRectToContent(
            { ...b, xMm: b.xMm + deltaX, yMm: b.yMm + deltaY },
            cw,
            ch,
            8,
            6,
            marginBleedBox(template.sections[j], m)
          );
        }
      } else {
        const base = interaction.startRect;
        const m = template.pageMargins;
        const bleedResize = marginBleedBox(template.sections[interaction.idx], m);
        candidate = rlist.map((r, i) => {
          if (i !== interaction.idx) return r;
          const mes = measuredMinsRef.current[interaction.idx];
          const minW = allowShrinkBelowContent ? 8 : Math.max(8, mes?.wMm ?? 8);
          const minH = allowShrinkBelowContent ? 6 : Math.max(6, mes?.hMm ?? 6);
          return clampRectToContent(
            {
              ...base,
              widthMm: Math.max(minW, base.widthMm + dxMm),
              heightMm: Math.max(minH, base.heightMm + dyMm),
            },
            cw,
            ch,
            minW,
            minH,
            bleedResize
          );
        });

        const moved = candidate[interaction.idx];
        const snappedPack = snapCanvasRect(
          moved,
          interaction.idx,
          candidate,
          cw,
          ch,
          'resize',
          snapEnabled,
          template.sections,
          m
        );
        candidate = candidate.map((r, i) => (i === interaction.idx ? snappedPack.rect : r));
        guides = snappedPack.guides;

        if (!allowShrinkBelowContent) {
          const mes = measuredMinsRef.current[interaction.idx];
          if (mes) {
            const minW = Math.max(8, mes.wMm);
            const minH = Math.max(6, mes.hMm);
            candidate = candidate.map((r, i) =>
              i === interaction.idx
                ? clampRectToContent(r, cw, ch, minW, minH, bleedResize)
                : r
            );
          }
        }
      }

      setSnapGuides(guides);

      pendingRectsRef.current = candidate;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const pending = pendingRectsRef.current;
          pendingRectsRef.current = null;
          if (pending) onCanvasRectsChange(pending);
        });
      }
    };

    const onUp = () => {
      flushRectRaf();
      setSnapGuides({ vx: [], hy: [] });
      onInteractionEnd?.();
      setInteraction(null);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [
    interaction,
    scale,
    template.sections,
    onUpdateSection,
    onCanvasRectsChange,
    onInteractionEnd,
    cw,
    ch,
    template.pageMargins,
    flushRectRaf,
    snapEnabled,
    allowShrinkBelowContent,
  ]);

  const handleCanvasOverlayMouseDown = (e: React.MouseEvent, idx: number) => {
    const t = e.target as HTMLElement;
    if (t.dataset.handle === 'resize-se') return;
    if (!rects) return;
    const moveGroup = getCanvasMoveIndicesForSection(template.sections, idx);
    if (moveGroup.length === 0) {
      e.stopPropagation();
      onSelectSection?.(idx);
      return;
    }
    if (selectedIdx !== idx) {
      e.stopPropagation();
      onSelectSection?.(idx);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    setInteraction({
      kind: 'canvas-move',
      idx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: { ...rects[idx] },
      moveGroupIndices: moveGroup,
      startRects: rects.map((r) => ({ ...r })),
    });
  };

  const startCanvasResize = (e: React.MouseEvent, idx: number) => {
    if (isSectionLocked(template.sections[idx])) return;
    if (selectedIdx !== idx) return;
    if (!rects) return;
    e.stopPropagation();
    e.preventDefault();
    setInteraction({
      kind: 'canvas-resize',
      idx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: { ...rects[idx] },
    });
  };

  const tickMm = 10;
  const tickPx = tickMm * scale;

  const canvasOverlayZ = (idx: number, r: SectionCanvasRect) => {
    const stack = r.zIndex ?? idx;
    let z = 500 + stack * 4;
    if (orderHoverIdx === idx && selectedIdx !== idx) z += 2;
    if (selectedIdx === idx) z += 4;
    return z;
  };

  const overlayChrome = (
    idx: number,
    flow: boolean
  ): React.CSSProperties => {
    const locked = isSectionLocked(template.sections[idx]);
    const isSel = selectedIdx === idx;
    const isHov = !locked && orderHoverIdx === idx && selectedIdx !== idx;
    if (isSel) {
      return {
        border: '2px solid #059669',
        backgroundColor: 'rgba(5, 150, 105, 0.06)',
      };
    }
    if (isHov) {
      return {
        border: '2px dashed rgba(56, 189, 248, 0.95)',
        backgroundColor: 'rgba(14, 165, 233, 0.16)',
        boxShadow: '0 0 0 1px rgba(56, 189, 248, 0.4), 0 0 24px rgba(14, 165, 233, 0.2)',
      };
    }
    if (locked) {
      return {
        border: 'none',
        backgroundColor: 'transparent',
      };
    }
    const dashed = flow
      ? '1px dashed rgba(203, 213, 225, 0.25)'
      : '1px dashed rgba(15, 23, 42, 0.35)';
    return {
      border: showSectionOutlines ? dashed : 'none',
      backgroundColor:
        showSectionOutlines && !flow ? 'rgba(255,255,255,0.02)' : 'transparent',
    };
  };

  const pageBlock = (
    <div
      ref={docRef}
      className="relative shadow-lg transition-shadow duration-150"
      style={{
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      }}
    >
      <DocumentRenderer template={template} data={data} mode="preview" scale={scale} />

      {hasCanvas && rects
        ? rects.map((r, idx) => (
            <div
              key={idx}
              onMouseDown={(e) => handleCanvasOverlayMouseDown(e, idx)}
              className="absolute box-border transition-[border-color,background-color,box-shadow] duration-150 ease-out"
              style={{
                left: marginLeftPx + r.xMm * scale,
                top: marginTopPx + r.yMm * scale,
                width: r.widthMm * scale,
                height: r.heightMm * scale,
                ...overlayChrome(idx, false),
                cursor:
                  selectedIdx === idx && !isSectionLocked(template.sections[idx])
                    ? 'move'
                    : 'pointer',
                pointerEvents: 'auto',
                zIndex: canvasOverlayZ(idx, r),
              }}
            >
              {selectedIdx === idx && !isSectionLocked(template.sections[idx]) && (
                <div
                  data-handle="resize-se"
                  onMouseDown={(e) => startCanvasResize(e, idx)}
                  className="absolute z-20 rounded-sm bg-emerald-600"
                  style={{
                    right: -2,
                    bottom: -2,
                    width: 12,
                    height: 12,
                    cursor: 'nwse-resize',
                  }}
                />
              )}
            </div>
          ))
        : sectionBounds.map((bounds, idx) => (
            <div
              key={idx}
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[data-flow-resize]')) return;
                e.stopPropagation();
                onSelectSection?.(idx);
              }}
              className="absolute box-border transition-[border-color,background-color,box-shadow] duration-150 ease-out cursor-pointer"
              style={{
                top: `${bounds.top}px`,
                left: 0,
                width: '100%',
                height: `${bounds.height}px`,
                ...overlayChrome(idx, true),
                zIndex:
                  orderHoverIdx === idx && selectedIdx !== idx
                    ? 12
                    : selectedIdx === idx
                      ? 11
                      : 10,
              }}
            >
              {selectedIdx === idx && !isSectionLocked(template.sections[idx]) && (
                <div
                  data-flow-resize
                  onMouseDown={(e) => handleFlowResizeStart(e, idx)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-0 left-0 right-0 bg-emerald-600 z-[1]"
                  style={{
                    height: '8px',
                    cursor: 'ns-resize',
                  }}
                />
              )}
            </div>
          ))}

      {hasCanvas && snapGuides.vx.length + snapGuides.hy.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-[3000]"
          style={{ marginLeft: marginLeftPx, marginTop: marginTopPx, width: cw * scale, height: ch * scale }}
        >
          {snapGuides.vx.map((xmm, i) => (
            <div
              key={`v-${i}`}
              className="absolute top-0 bottom-0 w-px bg-sky-400/90"
              style={{ left: xmm * scale }}
            />
          ))}
          {snapGuides.hy.map((ymm, i) => (
            <div
              key={`h-${i}`}
              className="absolute left-0 right-0 h-px bg-sky-400/90"
              style={{ top: ymm * scale }}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="flex justify-center"
      style={{
        position: 'relative',
        overflow: 'auto',
        backgroundColor: outerBg,
        alignItems: 'flex-start',
        padding: '20px',
      }}
    >
      {showRuler ? (
        <div className="flex flex-col" style={{ paddingLeft: RULER_GUTTER }}>
          <div className="flex" style={{ height: RULER_GUTTER }}>
            <div style={{ width: RULER_GUTTER }} className="shrink-0 bg-slate-800/90" />
            <div
              className="relative shrink-0 border border-slate-600 bg-slate-800/90"
              style={{
                width: pageW,
                backgroundImage: `repeating-linear-gradient(90deg, #64748b 0, #64748b 1px, transparent 1px, transparent ${tickPx}px)`,
              }}
            >
              {Array.from({ length: Math.floor(210 / tickMm) + 1 }, (_, i) => (
                <span
                  key={i}
                  className="absolute bottom-0 text-[8px] text-slate-500"
                  style={{ left: i * tickPx + 1 }}
                >
                  {i * tickMm === 0 ? '' : i % 5 === 0 ? `${i * tickMm}` : ''}
                </span>
              ))}
            </div>
          </div>
          <div className="flex">
            <div
              className="relative shrink-0 border border-slate-600 border-t-0 bg-slate-800/90"
              style={{
                width: RULER_GUTTER,
                height: pageH,
                backgroundImage: `repeating-linear-gradient(180deg, #64748b 0, #64748b 1px, transparent 1px, transparent ${tickPx}px)`,
              }}
            >
              {Array.from({ length: Math.floor(297 / tickMm) + 1 }, (_, i) => (
                <span
                  key={i}
                  className="absolute right-0.5 text-[8px] text-slate-500"
                  style={{ top: i * tickPx }}
                >
                  {i * tickMm === 0 ? '' : i % 5 === 0 ? `${i * tickMm}` : ''}
                </span>
              ))}
            </div>
            {pageBlock}
          </div>
        </div>
      ) : (
        pageBlock
      )}
    </div>
  );
}
