import { monthBounds, monthEndDate } from '@/lib/hr/payroll/calendar';
import { compensationOverlapsMonth } from '@/lib/hr/payroll/resolveCompensationForPayroll';

export type VisaPeriodSponsorSource = {
  sponsorType: string | null;
  startDate: Date;
  endDate: Date;
  status: string;
};

const STATUS_RANK: Record<string, number> = {
  ACTIVE: 0,
  DRAFT: 1,
  EXPIRED: 2,
  CANCELLED: 3,
};

function statusRank(status: string): number {
  return STATUS_RANK[status] ?? 99;
}

function validityDurationMs(period: VisaPeriodSponsorSource): number {
  return period.endDate.getTime() - period.startDate.getTime();
}

function compareVisaPeriodsForPayroll(
  a: VisaPeriodSponsorSource,
  b: VisaPeriodSponsorSource,
  preferLatestExpiry: boolean
): number {
  const statusDiff = statusRank(a.status) - statusRank(b.status);
  if (statusDiff !== 0) return statusDiff;

  if (preferLatestExpiry) {
    const endDateDiff = b.endDate.getTime() - a.endDate.getTime();
    if (endDateDiff !== 0) return endDateDiff;
  }

  const durationDiff = validityDurationMs(b) - validityDurationMs(a);
  if (durationDiff !== 0) return durationDiff;

  return b.endDate.getTime() - a.endDate.getTime();
}

/** Pick the visa sponsor label shown on payroll preview for a month. */
export function resolveVisaSponsorForPayroll(
  visaPeriods: VisaPeriodSponsorSource[],
  month: string
): string | null {
  const withSponsor = visaPeriods
    .map((period) => ({ ...period, sponsorType: period.sponsorType?.trim() || null }))
    .filter((period): period is VisaPeriodSponsorSource & { sponsorType: string } =>
      Boolean(period.sponsorType)
    );

  if (withSponsor.length === 0) return null;

  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);
  const validForMonth = withSponsor.filter((period) =>
    compensationOverlapsMonth(period.startDate, period.endDate, monthStart, monthEnd)
  );

  const preferLatestExpiry = validForMonth.length === 0;
  const candidates = validForMonth.length > 0 ? validForMonth : withSponsor;
  const sorted = [...candidates].sort((a, b) =>
    compareVisaPeriodsForPayroll(a, b, preferLatestExpiry)
  );
  return sorted[0]?.sponsorType ?? null;
}
