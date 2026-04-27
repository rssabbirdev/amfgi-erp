'use client';

import { useParams } from 'next/navigation';
import SupplierEditor from '@/components/suppliers/SupplierEditor';

export default function EditSupplierPage() {
  const params = useParams<{ id: string }>();
  return <SupplierEditor mode="edit" supplierId={params.id} />;
}
