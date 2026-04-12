import { prisma } from '@/lib/db/prisma';
import { errorResponse } from '@/lib/utils/apiResponse';
import type { NextResponse } from 'next/server';

/**
 * Ensures `companyId` exists. Stale JWTs after DB reset can reference deleted companies
 * and cause FK errors on create.
 */
export async function requireActiveCompanyInDb(
  companyId: string
): Promise<NextResponse | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    return errorResponse(
      'Active company no longer exists or your session is out of date. Use the company switcher to select a company, or sign out and sign in again.',
      400
    );
  }
  return null;
}
