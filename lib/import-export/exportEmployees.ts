import { downloadWorkbook } from '@/lib/import-export/xlsx';
import { employeeToExportRow } from '@/lib/import-export/employeeFields';
import type { HrEmployeeExportRecord } from '@/store/api/endpoints/hr';

export function exportEmployeesToXlsx(employees: HrEmployeeExportRecord[], label = 'employees') {
  const rows = employees.map(employeeToExportRow);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadWorkbook(`${label}-export-${stamp}.xlsx`, [
    {
      name: 'Instructions',
      rows: [
        ['Employee export'],
        ['Re-import using Import on the employee directory. Match updates by ID or Employee Code.'],
        ['Only columns present in your import file are updated; export → edit → import is supported.'],
        ['Compensation, visa periods, and documents are managed on each employee profile, not in this file.'],
      ],
    },
    { name: 'Employees', rows },
  ]);
}
