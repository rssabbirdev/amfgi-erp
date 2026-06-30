import { employeeDocumentDisplayName } from '@/lib/hr/employeeDocumentDisplay';

export type EmployeeDocumentPortalRecord = {
  id: string;
  documentNumber: string | null;
  issueDate: Date | string | null;
  expiryDate: Date | string | null;
  issuingAuthority: string | null;
  notes: string | null;
  customFields?: unknown;
  mediaUrl?: string | null;
  portalViewEnabled: boolean;
  portalDownloadEnabled: boolean;
  documentType: { id?: string; name: string; slug?: string };
};

export function normalizePortalDocumentFlags(
  portalViewEnabled?: boolean | null,
  portalDownloadEnabled?: boolean | null
): { portalViewEnabled: boolean; portalDownloadEnabled: boolean } {
  const view = Boolean(portalViewEnabled);
  return {
    portalViewEnabled: view,
    portalDownloadEnabled: view && Boolean(portalDownloadEnabled),
  };
}

export function canEmployeeDownloadPortalDocument(doc: {
  portalViewEnabled: boolean;
  portalDownloadEnabled: boolean;
  mediaUrl?: string | null;
}): boolean {
  return doc.portalViewEnabled && doc.portalDownloadEnabled && Boolean(doc.mediaUrl?.trim());
}

export type PortalEmployeeDocumentDto = {
  id: string;
  name: string;
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingAuthority: string | null;
  notes: string | null;
  documentType: { name: string; slug: string };
  canDownload: boolean;
};

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10) || null;
}

export function serializeEmployeeDocumentForPortal(
  doc: EmployeeDocumentPortalRecord
): PortalEmployeeDocumentDto | null {
  if (!doc.portalViewEnabled) return null;
  return {
    id: doc.id,
    name: employeeDocumentDisplayName(doc),
    documentNumber: doc.documentNumber,
    issueDate: toIsoDate(doc.issueDate),
    expiryDate: toIsoDate(doc.expiryDate),
    issuingAuthority: doc.issuingAuthority,
    notes: doc.notes?.trim() || null,
    documentType: { name: doc.documentType.name, slug: doc.documentType.slug ?? '' },
    canDownload: canEmployeeDownloadPortalDocument(doc),
  };
}

export function upcomingPortalDocument<T extends { expiryDate: Date | string | null; portalViewEnabled: boolean }>(
  documents: T[]
): T | null {
  const visible = documents.filter((doc) => doc.portalViewEnabled && doc.expiryDate);
  visible.sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());
  return visible[0] ?? null;
}
