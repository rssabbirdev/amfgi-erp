import { auth } from '@/auth';
import { getCompanyDB } from '@/lib/db/company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { z } from 'zod';
import { SupplierSchema } from '@/lib/db/schemas/Supplier';

const CreateSupplierSchema = z.object({
  name: z.string().min(1).max(100),
  contactPerson: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  try {
    const conn = await getCompanyDB(dbName);
    const Supplier = conn.model('Supplier', SupplierSchema);

    const suppliers = await Supplier.find({ isActive: true }).sort({ name: 1 }).lean();
    return successResponse(suppliers);
  } catch (err) {
    return errorResponse('Failed to fetch suppliers', 500);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.stock_in')) {
    return errorResponse('Forbidden', 403);
  }

  const dbName = session.user.activeCompanyDbName;
  if (!dbName) return errorResponse('No active company selected', 400);

  try {
    const body = await req.json();
    const parsed = CreateSupplierSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error.issues[0]?.message ?? 'Validation error', 422);
    }

    const conn = await getCompanyDB(dbName);
    const Supplier = conn.model('Supplier', SupplierSchema);

    const supplier = await Supplier.create(parsed.data);
    return successResponse(supplier, 201);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to create supplier';
    return errorResponse(errorMsg, 500);
  }
}
