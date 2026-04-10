export const A4_W = 210;    // mm
export const A4_H = 297;    // mm
export const CANVAS_PX_W = 620;
export const SCALE = CANVAS_PX_W / A4_W;  // px per mm (≈ 2.952)

export function pxToMm(px: number): number {
  return px / SCALE;
}

export function mmToPx(mm: number): number {
  return mm * SCALE;
}

export function snapToGrid(mm: number, gridMm = 5): number {
  return Math.round(mm / gridMm) * gridMm;
}

export function clampX(x: number, width: number): number {
  return Math.max(0, Math.min(x, A4_W - width));
}

export function clampY(y: number, height: number): number {
  return Math.max(0, Math.min(y, A4_H - height));
}

export const GRID_SIZE_MM = 5;
export const MIN_ELEMENT_SIZE = 5; // mm
