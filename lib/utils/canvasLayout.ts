import type { DocumentPageStyle, DocumentSection, DocumentTemplate, SectionCanvasRect } from '@/lib/types/documentTemplate';

/** CSS px at 96dpi → mm (border thickness on line/divider) */
const PX_TO_MM = 25.4 / 96;
const MM_PER_PT = 25.4 / 72;

function ptToMm(pt: number): number {
  return pt * MM_PER_PT;
}

export function getPageDimensionsMm(pageStyle?: DocumentPageStyle): { widthMm: number; heightMm: number } {
  if (pageStyle?.pageOrientation === 'landscape') {
    return { widthMm: 297, heightMm: 210 };
  }
  return { widthMm: 210, heightMm: 297 };
}

export function contentWidthMm(
  m: DocumentTemplate['pageMargins'],
  pageStyle?: DocumentPageStyle
): number {
  return Math.max(40, getPageDimensionsMm(pageStyle).widthMm - m.left - m.right);
}

export function contentHeightMm(
  m: DocumentTemplate['pageMargins'],
  pageStyle?: DocumentPageStyle
): number {
  return Math.max(80, getPageDimensionsMm(pageStyle).heightMm - m.top - m.bottom);
}

/** When `allowMarginBleed` is set on the section, canvas rects may extend into page margins by this much (mm). */
export function marginBleedBox(
  section: DocumentSection | undefined,
  pageMargins: DocumentTemplate['pageMargins'] | undefined
): { left: number; right: number; top: number; bottom: number } | undefined {
  if (!section?.allowMarginBleed || !pageMargins) return undefined;
  return {
    left: pageMargins.left,
    right: pageMargins.right,
    top: pageMargins.top,
    bottom: pageMargins.bottom,
  };
}

/**
 * Canvas cell height estimate aligned with `DocumentRenderer` (padding, line-height, table rows).
 * Used when stacking sections into `canvasRects` for freeform canvas mode.
 */
export function estimateSectionHeightMm(section: DocumentSection, contentWidthMmVal: number): number {
  const cw = Math.max(40, contentWidthMmVal);
  switch (section.type) {
    case 'image': {
      const mb = section.marginBottomMm ?? (section.layout === 'fill' ? 2 : 1);
      return Math.max(8, Math.ceil(section.heightMm + mb));
    }
    case 'heading':
      return Math.max(6, Math.ceil(ptToMm(section.fontSize) * 1.3 + 1));
    case 'field-row': {
      const pack = section.style;
      const lineH = pack?.lineHeight ?? 1.4;
      let maxCellPt = 10;
      for (const c of section.cells) {
        if (c.fontSize != null) maxCellPt = Math.max(maxCellPt, c.fontSize);
      }
      if (pack?.fontSizePt != null) maxCellPt = Math.max(maxCellPt, pack.fontSizePt);
      let h = ptToMm(maxCellPt) * lineH + (section.bordered ? 4 : 0);
      if (section.minHeight != null) h = Math.max(h, section.minHeight);
      return Math.max(10, Math.ceil(h));
    }
    case 'info-grid': {
      const cols = Math.max(1, section.columns);
      const rows = Math.max(1, Math.ceil(section.items.length / cols));
      const rowH = ptToMm(10) * 1.5 + 1.2;
      const h = rows * rowH + (section.bordered ? 4 : 0);
      return Math.max(12, Math.ceil(h));
    }
    case 'table': {
      const rp = section.rowPadding ?? 2;
      const fs = section.fontSize ?? 10;
      const headerRow = 2 * rp + ptToMm(fs) * 1.35 + 2;
      const bodyRow = 2 * rp + ptToMm(fs) * 1.45 + 1;
      const borderPad = section.showBorders ? 1 : 0;
      return Math.max(20, Math.ceil(headerRow + section.minRows * bodyRow + borderPad + 2));
    }
    case 'text': {
      const fs = section.fontSize ?? 10;
      const lineMm = ptToMm(fs) * 1.5;
      const charW = Math.max(0.2, ptToMm(fs) * 0.48);
      const charsPerLine = Math.max(28, Math.floor(cw / charW));
      const paras = section.content.split('\n');
      let lines = 0;
      for (const p of paras) {
        lines += Math.max(1, Math.ceil((p.length || 1) / charsPerLine));
      }
      return Math.max(8, Math.ceil(lines * lineMm + 2));
    }
    case 'spacer':
      return Math.max(0, section.height);
    case 'divider':
      return Math.max(1, Math.ceil(section.marginTop + section.marginBottom + section.thickness * PX_TO_MM));
    case 'signatures': {
      const labelBlock = ptToMm(9) * 1.35 + 3;
      return Math.max(22, Math.ceil(section.lineHeight + 2 + labelBlock));
    }
    case 'box':
      return Math.max(8, section.height);
    case 'line':
      return Math.max(1, Math.ceil(section.marginTop + section.marginBottom + section.thickness * PX_TO_MM));
    default:
      return 14;
  }
}

export function buildCanvasRectsFromSections(template: DocumentTemplate): SectionCanvasRect[] {
  const cw = contentWidthMm(template.pageMargins, template.pageStyle);
  let y = 0;
  const gap = 2;
  return template.sections.map((s, i) => {
    const h = estimateSectionHeightMm(s, cw);
    const r: SectionCanvasRect = { xMm: 0, yMm: y, widthMm: cw, heightMm: h, zIndex: i };
    y += h + gap;
    return r;
  });
}

/**
 * Use existing rects when the template is already canvas with a full matching list;
 * otherwise build a vertical stack (same as legacy “convert to canvas”) so layout stays predictable.
 */
export function resolveCanvasRectsForSections(
  pageMargins: DocumentTemplate['pageMargins'],
  pageStyle: DocumentPageStyle | undefined,
  sections: DocumentSection[],
  existingMode: boolean | undefined,
  existingRects: SectionCanvasRect[] | undefined
): SectionCanvasRect[] {
  const n = sections.length;
  if (n === 0) return [];
  if (
    existingMode === true &&
    Array.isArray(existingRects) &&
    existingRects.length === n
  ) {
    return existingRects.map((r) => ({ ...r }));
  }
  return buildCanvasRectsFromSections({
    id: '_',
    name: '_',
    itemType: 'delivery-note',
    isDefault: false,
    pageMargins,
    pageStyle,
    sections,
    canvasMode: true,
  });
}

export function ensureCanvasRects(
  template: DocumentTemplate,
  rects: SectionCanvasRect[] | undefined
): SectionCanvasRect[] {
  const n = template.sections.length;
  const cw = contentWidthMm(template.pageMargins, template.pageStyle);
  const next = [...(rects ?? [])];
  while (next.length < n) {
    const idx = next.length;
    const s = template.sections[idx];
    const y =
      next.length === 0
        ? 0
        : next[next.length - 1].yMm + next[next.length - 1].heightMm + 2;
    next.push({
      xMm: 0,
      yMm: y,
      widthMm: cw,
      heightMm: estimateSectionHeightMm(s, cw),
      zIndex: idx,
    });
  }
  if (next.length > n) next.length = n;
  return next;
}

export function clampRectToContent(
  r: SectionCanvasRect,
  cw: number,
  ch: number,
  minWidthMm = 8,
  minHeightMm = 6,
  bleed?: { left: number; right: number; top: number; bottom: number } | null
): SectionCanvasRect {
  const b = bleed ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const maxW = cw + b.left + b.right;
  const maxH = ch + b.top + b.bottom;
  const w = Math.min(Math.max(minWidthMm, r.widthMm), maxW);
  const h = Math.min(Math.max(minHeightMm, r.heightMm), maxH);
  const minX = -b.left;
  const maxX = cw + b.right - w;
  const minY = -b.top;
  const maxY = ch + b.bottom - h;
  const x = Math.max(minX, Math.min(r.xMm, maxX));
  const y = Math.max(minY, Math.min(r.yMm, maxY));
  return { ...r, xMm: x, yMm: y, widthMm: w, heightMm: h };
}

const SNAP_MM = 2.5;

/** Snap edges/centers to page midlines and other blocks while dragging on canvas */
export function snapCanvasRect(
  r: SectionCanvasRect,
  idx: number,
  all: SectionCanvasRect[],
  cw: number,
  ch: number,
  kind: 'move' | 'resize',
  snapEnabled = true,
  sections?: DocumentSection[],
  pageMargins?: DocumentTemplate['pageMargins']
): { rect: SectionCanvasRect; guides: { vx: number[]; hy: number[] } } {
  const bleed = marginBleedBox(sections?.[idx], pageMargins);
  if (!snapEnabled) {
    return {
      rect: clampRectToContent(r, cw, ch, 8, 6, bleed),
      guides: { vx: [], hy: [] },
    };
  }
  let { xMm, yMm, widthMm, heightMm } = r;
  const guides = { vx: [] as number[], hy: [] as number[] };

  const pushUnique = (arr: number[], v: number) => {
    if (!arr.includes(v)) arr.push(v);
  };

  if (kind === 'move') {
    const left = xMm;
    const right = xMm + widthMm;
    const top = yMm;
    const bottom = yMm + heightMm;
    const cx = xMm + widthMm / 2;
    const cy = yMm + heightMm / 2;
    const midX = cw / 2;
    const midY = ch / 2;

    if (Math.abs(cx - midX) <= SNAP_MM) {
      xMm = midX - widthMm / 2;
      pushUnique(guides.vx, midX);
    }
    if (Math.abs(cy - midY) <= SNAP_MM) {
      yMm = midY - heightMm / 2;
      pushUnique(guides.hy, midY);
    }

    for (let j = 0; j < all.length; j++) {
      if (j === idx) continue;
      const o = all[j];
      const ol = o.xMm;
      const or = o.xMm + o.widthMm;
      const ot = o.yMm;
      const ob = o.yMm + o.heightMm;
      const ocx = o.xMm + o.widthMm / 2;
      const ocy = o.yMm + o.heightMm / 2;

      if (Math.abs(left - ol) <= SNAP_MM) {
        xMm = ol;
        pushUnique(guides.vx, ol);
      }
      if (Math.abs(right - or) <= SNAP_MM) {
        xMm = or - widthMm;
        pushUnique(guides.vx, or);
      }
      if (Math.abs(left - or) <= SNAP_MM) {
        xMm = or;
        pushUnique(guides.vx, or);
      }
      if (Math.abs(right - ol) <= SNAP_MM) {
        xMm = ol - widthMm;
        pushUnique(guides.vx, ol);
      }
      if (Math.abs(cx - ocx) <= SNAP_MM) {
        xMm = ocx - widthMm / 2;
        pushUnique(guides.vx, ocx);
      }

      if (Math.abs(top - ot) <= SNAP_MM) {
        yMm = ot;
        pushUnique(guides.hy, ot);
      }
      if (Math.abs(bottom - ob) <= SNAP_MM) {
        yMm = ob - heightMm;
        pushUnique(guides.hy, ob);
      }
      if (Math.abs(top - ob) <= SNAP_MM) {
        yMm = ob;
        pushUnique(guides.hy, ob);
      }
      if (Math.abs(bottom - ot) <= SNAP_MM) {
        yMm = ot - heightMm;
        pushUnique(guides.hy, ot);
      }
      if (Math.abs(cy - ocy) <= SNAP_MM) {
        yMm = ocy - heightMm / 2;
        pushUnique(guides.hy, ocy);
      }
    }
  } else {
    const right = xMm + widthMm;
    const bottom = yMm + heightMm;
    const midX = cw / 2;
    const midY = ch / 2;

    if (Math.abs(right - midX) <= SNAP_MM) {
      widthMm = Math.max(12, midX - xMm);
      pushUnique(guides.vx, midX);
    }
    if (Math.abs(bottom - midY) <= SNAP_MM) {
      heightMm = Math.max(10, midY - yMm);
      pushUnique(guides.hy, midY);
    }

    for (let j = 0; j < all.length; j++) {
      if (j === idx) continue;
      const o = all[j];
      const ol = o.xMm;
      const or = o.xMm + o.widthMm;
      const ot = o.yMm;
      const ob = o.yMm + o.heightMm;

      if (Math.abs(right - ol) <= SNAP_MM) {
        widthMm = Math.max(12, ol - xMm);
        pushUnique(guides.vx, ol);
      }
      if (Math.abs(right - or) <= SNAP_MM) {
        widthMm = Math.max(12, or - xMm);
        pushUnique(guides.vx, or);
      }
      if (Math.abs(bottom - ot) <= SNAP_MM) {
        heightMm = Math.max(10, ot - yMm);
        pushUnique(guides.hy, ot);
      }
      if (Math.abs(bottom - ob) <= SNAP_MM) {
        heightMm = Math.max(10, ob - yMm);
        pushUnique(guides.hy, ob);
      }
    }
  }

  const rect = clampRectToContent({ xMm, yMm, widthMm, heightMm }, cw, ch, 8, 6, bleed);
  return { rect, guides };
}

/** Assign zIndex 0..n-1 following current paint order (zIndex ?? section index). */
export function materializeCanvasZOrder(rects: SectionCanvasRect[]): SectionCanvasRect[] {
  const order = rects.map((_, i) => i).sort((a, b) => {
    const za = rects[a].zIndex ?? a;
    const zb = rects[b].zIndex ?? b;
    if (za !== zb) return za - zb;
    return a - b;
  });
  return rects.map((r, i) => ({ ...r, zIndex: order.indexOf(i) }));
}

/** Swap stacking with the next block up or down in paint order. */
export function reorderCanvasRectZ(
  rects: SectionCanvasRect[],
  idx: number,
  dir: 'forward' | 'backward'
): SectionCanvasRect[] {
  const mat = materializeCanvasZOrder(rects);
  const order = [...mat.keys()].sort((a, b) => mat[a].zIndex! - mat[b].zIndex!);
  const pos = order.indexOf(idx);
  if (dir === 'forward') {
    if (pos >= order.length - 1) return mat;
    [order[pos], order[pos + 1]] = [order[pos + 1], order[pos]];
  } else {
    if (pos <= 0) return mat;
    [order[pos], order[pos - 1]] = [order[pos - 1], order[pos]];
  }
  return mat.map((r, i) => ({ ...r, zIndex: order.indexOf(i) }));
}
