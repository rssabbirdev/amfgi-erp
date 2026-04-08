'use client';

import { useEffect, useState, useCallback, createContext, useContext, ReactNode } from 'react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  options: ContextMenuOption[];
}

interface ContextMenuContextType {
  isOpen: boolean;
  x: number;
  y: number;
  options: ContextMenuOption[];
  openMenu: (x: number, y: number, options: ContextMenuOption[]) => void;
  closeMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

export function useGlobalContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useGlobalContextMenu must be used within ContextMenuProvider');
  }
  return context;
}

interface Props {
  children: ReactNode;
}

export function ContextMenuProvider({ children }: Props) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    options: [],
  });

  const openMenu = useCallback((x: number, y: number, options: ContextMenuOption[]) => {
    setState({
      isOpen: true,
      x,
      y,
      options,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isOpen: false,
    }));
  }, []);

  useEffect(() => {
    // Allow React handlers to fire, but prevent default menu on elements without handlers
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Only prevent default if the target doesn't have a custom context menu handler
      // React will handle the onContextMenu prop, so we just prevent the browser default
      if (!target?.hasAttribute('data-context-menu')) {
        e.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleContextMenu, false);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, false);
    };
  }, []);

  const value: ContextMenuContextType = {
    ...state,
    openMenu,
    closeMenu,
  };

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
      {state.isOpen && (
        <ContextMenu
          x={state.x}
          y={state.y}
          options={state.options}
          onClose={closeMenu}
        />
      )}
    </ContextMenuContext.Provider>
  );
}
