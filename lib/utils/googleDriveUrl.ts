const GOOGLE_DRIVE_VIEWER_BASE = 'https://lh3.googleusercontent.com/u/0/d/';
const BARE_DRIVE_FILE_ID = /^[a-zA-Z0-9_-]{10,}$/;

/**
 * Canonical Google-hosted viewer URL for a Drive file id.
 * We persist this in DB-facing URL fields so the app can render media
 * without rebuilding preview URLs from Drive page links each time.
 */
export function driveFileIdToDisplayUrl(driveId: string | null | undefined): string | null {
  const id = driveId?.trim();
  if (!id) return null;
  return `${GOOGLE_DRIVE_VIEWER_BASE}${encodeURIComponent(id)}`;
}

/**
 * Value from a bound template field: full URL, Drive page URL, or bare Drive file id.
 */
export function resolveBoundFieldImageSrc(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return convertGoogleDriveUrl(value);
  }
  if (BARE_DRIVE_FILE_ID.test(value)) {
    return driveFileIdToDisplayUrl(value) ?? '';
  }
  return convertGoogleDriveUrl(value);
}

export function convertGoogleDriveUrl(url: string): string {
  if (!url) return '';

  if (url.includes('googleusercontent.com')) {
    return url;
  }

  const fileId = extractGoogleDriveFileId(url);
  if (fileId) {
    return driveFileIdToDisplayUrl(fileId) ?? url;
  }

  return url;
}

/**
 * Extract file ID from various Google Drive URL formats.
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/,
    /\/u\/\d+\/d\/([a-zA-Z0-9-_]+)/,
    /id=([a-zA-Z0-9-_]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}
