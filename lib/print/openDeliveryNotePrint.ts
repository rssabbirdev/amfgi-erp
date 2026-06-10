export const DELIVERY_NOTE_PRINT_DONE = 'delivery-note-print-finished';
export const DELIVERY_NOTE_PRINT_ERROR = 'delivery-note-print-error';

export type DeliveryNotePrintParams = {
  transactionId?: string;
  deliveryNoteId?: string;
  templateId?: string;
};

type OpenDeliveryNotePrintOptions = {
  onError?: (message: string) => void;
};

/** Open the system print dialog for a delivery note without leaving the current page. */
export function openDeliveryNotePrint(
  params: DeliveryNotePrintParams,
  options?: OpenDeliveryNotePrintOptions
): void {
  const sp = new URLSearchParams();
  if (params.transactionId) sp.set('id', params.transactionId);
  if (params.deliveryNoteId) sp.set('deliveryNoteId', params.deliveryNoteId);
  if (params.templateId) sp.set('templateId', params.templateId);
  sp.set('embed', '1');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'Delivery note print';
  iframe.style.cssText =
    'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('message', onMessage);
    iframe.remove();
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; message?: string } | null;
    if (!data || typeof data !== 'object') return;
    if (data.type === DELIVERY_NOTE_PRINT_DONE) {
      cleanup();
      return;
    }
    if (data.type === DELIVERY_NOTE_PRINT_ERROR) {
      options?.onError?.(data.message || 'Failed to print delivery note');
      cleanup();
    }
  };

  window.addEventListener('message', onMessage);
  window.setTimeout(cleanup, 5 * 60 * 1000);

  iframe.src = `/print/delivery-note?${sp.toString()}`;
  document.body.appendChild(iframe);
}
