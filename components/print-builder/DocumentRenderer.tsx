'use client';

import React from 'react';
import type {
  DocumentTemplate,
  DocumentSection,
  InfoGridSection,
  TableSection,
  SignaturesSection,
  BoxSection,
  LineSection,
  ImageSection,
} from '@/lib/types/documentTemplate';
import type { AnyTemplateDataContext } from '@/lib/utils/templateData';
import { resolveField, formatValue } from '@/lib/utils/templateData';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';
import { migrateLegacyDocumentSections } from '@/lib/utils/migrateDocumentSections';
import { contentWidthMm, contentHeightMm } from '@/lib/utils/canvasLayout';
import { wrapSectionChrome } from './sectionStyleWrap';

/** 1 pt = 1/72 in = 25.4/72 mm — use with the same `scale` as mm→px so preview matches print proportions */
const MM_PER_PT = 25.4 / 72;

interface DocumentRendererProps {
  template: DocumentTemplate;
  data: AnyTemplateDataContext;
  /** true = mm units for actual printing, false = scaled px for screen preview */
  mode: 'print' | 'preview';
  /** Scale factor for preview mode (default 1) */
  scale?: number;
}

/**
 * Renders document: **canvas** when `canvasMode` + `canvasRects` match sections (default in builder);
 * otherwise legacy stacked **flow** for the same section list.
 * Page background sits behind a slightly translucent content layer so images remain visible.
 */
export function DocumentRenderer({ template, data, mode, scale = 1 }: DocumentRendererProps) {
  const isPrint = mode === 'print';
  const m = template.pageMargins;

  const ps = template.pageStyle;
  const bgRaw = ps?.backgroundImageField
    ? resolveField(ps.backgroundImageField, data)
    : ps?.backgroundImageUrl;
  const bgUrl = bgRaw?.trim() ? convertGoogleDriveUrl(bgRaw.trim()) : '';
  const paperAlpha =
    ps?.contentLayerOpacity !== undefined
      ? ps.contentLayerOpacity
      : bgUrl
        ? 0.88
        : 1;
  const pageFaceBg = ps?.pageBackgroundColor?.trim() || '#ffffff';
  const innerPaperBg = bgUrl
    ? paperAlpha >= 0.999
      ? '#fff'
      : `rgba(255,255,255,${Math.min(1, Math.max(0, paperAlpha))})`
    : 'transparent';

  // Preview: 1mm → scale px (fits A4 on screen). Typography uses pt→mm→px so text/page ratio matches print.
  const previewPtToPx = (ptVal: number) => ptVal * MM_PER_PT * scale;

  const bodyFont =
    ps?.bodyFontFamily?.trim() || 'Arial, Helvetica, sans-serif';

  const containerStyle: React.CSSProperties = isPrint
    ? {
        width: '210mm',
        minHeight: '297mm',
        padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
        fontFamily: bodyFont,
        color: '#000',
        backgroundColor: innerPaperBg,
        boxSizing: 'border-box',
      }
    : {
        width: `${210 * scale}px`,
        minHeight: `${297 * scale}px`,
        padding: `${m.top * scale}px ${m.right * scale}px ${m.bottom * scale}px ${m.left * scale}px`,
        fontFamily: bodyFont,
        color: '#000',
        backgroundColor: innerPaperBg,
        boxSizing: 'border-box',
        fontSize: `${previewPtToPx(10)}px`,
        transformOrigin: 'top left',
      };

  const u = (mm: number) => (isPrint ? `${mm}mm` : `${mm * scale}px`);
  const pt = (ptVal: number) => (isPrint ? `${ptVal}pt` : `${previewPtToPx(ptVal)}px`);

  const wmTextRaw = ps?.watermarkField
    ? resolveField(ps.watermarkField, data)
    : ps?.watermarkText;
  const wmText = wmTextRaw?.trim() ? wmTextRaw : '';
  const wmImgRaw = ps?.watermarkImageUrl?.trim();
  const wmImgUrl = wmImgRaw ? convertGoogleDriveUrl(wmImgRaw) : '';

  const wmOpacity = ps?.watermarkOpacity ?? 0.08;
  const wmAngle = ps?.watermarkAngle ?? -35;
  const wmFs = ps?.watermarkFontSizePt ?? 56;
  const bgOpacity = ps?.backgroundOpacity ?? 0.14;
  const bgFit = ps?.backgroundFit ?? 'cover';

  const outerPosition: React.CSSProperties = isPrint
    ? { position: 'relative', width: '210mm', minHeight: '297mm' }
    : { position: 'relative', width: `${210 * scale}px`, minHeight: `${297 * scale}px` };

  const cw = contentWidthMm(m);
  const ch = contentHeightMm(m);
  const rects = template.canvasRects;
  const hasCanvas =
    Boolean(template.canvasMode) &&
    Array.isArray(rects) &&
    rects.length === template.sections.length &&
    template.sections.length > 0;

  const letterheadUrl = ((data as unknown) as { company?: { letterheadUrl?: string } }).company
    ?.letterheadUrl;

  return (
    <div
      style={{ ...outerPosition, backgroundColor: pageFaceBg }}
      className="document-renderer-root"
    >
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            width: '100%',
            height: '100%',
            objectFit: bgFit === 'contain' ? 'contain' : bgFit === 'auto' ? 'fill' : 'cover',
            objectPosition: 'center',
            opacity: bgOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
      {(wmText || wmImgUrl) && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {wmImgUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wmImgUrl}
              alt=""
              style={{
                maxWidth: '70%',
                maxHeight: '70%',
                opacity: wmOpacity,
                transform: `rotate(${wmAngle}deg)`,
                objectFit: 'contain',
              }}
            />
          ) : (
            <span
              style={{
                fontSize: isPrint ? `${wmFs}pt` : `${previewPtToPx(wmFs)}px`,
                fontWeight: 700,
                color: ps?.watermarkColor?.trim() || '#888888',
                opacity: Math.min(1, wmOpacity * 4),
                transform: `rotate(${wmAngle}deg)`,
                userSelect: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {wmText}
            </span>
          )}
        </div>
      )}
      <div style={{ ...containerStyle, position: 'relative', zIndex: 2 }} className="document-renderer">
        {hasCanvas ? (
          <div
            style={{
              position: 'relative',
              width: u(cw),
              minHeight: u(ch),
              boxSizing: 'border-box',
            }}
          >
            {template.sections.map((section, idx) => {
              const r = rects![idx];
              return (
                <div
                  key={idx}
                  data-section-idx={idx}
                  style={{
                    position: 'absolute',
                    left: u(r.xMm),
                    top: u(r.yMm),
                    width: u(r.widthMm),
                    height: u(r.heightMm),
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    zIndex: r.zIndex ?? idx,
                  }}
                >
                  <div
                    data-canvas-cell-inner={String(idx)}
                    style={{ width: '100%', height: '100%', overflow: 'auto' }}
                  >
                    {wrapSectionChrome(
                      section,
                      u,
                      pt,
                      <SectionRenderer
                        section={section}
                        data={data}
                        u={u}
                        pt={pt}
                        isPrint={isPrint}
                        scale={scale}
                        letterheadUrl={letterheadUrl}
                        inCanvasCell
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          template.sections?.map((section, idx) => (
            <div key={idx} data-section-idx={idx}>
              {wrapSectionChrome(
                section,
                u,
                pt,
                <SectionRenderer
                  section={section}
                  data={data}
                  u={u}
                  pt={pt}
                  isPrint={isPrint}
                  scale={scale}
                  letterheadUrl={letterheadUrl}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Section Renderer ───────────────────────────────────────────────

interface SectionRendererProps {
  section: DocumentSection;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (pt: number) => string;
  isPrint: boolean;
  scale: number;
  letterheadUrl?: string;
  /** True when this block sits in a fixed canvas cell — box/shape fills the cell for print parity */
  inCanvasCell?: boolean;
}

function SectionRenderer({
  section,
  data,
  u,
  pt,
  isPrint,
  scale,
  letterheadUrl,
  inCanvasCell,
}: SectionRendererProps) {
  const sec: DocumentSection =
    (section as { type?: string }).type === 'letterhead'
      ? migrateLegacyDocumentSections([section as DocumentSection])[0]
      : section;

  switch (sec.type) {
    case 'image':
      return (
        <ImageSectionRenderer section={sec} data={data} u={u} pt={pt} letterheadUrl={letterheadUrl} />
      );
    case 'heading':
      return <HeadingRenderer section={sec} data={data} pt={pt} />;
    case 'field-row':
      return <FieldRowRenderer section={sec} data={data} u={u} pt={pt} />;
    case 'info-grid':
      return <InfoGridRenderer section={sec} data={data} u={u} pt={pt} />;
    case 'table':
      return <TableRenderer section={sec} data={data} u={u} pt={pt} isPrint={isPrint} />;
    case 'text':
      return <TextRenderer section={sec} pt={pt} />;
    case 'spacer':
      return <div style={{ height: u(sec.height) }} />;
    case 'divider':
      return (
        <div
          style={{
            marginTop: u(sec.marginTop),
            marginBottom: u(sec.marginBottom),
            borderTop: `${sec.thickness}px solid ${sec.color}`,
          }}
        />
      );
    case 'signatures':
      return <SignaturesRenderer section={sec} u={u} pt={pt} />;
    case 'box':
      return (
        <BoxRenderer section={sec} data={data} u={u} pt={pt} fillCanvasCell={Boolean(inCanvasCell)} />
      );
    case 'line':
      return <LineRenderer section={sec} u={u} />;
    default:
      return null;
  }
}

function resolveImageSectionSrc(
  section: ImageSection,
  data: AnyTemplateDataContext,
  letterheadUrl?: string
): string {
  const fromTemplate = section.imageUrl?.trim();
  if (fromTemplate) return convertGoogleDriveUrl(fromTemplate);
  const fromField =
    section.source === 'field' && section.field?.trim()
      ? String(resolveField(section.field, data) ?? '').trim()
      : '';
  if (fromField) return convertGoogleDriveUrl(fromField);
  const fromUrl = section.url?.trim() ?? '';
  if (fromUrl) return convertGoogleDriveUrl(fromUrl);
  const fallback =
    section.useCompanyLetterheadFallback !== false && letterheadUrl?.trim()
      ? letterheadUrl.trim()
      : '';
  return fallback ? convertGoogleDriveUrl(fallback) : '';
}

function ImageSectionRenderer({
  section,
  data,
  u,
  pt,
  letterheadUrl,
}: {
  section: ImageSection;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (ptVal: number) => string;
  letterheadUrl?: string;
}) {
  const src = resolveImageSectionSrc(section, data, letterheadUrl);
  const layout = section.layout ?? 'inline';
  const mb = section.marginBottomMm ?? (layout === 'fill' ? 2 : 1);
  const objectPos = section.objectPosition?.trim() || 'center';
  const fit = section.objectFit ?? 'contain';

  if (!src) {
    return (
      <div
        style={{
          height: u(section.heightMm),
          marginBottom: u(mb),
          border: '1px dashed #ccc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: pt(9),
          color: '#999',
        }}
      >
        No image
      </div>
    );
  }

  if (layout === 'fill') {
    return (
      <div
        style={{
          height: u(section.heightMm),
          overflow: 'hidden',
          marginBottom: u(mb),
          position: 'relative',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit === 'fill' ? 'fill' : fit,
            objectPosition: objectPos,
            opacity: section.opacity,
          }}
        />
      </div>
    );
  }

  const align =
    section.align === 'center' ? 'center' : section.align === 'right' ? 'flex-end' : 'flex-start';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: align,
        marginBottom: u(mb),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        style={{
          height: u(section.heightMm),
          width: 'auto',
          maxWidth: '100%',
          objectFit: fit === 'fill' ? 'fill' : fit,
          objectPosition: objectPos,
          opacity: section.opacity,
        }}
      />
    </div>
  );
}

// ── Heading ────────────────────────────────────────────────────────

function HeadingRenderer({
  section,
  data,
  pt,
}: {
  section: {
    type: 'heading';
    text: string;
    field?: string;
    fontSize: number;
    align: string;
    bold: boolean;
    color: string;
  };
  data: AnyTemplateDataContext;
  pt: (v: number) => string;
}) {
  const dynamic = section.field?.trim() ? resolveField(section.field, data) : '';
  const display = dynamic || section.text;
  return (
    <div
      style={{
        fontSize: pt(section.fontSize),
        textAlign: section.align as React.CSSProperties['textAlign'],
        fontWeight: section.bold ? 'bold' : 'normal',
        color: section.color,
        lineHeight: 1.3,
      }}
    >
      {display}
    </div>
  );
}

// ── Field Row ──────────────────────────────────────────────────────

function FieldRowRenderer({
  section,
  data,
  u,
  pt,
}: {
  section: Extract<DocumentSection, { type: 'field-row' }>;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (v: number) => string;
}) {
  const pack = section.style;
  const packWeight =
    pack?.fontWeight === 'bold' ? 'bold' : pack?.fontWeight === 'normal' ? 'normal' : undefined;

  const useGrid = section.layout === 'grid';
  const gridCols =
    section.gridColumns ??
    (Math.min(4, Math.max(1, section.cells.length)) as 1 | 2 | 3 | 4);

  return (
    <div
      style={{
        display: useGrid ? 'grid' : 'flex',
        gridTemplateColumns: useGrid ? `repeat(${gridCols}, minmax(0, 1fr))` : undefined,
        gap: u(2),
        minHeight: section.minHeight ? u(section.minHeight) : undefined,
        border: section.bordered ? '1px solid #000' : undefined,
        padding: section.bordered ? u(2) : undefined,
        fontFamily: pack?.fontFamily,
        fontStyle: pack?.fontStyle,
        textDecoration: pack?.textDecoration,
        lineHeight: pack?.lineHeight ?? 1.4,
      }}
    >
      {section.cells.map((cell, i) => {
        const value = cell.field ? resolveField(cell.field, data) : (cell.text ?? '');
        const fontSize =
          cell.fontSize != null
            ? pt(cell.fontSize)
            : pack?.fontSizePt != null
              ? pt(pack.fontSizePt)
              : pt(10);
        const fontWeight = cell.bold ? 'bold' : packWeight ?? 'normal';
        const explicitCellColor =
          cell.color != null && String(cell.color).trim() !== '';

        return (
          <div
            key={i}
            style={{
              width: !useGrid && cell.width ? `${cell.width}%` : undefined,
              flex: !useGrid && cell.width ? undefined : 1,
              minWidth: 0,
              textAlign: (cell.align ?? 'left') as React.CSSProperties['textAlign'],
              fontSize,
              fontWeight,
              ...(explicitCellColor ? { color: cell.color } : {}),
            }}
          >
            {cell.label && <span style={{ fontWeight: 'bold' }}>{cell.label} </span>}
            {value}
          </div>
        );
      })}
    </div>
  );
}

// ── Info Grid ──────────────────────────────────────────────────────

function InfoGridRenderer({
  section,
  data,
  u,
  pt,
}: {
  section: InfoGridSection;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (v: number) => string;
}) {
  const cols = section.columns;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: `${u(1)} ${u(4)}`,
        border: section.bordered ? '1px solid #000' : undefined,
        padding: section.bordered ? u(2) : undefined,
        fontSize: pt(10),
      }}
    >
      {section.items.map((item, i) => {
        const value = resolveField(item.field, data);
        return (
          <div key={i} style={{ lineHeight: 1.5 }}>
            <span style={{ fontWeight: 'bold', marginRight: u(1) }}>{item.label}:</span>
            <span style={{ fontWeight: item.bold ? 'bold' : 'normal' }}>{value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Table ──────────────────────────────────────────────────────────

function TableRenderer({
  section,
  data,
  u,
  pt,
  isPrint,
}: {
  section: TableSection;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (v: number) => string;
  isPrint: boolean;
}) {
  // Resolve data rows
  let items: any[] = [];
  const ds = section.dataSource;
  if (ds === 'customItems' && (data as any).customItems) items = (data as any).customItems;
  else if (ds === 'batches' && (data as any).batches) items = (data as any).batches;
  else if (ds === 'items' && (data as any).items) items = (data as any).items;

  // Pad with empty rows if less than minRows
  const displayItems = [...items];
  while (displayItems.length < section.minRows) {
    displayItems.push(null); // null = empty row placeholder
  }

  const borderStyle = section.showBorders ? '1px solid #000' : 'none';
  const cellPadding = u(section.rowPadding);

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: pt(section.fontSize),
        pageBreakInside: 'auto',
      }}
    >
      <thead>
        <tr
          style={{
            backgroundColor: section.headerBg,
            color: section.headerColor,
            // If repeatHeaderOnNewPage, the browser will repeat <thead> on each printed page
          }}
        >
          {section.columns.map((col, ci) => (
            <th
              key={ci}
              style={{
                border: borderStyle,
                padding: `${cellPadding} ${u(2)}`,
                width: col.width ? `${col.width}%` : undefined,
                textAlign: col.align,
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {displayItems.map((item, rowIdx) => (
          <tr
            key={rowIdx}
            style={{
              // Prevent a row from being split across pages
              pageBreakInside: 'avoid',
              breakInside: 'avoid',
            }}
          >
            {section.columns.map((col, ci) => {
              let cellValue = '';
              if (item !== null) {
                if (col.field === 'slno') {
                  cellValue = String(rowIdx + 1);
                } else {
                  cellValue = item[col.field] ?? '';
                }
              }
              return (
                <td
                  key={ci}
                  style={{
                    border: borderStyle,
                    padding: `${cellPadding} ${u(2)}`,
                    textAlign: col.align,
                    verticalAlign: 'top',
                    // Let cell height grow with content
                    wordBreak: 'break-word',
                  }}
                >
                  {cellValue || (item === null ? '\u00A0' : '')}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Text Block ─────────────────────────────────────────────────────

function TextRenderer({
  section,
  pt,
}: {
  section: { type: 'text'; content: string; fontSize: number; align: string; bold: boolean; color: string };
  pt: (v: number) => string;
}) {
  return (
    <div
      style={{
        fontSize: pt(section.fontSize),
        textAlign: section.align as any,
        fontWeight: section.bold ? 'bold' : 'normal',
        color: section.color,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      }}
    >
      {section.content}
    </div>
  );
}

// ── Signatures ─────────────────────────────────────────────────────

function SignaturesRenderer({
  section,
  u,
  pt,
}: {
  section: SignaturesSection;
  u: (mm: number) => string;
  pt: (v: number) => string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: u(5),
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
      }}
    >
      {section.items.map((sig, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              height: u(section.lineHeight),
              borderBottom: '1px solid #000',
              marginBottom: u(2),
            }}
          />
          <div style={{ fontSize: pt(9), fontWeight: 'bold', textTransform: 'uppercase' }}>
            {sig.label}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Box Shape ──────────────────────────────────────────────────────

function boxShapeRadiusAndClip(shape: string, borderRadiusPx: number): Pick<React.CSSProperties, 'borderRadius' | 'clipPath'> {
  if (shape === 'diamond') {
    return { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' };
  }
  if (shape === 'triangle') {
    return { clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' };
  }
  if (shape === 'ellipse' || shape === 'circle') {
    return { borderRadius: '50%' };
  }
  return { borderRadius: `${borderRadiusPx}px` };
}

function BoxRenderer({
  section,
  data,
  u,
  pt,
  fillCanvasCell,
}: {
  section: BoxSection;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (v: number) => string;
  fillCanvasCell?: boolean;
}) {
  const shape = section.shape ?? 'rectangle';
  const labelDynamic = section.labelField?.trim() ? resolveField(section.labelField, data) : '';
  const labelText = labelDynamic || section.label || '';
  const roundOrClip = boxShapeRadiusAndClip(shape, section.borderRadius);
  const isRoundFlow = shape === 'ellipse' || shape === 'circle';

  if (fillCanvasCell) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          minWidth: 0,
          minHeight: 0,
          border: `${section.borderWidth}px solid ${section.borderColor}`,
          backgroundColor: section.backgroundColor || 'transparent',
          ...roundOrClip,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: u(2),
          fontSize: pt(section.fontSize ?? 10),
          fontWeight: 'bold',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
        }}
      >
        {labelText}
      </div>
    );
  }

  return (
    <div
      style={{
        width: section.width ? `${section.width}mm` : isRoundFlow ? u(section.height) : '100%',
        height: u(section.height),
        border: `${section.borderWidth}px solid ${section.borderColor}`,
        backgroundColor: section.backgroundColor || 'transparent',
        ...roundOrClip,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: u(2),
        fontSize: pt(section.fontSize ?? 10),
        fontWeight: 'bold',
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        margin: isRoundFlow && !section.width ? '0 auto' : undefined,
      }}
    >
      {labelText}
    </div>
  );
}

// ── Line Shape ─────────────────────────────────────────────────────

function LineRenderer({
  section,
  u,
}: {
  section: LineSection;
  u: (mm: number) => string;
}) {
  return (
    <div
      style={{
        height: 0,
        borderTop: `${section.thickness}px solid ${section.color}`,
        marginTop: u(section.marginTop),
        marginBottom: u(section.marginBottom),
        width: `${section.width ?? 100}%`,
      }}
    />
  );
}
