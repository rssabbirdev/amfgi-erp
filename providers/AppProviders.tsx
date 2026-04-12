'use client';

import { Toaster }         from 'react-hot-toast';
import ReduxProvider        from './ReduxProvider';
import SessionProvider      from './SessionProvider';
import { ContextMenuProvider } from './ContextMenuProvider';
import DoubleClickSelectionGuard from './DoubleClickSelectionGuard';
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
        <ContextMenuProvider>
          <DoubleClickSelectionGuard />
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1e293b',
                color:      '#f1f5f9',
                borderRadius: '8px',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
        </ContextMenuProvider>
      </ReduxProvider>
    </SessionProvider>
  );
}
