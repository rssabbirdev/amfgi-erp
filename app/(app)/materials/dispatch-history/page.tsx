'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DispatchHistoryPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to new dispatch location
    router.replace('/dispatch');
  }, [router]);

  return null;
}
