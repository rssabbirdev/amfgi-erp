'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppDispatch } from '@/store/hooks';
import { fetchMaterials } from '@/store/slices/materialsSlice';
import { Button } from '@/components/ui/Button';
import SearchSelect from '@/components/ui/SearchSelect';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

interface Material {
  _id: string;
  name: string;
  unit: string;
  currentStock: number;
  unitCost?: number;
}

interface Supplier {
  id: string;
  label: string;
}

interface LineItem {
  id: string;
  materialId: string;
  quantity: string;
  unitCost: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyLine(): LineItem {
  return { id: uid(), materialId: '', quantity: '', unitCost: '' };
}

export default function ReceiveStockPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: session } = useSession();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [includeTax, setIncludeTax] = useState(true);
  const TAX_RATE = 0.05; // 5%
  const [submitting, setSubmitting] = useState(false);

  // Auto-generate receipt number on mount
  useEffect(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 900 + 100);
    setReceiptNumber(`GRN-${yyyy}${mm}${dd}-${rand}`);
  }, []);

  // Load materials and suppliers
  useEffect(() => {
    Promise.all([
      fetch('/api/materials')
        .then((r) => r.json())
        .then((j) => setMaterials(j.data ?? [])),
      fetch('/api/suppliers')
        .then((r) => r.json())
        .then((j) =>
          setSuppliers(
            (j.data?.suppliers ?? []).map((s: any) => ({
              id: s._id,
              label: s.name,
            }))
          )
        ),
    ]);
  }, []);

  // Line operations
  const updateLine = (id: string, field: keyof LineItem, value: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, [field]: value };
        // Auto-fill unit cost from material master when material is selected
        if (field === 'materialId' && value) {
          const mat = materials.find((m) => m._id === value);
          if (mat?.unitCost !== undefined) {
            updated.unitCost = String(mat.unitCost);
          }
        }
        return updated;
      })
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (id: string) => {
    if (lines.length === 1) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const duplicateLine = (id: string) => {
    const src = lines.find((l) => l.id === id);
    if (!src) return;
    const idx = lines.findIndex((l) => l.id === id);
    const copy = { ...src, id: uid() };
    setLines((prev) => [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]);
  };

  // Computed values
  const getMaterial = (id: string) => materials.find((m) => m._id === id);
  const getSupplier = (id: string) => suppliers.find((s) => s.id === id);

  const lineTotal = (line: LineItem) => {
    const qty = parseFloat(line.quantity) || 0;
    const cost = parseFloat(line.unitCost) || 0;
    return qty * cost;
  };

  const subTotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);
  const taxAmount = includeTax ? subTotal * TAX_RATE : 0;
  const billAmount = subTotal + taxAmount;
  const totalQtyLines = lines.filter((l) => l.materialId && parseFloat(l.quantity) > 0).length;

  // Validation
  const validLines = lines.filter((l) => l.materialId && parseFloat(l.quantity) > 0);

  const duplicateMaterials = validLines
    .map((l) => l.materialId)
    .filter((id, i, arr) => arr.indexOf(id) !== i);

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validLines.length === 0) {
      toast.error('Add at least one line item with material and quantity');
      return;
    }
    if (duplicateMaterials.length > 0) {
      toast.error('Duplicate materials found — merge them into one row');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/transactions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'STOCK_IN',
          receiptNumber,
          supplier: getSupplier(supplierId)?.label || undefined,
          notes: notes || undefined,
          date,
          billAmount,
          includeTax,
          taxAmount,
          lines: validLines.map((l) => ({
            materialId: l.materialId,
            quantity: parseFloat(l.quantity),
            unitCost: l.unitCost ? parseFloat(l.unitCost) : undefined,
          })),
          // Update material unit costs
          materialUpdates: validLines
            .filter((l) => l.unitCost)
            .map((l) => ({
              materialId: l.materialId,
              unitCost: parseFloat(l.unitCost),
            })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Submission failed');
      }

      const json = await res.json();
      dispatch(fetchMaterials());
      toast.success(`Receipt posted — ${json.data.created} item(s) received`);
      router.push('/materials');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/materials" className="text-slate-500 hover:text-slate-300 text-sm">
              ← Materials
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">Goods Receipt Note</h1>
          <p className="text-slate-400 text-sm mt-0.5">Receive stock into inventory against a supplier bill</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-0">
        {/* Bill Header */}
        <div className="rounded-t-xl bg-slate-800 border border-slate-700 border-b-0 p-6">
          <div className="flex items-start justify-between mb-6 pb-5 border-b border-slate-700">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <div>
                  <p className="font-bold text-white text-lg leading-tight">Almuraqib FGI</p>
                  <p className="text-xs text-slate-400">Goods Receipt Note</p>
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Receipt No.</p>
              <input
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                required
                className="text-right text-emerald-400 font-mono font-bold text-lg bg-transparent border-b border-slate-600 focus:border-emerald-500 focus:outline-none pb-0.5 w-52"
              />
            </div>
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <SearchSelect
                label="Supplier / Vendor"
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Search suppliers..."
                items={suppliers}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Receipt Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Notes / Remarks
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional remarks"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="border border-slate-700 border-b-0 bg-slate-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[220px]">Material</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-20">Unit</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">Stock</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Qty *</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Unit Cost (AED)</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Total</th>
                <th className="px-2 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const mat = getMaterial(line.materialId);
                const isDup = duplicateMaterials.includes(line.materialId);
                const total = lineTotal(line);

                return (
                  <tr
                    key={line.id}
                    className={`border-b border-slate-700/60 transition-colors ${
                      isDup ? 'bg-red-900/10' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>

                    <td className="px-4 py-2">
                      <SearchSelect
                        value={line.materialId}
                        onChange={(id) => updateLine(line.id, 'materialId', id)}
                        placeholder="Search materials..."
                        disabled={false}
                        items={materials.map((m) => ({
                          id: m._id,
                          label: m.name,
                          searchText: m.unit,
                        }))}
                        renderItem={(item) => (
                          <div>
                            <div className="font-medium text-white">{item.label}</div>
                            <div className="text-xs text-slate-400">{item.searchText}</div>
                          </div>
                        )}
                      />
                      {isDup && <p className="text-red-400 text-xs mt-0.5">Duplicate — merge rows</p>}
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span className="text-slate-400 text-xs font-medium">{mat?.unit ?? '—'}</span>
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-sm">
                      {mat ? (
                        <span className={mat.currentStock <= 0 ? 'text-red-400' : 'text-slate-300'}>
                          {mat.currentStock}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="0.000"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-md text-white text-sm text-right font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={line.unitCost}
                        onChange={(e) => updateLine(line.id, 'unitCost', e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-600 rounded-md text-slate-300 text-sm text-right font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                    </td>

                    <td className="px-3 py-2 text-right font-mono text-sm">
                      {total > 0 ? (
                        <span className="text-white font-medium">
                          {total.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          type="button"
                          title="Duplicate"
                          onClick={() => duplicateLine(line.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Remove"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length === 1}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              <tr className="border-b border-slate-700/30">
                <td colSpan={8} className="px-4 py-2">
                  <button
                    type="button"
                    onClick={addLine}
                    className="flex items-center gap-1.5 text-emerald-500 hover:text-emerald-400 text-sm font-medium transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Material
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summary & Tax */}
        <div className="bg-slate-800 border border-slate-700 border-t-0 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tax toggle */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTax}
                  onChange={(e) => setIncludeTax(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-sm font-medium text-slate-300">Include 5% Tax (VAT)</span>
              </label>
              <p className="text-xs text-slate-500">Tax will be {includeTax ? 'added to' : 'excluded from'} bill total</p>
            </div>

            {/* Summary */}
            <div className="space-y-2 text-right">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Subtotal:</span>
                <span className="text-white font-mono">
                  {subTotal.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {includeTax && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tax (5%):</span>
                  <span className="text-white font-mono">
                    {taxAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-700">
                <span className="text-white">Bill Amount:</span>
                <span className="text-emerald-400 font-mono">
                  {billAmount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="rounded-b-xl bg-slate-800 border border-slate-700 border-t-0 p-4 flex gap-3 justify-between">
          <div></div>
          <div className="flex gap-3">
            <Link href="/materials">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={submitting}>
              Post Receipt
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
