'use client';

import { useCallback, type KeyboardEvent } from 'react';
import {
  createBlockInputWheelRef,
  type InputPropsWithRef,
} from '@/lib/utils/blockInputWheelChange';

export const LINE_GRID_NAV_ATTR = 'data-line-grid-nav';

type LineGridNavInputProps = InputPropsWithRef & {
  'data-line-grid-nav'?: 'true';
  'data-nav-row'?: string;
  'data-nav-col'?: string;
};

function queryNavCell(row: number, col: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${LINE_GRID_NAV_ATTR}="true"][data-nav-row="${row}"][data-nav-col="${col}"]`
  );
}

function isFocusableNavTarget(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  if ('disabled' in element && (element as HTMLInputElement).disabled) return false;
  return true;
}

function tryFocusCell(row: number, col: number): boolean {
  const target = queryNavCell(row, col);
  if (!isFocusableNavTarget(target)) return false;
  target.focus();
  return true;
}

function focusNavCell(row: number, col: number, rowCount: number, colCount: number) {
  const clampedRow = Math.max(0, Math.min(rowCount - 1, row));
  const clampedCol = Math.max(0, Math.min(colCount - 1, col));

  if (tryFocusCell(clampedRow, clampedCol)) return;

  for (let offset = 1; offset < rowCount; offset += 1) {
    if (clampedRow - offset >= 0 && tryFocusCell(clampedRow - offset, clampedCol)) return;
    if (clampedRow + offset < rowCount && tryFocusCell(clampedRow + offset, clampedCol)) return;
  }

  for (let offset = 1; offset < colCount; offset += 1) {
    if (clampedCol - offset >= 0 && tryFocusCell(clampedRow, clampedCol - offset)) return;
    if (clampedCol + offset < colCount && tryFocusCell(clampedRow, clampedCol + offset)) return;
  }
}

export function useLineGridKeyboardNav(rowCount: number, navigableColCount: number) {
  const focusCell = useCallback(
    (row: number, col: number) => {
      if (rowCount <= 0 || navigableColCount <= 0) return;
      focusNavCell(row, col, rowCount, navigableColCount);
    },
    [navigableColCount, rowCount]
  );

  const onGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

      const target = event.currentTarget;
      if (target.getAttribute('aria-expanded') === 'true') return;

      const row = Number(target.dataset.navRow ?? -1);
      const col = Number(target.dataset.navCol ?? -1);
      if (row < 0 || col < 0) return;

      event.preventDefault();

      if (event.key === 'ArrowUp') focusCell(row - 1, col);
      if (event.key === 'ArrowDown') focusCell(row + 1, col);
      if (event.key === 'ArrowLeft') focusCell(row, col - 1);
      if (event.key === 'ArrowRight') focusCell(row, col + 1);
    },
    [focusCell]
  );

  const getNavInputProps = useCallback(
    (row: number, col: number): LineGridNavInputProps => ({
      'data-line-grid-nav': 'true',
      'data-nav-row': String(row),
      'data-nav-col': String(col),
      onKeyDown: onGridKeyDown,
    }),
    [onGridKeyDown]
  );

  return { getNavInputProps, onGridKeyDown, focusCell };
}

export type MergeLineGridInputPropsOptions = {
  /** Block mouse wheel from changing number input values while focused. */
  blockWheel?: boolean;
};

export function mergeLineGridInputProps(
  navProps: LineGridNavInputProps,
  existing?: LineGridNavInputProps,
  options?: MergeLineGridInputPropsOptions
): LineGridNavInputProps {
  const navOnKeyDown = navProps.onKeyDown;
  const blockWheel = options?.blockWheel ?? existing?.type === 'number';

  return {
    ...existing,
    ...navProps,
    onKeyDown: (event) => {
      navOnKeyDown?.(event);
      if (!event.defaultPrevented) {
        existing?.onKeyDown?.(event);
      }
    },
    ref: blockWheel ? createBlockInputWheelRef(existing?.ref) : existing?.ref,
  };
}
