'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import SearchSelect from '@/components/ui/SearchSelect';
import toast from 'react-hot-toast';

export interface SubcontractMaterialLineRow {
  id: string;
  materialName: string;
  materialUnit: string;
  issuedQty: number;
  receivedQty: number;
  outstandingQty: number;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
}

interface SubcontractReceivePanelProps {
  deliveryNoteId: string;
  lines: SubcontractMaterialLineRow[];
  warehouses: Array<{ id: string; name: string }>;
  transitStatus?: string | null;
  onReceived: () => void;
}

export default function SubcontractReceivePanel({
  deliveryNoteId,
  lines,
  warehouses,
  transitStatus,
  onReceived,
}: SubcontractReceivePanelProps) {
  const [receiveQtyByLine, setReceiveQtyByLine] = useState<Record<string, string>>({});
  const [destByLine, setDestByLine] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const openLines = useMemo(
    () => lines.filter((line) => line.outstandingQty > 0.0005),
    [lines]
  );

  const fillAllOutstanding = () => {
    const next: Record<string, string> = {};
    for (const line of openLines) {
      next[line.id] = String(line.outstandingQty);
      if (!destByLine[line.id]) {
        setDestByLine((prev) => ({ ...prev, [line.id]: line.sourceWarehouseId }));
      }
    }
    setReceiveQtyByLine((prev) => ({ ...prev, ...next }));
  };

  const handleReceive = async () => {
    const payload = openLines
      .map((line) => {
        const qty = Number.parseFloat(receiveQtyByLine[line.id] ?? '');
        if (!Number.isFinite(qty) || qty <= 0) return null;
        return {
          lineId: line.id,
          receiveQty: qty,
          destinationWarehouseId: destByLine[line.id] || line.sourceWarehouseId,
        };
      })
      .filter(Boolean) as Array<{ lineId: string; receiveQty: number; destinationWarehouseId: string }>;

    if (payload.length === 0) {
      toast.error('Enter receive quantity for at least one line');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/delivery-notes/${encodeURIComponent(deliveryNoteId)}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Failed to receive material');
        return;
      }
      toast.success('Material received');
      setReceiveQtyByLine({});
      onReceived();
    } catch {
      toast.error('Failed to receive material');
    } finally {
      setSubmitting(false);
    }
  };

  if (lines.length === 0) return null;

  return (
    <div className="border-b border-border bg-muted/20 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Receive from subcontractor</h3>
          <p className="text-xs text-muted-foreground">
            Status: {transitStatus ?? 'ON_TRANSIT'} — return stock to source warehouse by default
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={fillAllOutstanding} disabled={openLines.length === 0}>
            Fill all outstanding
          </Button>
          <Button type="button" size="sm" onClick={handleReceive} disabled={submitting || openLines.length === 0}>
            {submitting ? 'Receiving…' : 'Receive'}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2">Material</th>
              <th className="px-2 py-2 text-right">Issued</th>
              <th className="px-2 py-2 text-right">Received</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
              <th className="px-2 py-2 text-right">Receive qty</th>
              <th className="px-2 py-2">Destination</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border/60">
                <td className="px-2 py-2 font-medium">{line.materialName}</td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {line.issuedQty} {line.materialUnit}
                </td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {line.receivedQty} {line.materialUnit}
                </td>
                <td className="px-2 py-2 text-right font-mono text-xs">
                  {line.outstandingQty} {line.materialUnit}
                </td>
                <td className="px-2 py-2">
                  <input
                    type="text"
                    value={receiveQtyByLine[line.id] ?? ''}
                    onChange={(e) =>
                      setReceiveQtyByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                    disabled={line.outstandingQty <= 0.0005}
                    placeholder="0"
                    className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="px-2 py-2 min-w-[180px]">
                  <SearchSelect
                    value={destByLine[line.id] || line.sourceWarehouseId}
                    onChange={(id) => setDestByLine((prev) => ({ ...prev, [line.id]: id }))}
                    placeholder="Destination"
                    items={warehouses.map((w) => ({ id: w.id, label: w.name, searchText: w.name }))}
                    disabled={line.outstandingQty <= 0.0005}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
