import { auth }            from '@/auth';
import { connectSystemDB } from '@/lib/db/system';
import { User }            from '@/lib/db/models/system/User';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';
import bcrypt              from 'bcryptjs';
import { Types }           from 'mongoose';

const UpdateSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  isSuperAdmin: z.boolean().optional(),
  isActive:     z.boolean().optional(),
  password:     z.string().min(8).optional(),
  companyAccess: z.array(z.object({
    companyId: z.string().min(1),
    roleId:    z.string().min(1),
  })).optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.edit')) {
    return errorResponse('Forbidden', 403);
  }
  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  await connectSystemDB();
  const update: Record<string, unknown> = {};

  if (parsed.data.name         !== undefined) update.name         = parsed.data.name;
  if (parsed.data.isSuperAdmin !== undefined) update.isSuperAdmin = parsed.data.isSuperAdmin;
  if (parsed.data.isActive     !== undefined) update.isActive     = parsed.data.isActive;
  if (parsed.data.password) {
    update.password = await bcrypt.hash(parsed.data.password, 12);
  }
  if (parsed.data.companyAccess) {
    update.companyAccess = parsed.data.companyAccess.map((a) => ({
      companyId: new Types.ObjectId(a.companyId),
      roleId:    new Types.ObjectId(a.roleId),
    }));
  }

  const user = await User.findByIdAndUpdate(id, update, { new: true })
    .populate('companyAccess.companyId', 'name slug')
    .populate('companyAccess.roleId',    'name')
    .lean();
  if (!user) return errorResponse('User not found', 404);
  return successResponse(user);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);
  const { id } = await params;
  await connectSystemDB();
  await User.findByIdAndUpdate(id, { isActive: false });
  return successResponse({ deleted: true });
}
