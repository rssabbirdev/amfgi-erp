// Legacy endpoint — replaced by /api/companies
import { errorResponse } from '@/lib/utils/apiResponse';

export async function GET() {
  return errorResponse('This endpoint has been replaced by /api/companies', 410);
}

export async function POST() {
  return errorResponse('This endpoint has been replaced by /api/companies', 410);
}
