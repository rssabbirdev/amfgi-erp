import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export const GLOBAL_LIVE_UPDATE_COMPANY_ID = 'GLOBAL';

export type LiveUpdateChannel =
  | 'stock'
  | 'customers'
  | 'suppliers'
  | 'jobs'
  | 'settings'
  | 'admin'
  | 'hr';

export interface LiveUpdateEvent {
  id: string;
  companyId: string;
  channel: LiveUpdateChannel;
  entity: string;
  action: 'created' | 'updated' | 'deleted' | 'changed';
  at: string;
}

interface LiveUpdateRow {
  id: bigint;
  companyId: string;
  channel: string;
  entity: string;
  action: string;
  createdAt: Date;
}

const LIVE_UPDATE_RETENTION_HOURS = 24;

function mapRowToEvent(row: LiveUpdateRow): LiveUpdateEvent {
  return {
    id: row.id.toString(),
    companyId: row.companyId,
    channel: row.channel as LiveUpdateChannel,
    entity: row.entity,
    action: row.action as LiveUpdateEvent['action'],
    at: row.createdAt.toISOString(),
  };
}

export async function publishLiveUpdate(event: Omit<LiveUpdateEvent, 'id' | 'at'>) {
  await prisma.$executeRaw`
    INSERT INTO "LiveUpdateEvent" ("companyId", "channel", "entity", "action")
    VALUES (${event.companyId}, ${event.channel}, ${event.entity}, ${event.action})
  `;

  const cutoff = new Date(Date.now() - LIVE_UPDATE_RETENTION_HOURS * 60 * 60 * 1000);
  await prisma.$executeRaw`
    DELETE FROM "LiveUpdateEvent"
    WHERE "createdAt" < ${cutoff}
  `;
}

export async function getLatestLiveUpdateCursor(companyIds: string[]) {
  if (companyIds.length === 0) {
    return '0';
  }

  const rows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT "id"
    FROM "LiveUpdateEvent"
    WHERE "companyId" IN (${Prisma.join(companyIds)})
    ORDER BY "id" DESC
    LIMIT 1
  `);

  return rows[0]?.id.toString() ?? '0';
}

export async function getLiveUpdatesAfterCursor(
  companyIds: string[],
  afterCursor: string,
  limit = 50
) {
  if (companyIds.length === 0) {
    return [];
  }

  const cursorValue = BigInt(afterCursor || '0');
  const rows = await prisma.$queryRaw<LiveUpdateRow[]>(Prisma.sql`
    SELECT "id", "companyId", "channel", "entity", "action", "createdAt"
    FROM "LiveUpdateEvent"
    WHERE "companyId" IN (${Prisma.join(companyIds)})
      AND "id" > ${cursorValue}
    ORDER BY "id" ASC
    LIMIT ${limit}
  `);

  return rows.map(mapRowToEvent);
}
