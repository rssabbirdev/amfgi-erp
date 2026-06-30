import { Prisma } from '@prisma/client';

export const CUSTOM_EMPLOYEE_DOC_TYPE_VALUE = '__custom__';
export const EMPLOYEE_DOC_OTHER_SLUG = 'other';

export function readEmployeeDocumentCustomTitle(customFields: unknown): string | null {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return null;
  const title = (customFields as Record<string, unknown>).customTitle;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

export function employeeDocumentDisplayName(doc: {
  documentType: { name: string; slug?: string };
  customFields?: unknown;
}): string {
  const custom = readEmployeeDocumentCustomTitle(doc.customFields);
  if (custom) return custom;
  return doc.documentType.name;
}

export function isEmployeeDocumentCustomTitle(doc: {
  documentType: { slug?: string };
  customFields?: unknown;
}): boolean {
  return Boolean(readEmployeeDocumentCustomTitle(doc.customFields)) || doc.documentType.slug === EMPLOYEE_DOC_OTHER_SLUG;
}

export function resolveEmployeeDocumentCustomFields(
  customTitle: string | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (customTitle === undefined) return undefined;
  const trimmed = customTitle?.trim();
  if (trimmed) return { customTitle: trimmed };
  return Prisma.DbNull;
}
