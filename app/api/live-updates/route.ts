import { auth } from '@/auth';
import { errorResponse } from '@/lib/utils/apiResponse';
import {
  GLOBAL_LIVE_UPDATE_COMPANY_ID,
  getLatestLiveUpdateCursor,
  getLiveUpdatesAfterCursor,
} from '@/lib/live-updates/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const KEEPALIVE_INTERVAL_MS = 25_000;
const POLL_INTERVAL_MS = 1_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const companyId = session.user.activeCompanyId;
  if (!companyId) return errorResponse('No active company selected', 400);
  const visibleCompanyIds = [companyId, GLOBAL_LIVE_UPDATE_COMPANY_ID];

  const encoder = new TextEncoder();
  const requestedCursor = req.headers.get('last-event-id');
  const initialCursor =
    requestedCursor && requestedCursor.trim().length > 0
      ? requestedCursor.trim()
      : await getLatestLiveUpdateCursor(visibleCompanyIds);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let cursor = initialCursor;

      const send = (payload: unknown, eventId?: string) => {
        if (closed) return;
        const idLine = eventId ? `id: ${eventId}\n` : '';
        controller.enqueue(encoder.encode(`${idLine}data: ${JSON.stringify(payload)}\n\n`));
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(keepaliveId);
        req.signal.removeEventListener('abort', handleAbort);
        try {
          controller.close();
        } catch {}
      };

      const handleAbort = () => {
        cleanup();
      };

      const keepaliveId = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, KEEPALIVE_INTERVAL_MS);

      req.signal.addEventListener('abort', handleAbort);
      send({ type: 'connected', companyId, at: new Date().toISOString() }, cursor);

      void (async () => {
        while (!closed) {
          try {
            const events = await getLiveUpdatesAfterCursor(visibleCompanyIds, cursor);
            for (const event of events) {
              if (closed) return;
              cursor = event.id;
              send(event, event.id);
            }
          } catch {
            if (!closed) {
              send({ type: 'error', companyId, at: new Date().toISOString() });
            }
          }

          await sleep(POLL_INTERVAL_MS);
        }
      })();
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
