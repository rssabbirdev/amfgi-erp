import { redirect } from 'next/navigation';
import { auth }     from '@/auth';
import { isEmployeeSelfServiceUser } from '@/lib/auth/selfService';

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    if (isEmployeeSelfServiceUser(session.user)) redirect('/me/profile');
    redirect('/dashboard');
  }
  redirect('/login');
}
