'use client';

import { createContext, useContext, useLayoutEffect, useSyncExternalStore, useCallback } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem('theme') as Theme | null;
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => onStoreChange();
  window.addEventListener('storage', handleChange);
  window.addEventListener('theme-change', handleChange);
  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener('theme-change', handleChange);
  };
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore<Theme>(subscribe, getStoredTheme, () => 'dark');

  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const isLight = theme === 'light';
    const isDark = theme === 'dark';
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', isDark);
    body.classList.toggle('light', isLight);
    body.classList.toggle('dark', isDark);
  }, [theme]);

  const toggle = useCallback(() => {
    const nextTheme: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('theme', nextTheme);
    window.dispatchEvent(new Event('theme-change'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
