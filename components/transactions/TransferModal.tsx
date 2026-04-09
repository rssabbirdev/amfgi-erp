'use client';

import { useState }              from 'react';
import { useSession }            from 'next-auth/react';
import Modal                     from '@/components/ui/Modal';
import { Button }                from '@/components/ui/Button';
import toast                     from 'react-hot-toast';
import {
  useGetMaterialsQuery,
  useGetCompaniesQuery,
  useTransferStockMutation,
} from '@/store/hooks';

interface Material { id: string; name: string; unit: string; currentStock: number }
interface Company  { id: string; name: string; slug: string }

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function TransferModal({ isOpen, onClose, onSuccess }: Props) {
  const { data: session } = useSession();
  const { data: materialsData = [] } = useGetMaterialsQuery();
  const { data: companiesData = [] } = useGetCompaniesQuery();
  const [transferStock, { isLoading: loading }] = useTransferStockMutation();

  const [materialId, setMaterialId] = useState('');
  const [destId,     setDestId]     = useState('');
  const [quantity,   setQuantity]   = useState('');
  const [notes,      setNotes]      = useState('');
  const [date,       setDate]       = useState(() => new Date().toISOString().slice(0, 10));

  // Exclude the currently active company
  const companies = companiesData.filter(
    (c) => c.id !== session?.user?.activeCompanyId
  );
  const materials = materialsData;

  const selectedMaterial = materials.find((m) => m.id === materialId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destId) { toast.error('Select a destination company'); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }

    try {
      await transferStock({
        materialId,
        quantity: qty,
        destinationCompanyId: destId,
        notes: notes || undefined,
      }).unwrap();

      toast.success(
        `Transferred ${qty} ${selectedMaterial?.unit ?? ''} of ${selectedMaterial?.name ?? ''} to ${companies.find((c) => c.id === destId)?.name}`
      );
      onSuccess();
      onClose();
      // Reset
      setMaterialId(''); setDestId(''); setQuantity(''); setNotes('');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Transfer failed');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Inter-Company Transfer">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-xs text-blue-300">
          Stock will be deducted from <strong>{session?.user?.activeCompanyName}</strong> and credited to the destination company.
          The material will be auto-created in the destination if it does not exist.
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Material *</label>
          <select
            required
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">Select material…</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — Stock: {m.currentStock} {m.unit}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Destination Company *</label>
          <select
            required
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">Select company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Quantity *</label>
            <div className="relative">
              <input
                type="number"
                required
                min="0.001"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-16"
              />
              {selectedMaterial && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  {selectedMaterial.unit}
                </span>
              )}
            </div>
            {selectedMaterial && (
              <p className="text-xs text-slate-500 mt-1">
                Available: {selectedMaterial.currentStock} {selectedMaterial.unit}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional transfer notes"
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" loading={loading} fullWidth>Transfer Stock</Button>
        </div>
      </form>
    </Modal>
  );
}
