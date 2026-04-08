import { useState, useCallback } from 'react';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  options: ContextMenuOption[];
}

export function useContextMenu() {
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

  return {
    ...state,
    openMenu,
    closeMenu,
  };
}
