'use client';

import { useEffect, useRef } from 'react';

export interface ContextMenuOption {
  label?: string;
  icon?: React.ReactNode;
  action?: () => void;
  danger?: boolean;
  divider?: boolean;
}

interface Props {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
}

export function ContextMenu({ x, y, options, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position if menu goes off-screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const adjustedMenu = menuRef.current;

      if (rect.right > window.innerWidth) {
        adjustedMenu.style.left = `${Math.max(10, x - rect.width)}px`;
      }

      if (rect.bottom > window.innerHeight) {
        adjustedMenu.style.top = `${Math.max(10, y - rect.height)}px`;
      }
    }
  }, [x, y]);

  const handleOptionClick = (option: ContextMenuOption) => {
    if (option.action) {
      option.action();
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
    >
      {options.map((option, idx) => (
        <div key={idx}>
          {option.divider ? (
            <div className="h-px bg-slate-700 my-1" />
          ) : option.action ? (
            <button
              onClick={() => handleOptionClick(option)}
              className={`w-full px-4 py-2 text-sm text-left flex items-center gap-2 hover:bg-slate-700/60 transition-colors ${
                option.danger ? 'text-red-400 hover:bg-red-950/30' : 'text-slate-300'
              }`}
            >
              {option.icon && <span className="w-4 h-4">{option.icon}</span>}
              <span>{option.label}</span>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
