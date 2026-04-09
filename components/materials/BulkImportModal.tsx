'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { useBulkCreateMaterialsMutation, useGetMaterialsQuery, type Material } from '@/store/hooks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingMaterials: Material[];
}

interface MaterialRow {
  name: string;
  description?: string;
  unit: string;
  category?: string;
  warehouse?: string;
  stockType: string;
  externalItemName?: string;
  unitCost?: number;
  reorderLevel?: number;
  currentStock?: number;
  [key: string]: any;
}

interface MappedRow extends MaterialRow {
  __rowIndex: number;
  __errors: string[];
}

interface PreviewRow extends MappedRow {
  __isDuplicate: boolean;
  __action: 'update' | 'skip';
}

const SYSTEM_FIELDS = [
  { key: 'name', label: 'Item Name', required: true },
  { key: 'unit', label: 'Unit', required: true },
  { key: 'stockType', label: 'Stock Type', required: true },
  { key: 'category', label: 'Category', required: false },
  { key: 'warehouse', label: 'Warehouse', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'externalItemName', label: 'External Item Name', required: false },
  { key: 'unitCost', label: 'Unit Cost', required: false },
  { key: 'reorderLevel', label: 'Reorder Level', required: false },
  { key: 'currentStock', label: 'Opening Stock', required: false },
  { key: '__skip__', label: '— Skip column —', required: false },
];

function autoMap(header: string): string {
  const h = header.toLowerCase().trim();
  const match = SYSTEM_FIELDS.find(
    (f) => f.key.toLowerCase() === h || f.label.toLowerCase() === h
  );
  return match?.key ?? '__skip__';
}

export default function BulkImportModal({ isOpen, onClose, existingMaterials }: Props) {
  const { data: materials = [] } = useGetMaterialsQuery();
  const [bulkCreate, { isLoading: isSubmitting }] = useBulkCreateMaterialsMutation();

  // ──────────── STEP 0: Upload ────────────
  const [step, setStep] = useState(0);
  const [rawRows, setRawRows] = useState<(string | number | boolean | null)[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // ──────────── STEP 1: Mapping ────────────
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [autoMapped, setAutoMapped] = useState<Set<number>>(new Set());

  // ──────────── STEP 2: Preview ────────────
  const [previewTab, setPreviewTab] = useState<'new' | 'duplicates'>('new');
  const [allRows, setAllRows] = useState<PreviewRow[]>([]);

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

        const excelHeaders = String(rows[0]).split(',').map((h) => String(h).trim());
        const dataRows = rows.slice(1);

        setHeaders(excelHeaders);
        setRawRows(dataRows);

        // Auto-map
        const newMapping: Record<number, string> = {};
        const newAutoMapped = new Set<number>();
        excelHeaders.forEach((header, idx) => {
          const mapped = autoMap(header);
          newMapping[idx] = mapped;
          if (mapped !== '__skip__') {
            newAutoMapped.add(idx);
          }
        });

        setMapping(newMapping);
        setAutoMapped(newAutoMapped);
        setStep(1);
      } catch (err) {
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const canAdvanceFromMapping = useCallback(() => {
    const requiredFields = SYSTEM_FIELDS.filter((f) => f.required).map((f) => f.key);
    const mappedFields = Object.values(mapping).filter((k) => k !== '__skip__');
    return requiredFields.every((field) => mappedFields.includes(field));
  }, [mapping]);

  const handlePreview = useCallback(() => {
    const existingNamesLower = new Set(materials.map((m) => m.name.toLowerCase()));

    const parsedRows: MappedRow[] = rawRows
      .map((row, rowIndex) => {
        const parsed: MappedRow = { __rowIndex: rowIndex, __errors: [] } as any;

        headers.forEach((_, colIndex) => {
          const fieldKey = mapping[colIndex];
          if (fieldKey === '__skip__') return;

          const value = row[colIndex];
          const fieldDef = SYSTEM_FIELDS.find((f) => f.key === fieldKey);
          if (!fieldDef) return;

          if (fieldDef.required && !value) {
            parsed.__errors.push(`Missing required field: ${fieldDef.label}`);
          }

          if (fieldKey === 'unitCost' || fieldKey === 'reorderLevel' || fieldKey === 'currentStock') {
            parsed[fieldKey] = typeof value === 'number' ? value : parseFloat(String(value));
          } else {
            parsed[fieldKey] = String(value || '').trim();
          }
        });

        return parsed;
      })
      .filter((row) => row.__errors.length === 0); // Exclude rows with errors

    const errorCount = rawRows.length - parsedRows.length;

    const previewRows: PreviewRow[] = parsedRows.map((row) => ({
      ...row,
      __isDuplicate: existingNamesLower.has(String(row.name || '').toLowerCase()),
      __action: 'skip' as const,
    }));

    setAllRows(previewRows);
    if (errorCount > 0) {
      toast.error(`${errorCount} row(s) excluded due to validation errors`);
    }
    setPreviewTab('new');
    setStep(2);
  }, [rawRows, headers, mapping, materials]);

  const newRows = allRows.filter((r) => !r.__isDuplicate);
  const duplicateRows = allRows.filter((r) => r.__isDuplicate);

  const selectedForUpdate = duplicateRows.filter((r) => r.__action === 'update');

  const handleSubmit = async () => {
    if (newRows.length === 0 && selectedForUpdate.length === 0) {
      toast.error('No rows to import. Please create or select duplicates to update.');
      return;
    }

    const cleanRows = (rows: PreviewRow[]): MaterialRow[] =>
      rows.map(({ __rowIndex, __errors, __isDuplicate, __action, ...rest }) => rest);

    try {
      const result = await bulkCreate({
        newRows: cleanRows(newRows),
        updateRows: cleanRows(selectedForUpdate),
      }).unwrap();

      toast.success(`Imported ${result.created} new, updated ${result.updated}`);
      setStep(0);
      setRawRows([]);
      setHeaders([]);
      setMapping({});
      setAutoMapped(new Set());
      setAllRows([]);
      setPreviewTab('new');
      onClose();
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Import failed');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Import Materials" size="xl">
      <div className="space-y-4">
        {/* ────────────── STEP 0: Upload ─────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Upload an Excel file with your materials list</p>
            <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="cursor-pointer block">
                <svg className="h-12 w-12 mx-auto text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
                <p className="text-white font-medium">Click to upload or drag and drop</p>
                <p className="text-sm text-slate-400 mt-1">Excel (.xlsx, .xls) or CSV files</p>
              </label>
            </div>
          </div>
        )}

        {/* ────────────── STEP 1: Mapping ─────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Map your Excel columns to system fields</p>
            <div className="bg-slate-900 rounded-lg overflow-y-auto max-h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 border-b border-slate-700">
                    <th className="px-4 py-2 text-left text-slate-300">Excel Column</th>
                    <th className="px-4 py-2 text-left text-slate-300">Map To</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((header, idx) => (
                    <tr key={idx} className="border-b border-slate-700 hover:bg-slate-800/50">
                      <td className="px-4 py-2">
                        <div className="text-white">{header}</div>
                        {autoMapped.has(idx) && <div className="text-xs text-emerald-400 mt-1">Auto-matched</div>}
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
                          className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-emerald-500"
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

            {!canAdvanceFromMapping() && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-3">
                <p className="text-sm text-red-300">Required fields not mapped: Item Name, Unit, Stock Type</p>
              </div>
            )}

            <div className="flex gap-3 pt-2 border-t border-slate-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setStep(0);
                  setRawRows([]);
                  setHeaders([]);
                }}
                fullWidth
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={handlePreview}
                disabled={!canAdvanceFromMapping()}
                fullWidth
              >
                Preview
              </Button>
            </div>
          </div>
        )}

        {/* ────────────── STEP 2: Preview ─────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex gap-2 border-b border-slate-700">
              <button
                onClick={() => setPreviewTab('new')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  previewTab === 'new'
                    ? 'border-b-2 border-emerald-500 text-white'
                    : 'text-slate-400 hover:text-white'
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
            </div>

            {/* New Tab */}
            {previewTab === 'new' && (
              <div className="bg-slate-900 rounded-lg overflow-x-auto max-h-64">
                {newRows.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 text-sm">No new materials</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 border-b border-slate-700 sticky top-0">
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
                          <td className="px-3 py-2 text-slate-300">{row.category || '—'}</td>
                          <td className="px-3 py-2 text-slate-300">{row.warehouse || '—'}</td>
                          <td className="px-3 py-2 text-right text-slate-300">{row.unitCost?.toFixed(2) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Duplicates Tab */}
            {previewTab === 'duplicates' && (
              <div className="space-y-3">
                {duplicateRows.length === 0 ? (
                  <p className="text-center py-8 text-slate-400 text-sm">No duplicate materials</p>
                ) : (
                  <>
                    <div className="bg-blue-950/30 border border-blue-900 rounded-lg p-3">
                      <p className="text-sm text-blue-300">
                        ℹ️ When updating duplicates, the <strong>Opening Stock</strong> field will NOT be modified.
                        Only other fields (Unit, Category, etc.) will be updated.
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setAllRows((prev) =>
                          prev.map((r) => (r.__isDuplicate ? { ...r, __action: 'update' as const } : r))
                        );
                      }}
                    >
                      Select All → Update
                    </Button>

                    <div className="bg-slate-900 rounded-lg overflow-x-auto max-h-64">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-800 border-b border-slate-700 sticky top-0">
                            <th className="px-3 py-2 text-left text-slate-300">Item Name</th>
                            <th className="px-3 py-2 text-left text-slate-300">Unit</th>
                            <th className="px-3 py-2 text-left text-slate-300">Stock Type</th>
                            <th className="px-3 py-2 text-center text-slate-300">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duplicateRows.map((row) => (
                            <tr key={row.__rowIndex} className="border-b border-slate-700 hover:bg-slate-800/50">
                              <td className="px-3 py-2 text-white">{row.name}</td>
                              <td className="px-3 py-2 text-slate-300">{row.unit}</td>
                              <td className="px-3 py-2 text-slate-300">{row.stockType}</td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex justify-center gap-2">
                                  <button
                                    onClick={() => {
                                      setAllRows((prev) =>
                                        prev.map((r) =>
                                          r.__rowIndex === row.__rowIndex
                                            ? { ...r, __action: 'update' as const }
                                            : r
                                        )
                                      );
                                    }}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
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
                                        prev.map((r) =>
                                          r.__rowIndex === row.__rowIndex
                                            ? { ...r, __action: 'skip' as const }
                                            : r
                                        )
                                      );
                                    }}
                                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
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
            )}

            <div className="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 space-y-2">
              <p>Ready to import: <span className="font-semibold">{newRows.length}</span> new + <span className="font-semibold">{selectedForUpdate.length}</span> updates</p>
              <div className="text-xs text-slate-400 space-y-1">
                <p>• <strong>New items:</strong> Opening Stock creates StockBatch records for inventory tracking</p>
                <p>• <strong>Updates:</strong> Opening Stock field will NOT be changed for existing materials</p>
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(1)}
                fullWidth
              >
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
        )}
      </div>
    </Modal>
  );
}
