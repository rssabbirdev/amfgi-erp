import type { DocumentTemplate } from '@/lib/types/documentTemplate';

type PrintTemplatesRoot = Record<string, unknown>;
export type GoogleDriveOAuthConfig = {
  refreshToken: string;
  connectedAt: string;
  connectedEmail?: string | null;
};
export type GoogleDriveFolderRegistryEntry = {
  folderId: string;
  folderName: string;
};
export type GoogleDriveFolderRegistry = Record<string, GoogleDriveFolderRegistryEntry>;

function isTemplateLike(value: unknown): value is DocumentTemplate {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      'name' in value &&
      'itemType' in value &&
      'sections' in value,
  );
}

function extractIndexedTemplates(root: PrintTemplatesRoot): DocumentTemplate[] {
  return Object.keys(root)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => root[key])
    .filter(isTemplateLike);
}

export function readCompanyDocumentTemplates(printTemplates: unknown): DocumentTemplate[] {
  if (Array.isArray(printTemplates)) {
    return printTemplates.filter(isTemplateLike);
  }

  if (!printTemplates || typeof printTemplates !== 'object') {
    return [];
  }

  const root = printTemplates as PrintTemplatesRoot;

  if (Array.isArray(root.templates)) {
    return root.templates.filter(isTemplateLike);
  }

  return extractIndexedTemplates(root);
}

export function writeCompanyDocumentTemplates(
  currentPrintTemplates: unknown,
  nextTemplates: DocumentTemplate[],
): unknown {
  if (Array.isArray(currentPrintTemplates)) {
    return nextTemplates;
  }

  if (currentPrintTemplates && typeof currentPrintTemplates === 'object') {
    const root = { ...(currentPrintTemplates as PrintTemplatesRoot) };
    for (const key of Object.keys(root)) {
      if (/^\d+$/.test(key)) delete root[key];
    }
    delete root.hrEmployeeTypeSettings;
    root.templates = nextTemplates;
    return root;
  }

  return nextTemplates;
}

function toObjectRoot(printTemplates: unknown): PrintTemplatesRoot {
  if (printTemplates && typeof printTemplates === 'object' && !Array.isArray(printTemplates)) {
    return { ...(printTemplates as PrintTemplatesRoot) };
  }

  return {
    templates: readCompanyDocumentTemplates(printTemplates),
  };
}

export function readCompanyGoogleDriveOAuthConfig(printTemplates: unknown): GoogleDriveOAuthConfig | null {
  if (!printTemplates || typeof printTemplates !== 'object' || Array.isArray(printTemplates)) {
    return null;
  }

  const root = printTemplates as PrintTemplatesRoot;
  const raw = root.googleDriveOAuth;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const config = raw as Record<string, unknown>;
  const refreshToken = String(config.refreshToken ?? '').trim();
  if (!refreshToken) return null;

  return {
    refreshToken,
    connectedAt: String(config.connectedAt ?? '').trim() || new Date().toISOString(),
    connectedEmail:
      typeof config.connectedEmail === 'string' && config.connectedEmail.trim()
        ? config.connectedEmail.trim()
        : null,
  };
}

export function writeCompanyGoogleDriveOAuthConfig(
  currentPrintTemplates: unknown,
  nextConfig: GoogleDriveOAuthConfig | null,
): Record<string, unknown> {
  const root = toObjectRoot(currentPrintTemplates);

  if (!nextConfig) {
    delete root.googleDriveOAuth;
    return root;
  }

  root.googleDriveOAuth = {
    refreshToken: nextConfig.refreshToken,
    connectedAt: nextConfig.connectedAt,
    connectedEmail: nextConfig.connectedEmail ?? null,
  };
  return root;
}

export function readCompanyGoogleDriveFolderRegistry(
  printTemplates: unknown,
): GoogleDriveFolderRegistry {
  if (!printTemplates || typeof printTemplates !== 'object' || Array.isArray(printTemplates)) {
    return {};
  }

  const root = printTemplates as PrintTemplatesRoot;
  const raw = root.googleDriveFolders;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: GoogleDriveFolderRegistry = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const folderId = String(entry.folderId ?? '').trim();
    const folderName = String(entry.folderName ?? '').trim();
    if (!folderId || !folderName) continue;
    result[key] = { folderId, folderName };
  }
  return result;
}

export function writeCompanyGoogleDriveFolderRegistry(
  currentPrintTemplates: unknown,
  registry: GoogleDriveFolderRegistry,
): Record<string, unknown> {
  const root = toObjectRoot(currentPrintTemplates);
  root.googleDriveFolders = registry;
  return root;
}

export function normalizeCompanyPrintTemplateShape<T extends Record<string, unknown>>(company: T): T {
  const normalized = {
    ...company,
    printTemplates: readCompanyDocumentTemplates(company.printTemplates),
  } as T & {
    googleDriveOAuth?: GoogleDriveOAuthConfig | null;
    googleDriveFolders?: GoogleDriveFolderRegistry;
    hrEmployeeTypeSettings?: unknown;
  };

  const googleDriveOAuth = readCompanyGoogleDriveOAuthConfig(company.printTemplates);
  const googleDriveFolders = readCompanyGoogleDriveFolderRegistry(company.printTemplates);

  normalized.googleDriveOAuth = googleDriveOAuth;
  normalized.googleDriveFolders = googleDriveFolders;
  if (company.hrEmployeeTypeSettings !== undefined) {
    normalized.hrEmployeeTypeSettings = company.hrEmployeeTypeSettings;
  } else if (company.printTemplates && typeof company.printTemplates === 'object' && !Array.isArray(company.printTemplates)) {
    normalized.hrEmployeeTypeSettings = (company.printTemplates as PrintTemplatesRoot).hrEmployeeTypeSettings;
  }

  return normalized as T;
}
