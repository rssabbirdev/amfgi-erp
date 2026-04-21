import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';

function displayProfileImage(u: {
  image: string | null;
}): string | null {
  return u.image?.trim() ? convertGoogleDriveUrl(u.image.trim()) : null;
}

function displaySignature(u: {
  signatureUrl: string | null;
}): string | null {
  return u.signatureUrl?.trim() ? convertGoogleDriveUrl(u.signatureUrl.trim()) : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return errorResponse('Unauthorized', 401);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      imageDriveId: true,
      signatureUrl: true,
      signatureDriveId: true,
    },
  });

  if (!user) return errorResponse('User not found', 404);
  return successResponse({
    id: user.id,
    name: user.name,
    email: user.email,
    image: displayProfileImage(user),
    signatureUrl: displaySignature(user),
    imageDriveId: user.imageDriveId,
    signatureDriveId: user.signatureDriveId,
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse('Unauthorized', 401);

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  if (name !== undefined && name.length === 0) {
    return errorResponse('Name cannot be empty', 400);
  }
  if (name !== undefined && name.length > 120) {
    return errorResponse('Name is too long', 400);
  }

  if (name === undefined) {
    return errorResponse('No valid fields to update', 400);
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      imageDriveId: true,
      signatureUrl: true,
      signatureDriveId: true,
    },
  });

  return successResponse({
    id: user.id,
    name: user.name,
    email: user.email,
    image: displayProfileImage(user),
    signatureUrl: displaySignature(user),
    imageDriveId: user.imageDriveId,
    signatureDriveId: user.signatureDriveId,
  });
}
