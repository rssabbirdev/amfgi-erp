import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';

const UpdateSchema = z.object({
  name:           z.string().min(1).max(100).optional(),
  description:    z.string().max(300).optional(),
  isActive:       z.boolean().optional(),
  address:        z.string().max(500).optional(),
  phone:          z.string().max(50).optional(),
  email:          z.string().email().optional().or(z.literal('')),
  printTemplates: z.array(z.any()).optional(),  // JSON array; structural validation done client-side
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  const { id } = await params;

  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) return errorResponse('Company not found', 404);

  return successResponse(company);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const isSA = session.user.isSuperAdmin ?? false;
  const perms = (session.user.permissions ?? []) as string[];
  const canManageSettings = isSA || perms.includes('settings.manage');

  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  // Non-SA can only update profile fields (address, phone, email) for their own company
  // SA can update anything including name, description, isActive
  if (!isSA) {
    // Check if trying to update restricted fields
    const restrictedFields = ['name', 'description', 'isActive'];
    const hasRestrictedFields = restrictedFields.some((field) => parsed.data[field as keyof typeof parsed.data] !== undefined);
    if (hasRestrictedFields || !canManageSettings) {
      return errorResponse('Forbidden', 403);
    }
    // Non-SA can only update their own company
    if (id !== session.user.activeCompanyId) {
      return errorResponse('Forbidden', 403);
    }
  }

  const update: Record<string, unknown> = {};
  if (isSA && parsed.data.name !== undefined) update.name = parsed.data.name;
  if (isSA && parsed.data.description !== undefined) update.description = parsed.data.description;
  if (isSA && parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
  if (parsed.data.address !== undefined) update.address = parsed.data.address;
  if (parsed.data.phone !== undefined) update.phone = parsed.data.phone;
  if (parsed.data.email !== undefined) update.email = parsed.data.email;
  if (parsed.data.printTemplates !== undefined) update.printTemplates = parsed.data.printTemplates;

  const company = await prisma.company.update({
    where: { id },
    data: update,
  });

  if (!company) return errorResponse('Company not found', 404);
  return successResponse(company);
}
