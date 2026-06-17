import type { Prisma } from '@prisma/client';

export const packageInclude = {
  payType: { select: { id: true, name: true, code: true, config: true } },
  visaPeriod: { select: { id: true, label: true, startDate: true, endDate: true, status: true } },
  allowances: {
    include: {
      allowanceType: {
        select: {
          id: true,
          name: true,
          code: true,
          componentKind: true,
          applicationMode: true,
        },
      },
    },
    orderBy: { allowanceType: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.EmployeeCompensationInclude;

export type CompensationPackageRow = Prisma.EmployeeCompensationGetPayload<{
  include: typeof packageInclude;
}>;

export type CompensationChangeLine = {
  label: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
};

export function allowanceTotal(pkg: CompensationPackageRow) {
  return pkg.allowances.reduce((sum, a) => {
    const amount = Number(a.amount);
    return sum + (a.allowanceType.componentKind === 'DEDUCTION' ? -amount : amount);
  }, 0);
}

export function formatPackageForApi(pkg: CompensationPackageRow, previous?: CompensationPackageRow | null) {
  const totalAllowance = allowanceTotal(pkg);
  const prevTotalAllowance = previous ? allowanceTotal(previous) : null;
  const basic = pkg.monthlyBasic != null ? Number(pkg.monthlyBasic) : null;
  const prevBasic = previous?.monthlyBasic != null ? Number(previous.monthlyBasic) : null;
  const daily = pkg.dailyRate != null ? Number(pkg.dailyRate) : null;
  const prevDaily = previous?.dailyRate != null ? Number(previous.dailyRate) : null;
  const wpsTransfer =
    pkg.wpsTransferAmount != null ? Number(pkg.wpsTransferAmount) : null;
  const prevWpsTransfer =
    previous?.wpsTransferAmount != null ? Number(previous.wpsTransferAmount) : null;

  const changes: CompensationChangeLine[] = [];

  if (previous) {
    if (basic !== prevBasic) {
      changes.push({
        label: 'Monthly basic',
        previous: prevBasic,
        current: basic,
        delta: basic != null && prevBasic != null ? basic - prevBasic : null,
      });
    }
    if (daily !== prevDaily) {
      changes.push({
        label: 'Daily rate',
        previous: prevDaily,
        current: daily,
        delta: daily != null && prevDaily != null ? daily - prevDaily : null,
      });
    }
    if (wpsTransfer !== prevWpsTransfer) {
      changes.push({
        label: 'WPS transfer amount',
        previous: prevWpsTransfer,
        current: wpsTransfer,
        delta:
          wpsTransfer != null && prevWpsTransfer != null
            ? wpsTransfer - prevWpsTransfer
            : null,
      });
    }
    if (totalAllowance !== prevTotalAllowance) {
      changes.push({
        label: 'Net salary components',
        previous: prevTotalAllowance,
        current: totalAllowance,
        delta:
          prevTotalAllowance != null ? totalAllowance - prevTotalAllowance : totalAllowance,
      });
    }

    const prevByType = new Map(
      previous.allowances.map((a) => [a.allowanceTypeId, Number(a.amount)])
    );
    const curByType = new Map(pkg.allowances.map((a) => [a.allowanceTypeId, Number(a.amount)]));
    const allTypeIds = new Set([...prevByType.keys(), ...curByType.keys()]);
    for (const typeId of allTypeIds) {
      const prevAmt = prevByType.get(typeId) ?? 0;
      const curAmt = curByType.get(typeId) ?? 0;
      if (prevAmt !== curAmt) {
        const typeName =
          pkg.allowances.find((a) => a.allowanceTypeId === typeId)?.allowanceType.name ??
          previous.allowances.find((a) => a.allowanceTypeId === typeId)?.allowanceType.name ??
          'Allowance';
        changes.push({
          label: typeName,
          previous: prevAmt,
          current: curAmt,
          delta: curAmt - prevAmt,
        });
      }
    }
  }

  return {
    id: pkg.id,
    payType: pkg.payType,
    visaPeriod: pkg.visaPeriod
      ? {
          id: pkg.visaPeriod.id,
          label: pkg.visaPeriod.label,
          startDate: pkg.visaPeriod.startDate.toISOString().slice(0, 10),
          endDate: pkg.visaPeriod.endDate.toISOString().slice(0, 10),
          status: pkg.visaPeriod.status,
        }
      : null,
    monthlyBasic: basic,
    dailyRate: daily,
    wpsTransferAmount: wpsTransfer,
    totalAllowance,
    totalMonthly: (basic ?? 0) + totalAllowance,
    effectiveFrom: pkg.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: pkg.effectiveTo ? pkg.effectiveTo.toISOString().slice(0, 10) : null,
    notes: pkg.notes,
    createdAt: pkg.createdAt.toISOString(),
    allowances: pkg.allowances.map((a) => ({
      id: a.id,
      allowanceTypeId: a.allowanceTypeId,
      allowanceType: a.allowanceType,
      amount: Number(a.amount),
      componentKind: a.allowanceType.componentKind,
      applicationMode: a.allowanceType.applicationMode,
    })),
    changes,
    payTypeChanged: previous ? pkg.payTypeId !== previous.payTypeId : false,
    previousPayTypeName: previous?.payType.name ?? null,
  };
}
