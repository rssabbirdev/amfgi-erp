import type { Prisma } from '@prisma/client';
import { decimalToNumberOrZero } from '@/lib/utils/decimal';
import { calculateTrackedProgress, parseTrackableItems } from '@/lib/job-costing/progressTracking';

type TxClient = Prisma.TransactionClient;

export async function syncTrackedJobItemProgress(tx: TxClient, companyId: string, itemId: string) {
  const item = await tx.jobItem.findFirst({
    where: {
      id: itemId,
      companyId,
    },
    include: {
      progressEntries: {
        orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!item) return null;

  const trackers = parseTrackableItems(item.trackingItems);
  if (trackers.length === 0) {
    await tx.jobItem.update({
      where: { id: itemId },
      data: {
        trackingEnabled: false,
        progressUpdatedAt: new Date(),
      },
    });
    return item;
  }

  const jobRow = await tx.job.findFirst({
    where: { id: item.jobId, companyId },
    select: {
      executionProgressStatus: true,
      executionProgressPercent: true,
    },
  });

  const snapshot = calculateTrackedProgress(
    trackers,
    item.progressEntries.map((entry) => ({
      trackerId: entry.trackerId,
      entryDate: entry.entryDate,
      quantity: decimalToNumberOrZero(entry.quantity),
    })),
    {
      progressStatus: jobRow?.executionProgressStatus ?? item.progressStatus,
      progressPercent: decimalToNumberOrZero(jobRow?.executionProgressPercent ?? item.progressPercent),
    }
  );

  await tx.jobItem.update({
    where: { id: itemId },
    data: {
      progressPercent: snapshot.percentComplete,
      trackingEnabled: snapshot.enabled,
      progressUpdatedAt: new Date(),
    },
  });

  return snapshot;
}
