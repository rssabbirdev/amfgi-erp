import { auth }              from '@/auth';
import { getCompanyDB, getModels } from '@/lib/db/company';
import { connectSystemDB }   from '@/lib/db/system';
import { Company }           from '@/lib/db/models/system/Company';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return errorResponse('Unauthorized', 401);

  // Require transfer permission — same gate as the transfer endpoint
  if (!session.user.isSuperAdmin && !session.user.permissions.includes('transaction.transfer')) {
    return errorResponse('Forbidden', 403);
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get('companyId');
  if (!companyId) return errorResponse('companyId is required', 400);

  // Prevent browsing own company through this route
  if (companyId === session.user.activeCompanyId) {
    return errorResponse('Use /api/materials for your own company', 400);
  }

  await connectSystemDB();
  const company = await Company.findById(companyId).lean();
  if (!company) return errorResponse('Company not found', 404);
  if (!company.isActive) return errorResponse('Company is inactive', 400);

  const conn = await getCompanyDB(company.dbName);
  const { Material } = getModels(conn);

  const materials = await Material.find({ isActive: true })
    .select('_id name unit currentStock isActive')
    .sort({ name: 1 })
    .lean();

  return successResponse(materials);
}
