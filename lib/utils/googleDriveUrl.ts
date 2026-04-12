/**
 * Convert a Google Drive share link to the direct image URL format (lh3.googleusercontent.com)
 *
 * Input:  https://drive.google.com/file/d/1_bjbEi6zWvUCDjGB06Khj6i_hI7_UxLh/view
 * Output: https://lh3.googleusercontent.com/u/0/d/1_bjbEi6zWvUCDjGB06Khj6i_hI7_UxLh
 */
export function convertGoogleDriveUrl(url: string): string {
  if (!url) return '';

  // If it's already an lh3 URL, return as-is
  if (url.includes('lh3.googleusercontent.com')) {
    return url;
  }

  // Extract file ID from Google Drive share link
  // Format: https://drive.google.com/file/d/{FILE_ID}/view
  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!fileIdMatch || !fileIdMatch[1]) {
    return url; // Return original if extraction fails
  }

  const fileId = fileIdMatch[1];
  return `https://lh3.googleusercontent.com/u/0/d/${fileId}`;
}

/**
 * Extract file ID from various Google Drive URL formats
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;

  // Handle different URL formats
  const patterns = [
    /\/d\/([a-zA-Z0-9-_]+)/, // /d/{FILE_ID}
    /id=([a-zA-Z0-9-_]+)/, // id={FILE_ID}
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
