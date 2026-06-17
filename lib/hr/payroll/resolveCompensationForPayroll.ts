import {
  daysInMonth,
  denomDaysExcludingWeekdays,
  isExcludedWeekdayYmd,
  monthBounds,
  monthEndDate,
} from '@/lib/hr/payroll/calendar';
import { dateFromYmd } from '@/lib/hr/workDate';

export type CompensationTimelineRow = {
  id: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
};

export function compensationOverlapsMonth(
  effectiveFrom: Date,
  effectiveTo: Date | null,
  monthStart: Date,
  monthEnd: Date
): boolean {
  if (effectiveFrom > monthEnd) return false;
  if (effectiveTo && effectiveTo < monthStart) return false;
  return true;
}

export function compareCompensationPackages<T extends CompensationTimelineRow>(
  a: T,
  b: T,
  direction: 'asc' | 'desc'
): number {
  const fromCmp = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
  if (fromCmp !== 0) return direction === 'asc' ? fromCmp : -fromCmp;
  const createdCmp = a.createdAt.getTime() - b.createdAt.getTime();
  return direction === 'asc' ? createdCmp : -createdCmp;
}

export function sortCompensationPackagesForTimeline<T extends CompensationTimelineRow>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => compareCompensationPackages(a, b, 'asc'));
}

export function sortCompensationPackagesForDisplay<T extends CompensationTimelineRow>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => compareCompensationPackages(a, b, 'desc'));
}

export function compensationAppliesOnDate(
  pkg: Pick<CompensationTimelineRow, 'effectiveFrom' | 'effectiveTo'>,
  workDateYmd: string
): boolean {
  const workDate = dateFromYmd(workDateYmd);
  if (pkg.effectiveFrom > workDate) return false;
  if (pkg.effectiveTo && pkg.effectiveTo < workDate) return false;
  return true;
}

/** Pick the package active on a date; same effectiveFrom → latest createdAt wins. */
export function resolveCompensationPackageForDate<T extends CompensationTimelineRow>(
  packages: T[],
  workDateYmd: string
): T | null {
  const candidates = packages.filter((pkg) => compensationAppliesOnDate(pkg, workDateYmd));
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    const fromCmp = current.effectiveFrom.getTime() - best.effectiveFrom.getTime();
    if (fromCmp > 0) return current;
    if (fromCmp < 0) return best;
    return current.createdAt.getTime() > best.createdAt.getTime() ? current : best;
  });
}

export function listCompensationPackagesOverlappingMonth<T extends CompensationTimelineRow>(
  packages: T[],
  month: string
): T[] {
  const { start: monthStart } = monthBounds(month);
  const monthEnd = monthEndDate(month);
  return sortCompensationPackagesForTimeline(
    packages.filter((pkg) =>
      compensationOverlapsMonth(pkg.effectiveFrom, pkg.effectiveTo, monthStart, monthEnd)
    )
  );
}

export function hasMultipleCompensationPackagesInMonth<T extends CompensationTimelineRow>(
  packages: T[],
  month: string
): boolean {
  return listCompensationPackagesOverlappingMonth(packages, month).length > 1;
}

/** Working days in the month when this package is the active compensation (excludes weekly off-days). */
export function countCompensationPackageDaysInMonth<T extends CompensationTimelineRow>(
  packages: T[],
  packageId: string,
  month: string,
  excludedWeekdays: number[]
): number {
  const [year, monthIndex] = month.split('-').map(Number);
  const total = daysInMonth(month);
  let count = 0;

  for (let day = 1; day <= total; day += 1) {
    const ymd = `${year}-${String(monthIndex).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isExcludedWeekdayYmd(ymd, excludedWeekdays)) continue;
    const active = resolveCompensationPackageForDate(packages, ymd);
    if (active?.id === packageId) count += 1;
  }

  return count;
}

/** Fraction of the month (working days) that a package applies — used to prorate fixed monthly components. */
export function fixedMonthlyProrationFactor<T extends CompensationTimelineRow>(
  packages: T[],
  packageId: string,
  month: string,
  excludedWeekdays: number[]
): number {
  const denom = denomDaysExcludingWeekdays(month, excludedWeekdays);
  if (denom <= 0) return 0;
  return countCompensationPackageDaysInMonth(packages, packageId, month, excludedWeekdays) / denom;
}
