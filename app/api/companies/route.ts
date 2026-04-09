import { auth }            from '@/auth';
import { prisma }          from '@/lib/db/prisma';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                from 'zod';

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  const companies = await prisma.company.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

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

  const slug = parsed.data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const existing = await prisma.company.findFirst({
    where: {
      OR: [
        { slug },
        { name: parsed.data.name },
      ],
    },
  });

  if (existing) return errorResponse('Company with this name already exists', 409);

  const company = await prisma.company.create({
    data: {
      name:        parsed.data.name,
      slug,
      description: parsed.data.description,
      isActive:    true,
    },
  });

  return successResponse(company, 201);
}
