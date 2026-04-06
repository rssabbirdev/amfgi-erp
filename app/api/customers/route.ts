import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z }                 from 'zod';

const CustomerSchema = z.object({
  name:    z.string().min(1).max(100),
  phone:   z.string().max(30).optional(),
  email:   z.string().email().optional().or(z.literal('')),
  address: z.string().max(300).optional(),
  notes:   z.string().max(500).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.view')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const conn = await getCompanyDB(dbName);
  const { Customer } = getModels(conn);
  const customers = await Customer.find({ isActive: true }).sort({ name: 1 }).lean();
  return successResponse(customers);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('customer.create')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  const body   = await req.json();
  const parsed = CustomerSchema.safeParse(body);
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);

  const conn = await getCompanyDB(dbName);
  const { Customer } = getModels(conn);
  const customer = await Customer.create({ ...parsed.data, isActive: true });
  return successResponse(customer, 201);
}
