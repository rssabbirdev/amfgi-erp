export function formatPayMoney(n: number | null | undefined) {
  const value = Number(n);
  return (Number.isFinite(value) ? value : 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPayMonthLabel(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function payrollBreakdownLabel(key: string) {
  const labels: Record<string, string> = {
    monthlyBasic: 'Monthly basic',
    deductions: 'Deductions',
    deductDays: 'Absent days deducted',
    dailyWageTotal: 'Daily wage total',
    hourlyTotal: 'Hourly total',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}
