import { redirect } from 'next/navigation';

export default function SettingsMediaPage() {
  redirect('/settings?tab=media');
}
