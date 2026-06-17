'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

const sizes = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/** Mobile: up to 3 action buttons per row; desktop: right-aligned row. */
export const modalFooterActionsClassName =
  'grid grid-cols-3 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2 [&_button]:min-h-10 [&_button]:min-w-0 [&_button]:px-2 [&_button]:text-xs sm:[&_button]:w-auto sm:[&_button]:px-4 sm:[&_button]:text-sm';

interface ResponsiveDialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof sizes;
  className?: string;
  zIndex?: number;
}

export default function ResponsiveDialog({
  open,
  onClose,
  children,
  size = 'md',
  className,
  zIndex = 50,
}: ResponsiveDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className={cn(
          'relative z-10 flex max-h-[min(92dvh,100%)] w-full flex-col overflow-hidden',
          'rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl',
          'sm:max-h-[min(90dvh,calc(100vh-2rem))] sm:rounded-xl',
          sizes[size],
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
