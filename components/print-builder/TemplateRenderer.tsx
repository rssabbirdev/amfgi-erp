'use client';

import React from 'react';
import type { PrintTemplate, PrintElement } from '@/lib/types/printTemplate';
import type { AnyTemplateDataContext } from '@/lib/utils/templateData';
import { resolveField, formatValue } from '@/lib/utils/templateData';
import { A4_W, A4_H, SCALE } from './canvasConstants';

interface TemplateRendererProps {
  template: PrintTemplate;
  data: AnyTemplateDataContext;
  scale?: number;
  useCSSUnits?: boolean;
  isBuilder?: boolean;
}

export function TemplateRenderer({
  template,
  data,
  scale = 1,
  useCSSUnits = false,
  isBuilder = false,
}: TemplateRendererProps) {
  const mm = (val: number) => {
    if (useCSSUnits) return `${val}mm`;
    return `${val * scale}px`;
  };

  const canvasWidth = useCSSUnits ? `${A4_W}mm` : `${A4_W * scale}px`;
  const canvasHeight = useCSSUnits ? `${A4_H}mm` : `${A4_H * scale}px`;

  return (
    <div
      style={{
        position: 'relative',
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: 'white',
        overflow: 'hidden',
        fontFamily: 'Arial, sans-serif',
        color: '#000',
      }}
    >
      {template.elements
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((element) => (
          <RenderedElement
            key={element.id}
            element={element}
            data={data}
            scale={scale}
            useCSSUnits={useCSSUnits}
            mm={mm}
            isBuilder={isBuilder}
          />
        ))}
    </div>
  );
}

interface RenderedElementProps {
  element: PrintElement;
  data: AnyTemplateDataContext;
  scale: number;
  useCSSUnits: boolean;
  mm: (val: number) => string | number;
  isBuilder: boolean;
}

function RenderedElement({
  element,
  data,
  scale,
  useCSSUnits,
  mm,
  isBuilder,
}: RenderedElementProps) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: mm(element.x),
    top: mm(element.y),
    width: mm(element.width),
    height: mm(element.height),
    boxSizing: 'border-box',
  };

  const applyStyle = (style: React.CSSProperties): React.CSSProperties => {
    if (!element.style) return style;

    const fontSize = element.style.fontSize
      ? useCSSUnits
        ? `${element.style.fontSize * 0.35}pt`
        : `${element.style.fontSize * 0.35 * scale}px`
      : undefined;

    return {
      ...style,
      fontSize,
      fontWeight: element.style.fontWeight,
      fontStyle: element.style.fontStyle,
      textAlign: element.style.textAlign as any,
      color: element.style.color,
      backgroundColor: element.style.backgroundColor,
      border: element.style.borderWidth
        ? `${element.style.borderWidth}px solid ${element.style.borderColor ?? '#000'}`
        : undefined,
      opacity: element.style.opacity,
      padding: element.style.padding ? mm(element.style.padding) : undefined,
    };
  };

  switch (element.type) {
    case 'text':
      return (
        <div style={applyStyle(baseStyle)}>
          {element.content}
        </div>
      );

    case 'field':
      const fieldValue = resolveField(element.field, data);
      const formatted = formatValue(fieldValue, element.format);
      const labelText = element.label ? `${element.label} ` : '';
      return (
        <div style={applyStyle(baseStyle)}>
          {labelText}
          {formatted}
        </div>
      );

    case 'letterhead':
      if (!data.company.letterheadUrl) return null;
      return (
        <img
          src={data.company.letterheadUrl}
          alt="Letterhead"
          style={{
            ...baseStyle,
            width: mm(element.width),
            height: mm(element.height),
            opacity: element.style?.opacity ?? 1,
            objectFit: (element.objectFit ?? 'contain') as 'contain' | 'cover',
          }}
        />
      );

    case 'table': {
      const tableEl = element as any as import('@/lib/types/printTemplate').TableElement;

      // Determine which data array to use based on dataSource
      let items: any[] = [];
      if (tableEl.dataSource === 'customItems' && (data as any).customItems) {
        items = (data as any).customItems;
      } else if (tableEl.dataSource === 'batches' && (data as any).batches) {
        items = (data as any).batches;
      } else if (tableEl.dataSource === 'items' && (data as any).items) {
        items = (data as any).items;
      }

      const colWidths = tableEl.columns.map((col) => {
        if (col.width) return `${col.width}%`;
        return `${100 / tableEl.columns.length}%`;
      });

      const fontSize = tableEl.style?.fontSize
        ? useCSSUnits
          ? `${tableEl.style.fontSize * 0.35}pt`
          : `${tableEl.style.fontSize * 0.35 * scale}px`
        : '9px';

      return (
        <table
          style={{
            ...baseStyle,
            borderCollapse: 'collapse',
            width: mm(tableEl.width),
            height: 'auto',
            fontSize,
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              {tableEl.columns.map((col, idx) => (
                <th
                  key={idx}
                  style={{
                    border: '1px solid #000',
                    padding: '4mm',
                    width: colWidths[idx],
                    textAlign: (col.align ?? 'left') as any,
                    fontWeight: 'bold',
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, rowIdx) => (
              <tr key={rowIdx}>
                {tableEl.columns.map((col, colIdx) => {
                  let cellValue = '';
                  if (col.field === 'slno') {
                    cellValue = String(rowIdx + 1);
                  } else {
                    cellValue = (item as any)[col.field] ?? '';
                  }
                  return (
                    <td
                      key={colIdx}
                      style={{
                        border: '1px solid #000',
                        padding: '4mm',
                        textAlign: (col.align ?? 'left') as any,
                      }}
                    >
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={tableEl.columns.length}
                  style={{
                    border: '1px solid #000',
                    padding: '20mm 4mm',
                    textAlign: 'center',
                    color: '#999',
                  }}
                >
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      );
    }

    case 'line': {
      const lineEl = element as any as import('@/lib/types/printTemplate').LineElement;
      return (
        <div
          style={{
            ...baseStyle,
            borderTop: `${lineEl.thickness ?? 1}px solid ${lineEl.color ?? '#000'}`,
            height: 0,
          }}
        />
      );
    }

    case 'signature':
      const lineHeightMm = 15;
      return (
        <div style={baseStyle}>
          <div
            style={{
              height: mm(lineHeightMm),
              borderBottom: `1px solid #000`,
              marginBottom: mm(2),
            }}
          />
          <div
            style={{
              textAlign: 'center',
              fontSize: mm((element.style?.fontSize ?? 10) / 10),
              fontWeight: 'bold',
            }}
          >
            {element.label}
          </div>
        </div>
      );

    case 'box':
      return (
        <div
          style={{
            ...baseStyle,
            border: `${element.style?.borderWidth ?? 1}px solid ${element.style?.borderColor ?? '#000'}`,
            backgroundColor: element.style?.backgroundColor ?? 'transparent',
          }}
        />
      );

    default:
      return null;
  }
}
