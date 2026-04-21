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
import { resolveBoundFieldImageSrc } from '@/lib/utils/googleDriveUrl';
import { migrateLegacyDocumentSections } from '@/lib/utils/migrateDocumentSections';
import { contentWidthMm, contentHeightMm, getPageDimensionsMm } from '@/lib/utils/canvasLayout';
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
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const fitMeasureRef = React.useRef<HTMLDivElement | null>(null);
  const m = template.pageMargins;
  const ps = template.pageStyle;
  const pageDims = getPageDimensionsMm(ps);
  const [printMinHeightMm, setPrintMinHeightMm] = React.useState(pageDims.heightMm);
  const [fitScaleFactor, setFitScaleFactor] = React.useState(1);
  const [fitScaledHeightPx, setFitScaledHeightPx] = React.useState<number | null>(null);
  const fitSinglePage = ps?.contentFitMode === 'single-page';
  const fitWidthPercent = fitScaleFactor > 0 ? 100 / fitScaleFactor : 100;
  const bgRaw = ps?.backgroundImageField
    ? resolveField(ps.backgroundImageField, data)
    : ps?.backgroundImageUrl;
  const bgUrl = bgRaw?.trim() ? resolveBoundFieldImageSrc(bgRaw) : '';
  const paperAlpha =
    ps?.contentLayerOpacity !== undefined
      ? ps.contentLayerOpacity
      : bgUrl
        ? 0.88
        : 1;
  const rawPageFaceBg = ps?.pageBackgroundColor?.trim() || '#ffffff';
  const pageFaceBg =
    isPrint && rawPageFaceBg === 'transparent' ? '#ffffff' : rawPageFaceBg;
  const innerPaperBg = bgUrl
    ? paperAlpha >= 0.999
      ? '#fff'
      : `rgba(255,255,255,${Math.min(1, Math.max(0, paperAlpha))})`
    : isPrint
      ? '#ffffff'
      : 'transparent';

  // Preview: 1mm → scale px (fits A4 on screen). Typography uses pt→mm→px so text/page ratio matches print.
  const previewPtToPx = (ptVal: number) => ptVal * MM_PER_PT * scale;

  const bodyFont =
    ps?.bodyFontFamily?.trim() || 'Arial, Helvetica, sans-serif';

  const containerStyle: React.CSSProperties = isPrint
    ? {
        width: `${pageDims.widthMm}mm`,
        minHeight: `${pageDims.heightMm}mm`,
        padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`,
        fontFamily: bodyFont,
        color: '#000',
        backgroundColor: innerPaperBg,
        boxSizing: 'border-box',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }
    : {
        width: `${pageDims.widthMm * scale}px`,
        minHeight: `${pageDims.heightMm * scale}px`,
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
  const wmImgUrl = wmImgRaw ? resolveBoundFieldImageSrc(wmImgRaw) : '';

  const wmOpacity = ps?.watermarkOpacity ?? 0.08;
  const wmAngle = ps?.watermarkAngle ?? -35;
  const wmFs = ps?.watermarkFontSizePt ?? 56;
  const bgOpacity = ps?.backgroundOpacity ?? 0.14;
  const bgFit = ps?.backgroundFit ?? 'cover';

  const outerPosition: React.CSSProperties = isPrint
    ? {
        position: 'relative',
        width: `${pageDims.widthMm}mm`,
        minHeight: `${printMinHeightMm}mm`,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }
    : { position: 'relative', width: `${pageDims.widthMm * scale}px`, minHeight: `${pageDims.heightMm * scale}px` };

  const cw = contentWidthMm(m, ps);
  const ch = contentHeightMm(m, ps);
  const rects = template.canvasRects;
  // Print should not hard-clip long tables inside fixed canvas cells.
  // When any table exists, switch print rendering to flow mode so rows can page-break naturally.
  const forceFlowForPrint =
    isPrint &&
    template.sections.some(
      (s) => s.type === 'table' || Boolean(s.repeatOnEveryPage) || Boolean(s.pageAnchor)
    );
  const hasCanvas =
    Boolean(template.canvasMode) &&
    Array.isArray(rects) &&
    rects.length === template.sections.length &&
    template.sections.length > 0 &&
    !forceFlowForPrint;
  const shouldKeepCanvasPlacementInPrint = (section: DocumentSection) =>
    isPrint &&
    forceFlowForPrint &&
    section.type === 'signatures' &&
    !section.repeatOnEveryPage &&
    !section.pageAnchor;
  const repeatingSectionsInPrint = isPrint
    ? template.sections
        .map((section, idx) => ({ section, idx }))
        .filter(({ section }) => Boolean(section.repeatOnEveryPage))
    : [];
  const repeatingHeaderSections = repeatingSectionsInPrint.filter(
    ({ section }) => (section.repeatRole ?? 'header') !== 'footer'
  );
  const repeatingFooterSections = repeatingSectionsInPrint.filter(
    ({ section }) => section.repeatRole === 'footer'
  );
  const repeatTopReserveMm = isPrint
    ? repeatingHeaderSections.reduce((mx, { idx }) => {
        const r = rects?.[idx];
        if (!r) return Math.max(mx, 0);
        const y = Math.max(0, Math.min(ch, r.yMm));
        const h = Math.max(0, Math.min(ch - y, r.heightMm));
        return Math.max(mx, y + h);
      }, 0)
    : 0;
  const repeatBottomReserveMm = isPrint
    ? repeatingFooterSections.reduce((mx, { idx }) => {
        const r = rects?.[idx];
        if (!r) return Math.max(mx, 0);
        const y = Math.max(0, Math.min(ch, r.yMm));
        return Math.max(mx, ch - y);
      }, 0)
    : 0;
  const nonRepeatingSections = (isPrint ? template.sections : template.sections)
    .map((section, idx) => ({ section, idx }))
    .filter(({ section }) => !isPrint || !section.repeatOnEveryPage);
  const anchoredTopSections = nonRepeatingSections.filter(({ section }) => section.pageAnchor === 'top');
  const anchoredBottomSections = nonRepeatingSections.filter(({ section }) => section.pageAnchor === 'bottom');
  const mainFlowSections = nonRepeatingSections.filter(({ section }) => !section.pageAnchor);
  const orderedMainFlowSections =
    isPrint && forceFlowForPrint
      ? [...mainFlowSections].sort((a, b) => {
          const ar = rects?.[a.idx];
          const br = rects?.[b.idx];
          if (ar && br) {
            const yDiff = ar.yMm - br.yMm;
            if (Math.abs(yDiff) > 1) return yDiff;
            const xDiff = ar.xMm - br.xMm;
            if (Math.abs(xDiff) > 1) return xDiff;
          } else if (ar && !br) {
            return -1;
          } else if (!ar && br) {
            return 1;
          }
          return a.idx - b.idx;
        })
      : mainFlowSections;

  const letterheadUrl = ((data as unknown) as { company?: { letterheadUrl?: string } }).company
    ?.letterheadUrl;
  const renderSectionByIndex = (section: DocumentSection, idx: number, forceFlow = false) => {
    const r = rects?.[idx];
    const renderInCanvas = !forceFlow && r && (hasCanvas || shouldKeepCanvasPlacementInPrint(section));
    if (renderInCanvas) {
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
          <div data-canvas-cell-inner={String(idx)} style={{ width: '100%', height: '100%', overflow: 'auto' }}>
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
                fitSinglePage={fitSinglePage}
                scale={scale}
                letterheadUrl={letterheadUrl}
                inCanvasCell
              />
            )}
          </div>
        </div>
      );
    }

    return (
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
            fitSinglePage={fitSinglePage}
            scale={scale}
            letterheadUrl={letterheadUrl}
          />
        )}
      </div>
    );
  };

  const renderMainSections = () => (
    <>
      {hasCanvas ? (
        <div
          style={{
            position: 'relative',
            width: u(cw),
            minHeight: u(ch),
            boxSizing: 'border-box',
          }}
        >
          {orderedMainFlowSections.map(({ section, idx }) => renderSectionByIndex(section, idx))}
          {!isPrint &&
            anchoredTopSections.map(({ section, idx }) => {
              const r = rects?.[idx];
              if (!r) return null;
              const x = Math.max(0, Math.min(cw, r.xMm));
              const y = Math.max(0, Math.min(ch, r.yMm));
              const w = Math.max(0, Math.min(cw - x, r.widthMm));
              const h = Math.max(0, Math.min(ch - y, r.heightMm));
              return (
                <div
                  key={`anchor-top-preview-${idx}`}
                  style={{
                    position: 'absolute',
                    left: u(x),
                    top: u(y),
                    width: u(w),
                    height: u(h),
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    zIndex: (r.zIndex ?? idx) + 50,
                  }}
                >
                  <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
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
                        fitSinglePage={fitSinglePage}
                        scale={scale}
                        letterheadUrl={letterheadUrl}
                        inCanvasCell
                      />
                    )}
                  </div>
                </div>
              );
            })}
          {!isPrint &&
            anchoredBottomSections.map(({ section, idx }) => {
              const r = rects?.[idx];
              if (!r) return null;
              const x = Math.max(0, Math.min(cw, r.xMm));
              const w = Math.max(0, Math.min(cw - x, r.widthMm));
              const h = Math.max(0, Math.min(ch, r.heightMm));
              const bottomInset = Math.max(0, ch - (r.yMm + r.heightMm));
              return (
                <div
                  key={`anchor-bottom-preview-${idx}`}
                  style={{
                    position: 'absolute',
                    left: u(x),
                    bottom: u(bottomInset),
                    width: u(w),
                    height: u(h),
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    zIndex: (r.zIndex ?? idx) + 50,
                  }}
                >
                  <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
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
                        fitSinglePage={fitSinglePage}
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
        <>
          {anchoredTopSections.map(({ section, idx }) => renderSectionByIndex(section, idx, true))}
          {(() => {
            const rowToleranceMm = 2;
            const canSharePrintRow = (section: DocumentSection, idx: number) =>
              isPrint &&
              forceFlowForPrint &&
              section.type !== 'table' &&
              section.type !== 'signatures' &&
              !section.pageAnchor &&
              !section.repeatOnEveryPage &&
              Boolean(rects?.[idx]);

            const groups: Array<Array<{ section: DocumentSection; idx: number }>> = [];
            let currentRow: Array<{ section: DocumentSection; idx: number }> = [];

            const flushRow = () => {
              if (currentRow.length > 0) groups.push(currentRow);
              currentRow = [];
            };

            for (const item of orderedMainFlowSections) {
              if (!canSharePrintRow(item.section, item.idx)) {
                flushRow();
                groups.push([item]);
                continue;
              }

              if (currentRow.length === 0) {
                currentRow = [item];
                continue;
              }

              const prevRect = rects?.[currentRow[0].idx];
              const nextRect = rects?.[item.idx];
              const sameRow =
                prevRect &&
                nextRect &&
                Math.abs(prevRect.yMm - nextRect.yMm) <= rowToleranceMm;

              if (sameRow) {
                currentRow.push(item);
              } else {
                flushRow();
                currentRow = [item];
              }
            }

            flushRow();

            return groups.map((group, groupIdx) => {
              if (
                group.length === 1 &&
                !canSharePrintRow(group[0].section, group[0].idx)
              ) {
                return renderSectionByIndex(group[0].section, group[0].idx);
              }

              const positioned = group
                .map(({ section, idx }) => {
                  const r = rects?.[idx];
                  if (!r) return null;
                  const safeX = Math.max(0, Math.min(cw, r.xMm));
                  const safeY = Math.max(0, Math.min(ch, r.yMm));
                  const safeW = Math.max(0, Math.min(cw - safeX, r.widthMm));
                  const safeH = Math.max(0, r.heightMm);
                  return { section, idx, xMm: safeX, yMm: safeY, widthMm: safeW, heightMm: safeH };
                })
                .filter((item): item is NonNullable<typeof item> => Boolean(item));

              if (positioned.length === 0) {
                return (
                  <React.Fragment key={`print-flow-row-fallback-${groupIdx}`}>
                    {group.map(({ section, idx }) => renderSectionByIndex(section, idx, true))}
                  </React.Fragment>
                );
              }

              const minY = Math.min(...positioned.map((item) => item.yMm));
              const maxBottom = Math.max(...positioned.map((item) => item.yMm + item.heightMm));
              const rowHeight = Math.max(0, maxBottom - minY);

              return (
                <div
                  key={`print-flow-row-${groupIdx}-${positioned.map(({ idx }) => idx).join('-')}`}
                  style={{
                    position: 'relative',
                    width: u(cw),
                    minHeight: u(rowHeight),
                    height: u(rowHeight),
                    boxSizing: 'border-box',
                    overflow: 'visible',
                  }}
                >
                  {positioned
                    .sort((a, b) => a.xMm - b.xMm)
                    .map(({ section, idx, xMm, yMm, widthMm, heightMm }) => (
                      <div
                        key={`print-flow-row-item-${idx}`}
                        style={{
                          position: 'absolute',
                          left: u(xMm),
                          top: u(yMm - minY),
                          width: u(widthMm),
                          minHeight: u(heightMm),
                          boxSizing: 'border-box',
                          overflow: 'visible',
                        }}
                      >
                        {renderSectionByIndex(section, idx, true)}
                      </div>
                    ))}
                </div>
              );
            });
          })()}
          {anchoredBottomSections.map(({ section, idx }) => renderSectionByIndex(section, idx, true))}
        </>
      )}
    </>
  );
  const renderRepeatedSectionInAssignedArea = (
    section: DocumentSection,
    idx: number,
    role: 'header' | 'footer'
  ) => {
    const r = rects?.[idx];
    const x = r ? Math.max(0, Math.min(cw, r.xMm)) : 0;
    const width = r ? Math.max(0, Math.min(cw - x, r.widthMm)) : cw;
    const y = r ? Math.max(0, Math.min(ch, r.yMm)) : 0;
    const height = r ? Math.max(0, Math.min(ch, r.heightMm)) : undefined;
    const footerInset = r ? Math.max(0, ch - (r.yMm + r.heightMm)) : 0;

    return (
      <div
        style={{
          position: 'fixed',
          left: `${m.left + x}mm`,
          width: `${width}mm`,
          ...(role === 'header'
            ? { top: `${m.top + y}mm` }
            : { bottom: `${m.bottom + footerInset}mm` }),
          ...(height ? { minHeight: `${height}mm` } : {}),
          zIndex: 15,
          pointerEvents: 'none',
        }}
      >
        {renderSectionByIndex(section, idx, true)}
      </div>
    );
  };

  React.useLayoutEffect(() => {
    if (!isPrint) return;
    if (fitSinglePage) {
      setPrintMinHeightMm(pageDims.heightMm);
      return;
    }
    const root = rootRef.current;
    const content = contentRef.current;
    if (!root || !content) return;

    const widthPx = root.getBoundingClientRect().width;
    if (!widthPx) return;
    const pxPerMm = widthPx / pageDims.widthMm;
    const pagePx = pageDims.heightMm * pxPerMm;
    const neededPx = Math.max(content.scrollHeight, pagePx);
    const pages = Math.max(1, Math.ceil(neededPx / pagePx));
    const nextMm = pages * pageDims.heightMm;
    setPrintMinHeightMm((prev) => (prev !== nextMm ? nextMm : prev));
  }, [
    fitSinglePage,
    isPrint,
    template.sections,
    template.canvasRects,
    template.canvasMode,
    template.pageMargins,
    template.pageStyle,
    repeatTopReserveMm,
    repeatBottomReserveMm,
    data,
    pageDims.heightMm,
    pageDims.widthMm,
  ]);

  React.useLayoutEffect(() => {
    if (!fitSinglePage) {
      setFitScaleFactor(1);
      setFitScaledHeightPx(null);
      return;
    }

    const content = contentRef.current;
    const measure = fitMeasureRef.current;
    if (!content || !measure) return;

    const availableWidth = content.clientWidth;
    const availableHeight = content.clientHeight;
    const naturalWidth = measure.scrollWidth;
    const naturalHeight = measure.scrollHeight;
    if (!availableWidth || !availableHeight || !naturalWidth || !naturalHeight) return;

    const widthScale = availableWidth / naturalWidth;
    const heightScale = availableHeight / naturalHeight;
    const nextScale = Math.min(1, widthScale, heightScale);
    setFitScaleFactor((prev) => (Math.abs(prev - nextScale) > 0.001 ? nextScale : prev));
    const nextHeight = naturalHeight * nextScale;
    setFitScaledHeightPx((prev) => (prev == null || Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
  }, [
    fitSinglePage,
    template.sections,
    template.canvasRects,
    template.canvasMode,
    template.pageMargins,
    template.pageStyle,
    repeatTopReserveMm,
    repeatBottomReserveMm,
    data,
    pageDims.heightMm,
    pageDims.widthMm,
  ]);

  return (
    <div
      ref={rootRef}
      style={{ ...outerPosition, backgroundColor: pageFaceBg }}
      className="document-renderer-root"
    >
      <style>{`
        .print-page-number::before { content: "1"; }
        .print-page-total::before { content: "1"; }
        @media print {
          .print-page-number::before { content: counter(page); }
          .print-page-total::before { content: counter(pages); }
        }
      `}</style>
      {bgUrl && (
        isPrint ? (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              pointerEvents: 'none',
              opacity: bgOpacity,
              backgroundImage: `url(${bgUrl})`,
              backgroundPosition: 'top center',
              backgroundRepeat: bgFit === 'auto' ? 'repeat' : 'repeat-y',
              // Repeat one full A4-sized background per page for every print page.
              backgroundSize: bgFit === 'auto' ? 'auto' : '100% 297mm',
              backgroundOrigin: 'border-box',
            }}
          />
        ) : (
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
        )
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
      <div
        ref={contentRef}
        style={{
          ...containerStyle,
          position: 'relative',
          zIndex: 2,
          ...(isPrint
            ? {
                paddingTop: `${m.top + repeatTopReserveMm}mm`,
                paddingBottom: `${m.bottom + repeatBottomReserveMm}mm`,
                boxDecorationBreak: 'clone',
                WebkitBoxDecorationBreak: 'clone',
              }
            : {}),
        }}
        className="document-renderer"
      >
        {isPrint &&
          repeatingHeaderSections.map(({ section, idx }) => (
            <React.Fragment key={`repeat-head-${idx}`}>
              {renderRepeatedSectionInAssignedArea(section, idx, 'header')}
            </React.Fragment>
          ))}
        {isPrint &&
          repeatingFooterSections.map(({ section, idx }) => (
            <React.Fragment key={`repeat-foot-${idx}`}>
              {renderRepeatedSectionInAssignedArea(section, idx, 'footer')}
            </React.Fragment>
          ))}
        {fitSinglePage ? (
          <div
            style={{
              height: fitScaledHeightPx != null ? `${fitScaledHeightPx}px` : undefined,
              overflow: 'hidden',
            }}
          >
            <div
              ref={fitMeasureRef}
              style={
                isPrint
                  ? (({
                      zoom: fitScaleFactor < 0.999 ? fitScaleFactor : 1,
                      width: fitScaleFactor < 0.999 ? `${fitWidthPercent}%` : '100%',
                    }) as React.CSSProperties)
                  : {
                      transform: fitScaleFactor < 0.999 ? `scale(${fitScaleFactor})` : undefined,
                      transformOrigin: 'top left',
                      width: fitScaleFactor < 0.999 ? `${fitWidthPercent}%` : '100%',
                    }
              }
            >
              {renderMainSections()}
            </div>
          </div>
        ) : (
          <div ref={fitMeasureRef}>{renderMainSections()}</div>
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
  fitSinglePage?: boolean;
  scale: number;
  letterheadUrl?: string;
  /** True when this block sits in a fixed canvas cell — box/shape fills the cell for print parity */
  inCanvasCell?: boolean;
}

function resolveInlineTemplate(text: string | undefined, data: AnyTemplateDataContext): string {
  const src = String(text ?? '');
  if (!src.includes('{{')) return src;
  return src.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, pathRaw: string) => {
    const path = String(pathRaw ?? '').trim();
    if (!path) return '';
    return resolveField(path, data);
  });
}

function renderDynamicText(value: string): React.ReactNode {
  if (!value.includes('__PAGE_')) return value;
  const parts: React.ReactNode[] = [];
  const re = /__PAGE_NUMBER__|__PAGE_TOTAL__/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) parts.push(value.slice(last, m.index));
    parts.push(
      m[0] === '__PAGE_NUMBER__' ? (
        <span key={`pn-${m.index}`} className="print-page-number" />
      ) : (
        <span key={`pt-${m.index}`} className="print-page-total" />
      )
    );
    last = re.lastIndex;
  }
  if (last < value.length) parts.push(value.slice(last));
  return <>{parts}</>;
}

function getScheduleLocationCellTone(
  item: Record<string, unknown> | null,
  fallbackBg?: string,
  fallbackColor?: string
): { backgroundColor?: string; color?: string; fontWeight?: React.CSSProperties['fontWeight'] } {
  const variant = String(item?.locationBadgeVariant ?? '').trim();
  if (variant === 'factory') {
    return {
      backgroundColor: '#dcfce7',
      color: '#166534',
      fontWeight: 600,
    };
  }
  return {
    backgroundColor: fallbackBg,
    color: fallbackColor,
  };
}

function SectionRenderer({
  section,
  data,
  u,
  pt,
  isPrint,
  fitSinglePage = false,
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
      return (
        <TableRenderer
          section={sec}
          data={data}
          u={u}
          pt={pt}
          isPrint={isPrint}
          fitSinglePage={fitSinglePage}
        />
      );
    case 'text':
      return <TextRenderer section={sec} data={data} pt={pt} />;
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
      return <SignaturesRenderer section={sec} data={data} u={u} pt={pt} />;
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
  if (fromTemplate) return resolveBoundFieldImageSrc(fromTemplate);
  const fromField =
    section.source === 'field' && section.field?.trim()
      ? String(resolveField(section.field, data) ?? '').trim()
      : '';
  if (fromField) return resolveBoundFieldImageSrc(fromField);
  const fromUrl = section.url?.trim() ?? '';
  if (fromUrl) return resolveBoundFieldImageSrc(fromUrl);
  const fallback =
    section.useCompanyLetterheadFallback !== false && letterheadUrl?.trim()
      ? letterheadUrl.trim()
      : '';
  return fallback ? resolveBoundFieldImageSrc(fallback) : '';
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
  const display = dynamic || resolveInlineTemplate(section.text, data);
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
      {renderDynamicText(display)}
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
        const value =
          cell.valueTemplate && cell.valueTemplate.trim()
            ? resolveInlineTemplate(cell.valueTemplate, data)
            : cell.field
              ? resolveField(cell.field, data)
              : resolveInlineTemplate(cell.text ?? '', data);
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
            {cell.label && (
              <span style={{ fontWeight: 'bold' }}>{renderDynamicText(resolveInlineTemplate(cell.label, data))} </span>
            )}
            {renderDynamicText(value)}
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
            <span style={{ fontWeight: 'bold', marginRight: u(1) }}>
              {renderDynamicText(resolveInlineTemplate(item.label, data))}:
            </span>
            <span style={{ fontWeight: item.bold ? 'bold' : 'normal' }}>{renderDynamicText(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

type ScheduleWorkerBlock = {
  kind?: 'subteam' | 'leader' | 'worker' | 'spacer';
  text?: string;
};

function renderScheduleWorkerBlocks(
  blocks: unknown,
  u: (mm: number) => string
): React.ReactNode {
  if (!Array.isArray(blocks) || blocks.length === 0) return '\u00A0';
  const typedBlocks = blocks as ScheduleWorkerBlock[];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: u(0.7) }}>
      {typedBlocks.map((block, index) => {
        const kind = block?.kind ?? 'worker';
        const text = String(block?.text ?? '');
        if (kind === 'spacer') {
          return <div key={`worker-block-${index}`} style={{ height: u(1.2) }} />;
        }
        return (
          <div
            key={`worker-block-${index}`}
            style={{
              fontWeight: kind === 'subteam' || kind === 'leader' ? 'bold' : 'normal',
              opacity: kind === 'subteam' ? 1 : 0.98,
            }}
          >
            {renderDynamicText(text)}
          </div>
        );
      })}
    </div>
  );
}

function getScheduleWorkerStructuredRows(item: Record<string, unknown> | null | undefined): ScheduleWorkerBlock[] {
  if (!item) return [];
  if (Array.isArray(item.workerBlocks)) {
    return (item.workerBlocks as Array<unknown>).map((block) => {
      const row = (block ?? {}) as Record<string, unknown>;
      return {
        kind: (row.kind as ScheduleWorkerBlock['kind']) ?? 'worker',
        text: String(row.text ?? ''),
      };
    });
  }
  if (Array.isArray(item.workerStructuredRows)) {
    return (item.workerStructuredRows as Array<unknown>).map((row) => ({
      kind: 'worker' as const,
      text: String(row ?? ''),
    }));
  }
  return [];
}

function getScheduleWorkerRowLabel(
  block: ScheduleWorkerBlock | null | undefined,
  rowIndex: number
): string {
  if (block?.kind === 'subteam') return 'Sub-team';
  if (block?.kind === 'leader') return 'Team Leader';
  if (block?.kind === 'spacer') return '\u00A0';
  return rowIndex === 0 ? 'Team Leader' : 'Worker';
}

// ── Table ──────────────────────────────────────────────────────────

function TableRenderer({
  section,
  data,
  u,
  pt,
  isPrint,
  fitSinglePage = false,
}: {
  section: TableSection;
  data: AnyTemplateDataContext;
  u: (mm: number) => string;
  pt: (v: number) => string;
  isPrint: boolean;
  fitSinglePage?: boolean;
}) {
  const dataBag = data as unknown as Record<string, unknown>;
  let items: Array<Record<string, unknown>> = [];
  const ds = section.dataSource;
  if (ds === 'customItems' && Array.isArray(dataBag.customItems)) items = dataBag.customItems as Array<Record<string, unknown>>;
  else if (ds === 'batches' && Array.isArray(dataBag.batches)) items = dataBag.batches as Array<Record<string, unknown>>;
  else if (ds === 'items' && Array.isArray(dataBag.items)) items = dataBag.items as Array<Record<string, unknown>>;
  else if (ds === 'scheduleGroups' && Array.isArray(dataBag.scheduleGroups)) items = dataBag.scheduleGroups as Array<Record<string, unknown>>;
  else if (ds === 'driverTrips' && Array.isArray(dataBag.driverTrips)) items = dataBag.driverTrips as Array<Record<string, unknown>>;

  // Pad with empty rows if less than minRows
  const displayItems: Array<Record<string, unknown> | null> = [...items];
  while (displayItems.length < section.minRows) {
    displayItems.push(null); // null = empty row placeholder
  }

  const borderStyle = section.showBorders ? '1px solid #000' : 'none';
  const cellPadding = u(section.rowPadding);
  const rowMinHeight = section.rowMinHeightMm && section.rowMinHeightMm > 0 ? u(section.rowMinHeightMm) : undefined;
  const globalHeaderFontWeight = section.headerFontWeight ?? 'bold';
  const globalHeaderFontStyle = section.headerFontStyle ?? 'normal';
  const getColumnMinHeight = (col: TableSection['columns'][number]) =>
    col.rowMinHeightMm && col.rowMinHeightMm > 0 ? u(col.rowMinHeightMm) : rowMinHeight;

  if (section.layoutMode === 'group-columns' && ds === 'scheduleGroups') {
    const maxWorkerRows = section.columns.some((col) => col.field === 'workerRows')
      ? displayItems.reduce((max, item) => {
          const rows = Array.isArray(item?.workerRows) ? item.workerRows : [];
          return Math.max(max, rows.length);
        }, 0)
      : 0;
    const maxStructuredWorkerRows = section.columns.some((col) => col.field === 'workerStructuredRows')
      ? displayItems.reduce((max, item) => {
          const rows = getScheduleWorkerStructuredRows(item);
          return Math.max(max, rows.length);
        }, 0)
      : 0;
    const matrixRowCount = section.columns.reduce((count, col) => {
      if (col.field === 'workerRows') return count + Math.max(1, maxWorkerRows);
      if (col.field === 'workerStructuredRows') return count + Math.max(1, maxStructuredWorkerRows);
      return count + 1;
    }, 0);
    const fitMatrixForPrint = isPrint && fitSinglePage && displayItems.length > 0;
    const widthScale = fitMatrixForPrint
      ? Math.min(1, 8 / Math.max(displayItems.length, 8))
      : 1;
    const heightScale = fitMatrixForPrint
      ? Math.min(1, 12 / Math.max(matrixRowCount, 12))
      : 1;
    const matrixScale = fitMatrixForPrint ? Math.min(widthScale, heightScale) : 1;
    const effectiveFontSize = fitMatrixForPrint ? Math.max(4.25, section.fontSize * matrixScale) : section.fontSize;
    const effectiveRowPaddingMm = fitMatrixForPrint
      ? Math.max(0.35, section.rowPadding * matrixScale * 0.6)
      : section.rowPadding;
    const effectiveCellPadding = u(effectiveRowPaddingMm);
    const labelColumnPercent = fitMatrixForPrint ? Math.max(8, Math.min(12, 20 - displayItems.length * 0.45)) : undefined;
    const groupColumnPercent =
      fitMatrixForPrint && displayItems.length > 0 && labelColumnPercent
        ? (100 - labelColumnPercent) / displayItems.length
        : undefined;
    return (
      <div style={{ overflowX: fitMatrixForPrint ? 'hidden' : 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: pt(effectiveFontSize),
            pageBreakInside: 'auto',
            tableLayout: fitMatrixForPrint ? 'fixed' : 'auto',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: section.headerBg, color: section.headerColor }}>
              <th
                style={{
                  border: borderStyle,
                  padding: `${effectiveCellPadding} ${u(1.2)}`,
                  textAlign: 'left',
                  fontWeight: globalHeaderFontWeight,
                  fontStyle: globalHeaderFontStyle,
                  whiteSpace: fitMatrixForPrint ? 'normal' : 'nowrap',
                  minWidth: isPrint ? undefined : u(22),
                  minHeight: rowMinHeight,
                  height: rowMinHeight,
                  width: labelColumnPercent ? `${labelColumnPercent}%` : undefined,
                  lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                }}
              >
                Field
              </th>
              {displayItems.map((item, idx) => (
                <th
                  key={`group-${idx}`}
                  style={{
                    border: borderStyle,
                    padding: `${effectiveCellPadding} ${u(1.2)}`,
                    textAlign: 'left',
                    fontWeight: globalHeaderFontWeight,
                    fontStyle: globalHeaderFontStyle,
                    minWidth: isPrint ? undefined : u(34),
                    whiteSpace: fitMatrixForPrint ? 'normal' : 'nowrap',
                    minHeight: rowMinHeight,
                    height: rowMinHeight,
                    width: groupColumnPercent ? `${groupColumnPercent}%` : undefined,
                    lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                  }}
                >
                  {item ? renderDynamicText(String(item.label ?? `Group ${idx + 1}`)) : '\u00A0'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.columns.map((col, rowIdx) => {
              if (col.field === 'workerRows') {
                const workerRowCount = Math.max(1, maxWorkerRows);
                return Array.from({ length: workerRowCount }).map((_, workerIdx) => (
                  <tr
                    key={`matrix-worker-row-${rowIdx}-${workerIdx}`}
                    style={{
                      minHeight: getColumnMinHeight(col),
                      height: getColumnMinHeight(col),
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid',
                    }}
                  >
                    <th
                      style={{
                        border: borderStyle,
                        padding: `${effectiveCellPadding} ${u(1.2)}`,
                        textAlign: 'left',
                        verticalAlign: col.verticalAlign ?? 'top',
                        backgroundColor:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerBg ?? section.headerBg)
                            : section.headerBg,
                        color:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerColor ?? section.headerColor)
                            : section.headerColor,
                        fontWeight:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerFontWeight ?? globalHeaderFontWeight)
                            : globalHeaderFontWeight,
                        fontStyle:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerFontStyle ?? globalHeaderFontStyle)
                            : globalHeaderFontStyle,
                        whiteSpace: 'pre-wrap',
                        minHeight: getColumnMinHeight(col),
                        height: getColumnMinHeight(col),
                        width: labelColumnPercent ? `${labelColumnPercent}%` : undefined,
                        lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                      }}
                    >
                      {workerIdx === 0 ? 'Team Leader' : 'Worker'}
                    </th>
                    {displayItems.map((item, itemIdx) => {
                      const workerRows = Array.isArray(item?.workerRows)
                        ? (item.workerRows as Array<unknown>).map((row) => String(row ?? ''))
                        : [];
                      const cellValue = item == null ? '' : workerRows[workerIdx] ?? '';
                      return (
                        <td
                          key={`matrix-worker-cell-${rowIdx}-${workerIdx}-${itemIdx}`}
                          style={{
                            border: borderStyle,
                            padding: `${effectiveCellPadding} ${u(1.2)}`,
                            textAlign: col.align,
                            verticalAlign: col.verticalAlign ?? 'top',
                            backgroundColor: col.cellBg,
                            color: col.cellColor,
                            fontWeight: col.fontWeight ?? 'normal',
                            fontStyle: col.fontStyle ?? 'normal',
                            wordBreak: 'break-word',
                            whiteSpace: fitMatrixForPrint ? 'normal' : 'pre-wrap',
                            minHeight: getColumnMinHeight(col),
                            height: getColumnMinHeight(col),
                            width: groupColumnPercent ? `${groupColumnPercent}%` : undefined,
                            lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                            overflow: fitMatrixForPrint ? 'hidden' : undefined,
                          }}
                        >
                          {renderDynamicText(cellValue || (item == null ? '\u00A0' : ''))}
                        </td>
                      );
                    })}
                  </tr>
                ));
              }

              if (col.field === 'workerStructuredRows') {
                const workerRowCount = Math.max(1, maxStructuredWorkerRows);
                return Array.from({ length: workerRowCount }).map((_, workerIdx) => (
                  (() => {
                    const labelBlock =
                      displayItems
                        .map((item) => getScheduleWorkerStructuredRows(item)[workerIdx] ?? null)
                        .find((block) => Boolean(block && String(block.text ?? '').trim())) ?? null;
                    return (
                  <tr
                    key={`matrix-structured-worker-row-${rowIdx}-${workerIdx}`}
                    style={{
                      minHeight: getColumnMinHeight(col),
                      height: getColumnMinHeight(col),
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid',
                    }}
                  >
                    <th
                      style={{
                        border: borderStyle,
                        padding: `${effectiveCellPadding} ${u(1.2)}`,
                        textAlign: 'left',
                        verticalAlign: col.verticalAlign ?? 'top',
                        backgroundColor:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerBg ?? section.headerBg)
                            : section.headerBg,
                        color:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerColor ?? section.headerColor)
                            : section.headerColor,
                        fontWeight:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerFontWeight ?? globalHeaderFontWeight)
                            : globalHeaderFontWeight,
                        fontStyle:
                          col.useGlobalHeaderStyle === false
                            ? (col.headerFontStyle ?? globalHeaderFontStyle)
                            : globalHeaderFontStyle,
                        whiteSpace: 'pre-wrap',
                        minHeight: getColumnMinHeight(col),
                        height: getColumnMinHeight(col),
                        width: labelColumnPercent ? `${labelColumnPercent}%` : undefined,
                        lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                      }}
                    >
                      {getScheduleWorkerRowLabel(labelBlock, workerIdx)}
                    </th>
                    {displayItems.map((item, itemIdx) => {
                      const workerRows = getScheduleWorkerStructuredRows(item);
                      const block = item == null ? null : workerRows[workerIdx] ?? null;
                      return (
                        <td
                          key={`matrix-structured-worker-cell-${rowIdx}-${workerIdx}-${itemIdx}`}
                          style={{
                            border: borderStyle,
                            padding: `${effectiveCellPadding} ${u(1.2)}`,
                            textAlign: col.align,
                            verticalAlign: col.verticalAlign ?? 'top',
                            backgroundColor: col.cellBg,
                            color: col.cellColor,
                            fontWeight:
                              block?.kind === 'subteam' || block?.kind === 'leader'
                                ? 'bold'
                                : col.fontWeight ?? 'normal',
                            fontStyle: col.fontStyle ?? 'normal',
                            wordBreak: 'break-word',
                            whiteSpace: fitMatrixForPrint ? 'normal' : 'pre-wrap',
                            minHeight: getColumnMinHeight(col),
                            height: getColumnMinHeight(col),
                            width: groupColumnPercent ? `${groupColumnPercent}%` : undefined,
                            lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                            overflow: fitMatrixForPrint ? 'hidden' : undefined,
                          }}
                        >
                          {block?.kind === 'spacer'
                            ? '\u00A0'
                            : renderDynamicText(block?.text || (item == null ? '\u00A0' : ''))}
                        </td>
                      );
                    })}
                  </tr>
                    );
                  })()
                ));
              }

              return (
                <tr
                  key={`matrix-row-${rowIdx}`}
                  style={{
                    minHeight: getColumnMinHeight(col),
                    height: getColumnMinHeight(col),
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <th
                  style={{
                      border: borderStyle,
                      padding: `${effectiveCellPadding} ${u(1.2)}`,
                      textAlign: 'left',
                      verticalAlign: col.verticalAlign ?? 'top',
                    backgroundColor:
                      col.useGlobalHeaderStyle === false
                        ? (col.headerBg ?? section.headerBg)
                        : section.headerBg,
                    color:
                      col.useGlobalHeaderStyle === false
                        ? (col.headerColor ?? section.headerColor)
                        : section.headerColor,
                    fontWeight:
                      col.useGlobalHeaderStyle === false
                        ? (col.headerFontWeight ?? globalHeaderFontWeight)
                        : globalHeaderFontWeight,
                    fontStyle:
                      col.useGlobalHeaderStyle === false
                        ? (col.headerFontStyle ?? globalHeaderFontStyle)
                        : globalHeaderFontStyle,
                      whiteSpace: 'pre-wrap',
                      minHeight: getColumnMinHeight(col),
                      height: getColumnMinHeight(col),
                      width: labelColumnPercent ? `${labelColumnPercent}%` : undefined,
                      lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                    }}
                  >
                    {col.header}
                  </th>
                  {displayItems.map((item, itemIdx) => {
                    const locationTone =
                      col.field === 'locationDisplay'
                        ? getScheduleLocationCellTone(item, col.cellBg, col.cellColor)
                        : null;
                    const rawCellValue =
                      item == null
                        ? ''
                        : col.field === 'slno'
                          ? String(itemIdx + 1)
                          : item[col.field];
                    return (
                      <td
                        key={`matrix-cell-${rowIdx}-${itemIdx}`}
                        style={{
                          border: borderStyle,
                          padding: `${effectiveCellPadding} ${u(1.2)}`,
                          textAlign: col.align,
                          verticalAlign: col.verticalAlign ?? 'top',
                          backgroundColor: locationTone?.backgroundColor ?? col.cellBg,
                          color: locationTone?.color ?? col.cellColor,
                          fontWeight: locationTone?.fontWeight ?? col.fontWeight ?? 'normal',
                          fontStyle: col.fontStyle ?? 'normal',
                          wordBreak: 'break-word',
                          whiteSpace: fitMatrixForPrint ? 'normal' : 'pre-wrap',
                          minHeight: getColumnMinHeight(col),
                          height: getColumnMinHeight(col),
                          width: groupColumnPercent ? `${groupColumnPercent}%` : undefined,
                          lineHeight: fitMatrixForPrint ? 1.05 : undefined,
                          overflow: fitMatrixForPrint ? 'hidden' : undefined,
                        }}
                        >
                          {col.field === 'workerBlocks'
                            ? renderScheduleWorkerBlocks(rawCellValue, u)
                            : renderDynamicText(String(rawCellValue || (item == null ? '\u00A0' : '')))}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

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
                fontWeight:
                  col.useGlobalHeaderStyle === false
                    ? (col.headerFontWeight ?? globalHeaderFontWeight)
                    : globalHeaderFontWeight,
                fontStyle:
                  col.useGlobalHeaderStyle === false
                    ? (col.headerFontStyle ?? globalHeaderFontStyle)
                    : globalHeaderFontStyle,
                backgroundColor:
                  col.useGlobalHeaderStyle === false
                    ? (col.headerBg ?? section.headerBg)
                    : section.headerBg,
                color:
                  col.useGlobalHeaderStyle === false
                    ? (col.headerColor ?? section.headerColor)
                    : section.headerColor,
                whiteSpace: 'pre-wrap',
                minHeight: getColumnMinHeight(col),
                height: getColumnMinHeight(col),
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
                let cellValue: unknown = '';
                if (item !== null) {
                  if (col.field === 'slno') {
                    cellValue = String(rowIdx + 1);
                  } else {
                    cellValue = item[col.field] ?? '';
                }
              }
              const locationTone =
                col.field === 'locationDisplay'
                  ? getScheduleLocationCellTone(item, col.cellBg, col.cellColor)
                  : null;
              return (
                <td
                  key={ci}
                  style={{
                    border: borderStyle,
                    padding: `${cellPadding} ${u(2)}`,
                    textAlign: col.align,
                    verticalAlign: col.verticalAlign ?? 'top',
                    backgroundColor: locationTone?.backgroundColor ?? col.cellBg,
                    color: locationTone?.color ?? col.cellColor,
                    fontWeight: locationTone?.fontWeight ?? col.fontWeight ?? 'normal',
                    fontStyle: col.fontStyle ?? 'normal',
                    // Let cell height grow with content
                    wordBreak: 'break-word',
                    whiteSpace: 'pre-wrap',
                    minHeight: getColumnMinHeight(col),
                    height: getColumnMinHeight(col),
                  }}
                  >
                    {col.field === 'workerBlocks'
                      ? renderScheduleWorkerBlocks(cellValue, u)
                      : renderDynamicText(String(cellValue || (item === null ? '\u00A0' : '')))}
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
  data,
  pt,
}: {
  section: { type: 'text'; content: string; fontSize: number; align: string; bold: boolean; color: string };
  data: AnyTemplateDataContext;
  pt: (v: number) => string;
}) {
  return (
    <div
      style={{
        fontSize: pt(section.fontSize),
        textAlign: section.align as React.CSSProperties['textAlign'],
        fontWeight: section.bold ? 'bold' : 'normal',
        color: section.color,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      }}
    >
      {renderDynamicText(resolveInlineTemplate(section.content, data))}
    </div>
  );
}

// ── Signatures ─────────────────────────────────────────────────────

function SignaturesRenderer({
  section,
  data,
  u,
  pt,
}: {
  section: SignaturesSection;
  data: AnyTemplateDataContext;
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
            {renderDynamicText(resolveInlineTemplate(sig.label, data))}
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
  const labelText = labelDynamic || resolveInlineTemplate(section.label || '', data);
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
      {renderDynamicText(labelText)}
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
