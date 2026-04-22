import { google } from 'googleapis';
import { Readable } from 'stream';
import { prisma } from '@/lib/db/prisma';
import { Prisma } from '@prisma/client';
import {
  readCompanyGoogleDriveFolderRegistry,
  readCompanyGoogleDriveOAuthConfig,
  type GoogleDriveOAuthConfig,
  writeCompanyGoogleDriveFolderRegistry,
} from '@/lib/utils/companyPrintTemplates';
import { driveFileIdToDisplayUrl } from '@/lib/utils/googleDriveUrl';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export type DriveUploadFolderTarget = {
  companyId: string;
  rootFolderId: string;
  folderPath?: Array<{
    key: string;
    name: string;
  }>;
};

function requireClientCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  return { clientId, clientSecret };
}

export function getGoogleDriveOAuthRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/settings/google-drive/oauth/callback`;
}

function createOAuthClient(origin?: string) {
  const { clientId, clientSecret } = requireClientCredentials();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    origin ? getGoogleDriveOAuthRedirectUri(origin) : undefined,
  );
}

async function loadCompanyDriveOAuthConfig(companyId: string): Promise<GoogleDriveOAuthConfig> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { printTemplates: true },
  });

  const config = readCompanyGoogleDriveOAuthConfig(company?.printTemplates);
  if (!config?.refreshToken) {
    throw new Error('Google Drive is not connected for this company. Connect Google Drive from Settings first.');
  }

  return config;
}

async function getDriveClientForCompany(companyId: string) {
  const config = await loadCompanyDriveOAuthConfig(companyId);
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: config.refreshToken,
  });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

function sanitizeFolderName(value: string, fallback: string): string {
  const trimmed = value
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed || fallback;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureChildFolder(
  drive: ReturnType<typeof google.drive>,
  parentId: string,
  folderName: string,
): Promise<string> {
  const safeName = sanitizeFolderName(folderName, 'Folder');
  const query =
    `mimeType='${FOLDER_MIME_TYPE}' and trashed=false and ` +
    `'${escapeDriveQueryValue(parentId)}' in parents and name='${escapeDriveQueryValue(safeName)}'`;

  const existing = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  const existingId = existing.data.files?.[0]?.id?.trim();
  if (existingId) return existingId;

  const created = await drive.files.create({
    requestBody: {
      name: safeName,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  const createdId = created.data.id?.trim();
  if (!createdId) {
    throw new Error(`Failed to create Drive folder "${safeName}".`);
  }
  return createdId;
}

async function renameFolderIfNeeded(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  folderName: string,
): Promise<void> {
  const safeName = sanitizeFolderName(folderName, 'Folder');
  try {
    await drive.files.update({
      fileId: folderId,
      requestBody: { name: safeName },
      fields: 'id',
      supportsAllDrives: true,
    });
  } catch {
    // If rename fails due to stale/missing folder id, caller will recreate on next upload.
  }
}

async function ensureFolderPath(
  drive: ReturnType<typeof google.drive>,
  companyId: string,
  rootFolderId: string,
  folderPath: Array<{ key: string; name: string }>,
): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, printTemplates: true },
  });
  let currentPrintTemplates: unknown = company?.printTemplates;
  const registry = readCompanyGoogleDriveFolderRegistry(currentPrintTemplates);
  let currentFolderId = rootFolderId;
  let registryChanged = false;
  const scopedPath = [
    {
      key: 'drive-folder:company-scope',
      name: buildCompanyDriveFolderName(company?.name ?? 'Company', companyId),
    },
    ...folderPath,
  ];

  for (const segment of scopedPath) {
    const desiredName = sanitizeFolderName(segment.name, segment.key);
    const existing = registry[segment.key];
    if (existing?.folderId) {
      currentFolderId = existing.folderId;
      if (existing.folderName !== desiredName) {
        await renameFolderIfNeeded(drive, existing.folderId, desiredName);
        registry[segment.key] = { folderId: existing.folderId, folderName: desiredName };
        registryChanged = true;
      }
      continue;
    }

    currentFolderId = await ensureChildFolder(drive, currentFolderId, desiredName);
    registry[segment.key] = { folderId: currentFolderId, folderName: desiredName };
    registryChanged = true;
  }

  if (registryChanged) {
    currentPrintTemplates = writeCompanyGoogleDriveFolderRegistry(currentPrintTemplates, registry);
    await prisma.company.update({
      where: { id: companyId },
      data: { printTemplates: currentPrintTemplates as Prisma.InputJsonValue },
    });
  }
  return currentFolderId;
}

export function buildEmployeeDriveFolderName(employeeName: string, employeeId: string): string {
  return sanitizeFolderName(`${employeeName} - ${employeeId}`, employeeId);
}

export function buildUserDriveFolderName(userName: string, userId: string): string {
  return sanitizeFolderName(`${userName || 'User'} - ${userId}`, userId);
}

export function buildCompanyDriveFolderName(companyName: string, companyId: string): string {
  return sanitizeFolderName(`${companyName || 'Company'} - ${companyId}`, companyId);
}

export function buildCustomerDriveFolderName(customerName: string, customerId: string): string {
  return sanitizeFolderName(`${customerName || 'Customer'} - ${customerId}`, customerId);
}

export function buildJobDriveFolderName(jobName: string, jobId: string): string {
  return sanitizeFolderName(`${jobName || 'Job'} - ${jobId}`, jobId);
}

export function buildSignedDeliveryNoteDriveFileName(
  deliveryNoteLabel: string,
  jobNumber: string,
  systemId: string,
  extension?: string,
): string {
  const base = sanitizeFolderName(
    `${deliveryNoteLabel} SIGN COPY OF - ${jobNumber || 'JOB'} - ${systemId}`,
    systemId,
  );
  const normalizedExt = extension?.trim().replace(/^\./, '');
  return normalizedExt ? `${base}.${normalizedExt}` : base;
}

export function explainGoogleDriveError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes('invalid_grant') ||
    normalized.includes('token has been expired or revoked') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Google Drive authorization expired or was revoked. Reconnect Google Drive from Settings and try again.';
  }

  if (
    normalized.includes('access_denied') ||
    normalized.includes('redirect_uri_mismatch')
  ) {
    return 'Google Drive OAuth configuration is incomplete. Check the authorized redirect URI in Google Cloud Console and reconnect from Settings.';
  }

  if (
    normalized.includes('file not found') ||
    normalized.includes('insufficient permission') ||
    normalized.includes('the user does not have sufficient permissions')
  ) {
    return 'Google Drive access is missing required permissions. Check the connected Google account and target folder permissions.';
  }

  return message;
}

export function createGoogleDriveAuthorizationUrl(origin: string, state: string): string {
  const oauth2Client = createOAuthClient(origin);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [DRIVE_SCOPE],
    state,
  });
}

export async function exchangeGoogleDriveAuthorizationCode(params: {
  code: string;
  origin: string;
}): Promise<{ refreshToken: string; connectedEmail: string | null }> {
  const oauth2Client = createOAuthClient(params.origin);
  const { tokens } = await oauth2Client.getToken(params.code);
  oauth2Client.setCredentials(tokens);

  const refreshToken = tokens.refresh_token?.trim();
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token. Reconnect again and make sure consent is granted.');
  }

  let connectedEmail: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    connectedEmail = me.data.email?.trim() || null;
  } catch {
    connectedEmail = null;
  }

  return { refreshToken, connectedEmail };
}

export async function uploadToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  target: DriveUploadFolderTarget,
): Promise<{ id: string; webViewLink: string; viewerUrl: string }> {
  try {
    const drive = await getDriveClientForCompany(target.companyId);
    const parentFolderId = await ensureFolderPath(
      drive,
      target.companyId,
      target.rootFolderId,
      target.folderPath?.filter(Boolean) ?? [],
    );

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [parentFolderId] },
      media: { mimeType, body: Readable.from(buffer) },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    if (res.data.id) {
      await drive.permissions.create({
        fileId: res.data.id,
        requestBody: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
      });
    }

    const id = res.data.id!;
    return {
      id,
      webViewLink: res.data.webViewLink!,
      viewerUrl: driveFileIdToDisplayUrl(id) ?? '',
    };
  } catch (error) {
    throw new Error(explainGoogleDriveError(error));
  }
}

export async function deleteFromDrive(driveId: string, companyId: string): Promise<void> {
  try {
    const drive = await getDriveClientForCompany(companyId);
    await drive.files.delete({ fileId: driveId, supportsAllDrives: true });
  } catch (error) {
    throw new Error(explainGoogleDriveError(error));
  }
}

export async function moveDriveFile(
  driveId: string,
  fileName: string,
  target: DriveUploadFolderTarget,
): Promise<{ id: string; viewerUrl: string }> {
  try {
    const drive = await getDriveClientForCompany(target.companyId);
    const parentFolderId = await ensureFolderPath(
      drive,
      target.companyId,
      target.rootFolderId,
      target.folderPath?.filter(Boolean) ?? [],
    );

    const existing = await drive.files.get({
      fileId: driveId,
      fields: 'id, name, parents',
      supportsAllDrives: true,
    });

    const currentName = existing.data.name?.trim() || '';
    const currentParents = existing.data.parents?.filter(Boolean) ?? [];
    const currentExtMatch = currentName.match(/\.([a-zA-Z0-9]+)$/);
    const desiredHasExt = /\.[a-zA-Z0-9]+$/.test(fileName);
    const nextName = desiredHasExt
      ? `${sanitizeFolderName(fileName.replace(/\.[a-zA-Z0-9]+$/, ''), driveId)}${fileName.slice(fileName.lastIndexOf('.'))}`
      : `${sanitizeFolderName(fileName, driveId)}${currentExtMatch?.[1] ? `.${currentExtMatch[1]}` : ''}`;

    await drive.files.update({
      fileId: driveId,
      addParents: currentParents.includes(parentFolderId) ? undefined : parentFolderId,
      removeParents: currentParents.filter((parentId) => parentId !== parentFolderId).join(',') || undefined,
      requestBody: { name: nextName },
      fields: 'id',
      supportsAllDrives: true,
    });

    return {
      id: driveId,
      viewerUrl: driveFileIdToDisplayUrl(driveId) ?? '',
    };
  } catch (error) {
    throw new Error(explainGoogleDriveError(error));
  }
}
