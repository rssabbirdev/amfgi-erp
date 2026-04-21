import type { Metadata } from 'next';
import { Inter }         from 'next/font/google';
import './globals.css';
import AppProviders from '@/providers/AppProviders';
import { auth }     from '@/auth';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title:       'AMFGI ERP',
  description: 'Almuraqib Fiber Glass Industry — Internal ERP & Stock Management',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={`${inter.className} antialiased`}
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
        suppressHydrationWarning
      >
        <AppProviders session={session}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
