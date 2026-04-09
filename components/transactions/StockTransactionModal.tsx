'use client';

import { useState, useEffect }    from 'react';
import Modal                      from '@/components/ui/Modal';
import { Button }                 from '@/components/ui/Button';
import toast                      from 'react-hot-toast';

interface Material { id: string; name: string; unit: string; currentStock: number }
interface Job      { id: string; jobNumber: string; description: string }

interface JobMaterialSummary {
  materialId:       string;
  materialName:     string;
  unit:             string;
  availableToReturn: number;
}

interface Props {
  isOpen:     boolean;
  onClose:    () => void;
  onSuccess:  () => void;
  mode:       'STOCK_OUT' | 'RETURN' | 'STOCK_IN';
  preselectedJobId?: string;
}

export default function StockTransactionModal({ isOpen, onClose, onSuccess, mode, preselectedJobId }: Props) {

  const [materials,      setMaterials]      = useState<Material[]>([]);
  const [jobs,           setJobs]           = useState<Job[]>([]);
  const [jobSummary,     setJobSummary]     = useState<JobMaterialSummary[]>([]);
  const [materialId,     setMaterialId]     = useState('');
  const [jobId,          setJobId]          = useState(preselectedJobId ?? '');
  const [quantity,       setQuantity]       = useState('');
  const [notes,          setNotes]          = useState('');
  const [date,           setDate]           = useState(new Date().toISOString().split('T')[0]);
  const [loading,        setLoading]        = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/materials').then((r) => r.json()).then((j) => setMaterials(j.data ?? []));
    if (mode !== 'STOCK_IN') {
      fetch('/api/jobs?status=ACTIVE').then((r) => r.json()).then((j) => setJobs(j.data ?? []));
    }
  }, [isOpen, mode]);

  useEffect(() => {
    if (preselectedJobId) setJobId(preselectedJobId);
  }, [preselectedJobId]);

  // For RETURN mode: fetch what's available to return for selected job
  useEffect(() => {
    if (mode !== 'RETURN' || !jobId) return;
    fetch(`/api/jobs/${jobId}/materials`)
      .then((r) => r.json())
      .then((j) => setJobSummary(j.data ?? []));
  }, [mode, jobId]);

  const availableToReturn = mode === 'RETURN'
    ? (jobSummary.find((s) => s.materialId === materialId)?.availableToReturn ?? Infinity)
    : Infinity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) { toast.error('Invalid quantity'); return; }
    if (mode === 'RETURN' && qty > availableToReturn) {
      toast.error(`Max returnable: ${availableToReturn}`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/transactions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:       mode,
          materialId,
          quantity:   qty,
          jobId:      mode === 'STOCK_IN' ? null : jobId,
          notes,
          date,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Transaction failed');
      }

      toast.success(
        mode === 'STOCK_IN'  ? 'Stock received successfully' :
        mode === 'STOCK_OUT' ? 'Material dispatched' :
                               'Return recorded'
      );
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMaterialId(''); setJobId(preselectedJobId ?? '');
    setQuantity(''); setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    onClose();
  };

  const titles = {
    STOCK_IN:  'Receive Stock',
    STOCK_OUT: 'Dispatch Materials',
    RETURN:    'End-of-Day Return',
  };

  const returnableMaterials = mode === 'RETURN' && jobId
    ? materials.filter((m) => jobSummary.some((s) => s.materialId === m.id && s.availableToReturn > 0))
    : materials;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={titles[mode]} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Job selector (not for STOCK_IN) */}
        {mode !== 'STOCK_IN' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Job *</label>
            <select
              required
              value={jobId}
              onChange={(e) => { setJobId(e.target.value); setMaterialId(''); }}
              disabled={!!preselectedJobId}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            >
              <option value="">Select job...</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.jobNumber} — {j.description}</option>
              ))}
            </select>
          </div>
        )}

        {/* Material selector */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Material *</label>
          <select
            required
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Select material...</option>
            {returnableMaterials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.unit})
                {mode === 'STOCK_OUT' ? ` — stock: ${m.currentStock}` : ''}
              </option>
            ))}
          </select>
          {mode === 'RETURN' && materialId && (
            <p className="text-xs text-emerald-400 mt-1">
              Max returnable: {availableToReturn}
            </p>
          )}
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Quantity *</label>
          <input
            type="number"
            required
            min="0.001"
            step="0.001"
            max={mode === 'RETURN' ? availableToReturn : undefined}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            placeholder="0.000"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
            placeholder="Optional notes..."
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} fullWidth>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            fullWidth
            variant={mode === 'RETURN' ? 'secondary' : 'primary'}
          >
            {titles[mode]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
