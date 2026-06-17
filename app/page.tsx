import { redirect } from 'next/navigation';
import { auth }     from '@/auth';
import { EMPLOYEE_PORTAL_HOME, isEmployeeSelfServiceUser } from '@/lib/auth/selfService';

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    if (isEmployeeSelfServiceUser(session.user)) redirect(EMPLOYEE_PORTAL_HOME);
    redirect('/dashboard');
  }
  redirect('/login');
}
