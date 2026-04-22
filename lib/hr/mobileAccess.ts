import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const TOKEN_PREFIX_LEN = 16;

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateEmployeeMobileToken() {
  const raw = randomBytes(32).toString('hex');
  const plainTextToken = `amfgi_emp_${raw}`;
  const tokenPrefix = plainTextToken.slice(0, TOKEN_PREFIX_LEN);
  const tokenHash = sha256(plainTextToken);
  return { plainTextToken, tokenPrefix, tokenHash };
}

function readBearerToken(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return null;
}

export type EmployeeApiAuthContext =
  | {
      ok: true;
      source: 'session' | 'token';
      companyId: string;
      userId: string;
      employeeId: string;
      employee: {
        id: string;
        fullName: string;
        employeeCode: string;
      };
      tokenId?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function requireEmployeeApiAuth(req: Request): Promise<EmployeeApiAuthContext> {
  const session = await auth();
  if (session?.user?.activeCompanyId && session.user.linkedEmployeeId) {
    const employee = await prisma.employee.findFirst({
      where: {
        id: session.user.linkedEmployeeId,
        companyId: session.user.activeCompanyId,
        portalEnabled: true,
      },
      select: { id: true, fullName: true, employeeCode: true },
    });
    if (employee) {
      return {
        ok: true,
        source: 'session',
        companyId: session.user.activeCompanyId,
        userId: session.user.id,
        employeeId: employee.id,
        employee,
      };
    }
  }

  const token = readBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const tokenPrefix = token.slice(0, TOKEN_PREFIX_LEN);
  const rows = await prisma.employeeMobileAccessToken.findMany({
    where: {
      tokenPrefix,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          portalEnabled: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const inputHash = Buffer.from(sha256(token), 'utf8');
  for (const row of rows) {
    const storedHash = Buffer.from(row.tokenHash, 'utf8');
    if (storedHash.length === inputHash.length && timingSafeEqual(inputHash, storedHash)) {
      if (!row.employee.portalEnabled) return { ok: false, status: 403, error: 'Employee portal is disabled' };
      await prisma.employeeMobileAccessToken.update({
        where: { id: row.id },
        data: { lastUsedAt: new Date() },
      });
      return {
        ok: true,
        source: 'token',
        companyId: row.companyId,
        userId: row.userId,
        employeeId: row.employeeId,
        employee: {
          id: row.employee.id,
          fullName: row.employee.fullName,
          employeeCode: row.employee.employeeCode,
        },
        tokenId: row.id,
      };
    }
  }

  return { ok: false, status: 401, error: 'Invalid or expired token' };
}
