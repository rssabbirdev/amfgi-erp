'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useBulkCreateMaterialsMutation, useGetWarehousesQuery, type Material } from '@/store/hooks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingMaterials: Material[];
}

interface MaterialRow {
  id?: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
  categoryId?: string;
  warehouse?: string;
  warehouseId?: string;
  stockType: string;
  allowNegativeConsumption?: boolean;
  externalItemName?: string;
  unitCost?: number;
  reorderLevel?: number;
  currentStock?: number;
}

type MappedRow = Partial<MaterialRow> & {
  __rowIndex: number;
  __errors: string[];
};

type PreviewRow = MappedRow & {
  __isDuplicate: boolean;
  __duplicateReason?: string;
  __action: 'update' | 'skip';
};

type InvalidRow = MappedRow & {
  __sourceValues: string[];
};

const SYSTEM_FIELDS = [
  { key: 'id', label: 'Material ID', required: false },
  { key: 'name', label: 'Item Name', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'unit', label: 'Unit', required: true },
  { key: 'stockType', label: 'Stock Type', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'categoryId', label: 'Category ID', required: false },
  { key: 'warehouse', label: 'Warehouse', required: false },
  { key: 'warehouseId', label: 'Warehouse ID', required: false },
  { key: 'allowNegativeConsumption', label: 'Allow Negative Consumption', required: false },
  { key: 'externalItemName', label: 'External Item Name', required: false },
  { key: 'unitCost', label: 'Unit Cost', required: false },
  { key: 'reorderLevel', label: 'Reorder Level', required: false },
  { key: 'currentStock', label: 'Opening Stock', required: false },
  { key: '__skip__', label: 'Skip Column', required: false },
] as const;

function autoMap(header: string) {
  const normalized = header.toLowerCase().trim();
  const match = SYSTEM_FIELDS.find(
    (field) => field.key.toLowerCase() === normalized || field.label.toLowerCase() === normalized
  );
  return match?.key ?? '__skip__';
}

function parseOptionalNumber(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const parsed = Number.parseFloat(String(value).trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'allowed'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'blocked'].includes(normalized)) return false;
  return undefined;
}

function hasRowContent(row: (string | number | boolean | null)[]) {
  return row.some((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });
}

function downloadTemplate() {
  const instructionRows = [
    ['Field', 'Required', 'Instructions'],
    ['Material ID', 'No', 'Leave blank for new rows. Use the existing material ID when you want duplicate detection by ID.'],
    ['Item Name', 'Yes', 'Primary material name. Required for every non-empty row.'],
    ['Description', 'No', 'Optional free-text note.'],
    ['Unit', 'Yes', 'Base stock unit, such as KG, PCS, MTR, or LTR.'],
    ['Stock Type', 'Yes', 'Example values: Raw Material, Consumable, Finished Goods.'],
    ['Category', 'No', 'Category name. If Category ID is provided, ID takes priority.'],
    ['Category ID', 'No', 'Existing category ID from the system, if known.'],
    ['Warehouse', 'No', 'Default warehouse name. If Warehouse ID is provided, ID takes priority.'],
    ['Warehouse ID', 'No', 'Existing warehouse ID from the system, if known.'],
    ['Allow Negative Consumption', 'No', 'Use TRUE/FALSE, YES/NO, 1/0, or Allowed/Blocked.'],
    ['External Item Name', 'No', 'Optional external system item name.'],
    ['Unit Cost', 'No', 'Numeric only. Example: 12.5'],
    ['Reorder Level', 'No', 'Numeric only. Example: 25'],
    ['Opening Stock', 'No', 'Numeric only. Only applied for new materials.'],
  ];

  const templateRows = [
    {
      'Material ID': '',
      'Item Name': 'Fiberglass Mat 300gsm',
      Description: 'Sample import row',
      Unit: 'PCS',
      'Stock Type': 'Raw Material',
      Category: 'Fiberglass',
      'Category ID': '',
      Warehouse: 'Main Warehouse',
      'Warehouse ID': '',
      'Allow Negative Consumption': 'FALSE',
      'External Item Name': 'FG-MAT-300',
      'Unit Cost': 18.75,
      'Reorder Level': 50,
      'Opening Stock': 120,
    },
  ];

  const workbook = XLSX.utils.book_new();
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionRows);
  const templateSheet = XLSX.utils.json_to_sheet(templateRows);

  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, templateSheet, 'Template');
  XLSX.writeFile(workbook, 'materials-import-template.xlsx');
}

export default function BulkImportModal({ isOpen, onClose, existingMaterials }: Props) {
  const [bulkCreate, { isLoading: isSubmitting }] = useBulkCreateMaterialsMutation();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const [step, setStep] = useState(0);
  const [rawRows, setRawRows] = useState<(string | number | boolean | null)[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [autoMapped, setAutoMapped] = useState<Set<number>>(new Set());
  const [previewTab, setPreviewTab] = useState<'new' | 'duplicates' | 'invalid'>('new');
  const [allRows, setAllRows] = useState<PreviewRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidRow[]>([]);

  const resetState = useCallback(() => {
    setStep(0);
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setAutoMapped(new Set());
    setAllRows([]);
    setInvalidRows([]);
    setPreviewTab('new');
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result as ArrayBuffer;
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as (string | number | boolean | null)[][];

        if (rows.length < 2) {
          toast.error('Excel file must have headers and at least one data row');
          return;
        }

        const excelHeaders = rows[0].map((cell) => String(cell ?? '').trim());
        const dataRows = rows.slice(1).filter((row) => hasRowContent(row));
        const nextMapping: Record<number, string> = {};
        const nextAutoMapped = new Set<number>();

        excelHeaders.forEach((header, idx) => {
          const mapped = autoMap(header);
          nextMapping[idx] = mapped;
          if (mapped !== '__skip__') nextAutoMapped.add(idx);
        });

        setHeaders(excelHeaders);
        setRawRows(dataRows);
        setMapping(nextMapping);
        setAutoMapped(nextAutoMapped);
        setStep(1);
      } catch {
        toast.error('Failed to parse Excel file');
      }
    };

    reader.readAsArrayBuffer(file);
  }, []);

  const canAdvanceFromMapping = useCallback(() => {
    const requiredFields = SYSTEM_FIELDS.filter((field) => field.required).map((field) => field.key);
    const mappedFields = Object.values(mapping).filter((key) => key !== '__skip__');
    return requiredFields.every((field) => mappedFields.includes(field));
  }, [mapping]);

  const handlePreview = useCallback(() => {
    const existingNameMap = new Map(existingMaterials.map((material) => [material.name.toLowerCase(), material.name]));
    const existingIdMap = new Map(existingMaterials.map((material) => [material.id, material.name]));
    const warehouseNamesLower = new Set(warehouses.map((warehouse) => warehouse.name.toLowerCase()));
    const warehouseIds = new Set(warehouses.map((warehouse) => warehouse.id));

    const parsedResults = rawRows.map((row, rowIndex) => {
      const parsed: MappedRow = { __rowIndex: rowIndex, __errors: [] };
      const parsedValues = parsed as MappedRow & Record<string, string | number | boolean | undefined>;

      headers.forEach((_, colIndex) => {
        const fieldKey = mapping[colIndex];
        if (!fieldKey || fieldKey === '__skip__') return;

        const value = row[colIndex];
        const fieldDef = SYSTEM_FIELDS.find((field) => field.key === fieldKey);
        if (!fieldDef) return;

        if (fieldDef.required && !value) {
          parsed.__errors.push(`Missing required field: ${fieldDef.label}`);
          return;
        }

        if (fieldKey === 'unitCost' || fieldKey === 'reorderLevel' || fieldKey === 'currentStock') {
          if (value === null || value === undefined || value === '') {
            parsedValues[fieldKey] = undefined;
            return;
          }

          const numericValue = parseOptionalNumber(value);
          if (numericValue === undefined) {
            parsed.__errors.push(`Invalid number for ${fieldDef.label}`);
            return;
          }

          parsedValues[fieldKey] = numericValue;
          return;
        }

        if (fieldKey === 'allowNegativeConsumption') {
          if (value === null || value === undefined || value === '') {
            parsedValues[fieldKey] = undefined;
            return;
          }

          const booleanValue = parseOptionalBoolean(value);
          if (booleanValue === undefined) {
            parsed.__errors.push(`Invalid boolean for ${fieldDef.label}`);
            return;
          }

          parsedValues[fieldKey] = booleanValue;
          return;
        }

        parsedValues[fieldKey] = String(value ?? '').trim();
      });

      if (parsed.warehouseId && !warehouseIds.has(parsed.warehouseId)) {
        parsed.__errors.push(`Warehouse ID not found: ${parsed.warehouseId}`);
      } else if (
        parsed.warehouse &&
        typeof parsed.warehouse === 'string' &&
        !warehouseNamesLower.has(parsed.warehouse.toLowerCase())
      ) {
        parsed.__errors.push(`Warehouse not found: ${parsed.warehouse}`);
      }

      return {
        parsed,
        sourceValues: headers.map((_, colIndex) => String(row[colIndex] ?? '').trim()),
      };
    });

    const parsedRows = parsedResults
      .map((result) => result.parsed)
      .filter((row) => row.__errors.length === 0);
    const parsedNameCounts = new Map<string, number>();
    const parsedIdCounts = new Map<string, number>();

    for (const row of parsedRows) {
      const normalizedName = row.name?.trim().toLowerCase();
      if (normalizedName) {
        parsedNameCounts.set(normalizedName, (parsedNameCounts.get(normalizedName) ?? 0) + 1);
      }

      const normalizedId = row.id?.trim();
      if (normalizedId) {
        parsedIdCounts.set(normalizedId, (parsedIdCounts.get(normalizedId) ?? 0) + 1);
      }
    }

    for (const result of parsedResults) {
      const normalizedName = result.parsed.name?.trim().toLowerCase();
      const normalizedId = result.parsed.id?.trim();

      if (!result.parsed.__errors.length && normalizedName && (parsedNameCounts.get(normalizedName) ?? 0) > 1) {
        result.parsed.__errors.push(`Duplicate item name in this file: ${result.parsed.name}`);
      }

      if (!result.parsed.__errors.length && normalizedId && (parsedIdCounts.get(normalizedId) ?? 0) > 1) {
        result.parsed.__errors.push(`Duplicate material ID in this file: ${normalizedId}`);
      }
    }

    const validParsedRows = parsedResults
      .map((result) => result.parsed)
      .filter((row) => row.__errors.length === 0);
    const nextInvalidRows: InvalidRow[] = parsedResults
      .filter((result) => result.parsed.__errors.length > 0)
      .map((result) => ({
        ...result.parsed,
        __sourceValues: result.sourceValues,
      }));

    const previewRows: PreviewRow[] = validParsedRows.map((row) => ({
      ...row,
      __isDuplicate: Boolean(
        (typeof row.id === 'string' && row.id.length > 0 && existingIdMap.has(row.id)) ||
          existingNameMap.has(String(row.name || '').toLowerCase())
      ),
      __duplicateReason:
        typeof row.id === 'string' && row.id.length > 0 && existingIdMap.has(row.id)
          ? `Matches existing material ID: ${row.id} (${existingIdMap.get(row.id)})`
          : existingNameMap.has(String(row.name || '').toLowerCase())
            ? `Matches existing material name: ${existingNameMap.get(String(row.name || '').toLowerCase())}`
            : undefined,
      __action: 'skip',
    }));

    if (nextInvalidRows.length > 0) {
      toast.error(`${nextInvalidRows.length} row(s) failed validation`);
    }

    setAllRows(previewRows);
    setInvalidRows(nextInvalidRows);
    setPreviewTab(previewRows.length > 0 ? 'new' : nextInvalidRows.length > 0 ? 'invalid' : 'new');
    setStep(2);
  }, [existingMaterials, headers, mapping, rawRows, warehouses]);

  const newRows = allRows.filter((row) => !row.__isDuplicate);
  const duplicateRows = allRows.filter((row) => row.__isDuplicate);
  const selectedForUpdate = duplicateRows.filter((row) => row.__action === 'update');

  const handleSubmit = async () => {
    if (newRows.length === 0 && selectedForUpdate.length === 0) {
      toast.error('No rows to import. Please create or select duplicates to update.');
      return;
    }

    const cleanRows = (rows: PreviewRow[]): MaterialRow[] =>
      rows.map(({ __rowIndex, __errors, __isDuplicate, __action, ...rest }) => rest as MaterialRow);

    try {
      const result = await bulkCreate({
        newRows: cleanRows(newRows),
        updateRows: cleanRows(selectedForUpdate),
      }).unwrap();

      toast.success(`Imported ${result.created} new, updated ${result.updated}`);
      resetState();
      onClose();
    } catch (err: unknown) {
      const message =
        typeof err === 'object' &&
        err !== null &&
        'data' in err &&
        typeof (err as { data?: { error?: unknown } }).data?.error === 'string'
          ? (err as { data: { error: string } }).data.error
          : 'Import failed';

      toast.error(message);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Import Materials" size="xl">
      <div className="space-y-4">
        {step === 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-slate-300">Upload an Excel file with your materials list.</p>
                <p className="mt-1 text-xs text-slate-400">
                  Blank rows are ignored. Use the template to see the accepted columns and example values.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>
            <div className="rounded-lg border-2 border-dashed border-slate-600 p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="block cursor-pointer">
                <svg className="mx-auto mb-2 h-12 w-12 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
                <p className="font-medium text-white">Click to upload or drag and drop</p>
                <p className="mt-1 text-sm text-slate-400">Excel (.xlsx, .xls) or CSV files</p>
              </label>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">Map your spreadsheet columns to material fields.</p>
              <Button type="button" variant="secondary" onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg bg-slate-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800">
                    <th className="px-4 py-2 text-left text-slate-300">Excel Column</th>
                    <th className="px-4 py-2 text-left text-slate-300">Map To</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, idx) => (
                    <tr key={idx} className="border-b border-slate-700 hover:bg-slate-800/50">
                      <td className="px-4 py-2">
                        <div className="text-white">{header}</div>
                        {autoMapped.has(idx) ? (
                          <div className="mt-1 text-xs text-emerald-400">Auto-matched</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping[idx] || ''}
                          onChange={(e) => {
                            setMapping((prev) => ({ ...prev, [idx]: e.target.value }));
                            if (e.target.value !== '__skip__') {
                              setAutoMapped((prev) => new Set(prev).add(idx));
                            }
                          }}
                          className="w-full rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="">-- Select --</option>
                          {SYSTEM_FIELDS.map((field) => (
                            <option key={field.key} value={field.key}>
                              {field.label} {field.required ? '*' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!canAdvanceFromMapping() ? (
              <div className="rounded-lg border border-red-900 bg-red-950/30 p-3">
                <p className="text-sm text-red-300">Required fields not mapped: Item Name, Unit, Stock Type</p>
              </div>
            ) : null}

            <div className="flex gap-3 border-t border-slate-700 pt-2">
              <Button type="button" variant="ghost" onClick={resetState} fullWidth>
                Back
              </Button>
              <Button type="button" onClick={handlePreview} disabled={!canAdvanceFromMapping()} fullWidth>
                Preview
              </Button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="flex gap-2 border-b border-slate-700">
              <button
                onClick={() => setPreviewTab('new')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  previewTab === 'new' ? 'border-b-2 border-emerald-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                New ({newRows.length})
              </button>
              <button
                onClick={() => setPreviewTab('duplicates')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  previewTab === 'duplicates'
                    ? 'border-b-2 border-emerald-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Duplicates ({duplicateRows.length})
              </button>
              <button
                onClick={() => setPreviewTab('invalid')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  previewTab === 'invalid'
                    ? 'border-b-2 border-emerald-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Invalid ({invalidRows.length})
              </button>
            </div>

            {previewTab === 'new' ? (
              <div className="max-h-64 overflow-x-auto rounded-lg bg-slate-900">
                {newRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No new materials</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="sticky top-0 border-b border-slate-700 bg-slate-800">
                        <th className="px-3 py-2 text-left text-slate-300">Item Name</th>
                        <th className="px-3 py-2 text-left text-slate-300">Unit</th>
                        <th className="px-3 py-2 text-left text-slate-300">Stock Type</th>
                        <th className="px-3 py-2 text-left text-slate-300">Category</th>
                        <th className="px-3 py-2 text-left text-slate-300">Warehouse</th>
                        <th className="px-3 py-2 text-right text-slate-300">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newRows.map((row) => (
                        <tr key={row.__rowIndex} className="border-b border-slate-700 hover:bg-slate-800/50">
                          <td className="px-3 py-2 text-white">{row.name}</td>
                          <td className="px-3 py-2 text-slate-300">{row.unit}</td>
                          <td className="px-3 py-2 text-slate-300">{row.stockType}</td>
                          <td className="px-3 py-2 text-slate-300">{row.category || '-'}</td>
                          <td className="px-3 py-2 text-slate-300">{row.warehouse || '-'}</td>
                          <td className="px-3 py-2 text-right text-slate-300">
                            {typeof row.unitCost === 'number' ? row.unitCost.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : previewTab === 'duplicates' ? (
              <div className="space-y-3">
                {duplicateRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No duplicate materials</p>
                ) : (
                  <>
                    <div className="rounded-lg border border-blue-900 bg-blue-950/30 p-3">
                      <p className="text-sm text-blue-300">
                        When updating duplicates, the <strong>Opening Stock</strong> field is ignored. Only schema
                        fields such as unit, category, warehouse, costing, and stock rules are updated.
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAllRows((prev) =>
                          prev.map((row) => (row.__isDuplicate ? { ...row, __action: 'update' } : row))
                        );
                      }}
                    >
                      Select All to Update
                    </Button>

                    <div className="max-h-64 overflow-x-auto rounded-lg bg-slate-900">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="sticky top-0 border-b border-slate-700 bg-slate-800">
                            <th className="px-3 py-2 text-left text-slate-300">Item Name</th>
                            <th className="px-3 py-2 text-left text-slate-300">Unit</th>
                            <th className="px-3 py-2 text-left text-slate-300">Stock Type</th>
                            <th className="px-3 py-2 text-left text-slate-300">Matched Existing Record</th>
                            <th className="px-3 py-2 text-center text-slate-300">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicateRows.map((row) => (
                            <tr key={row.__rowIndex} className="border-b border-slate-700 hover:bg-slate-800/50">
                              <td className="px-3 py-2 text-white">{row.name}</td>
                              <td className="px-3 py-2 text-slate-300">{row.unit}</td>
                              <td className="px-3 py-2 text-slate-300">{row.stockType}</td>
                              <td className="px-3 py-2 text-xs text-amber-200">{row.__duplicateReason || '-'}</td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => {
                                      setAllRows((prev) =>
                                        prev.map((entry) =>
                                          entry.__rowIndex === row.__rowIndex
                                            ? { ...entry, __action: 'update' }
                                            : entry
                                        )
                                      );
                                    }}
                                    className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                                      row.__action === 'update'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                  >
                                    Update
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAllRows((prev) =>
                                        prev.map((entry) =>
                                          entry.__rowIndex === row.__rowIndex
                                            ? { ...entry, __action: 'skip' }
                                            : entry
                                        )
                                      );
                                    }}
                                    className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                                      row.__action === 'skip'
                                        ? 'bg-slate-600 text-white'
                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                                  >
                                    Skip
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {invalidRows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No invalid rows</p>
                ) : (
                  <>
                    <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-3">
                      <p className="text-sm text-amber-300">
                        These rows were excluded from import. Fix the listed validation issues in the source file and upload again.
                      </p>
                    </div>

                    <div className="max-h-72 overflow-x-auto rounded-lg bg-slate-900">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="sticky top-0 border-b border-slate-700 bg-slate-800">
                            <th className="px-3 py-2 text-left text-slate-300">Row</th>
                            <th className="px-3 py-2 text-left text-slate-300">Item Name</th>
                            <th className="px-3 py-2 text-left text-slate-300">Validation Errors</th>
                            <th className="px-3 py-2 text-left text-slate-300">Source Data</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invalidRows.map((row) => (
                            <tr key={row.__rowIndex} className="border-b border-slate-700 align-top hover:bg-slate-800/50">
                              <td className="px-3 py-2 text-slate-300">{row.__rowIndex + 2}</td>
                              <td className="px-3 py-2 text-white">{row.name || '-'}</td>
                              <td className="px-3 py-2">
                                <div className="space-y-1">
                                  {row.__errors.map((error) => (
                                    <div key={error} className="rounded bg-red-950/40 px-2 py-1 text-xs text-red-200">
                                      {error}
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-400">
                                <div className="space-y-1">
                                  {headers.map((header, index) => (
                                    <div key={`${row.__rowIndex}-${header}-${index}`}>
                                      <span className="text-slate-500">{header}:</span>{' '}
                                      <span>{row.__sourceValues[index] || '-'}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-lg bg-slate-800/50 p-3 text-sm text-slate-300">
              <p>
                Ready to import: <span className="font-semibold">{newRows.length}</span> new +{' '}
                <span className="font-semibold">{selectedForUpdate.length}</span> updates
              </p>
              <div className="space-y-1 text-xs text-slate-400">
                <p>New items create base UOMs and opening-stock batches.</p>
                <p>Duplicate updates preserve live stock and only refresh the master data.</p>
              </div>
            </div>

            <div className="flex gap-3 border-t border-slate-700 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} fullWidth>
                Back
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                loading={isSubmitting}
                disabled={newRows.length === 0 && selectedForUpdate.length === 0}
                fullWidth
              >
                Import {newRows.length + selectedForUpdate.length} rows
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
