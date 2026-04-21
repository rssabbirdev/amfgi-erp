import { errorResponse } from '@/lib/utils/apiResponse';

const GOOGLE_DRIVE_FETCH_BASE = 'https://lh3.googleusercontent.com/u/0/d/';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const driveId = id?.trim();
  if (!driveId) return errorResponse('Drive file id is required', 400);

  const upstream = await fetch(`${GOOGLE_DRIVE_FETCH_BASE}${encodeURIComponent(driveId)}`, {
    headers: { Accept: 'image/*,*/*;q=0.8' },
  });

  if (!upstream.ok) {
    return errorResponse(`Upstream fetch failed (${upstream.status})`, upstream.status);
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Drive file ids are stable, so this legacy proxy path can be cached aggressively.
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'CDN-Cache-Control': 'public, s-maxage=31536000, immutable',
      'Vary': 'Accept',
    },
  });
}
