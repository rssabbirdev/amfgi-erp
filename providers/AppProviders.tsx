'use client';

import { Toaster }         from 'react-hot-toast';
import ReduxProvider        from './ReduxProvider';
import SessionProvider      from './SessionProvider';
import { ContextMenuProvider } from './ContextMenuProvider';
import DoubleClickSelectionGuard from './DoubleClickSelectionGuard';
import ThemeProvider, { useTheme } from './ThemeProvider';
import StockLiveUpdates from './StockLiveUpdates';
import type { Session }    from 'next-auth';

export default function AppProviders({
  children,
  session,
}: {
  children: React.ReactNode;
  session:  Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <ReduxProvider>
        <StockLiveUpdates />
        <ThemeProvider>
        <ContextMenuProvider>
          <DoubleClickSelectionGuard />
          {children}
          <ThemeAwareToaster />
        </ContextMenuProvider>
        </ThemeProvider>
      </ReduxProvider>
    </SessionProvider>
  );
}

function ThemeAwareToaster() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: isLight ? '#ffffff' : '#1e293b',
          color: isLight ? '#0f172a' : '#f1f5f9',
          border: `1px solid ${isLight ? '#cbd5e1' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: '10px',
          fontSize: '14px',
          boxShadow: isLight
            ? '0 20px 45px rgba(148, 163, 184, 0.22)'
            : '0 20px 45px rgba(2, 6, 23, 0.45)',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: isLight ? '#ffffff' : '#0f172a',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: isLight ? '#ffffff' : '#0f172a',
          },
        },
      }}
    />
  );
}
