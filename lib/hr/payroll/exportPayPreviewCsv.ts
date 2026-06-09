export type PayPreviewCsvRow = {
  employeeCode: string;
  employeeName: string;
  payTypeName: string | null;
  payTypeCode: string | null;
  approvedAttendanceRows: number;
  draftAttendanceRows: number;
  gross: number;
  skipped: boolean;
  skipReason: string | null;
};

function escapeCsvCell(value: string | number) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function payPreviewToCsv(month: string, employees: PayPreviewCsvRow[]) {
  const headers = [
    'Month',
    'Employee code',
    'Employee name',
    'Pay type',
    'Pay type code',
    'Approved attendance rows',
    'Draft attendance rows',
    'Gross AED',
    'Skipped',
    'Skip reason',
  ];

  const lines = employees.map((row) =>
    [
      month,
      row.employeeCode,
      row.employeeName,
      row.payTypeName ?? '',
      row.payTypeCode ?? '',
      row.approvedAttendanceRows,
      row.draftAttendanceRows,
      row.skipped ? '' : row.gross.toFixed(2),
      row.skipped ? 'yes' : 'no',
      row.skipReason ?? '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.map(escapeCsvCell).join(','), ...lines].join('\r\n');
}

export function downloadPayPreviewCsv(month: string, employees: PayPreviewCsvRow[]) {
  const csv = payPreviewToCsv(month, employees);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `payroll-preview-${month}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
