import {
  buildDeliveryNotePrintUrl,
  prefersPrintWindow,
  type DeliveryNotePrintParams,
} from '@/lib/print/printEnvironment';

export const DELIVERY_NOTE_PRINT_DONE = 'delivery-note-print-finished';
export const DELIVERY_NOTE_PRINT_ERROR = 'delivery-note-print-error';

export type { DeliveryNotePrintParams };

type OpenDeliveryNotePrintOptions = {
  onError?: (message: string) => void;
};

/** Open the system print dialog for a delivery note without leaving the current page. */
export function openDeliveryNotePrint(
  params: DeliveryNotePrintParams,
  options?: OpenDeliveryNotePrintOptions
): void {
  if (prefersPrintWindow()) {
    const url = buildDeliveryNotePrintUrl(params);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.assign(url);
    }
    return;
  }

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

  iframe.src = buildDeliveryNotePrintUrl(params, { embed: true });
  document.body.appendChild(iframe);
}
