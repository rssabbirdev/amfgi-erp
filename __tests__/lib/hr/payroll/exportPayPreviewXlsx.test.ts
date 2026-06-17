import * as XLSX from 'xlsx';

import {
  buildPayPreviewWorkbookSheets,
  type PayPreviewExportPayload,
} from '@/lib/hr/payroll/exportPayPreviewXlsx';

const samplePayload: PayPreviewExportPayload = {
  month: '2026-06',
  totalGross: 3500,
  employees: [
    {
      employeeId: 'e1',
      employeeCode: 'EMP001',
      employeeName: 'Jane Doe',
      employeeFullName: 'Jane Doe',
      employeePreferredName: 'Jane',
      payTypeName: 'Office',
      payTypeCode: 'OFFICE',
      workforceRoleTypeShort: 'Office',
      visaHoldingLabel: 'Company provided',
      wpsTransferAmount: 2800,
      visaSponsorName: 'Company A',
      gross: 3500,
      breakdown: { monthlyBasic: 3000, deductions: 0 },
      salaryComponentEarnings: 200,
      salaryComponentDeductions: 50,
      dayDetails: [
        {
          date: '2026-06-02',
          status: 'Present',
          totalHours: 9,
          basicHours: 8,
          otHours: 1,
          basicHourRate: 15,
          basicHourSalary: 120,
          otHourRate: 22.5,
          otHourSalary: 22.5,
          allowance: 10,
          componentEarning: 10,
          componentDeduction: 5,
          totalSalary: 147.5,
          amount: 147.5,
        },
      ],
      healthCheck: {
        ok: true,
        issues: [],
        basicPaid: 3000,
        basicCap: 3000,
        allowancePaid: 200,
        allowanceCap: 200,
        componentEarningsPaid: 200,
        componentEarningsCap: 200,
        componentDeductionsPaid: 50,
        componentDeductionsCap: 50,
      },
      approvedAttendanceRows: 1,
      draftAttendanceRows: 0,
      skipped: false,
      skipReason: null,
    },
    {
      employeeId: 'e2',
      employeeCode: 'EMP002',
      employeeName: 'John Smith',
      payTypeName: null,
      payTypeCode: null,
      gross: 0,
      breakdown: {},
      approvedAttendanceRows: 0,
      draftAttendanceRows: 0,
      skipped: true,
      skipReason: 'No compensation',
    },
  ],
};

function sheetToRows(sheet: XLSX.WorkSheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as Array<Array<string | number>>;
}

describe('buildPayPreviewWorkbookSheets', () => {
  it('creates summary sheet and one sheet per included employee', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]?.name).toBe('Summary');
    expect(sheets[1]?.name).toBe('Jane Doe');
  });

  it('summary sheet mirrors preview table columns', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    const summaryRows = sheets[0]?.rows ?? [];
    expect(summaryRows[0]).toEqual(['Payroll preview', '2026-06']);
    expect(summaryRows[4]?.[0]).toBe('Employee');
    expect(summaryRows[4]).toContain('Role');
    expect(summaryRows[4]).toContain('Visa sponsor');
    expect(summaryRows[4]).toContain('WPS (AED)');
    expect(summaryRows[5]?.[0]).toBe('Jane Doe');
    expect(summaryRows[4]).toContain('Visa holding');
    expect(summaryRows[5]?.[2]).toBe('Office');
    expect(summaryRows[5]?.[3]).toBe('Company provided');
    expect(summaryRows[5]?.[4]).toBe('Company A');
    expect(summaryRows[5]?.[14]).toBe(2800);
    expect(summaryRows[5]?.[15]).toBe(3500);
    expect(summaryRows.some((row) => row[0] === 'Skipped employees')).toBe(true);
  });

  it('employee sheet includes daily breakdown headers', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    const detailRows = sheets[1]?.rows ?? [];
    const dailyHeaderIndex = detailRows.findIndex((row) => row[0] === 'Date');
    expect(dailyHeaderIndex).toBeGreaterThan(-1);
    expect(detailRows[dailyHeaderIndex]).toEqual([
      'Date',
      'Total h',
      'Basic h',
      'OT h',
      'Basic salary',
      'OT rate',
      'OT salary',
      'Allowance',
      'Deduction',
      'Total',
      'Status',
    ]);
    expect(detailRows[dailyHeaderIndex + 1]?.[0]).toBe('2026-06-02');
  });

  it('produces a valid xlsx workbook', () => {
    const sheets = buildPayPreviewWorkbookSheets(samplePayload);
    const workbook = XLSX.utils.book_new();
    for (const sheet of sheets) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
    }
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const parsed = XLSX.read(buffer, { type: 'buffer' });
    expect(parsed.SheetNames).toEqual(['Summary', 'Jane Doe']);
    const summary = sheetToRows(parsed.Sheets.Summary);
    expect(summary[5]?.[0]).toBe('Jane Doe');
  });
});
