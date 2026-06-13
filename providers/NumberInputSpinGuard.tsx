'use client';

import { useEffect } from 'react';
import { installGlobalNumberInputSpinBlock } from '@/lib/utils/blockInputWheelChange';

export default function NumberInputSpinGuard() {
  useEffect(() => installGlobalNumberInputSpinBlock(), []);
  return null;
}
