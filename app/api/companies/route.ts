import { auth }             from '@/auth';
import { connectSystemDB }  from '@/lib/db/system';
import { Company }          from '@/lib/db/models/system/Company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                from 'zod';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  await connectSystemDB();

  const companies = await Company.find({ isActive: true }).sort({ name: 1 }).lean();
  return successResponse(companies);
}

const CreateSchema = z.object({
  name:        z.string().min(1).max(100),
  description: z.string().max(300).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);

  const body   = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  await connectSystemDB();

  // Auto-generate slug and dbName from name
  const slug   = parsed.data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const dbName = `company_${slug.replace(/-/g, '_')}`;

  const existing = await Company.findOne({ $or: [{ slug }, { name: parsed.data.name }] });
  if (existing) return errorResponse('Company with this name already exists', 409);

  const company = await Company.create({ ...parsed.data, slug, dbName });
  return successResponse(company, 201);
}
