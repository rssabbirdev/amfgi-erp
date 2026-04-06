import { auth }            from '@/auth';
import { connectSystemDB } from '@/lib/db/system';
import { User }            from '@/lib/db/models/system/User';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';
import bcrypt              from 'bcryptjs';
import { Types }           from 'mongoose';

export async function GET() {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.view')) {
    return errorResponse('Forbidden', 403);
  }
  await connectSystemDB();
  const users = await User.find({})
    .populate('companyAccess.companyId', 'name slug')
    .populate('companyAccess.roleId',    'name')
    .populate('activeCompanyId',         'name slug')
    .sort({ createdAt: -1 })
    .lean();
  return successResponse(users);
}

const CreateUserSchema = z.object({
  name:         z.string().min(1).max(100),
  email:        z.string().email(),
  password:     z.string().min(8).optional(),
  isSuperAdmin: z.boolean().default(false),
  companyAccess: z.array(z.object({
    companyId: z.string().min(1),
    roleId:    z.string().min(1),
  })).default([]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin && !session?.user?.permissions.includes('user.create')) {
    return errorResponse('Forbidden', 403);
  }

  const body   = await req.json();
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  await connectSystemDB();
  if (await User.findOne({ email: parsed.data.email })) {
    return errorResponse('Email already registered', 409);
  }

  const userData: Record<string, unknown> = {
    name:         parsed.data.name,
    email:        parsed.data.email,
    isSuperAdmin: parsed.data.isSuperAdmin,
    companyAccess: parsed.data.companyAccess.map((a) => ({
      companyId: new Types.ObjectId(a.companyId),
      roleId:    new Types.ObjectId(a.roleId),
    })),
  };
  if (parsed.data.password) {
    userData.password = await bcrypt.hash(parsed.data.password, 12);
  }

  const user = await User.create(userData);
  const safe = await User.findById(user._id)
    .populate('companyAccess.companyId', 'name slug')
    .populate('companyAccess.roleId',    'name')
    .lean();
  return successResponse(safe, 201);
}
