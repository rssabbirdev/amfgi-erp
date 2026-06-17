/**
 * Resolves employee id for nested `/api/hr/employees/[id]/…` route handlers.
 * Next.js 16 may not always populate parent dynamic `id` on deeply nested handlers.
 */
export async function resolveRouteEmployeeId(
  request: Request,
  params: Promise<{ id?: string }>
): Promise<string | null> {
  const resolved = await params;
  const fromParams = resolved.id?.trim();
  if (fromParams) return fromParams;

  const pathname = new URL(request.url).pathname;
  const segments = pathname.split('/').filter(Boolean);
  const employeesIndex = segments.indexOf('employees');
  if (employeesIndex < 0) return null;

  const candidate = segments[employeesIndex + 1];
  if (!candidate || candidate === 'import') return null;
  return candidate;
}
