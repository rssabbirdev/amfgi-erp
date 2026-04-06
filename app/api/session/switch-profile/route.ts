// Legacy endpoint — replaced by /api/session/switch-company
import { errorResponse } from '@/lib/utils/apiResponse';

export async function POST() {
  return errorResponse('This endpoint has been replaced by /api/session/switch-company', 410);
}
