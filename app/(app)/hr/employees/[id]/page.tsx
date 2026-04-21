'use client';

import { useParams } from 'next/navigation';
import { EmployeeProfileView } from '@/components/hr/EmployeeProfileView';

export default function EmployeeProfilePage() {
  const params = useParams();
  const id = params.id as string;
  return <EmployeeProfileView employeeId={id} />;
}
