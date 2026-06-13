import { auth } from '@/auth';
import { visibleSettingsNavItems } from '@/lib/auth/settingsAccess';
import { redirect } from 'next/navigation';

type SettingsIndexProps = {
  searchParams: Promise<{
    tab?: string;
    driveConnected?: string;
    driveMessage?: string;
  }>;
};

/** Legacy `/settings` entry — redirect to the first allowed settings page (sidebar navigation only). */
export default async function SettingsIndexRedirect({ searchParams }: SettingsIndexProps) {
  const params = await searchParams;
  const session = await auth();
  const user = {
    isSuperAdmin: session?.user?.isSuperAdmin ?? false,
    permissions: (session?.user?.permissions ?? []) as string[],
  };

  if (params.tab === 'template') redirect('/settings/print-format');
  if (params.tab === 'api') redirect('/settings/api');
  if (params.tab === 'drive') {
    const qs = new URLSearchParams();
    if (params.driveConnected) qs.set('driveConnected', params.driveConnected);
    if (params.driveMessage) qs.set('driveMessage', params.driveMessage);
    const suffix = qs.toString();
    redirect(suffix ? `/settings/storage?${suffix}` : '/settings/storage');
  }

  const items = visibleSettingsNavItems(user);
  if (items.length === 0) redirect('/unauthorized');
  redirect(items[0].href);
}
