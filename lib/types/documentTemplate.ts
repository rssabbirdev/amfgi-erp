/**
 * Section-based document template system.
 *
 * Instead of absolute-positioned elements on a canvas, templates are
 * an ordered list of sections that flow naturally in the document.
 * The renderer handles page breaks, dynamic row heights, and
 * multi-page tables automatically.
 */

/** Built-in document kinds; templates may use any string — unknown types use generic field hints. */
export const KNOWN_ITEM_TYPES = [
  'delivery-note',
  'goods-receipt',
  'packing-slip',
  'material-label',
  'work-schedule',
] as const;

export type KnownItemType = (typeof KNOWN_ITEM_TYPES)[number];
/** Allow future/ERP-specific kinds without schema churn */
export type ItemType = KnownItemType | (string & {});

/** Optional visual chrome applied around any block in print/preview */
export interface SectionStylePack {
  color?: string;
  backgroundColor?: string;
  borderWidthPx?: number;
  borderColor?: string;
  borderRadiusPx?: number;
  paddingMm?: number;
  marginTopMm?: number;
  marginBottomMm?: number;
  widthMm?: number;
  heightMm?: number;
  minHeightMm?: number;
  maxWidthMm?: number;
  fontSizePt?: number;
  fontWeight?: 'normal' | 'bold';
  /** CSS font-style */
  fontStyle?: 'normal' | 'italic';
  /** CSS text-decoration (e.g. underline) */
  textDecoration?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  /** CSS font-family stack for this block */
  fontFamily?: string;
  lineHeight?: number;
  textAlign?: 'left' | 'center' | 'right';
  /** Block opacity 0–1 */
  opacity?: number;
  /** CSS background-image URL (static) */
  backgroundImageUrl?: string;
  backgroundSize?: 'auto' | 'cover' | 'contain';
  /** e.g. `center center`, `top left`, `50% 20%` */
  backgroundPosition?: string;
  backgroundRepeat?: 'no-repeat' | 'repeat' | 'repeat-x' | 'repeat-y';
}

/** Builder-only fields on every section variant (ignored by the print renderer) */
export interface SectionBuilderMeta {
  style?: SectionStylePack;
  /** Shown after the fixed type name: "Field Row - {this}" (not printed) */
  customBlockName?: string;
  /** Legacy full-row label; superseded by type + customBlockName */
  blockName?: string;
  /** When true, block cannot be edited or moved/resized in the builder (canvas + flow). */
  locked?: boolean;
  /** Sections with the same id move together on the canvas (freeform mode). */
  groupId?: string;
  /**
   * Canvas only: block may extend into the page margin band (negative x/y relative to content origin).
   * Ignored in flow layout.
   */
  allowMarginBleed?: boolean;
  /** Print mode: repeat this block on every printed page. */
  repeatOnEveryPage?: boolean;
  /** Print repeat position bucket. */
  repeatRole?: 'header' | 'footer';
  /**
   * Non-repeating page anchor:
   * - top: place once at top of first page content
   * - bottom: place once at bottom of document flow
   */
  pageAnchor?: 'top' | 'bottom';
}

// ── Section types ──────────────────────────────────────────────────

export interface HeadingSection {
  type: 'heading';
  /** Static title; ignored if `field` is set */
  text: string;
  /** When set, resolved from data (e.g. job.jobNumber) */
  field?: string;
  fontSize: number; // pt
  align: 'left' | 'center' | 'right';
  bold: boolean;
  color: string;
}

export interface FieldRowSection {
  type: 'field-row';
  cells: FieldRowCell[];
  bordered: boolean;
  minHeight?: number; // mm – optional minimum height
  /** Default `flex`. `grid` uses `gridColumns` (or cell count). */
  layout?: 'flex' | 'grid';
  gridColumns?: 1 | 2 | 3 | 4;
}

export interface FieldRowCell {
  label?: string;     // static label text (e.g. "DATE:")
  field?: string;     // dynamic field path (e.g. "dn.date")
  text?: string;      // static text (if no field)
  /**
   * Multi-dynamic inline template, e.g.
   * `{{job.contactPerson}} / {{job.contactPhone}} / {{job.contactEmail}}`
   * If provided, this takes precedence over `field` and `text`.
   */
  valueTemplate?: string;
  width?: number;     // percentage of row width (auto if missing)
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  fontSize?: number;  // pt
  color?: string;
}

export interface InfoGridSection {
  type: 'info-grid';
  columns: 1 | 2 | 3 | 4;
  items: InfoGridItem[];
  bordered: boolean;
}

export interface InfoGridItem {
  label: string;
  field: string;
  bold?: boolean;
}

export type TableDataSource =
  | 'customItems'
  | 'batches'
  | 'items'
  | 'scheduleGroups'
  | 'driverTrips';

export interface TableSection {
  type: 'table';
  dataSource: TableDataSource;
  layoutMode?: 'table' | 'group-columns';
  columns: TableColumnDef[];
  fontSize: number;       // pt
  showBorders: boolean;
  headerBg: string;       // CSS color
  headerColor: string;    // text color
  headerFontWeight?: 'normal' | 'bold';
  headerFontStyle?: 'normal' | 'italic';
  repeatHeaderOnNewPage: boolean;
  minRows: number;        // minimum empty rows to show
  rowPadding: number;     // mm vertical padding per cell
  rowMinHeightMm?: number;
}

export interface TableColumnDef {
  header: string;
  field: string;    // key on data row, or 'slno' for auto serial number
  width?: number;   // percentage
  align: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  rowMinHeightMm?: number;
  useGlobalHeaderStyle?: boolean;
  headerBg?: string;
  headerColor?: string;
  headerFontWeight?: 'normal' | 'bold';
  headerFontStyle?: 'normal' | 'italic';
  cellBg?: string;
  cellColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
}

export interface TextSection {
  type: 'text';
  content: string;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  color: string;
}

export interface SpacerSection {
  type: 'spacer';
  height: number; // mm
}

export interface DividerSection {
  type: 'divider';
  thickness: number; // px
  color: string;
  marginTop: number;    // mm
  marginBottom: number; // mm
}

export interface SignaturesSection {
  type: 'signatures';
  items: { label: string }[];
  lineHeight: number; // mm – height of signature area above label
}

export type BoxShape = 'rectangle' | 'ellipse' | 'circle' | 'diamond' | 'triangle';

export interface BoxSection {
  type: 'box';
  shape?: BoxShape;
  width?: number;           // mm – optional, defaults to full width
  height: number;           // mm
  borderWidth: number;      // px
  borderColor: string;      // CSS color
  backgroundColor?: string; // CSS color or transparent
  borderRadius: number;     // px – rounded corners (ignored for ellipse)
  label?: string;           // optional label inside box
  /** Dynamic label from data when set */
  labelField?: string;
  fontSize?: number;        // pt – for label text
}

export interface LineSection {
  type: 'line';
  thickness: number;        // px
  color: string;            // CSS color
  marginTop: number;        // mm
  marginBottom: number;     // mm
  width?: number;           // percentage – 100 = full width
}

/**
 * Image block (replaces legacy letterhead): URL, data field, template upload, or company letterhead fallback.
 */
export interface ImageSection {
  type: 'image';
  heightMm: number;
  source: 'url' | 'field';
  url?: string;
  field?: string;
  /** Template upload / pasted URL (takes precedence over `url`/`field` when set) */
  imageUrl?: string;
  imageDriveId?: string;
  objectFit: 'contain' | 'cover' | 'fill';
  /** CSS object-position, e.g. `center top`, `50% 30%` */
  objectPosition?: string;
  opacity: number;
  align: 'left' | 'center' | 'right';
  /** When no resolved URL from image/url/field, use `company.letterheadUrl` from print data */
  useCompanyLetterheadFallback?: boolean;
  /** Space below the image (mm) */
  marginBottomMm?: number;
  /**
   * `fill` = full width of cell, fixed height (banner / ex-letterhead).
   * `inline` = flex row, image height = heightMm, width auto.
   */
  layout?: 'inline' | 'fill';
}

export type DocumentSection =
  | (HeadingSection & SectionBuilderMeta)
  | (FieldRowSection & SectionBuilderMeta)
  | (InfoGridSection & SectionBuilderMeta)
  | (TableSection & SectionBuilderMeta)
  | (TextSection & SectionBuilderMeta)
  | (SpacerSection & SectionBuilderMeta)
  | (DividerSection & SectionBuilderMeta)
  | (SignaturesSection & SectionBuilderMeta)
  | (BoxSection & SectionBuilderMeta)
  | (LineSection & SectionBuilderMeta)
  | (ImageSection & SectionBuilderMeta);

/** True when the section is builder-locked. */
export function isSectionLocked(s: DocumentSection): boolean {
  return Boolean(s.locked);
}

/**
 * Indices that should move together when dragging `idx` on the canvas.
 * Empty if the block is locked. Ungrouped returns `[idx]`. If any member of a group is locked,
 * only the primary index moves (avoids splitting a partially locked group).
 */
export function getCanvasMoveIndicesForSection(sections: DocumentSection[], idx: number): number[] {
  if (idx < 0 || idx >= sections.length) return [];
  if (isSectionLocked(sections[idx])) return [];
  const gid = sections[idx].groupId;
  if (!gid) return [idx];
  const members = sections
    .map((sec, i) => (sec.groupId === gid ? i : -1))
    .filter((i): i is number => i >= 0);
  if (members.some((i) => isSectionLocked(sections[i]))) return [idx];
  return members;
}

/** Absolute placement inside the printable content box (inside page margins), mm from top-left of content */
export interface SectionCanvasRect {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Builder stacking order; higher values paint on top. Defaults to section index when omitted. */
  zIndex?: number;
}

/** Full-page visual options (background + watermark) */
export interface DocumentPageStyle {
  pageOrientation?: 'portrait' | 'landscape';
  /** `single-page` scales the document content down to keep it on one sheet when possible. */
  contentFitMode?: 'default' | 'single-page';
  /**
   * Solid color behind the whole A4 face (margins + under content). Default in renderer: white.
   * Use `transparent` to let the editor workspace show through in preview.
   */
  pageBackgroundColor?: string;
  backgroundImageUrl?: string;
  /** Resolve image URL from context (e.g. company.letterheadUrl) — takes precedence over backgroundImageUrl when both set */
  backgroundImageField?: string;
  backgroundOpacity?: number;
  backgroundFit?: 'cover' | 'contain' | 'auto';
  /**
   * Opacity of the white “paper” layer over the background image (0 = fully transparent, see bg at full strength; 1 = solid white).
   * Default ~0.88 when a background image is set.
   */
  contentLayerOpacity?: number;
  watermarkText?: string;
  watermarkField?: string;
  watermarkImageUrl?: string;
  watermarkOpacity?: number;
  /** Text watermark color (CSS). Image watermarks ignore this. */
  watermarkColor?: string;
  /** Degrees, counter-clockwise typical for diagonal text */
  watermarkAngle?: number;
  watermarkFontSizePt?: number;
  /**
   * Default font stack for all body content on the page (sections still use per-block overrides).
   * Example: "Georgia, serif" or "Arial, Helvetica, sans-serif"
   */
  bodyFontFamily?: string;
}

// ── Template ───────────────────────────────────────────────────────

export interface DocumentTemplate {
  id: string;
  name: string;
  itemType: ItemType;
  isDefault: boolean;
  pageMargins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Optional A4 page chrome — rendered behind sections */
  pageStyle?: DocumentPageStyle;
  /** When true, sections use `canvasRects` for drag-positioned layout (print + preview) */
  canvasMode?: boolean;
  /** One rect per section index — used when canvasMode is true */
  canvasRects?: SectionCanvasRect[];
  sections: DocumentSection[];
}

// ── Section palette (for builder) ──────────────────────────────────

export interface SectionPaletteItem {
  type: DocumentSection['type'];
  label: string;
  icon: string;
  description: string;
}

export const SECTION_PALETTE: SectionPaletteItem[] = [
  {
    type: 'image',
    label: 'Image',
    icon: '🖼',
    description: 'Image / banner — URL, field, upload, positioning, optional bleed',
  },
  { type: 'heading',     label: 'Heading',         icon: 'H',   description: 'Title — static or bound to a field' },
  { type: 'field-row',   label: 'Field Row',       icon: '⇥',   description: 'Row of label–value pairs' },
  { type: 'info-grid',   label: 'Info Grid',       icon: '⊞',   description: 'Grid of label–value pairs' },
  { type: 'table',       label: 'Table',           icon: '☰',   description: 'Linked rows (items, batches, custom lines)' },
  { type: 'text',        label: 'Text',            icon: 'T',   description: 'Static paragraph' },
  { type: 'spacer',      label: 'Spacer',          icon: '↕',   description: 'Vertical space' },
  { type: 'divider',     label: 'Divider',         icon: '—',   description: 'Rule line' },
  { type: 'signatures',  label: 'Signatures',      icon: '✎',   description: 'Signature blocks' },
  { type: 'box',         label: 'Shape / Box',     icon: '▭',   description: 'Rectangle, circle, ellipse, diamond, triangle' },
  { type: 'line',        label: 'Line',            icon: '━',   description: 'Horizontal line' },
];

/** Fixed palette / type title for a section (e.g. "Field Row") */
export function getSectionTypeLabel(type: DocumentSection['type']): string {
  const hit = SECTION_PALETTE.find((p) => p.type === type);
  return hit?.label ?? type.replace(/-/g, ' ');
}

type SectionWithLegacyName = DocumentSection & { blockName?: string };

/** How to render one row in the section order list */
export type SectionOrderDisplay =
  | { kind: 'split'; base: string; suffix: string }
  | { kind: 'title'; text: string };

export function getSectionOrderDisplay(section: DocumentSection): SectionOrderDisplay {
  const base = getSectionTypeLabel(section.type);
  const s = section as SectionWithLegacyName;
  const custom = s.customBlockName?.trim();
  if (custom) return { kind: 'split', base, suffix: custom };
  const legacy = s.blockName?.trim();
  if (!legacy) return { kind: 'title', text: base };
  if (legacy === base) return { kind: 'title', text: base };
  const prefix = `${base} - `;
  if (legacy.startsWith(prefix)) {
    const suf = legacy.slice(prefix.length).trim();
    return suf ? { kind: 'split', base, suffix: suf } : { kind: 'title', text: base };
  }
  return { kind: 'title', text: legacy };
}

/** Plain string for tooltips / accessibility */
export function getSectionOrderLabel(section: DocumentSection): string {
  const d = getSectionOrderDisplay(section);
  return d.kind === 'split' ? `${d.base} - ${d.suffix}` : d.text;
}

/** Value for the "custom name" field in block properties (migrates legacy blockName) */
export function getSectionCustomNameInputValue(section: DocumentSection): string {
  const s = section as SectionWithLegacyName;
  if (s.customBlockName != null) return s.customBlockName;
  const legacy = s.blockName?.trim();
  if (!legacy) return '';
  const base = getSectionTypeLabel(section.type);
  const prefix = `${base} - `;
  if (legacy.startsWith(prefix)) return legacy.slice(prefix.length);
  if (legacy === base) return '';
  return legacy;
}

// ── Default section factories ──────────────────────────────────────

export function createDefaultSection(type: DocumentSection['type']): DocumentSection {
  switch (type) {
    case 'heading':
      return { type: 'heading', text: 'DOCUMENT TITLE', fontSize: 18, align: 'center', bold: true, color: '#000', field: undefined };
    case 'field-row':
      return {
        type: 'field-row',
        cells: [
          { label: 'Label:', field: '', width: 50, bold: true, fontSize: 10 },
          { label: 'Label:', field: '', width: 50, bold: false, fontSize: 10 },
        ],
        bordered: false,
        layout: 'flex',
      };
    case 'info-grid':
      return {
        type: 'info-grid',
        columns: 2,
        items: [
          { label: 'Field 1', field: '' },
          { label: 'Field 2', field: '' },
        ],
        bordered: true,
      };
    case 'table':
      return {
        type: 'table',
        dataSource: 'customItems',
        columns: [
          { header: 'SL.NO.', field: 'slno', width: 10, align: 'center', verticalAlign: 'top', useGlobalHeaderStyle: true },
          { header: 'Description', field: 'name', width: 50, align: 'left', verticalAlign: 'top', useGlobalHeaderStyle: true },
          { header: 'Unit', field: 'unit', width: 15, align: 'center', verticalAlign: 'top', useGlobalHeaderStyle: true },
          { header: 'Qty', field: 'qty', width: 25, align: 'right', verticalAlign: 'top', useGlobalHeaderStyle: true },
        ],
        fontSize: 10,
        showBorders: true,
        headerBg: '#f0f0f0',
        headerColor: '#000',
        headerFontWeight: 'bold',
        headerFontStyle: 'normal',
        repeatHeaderOnNewPage: true,
        minRows: 5,
        rowPadding: 2,
        rowMinHeightMm: 0,
      };
    case 'text':
      return { type: 'text', content: 'Enter text here', fontSize: 10, align: 'left', bold: false, color: '#000' };
    case 'spacer':
      return { type: 'spacer', height: 5 };
    case 'divider':
      return { type: 'divider', thickness: 1, color: '#000', marginTop: 3, marginBottom: 3 };
    case 'signatures':
      return {
        type: 'signatures',
        items: [
          { label: 'Prepared By' },
          { label: 'Delivered By' },
          { label: 'Received By' },
        ],
        lineHeight: 20,
      };
    case 'image':
      return {
        type: 'image',
        heightMm: 28,
        source: 'field',
        field: 'company.letterheadUrl',
        objectFit: 'contain',
        objectPosition: 'center',
        opacity: 1,
        align: 'center',
        layout: 'fill',
        useCompanyLetterheadFallback: true,
        marginBottomMm: 2,
      };
    case 'box':
      return {
        type: 'box',
        shape: 'rectangle' as BoxShape,
        height: 30,
        borderWidth: 1,
        borderColor: '#000',
        backgroundColor: '#ffffff',
        borderRadius: 4,
        label: 'Box Label',
        fontSize: 10,
      };
    case 'line':
      return {
        type: 'line',
        thickness: 1,
        color: '#000',
        marginTop: 3,
        marginBottom: 3,
        width: 100,
      };
  }
}
