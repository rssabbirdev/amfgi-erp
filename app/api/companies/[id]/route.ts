import { auth }            from '@/auth';
import { connectSystemDB } from '@/lib/db/system';
import { Company }         from '@/lib/db/models/system/Company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }               from 'zod';

const UpdateSchema = z.object({
  name:        z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  isActive:    z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.isSuperAdmin) return errorResponse('Forbidden', 403);
  const { id } = await params;

  const body   = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  await connectSystemDB();
  const company = await Company.findByIdAndUpdate(id, parsed.data, { new: true }).lean();
  if (!company) return errorResponse('Company not found', 404);
  return successResponse(company);
}
