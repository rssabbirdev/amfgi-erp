'use client';

import { useEffect } from 'react';

/**
 * Blocks the browser default on the 2nd mousedown of a double-click so text
 * is not highlighted (mouse + most trackpads). Form fields stay selectable.
 *
 * Opt-in copyable regions: `data-user-select="text"` or class `allow-text-select`.
 */
const ALLOW_SELECT =
  'input, textarea, select, option, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [data-user-select="text"], .allow-text-select';

function allowSelect(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (target instanceof Element) {
    const el = target.closest(ALLOW_SELECT);
    if (el) return true;
  }
  return false;
}

export default function DoubleClickSelectionGuard() {
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (e.detail <= 1) return;
      if (allowSelect(e.target)) return;
      e.preventDefault();
    };

    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, []);

  return null;
}
