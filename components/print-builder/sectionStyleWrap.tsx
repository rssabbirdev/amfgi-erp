'use client';

import React from 'react';
import type { DocumentSection } from '@/lib/types/documentTemplate';

/**
 * Wraps a rendered block with optional border / padding / typography from `section.style`.
 */
export function wrapSectionChrome(
  section: DocumentSection,
  u: (mm: number) => string,
  pt: (n: number) => string,
  children: React.ReactNode
): React.ReactNode {
  const s = section.style;
  if (!s) return children;
  const hasAny = Object.values(s).some((v) => v !== undefined && v !== '');
  if (!hasAny) return children;

  const style: React.CSSProperties = {
    boxSizing: 'border-box',
    color: s.color,
    backgroundColor: s.backgroundColor,
    backgroundImage: s.backgroundImageUrl ? `url(${s.backgroundImageUrl})` : undefined,
    backgroundSize: s.backgroundSize,
    backgroundPosition: s.backgroundPosition,
    backgroundRepeat: s.backgroundRepeat,
    borderWidth: s.borderWidthPx !== undefined ? `${s.borderWidthPx}px` : undefined,
    borderStyle: s.borderWidthPx ? 'solid' : undefined,
    borderColor: s.borderColor,
    borderRadius: s.borderRadiusPx !== undefined ? `${s.borderRadiusPx}px` : undefined,
    padding: s.paddingMm !== undefined ? u(s.paddingMm) : undefined,
    marginTop: s.marginTopMm !== undefined ? u(s.marginTopMm) : undefined,
    marginBottom: s.marginBottomMm !== undefined ? u(s.marginBottomMm) : undefined,
    width: s.widthMm !== undefined ? u(s.widthMm) : undefined,
    height: s.heightMm !== undefined ? u(s.heightMm) : undefined,
    minHeight: s.minHeightMm !== undefined ? u(s.minHeightMm) : undefined,
    maxWidth: s.maxWidthMm !== undefined ? u(s.maxWidthMm) : undefined,
    fontSize: s.fontSizePt !== undefined ? pt(s.fontSizePt) : undefined,
    fontWeight: s.fontWeight,
    fontStyle: s.fontStyle,
    fontFamily: s.fontFamily,
    textDecoration: s.textDecoration,
    lineHeight: s.lineHeight !== undefined ? s.lineHeight : undefined,
    textAlign: s.textAlign,
    opacity: s.opacity !== undefined ? s.opacity : undefined,
  };

  return <div style={style}>{children}</div>;
}
