import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import type { AppSessionUser } from '@/lib/hr/requireCompanySession';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

function canAccess(user: AppSessionUser) {
  const isSA = user.isSuperAdmin ?? false;
  const perms = (user.permissions ?? []) as string[];
  return { isSA, canManage: isSA || perms.includes('settings.manage'), companyId: user.activeCompanyId };
}

/** List media assets for the active company (usage links, category, uploader). */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { canManage, companyId } = canAccess(session.user);
  if (!canManage) return errorResponse('Forbidden', 403);
  if (!companyId) return errorResponse('No active company selected', 400);

  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category')?.trim() || undefined;
  const orphansOnly = searchParams.get('orphansOnly') === '1' || searchParams.get('orphansOnly') === 'true';
  const uploadedById = searchParams.get('uploadedBy')?.trim() || undefined;
  const q = searchParams.get('q')?.trim() || undefined;

  const rows = await prisma.mediaAsset.findMany({
    where: {
      companyId,
      ...(category ? { category } : {}),
      ...(orphansOnly ? { links: { none: {} } } : {}),
      ...(uploadedById ? { uploadedById } : {}),
      ...(q ? { fileName: { contains: q } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      links: { select: { kind: true, entityId: true } },
    },
  });

  const data = rows.map((a) => ({
    id: a.id,
    fileUrl: a.fileUrl,
    previewUrl: a.fileUrl,
    mimeType: a.mimeType,
    fileName: a.fileName,
    category: a.category,
    bytes: a.bytes,
    createdAt: a.createdAt,
    uploadedBy: a.uploadedBy,
    linkCount: a.links.length,
    links: a.links,
  }));

  return successResponse(data);
}
