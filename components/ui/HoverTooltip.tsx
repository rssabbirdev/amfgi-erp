'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 180;

export function useLgUp() {
  const [lg, setLg] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const fn = () => setLg(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return lg;
}

type HoverTooltipProps = {
  label: string;
  children: React.ReactNode;
  /** When false, children render with no tooltip wrapper behavior */
  enabled?: boolean;
  /** Extra classes on the hover target wrapper */
  className?: string;
};

/**
 * Fixed-position tooltip via portal (avoids overflow clipping in scrollable sidebars).
 */
export function HoverTooltip({
  label,
  children,
  enabled = true,
  className = '',
}: HoverTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearShowTimer = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  }, []);

  const updatePosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 10;
    setCoords({
      top: r.top + r.height / 2,
      left: r.right + gap,
    });
  }, []);

  const openTooltip = useCallback(() => {
    if (!enabled || !label) return;
    clearShowTimer();
    showTimer.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, SHOW_DELAY_MS);
  }, [enabled, label, clearShowTimer, updatePosition]);

  const closeTooltip = useCallback(() => {
    clearShowTimer();
    setOpen(false);
  }, [clearShowTimer]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => () => clearShowTimer(), [clearShowTimer]);

  if (!enabled) {
    return <>{children}</>;
  }

  const tip =
    open && typeof document !== 'undefined'
      ? createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[10000] max-w-[14rem] rounded-lg border border-white/10 bg-slate-800/95 px-2.5 py-1.5 text-xs font-medium text-slate-100 shadow-xl shadow-black/50 ring-1 ring-white/5 backdrop-blur-sm"
            style={{
              top: coords.top,
              left: coords.left,
              transform: 'translateY(-50%)',
            }}
          >
            <span
              className="absolute right-full top-1/2 mr-px h-0 w-0 -translate-y-1/2 border-y-[5px] border-r-[6px] border-y-transparent border-r-slate-800"
              aria-hidden
            />
            {label}
          </span>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={wrapRef}
        className={className}
        onMouseEnter={openTooltip}
        onMouseLeave={closeTooltip}
        onFocus={openTooltip}
        onBlur={closeTooltip}
      >
        {children}
      </div>
      {tip}
    </>
  );
}
