export type ItemType = 'delivery-note' | 'goods-receipt' | 'packing-slip' | 'material-label';

export type ElementType =
  | 'text'
  | 'field'
  | 'letterhead'
  | 'table'
  | 'line'
  | 'signature'
  | 'box';

export interface ElementStyle {
  fontSize?: number;           // pt
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  color?: string;              // CSS color string
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;        // px
  opacity?: number;            // 0–1
  padding?: number;            // mm
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;       // mm from left edge of page content area
  y: number;       // mm from top edge
  width: number;   // mm
  height: number;  // mm
  zIndex?: number;
  style?: ElementStyle;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
}

export interface FieldElement extends BaseElement {
  type: 'field';
  field: string;       // dot-path into data context: "dn.number", "company.name"
  label?: string;      // optional prefix label rendered before value
  format?: 'date' | 'currency' | 'number' | 'text';
}

export interface LetterheadElement extends BaseElement {
  type: 'letterhead';
  objectFit?: 'contain' | 'cover';
}

export interface TableColumn {
  header: string;
  field: string;     // key on each customItem row or special 'slno'
  width?: number;    // percentage of table width, auto if missing
  align?: 'left' | 'center' | 'right';
}

export interface TableElement extends BaseElement {
  type: 'table';
  dataSource: 'customItems' | 'batches' | 'items';
  columns: TableColumn[];
}

export interface LineElement extends BaseElement {
  type: 'line';
  color?: string;
  thickness?: number;  // px
}

export interface SignatureElement extends BaseElement {
  type: 'signature';
  label: string;
}

export interface BoxElement extends BaseElement {
  type: 'box';
}

export type PrintElement =
  | TextElement
  | FieldElement
  | LetterheadElement
  | TableElement
  | LineElement
  | SignatureElement
  | BoxElement;

export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PrintTemplate {
  version: 1;
  pageMargins: PageMargins;
  elements: PrintElement[];
}

export interface NamedPrintTemplate extends PrintTemplate {
  id: string;
  name: string;
  itemType: ItemType;
  isDefault: boolean;
}
