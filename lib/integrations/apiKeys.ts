import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db/prisma';

const KEY_PREFIX_LEN = 12;

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export function generateIntegrationApiKey(): {
  plainTextKey: string;
  keyPrefix: string;
  keyHash: string;
} {
  const raw = randomBytes(32).toString('hex');
  const plainTextKey = `amfgi_${raw}`;
  const keyPrefix = plainTextKey.slice(0, KEY_PREFIX_LEN);
  const keyHash = sha256(plainTextKey);
  return { plainTextKey, keyPrefix, keyHash };
}

export async function resolveApiCredentialByKey(apiKey: string) {
  const keyPrefix = apiKey.slice(0, KEY_PREFIX_LEN);
  const records = await prisma.apiCredential.findMany({
    where: { keyPrefix, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const inputHash = Buffer.from(sha256(apiKey), 'utf8');
  for (const rec of records) {
    const recHash = Buffer.from(rec.keyHash, 'utf8');
    if (recHash.length === inputHash.length && timingSafeEqual(inputHash, recHash)) {
      return rec;
    }
  }
  return null;
}
