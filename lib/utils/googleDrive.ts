import { google } from 'googleapis';
import { Readable } from 'stream';

// Get authenticated Drive client using your personal Google account
async function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<{ id: string; webViewLink: string }> {
  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error('Google Drive credentials not configured. Check your .env file.');
  }

  const drive = await getDriveClient();
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });

  // Make file viewable via link
  if (res.data.id) {
    await drive.permissions.create({
      fileId: res.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  }

  return { id: res.data.id!, webViewLink: res.data.webViewLink! };
}

export async function deleteFromDrive(driveId: string): Promise<void> {
  if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error('Google Drive credentials not configured.');
  }

  const drive = await getDriveClient();
  await drive.files.delete({ fileId: driveId });
}
