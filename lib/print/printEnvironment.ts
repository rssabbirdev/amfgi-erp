export type DeliveryNotePrintParams = {
  transactionId?: string;
  deliveryNoteId?: string;
  templateId?: string;
};

/** Touch-first devices where hidden iframe printing is unreliable (iOS/Android). */
export function prefersPrintWindow(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function buildDeliveryNotePrintUrl(
  params: DeliveryNotePrintParams,
  options?: { embed?: boolean }
): string {
  const sp = new URLSearchParams();
  if (params.transactionId) sp.set('id', params.transactionId);
  if (params.deliveryNoteId) sp.set('deliveryNoteId', params.deliveryNoteId);
  if (params.templateId) sp.set('templateId', params.templateId);
  if (options?.embed) sp.set('embed', '1');
  return `/print/delivery-note?${sp.toString()}`;
}
