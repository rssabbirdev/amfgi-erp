'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import SearchSelect from '@/components/ui/SearchSelect';
import { Badge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';
import {
  useGetJobsQuery,
  useGetCustomersQuery,
  useGetMaterialsQuery,
  useGetJobMaterialsQuery,
  useAddBatchTransactionMutation,
} from '@/store/hooks';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

interface CustomItem {
  id: string;
  name: string;
  description: string;
  unit: string;
  qty: string;
}

interface Line {
  id: string;
  jobId: string;
  materialId: string;
  dispatchQty: string;
  returnQty: string;
  originalDispatchQty?: number;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

export default function DeliveryNoteCreatePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: materials = [] } = useGetMaterialsQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();

  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [selectedJob, setSelectedJob] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [skipMaterialDispatch, setSkipMaterialDispatch] = useState(false);
  const [customItems, setCustomItems] = useState<CustomItem[]>([
    { id: generateId(), name: '', description: '', unit: '', qty: '' },
  ]);
  const [lines, setLines] = useState<Line[]>(() => [
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [signedCopyUrl, setSignedCopyUrl] = useState<string | null>(null);
  const [uploadingSignedCopy, setUploadingSignedCopy] = useState(false);
  const [changeWarningModal, setChangeWarningModal] = useState<{ open: boolean; pendingChange: PendingChange | null }>({
    open: false,
    pendingChange: null,
  });

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');

  const { data: jobMaterials = [] } = useGetJobMaterialsQuery(selectedJob, { skip: !selectedJob });

  // Parse delivery note number from notes
  const parseDeliveryNoteNumber = (notesText: string): number | null => {
    const match = notesText.match(/--- DELIVERY NOTE #(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Parse custom items from notes
  const parseCustomItems = (notesText: string): CustomItem[] => {
    const match = notesText.match(/--- DELIVERY NOTE ITEMS \(For Printing\) ---\n([\s\S]*?)(?=\n--- |$)/);
    if (!match) return [{ id: generateId(), name: '', description: '', unit: '', qty: '' }];

    const itemsText = match[1];
    const items = itemsText.split('\n').filter(line => line.startsWith('• '));

    if (items.length === 0) {
      return [{ id: generateId(), name: '', description: '', unit: '', qty: '' }];
    }

    return items.map(item => {
      // Format: • Name - Description | Qty Unit
      const cleanItem = item.replace('• ', '');
      const [leftPart, rightPart] = cleanItem.split(' | ');
      const [name, description] = leftPart.includes(' - ')
        ? leftPart.split(' - ')
        : [leftPart, ''];

      const [qtyStr, unit] = rightPart?.trim().split(' ') || ['', ''];

      return {
        id: generateId(),
        name: name.trim(),
        description: description?.trim() || '',
        unit: unit?.trim() || '',
        qty: qtyStr?.trim() || '',
      };
    });
  };

  // Load existing delivery note if editing or duplicating
  useEffect(() => {
    const transactionId = searchParams.get('transactionId');
    const duplicateFromId = searchParams.get('duplicateFrom');
    const sourceId = transactionId || duplicateFromId;
    const isDuplicating = !!duplicateFromId;

    if (sourceId) {
      // Only set editingTransactionId when actually editing (not duplicating)
      if (!isDuplicating) {
        setEditingTransactionId(sourceId);
      }
      setIsLoadingEdit(true);

      const loadTransaction = async () => {
        try {
          const res = await fetch(`/api/transactions/${sourceId}`);
          const data = await res.json();

          if (res.ok && data.data) {
            const txn = data.data;
            setSelectedJob(txn.jobId || '');
            // Duplicates default to today's date; edits keep the original date
            setDate(isDuplicating
              ? new Date().toISOString().split('T')[0]
              : new Date(txn.date).toISOString().split('T')[0]);

            // Parse custom items from notes
            const customItemsParsed = parseCustomItems(txn.notes || '');
            setCustomItems(customItemsParsed);

            // Extract base notes (without delivery note headers)
            let baseNotes = (txn.notes || '')
              .replace(/--- DELIVERY NOTE #\d+\n?/g, '')
              .replace(/--- DELIVERY NOTE ITEMS \(For Printing\) ---[\s\S]*?(?=\n--- |$)/g, '')
              .trim();
            setNotes(baseNotes);

            // Load signed copy URL if present
            setSignedCopyUrl(txn.signedCopyUrl || null);

            // Load the transaction's material(s)
            if (txn.material && txn.quantity) {
              setLines([
                {
                  id: generateId(),
                  jobId: txn.jobId || '',
                  materialId: txn.material.id,
                  dispatchQty: txn.quantity.toString(),
                  returnQty: '',
                  originalDispatchQty: txn.quantity,
                },
              ]);
            }

            if (isDuplicating) {
              // For duplicates: fetch a fresh delivery note number
              try {
                const numRes = await fetch('/api/delivery-notes/next-number');
                const numData = await numRes.json();
                if (numRes.ok && numData.data) {
                  setDeliveryNoteNumber(numData.data.nextNumber);
                }
              } catch (err) {
                console.error('Failed to fetch next delivery note number');
              }
            } else {
              // For edits: keep the original delivery note number
              const dnNumber = parseDeliveryNoteNumber(txn.notes || '');
              if (dnNumber) {
                setDeliveryNoteNumber(dnNumber);
              }
            }
          } else {
            toast.error(data.error || 'Failed to load delivery note');
            router.push('/dispatch');
          }
        } catch (err) {
          console.error('Failed to load transaction:', err);
          toast.error('Failed to load delivery note');
          router.push('/dispatch');
        } finally {
          setIsLoadingEdit(false);
        }
      };

      loadTransaction();
    } else {
      // Create mode: load next delivery note number
      const fetchNextNumber = async () => {
        try {
          const res = await fetch('/api/delivery-notes/next-number');
          const data = await res.json();
          if (res.ok && data.data) {
            setDeliveryNoteNumber(data.data.nextNumber);
          }
        } catch (err) {
          console.error('Failed to fetch delivery note number');
        }
      };
      fetchNextNumber();
    }
  }, [searchParams, router]);

  // Load from query params if provided (create mode)
  useEffect(() => {
    if (editingTransactionId) return; // Skip if editing
    if (searchParams.get('duplicateFrom')) return; // Skip if duplicating (handled in load effect)

    const jobId = searchParams.get('jobId');
    const dateParam = searchParams.get('date');

    if (jobId && dateParam) {
      setSelectedJob(jobId);
      setDate(dateParam);
    }
  }, [searchParams, editingTransactionId]);

  const hasData = () => customItems.some(item => item.name.trim()) || lines.some(l => l.materialId || l.dispatchQty);

  const handleJobChange = (newJobId: string) => {
    if (hasData()) {
      setChangeWarningModal({
        open: true,
        pendingChange: { type: 'job', newValue: newJobId },
      });
    } else {
      setSelectedJob(newJobId);
    }
  };

  const handleDateChange = (newDate: string) => {
    if (hasData()) {
      setChangeWarningModal({
        open: true,
        pendingChange: { type: 'date', newValue: newDate },
      });
    } else {
      setDate(newDate);
    }
  };

  const confirmChange = () => {
    if (!changeWarningModal.pendingChange) return;
    const { type, newValue } = changeWarningModal.pendingChange;
    if (type === 'job') setSelectedJob(newValue);
    if (type === 'date') setDate(newValue);
    setCustomItems([{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);
    setLines(Array.from({ length: 3 }, () => ({
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    })));
    setNotes('');
    setSkipMaterialDispatch(false);
    setChangeWarningModal({ open: false, pendingChange: null });
  };

  const addCustomItem = () => {
    setCustomItems([...customItems, { id: generateId(), name: '', description: '', unit: '', qty: '' }]);
  };

  const removeCustomItem = (id: string) => {
    if (customItems.length > 1) {
      setCustomItems(customItems.filter(item => item.id !== id));
    }
  };

  const updateCustomItem = (id: string, field: string, value: string) => {
    setCustomItems(customItems.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const addLine = () => {
    setLines((prev) => [...prev, {
      id: generateId(),
      jobId: selectedJob,
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) => l.id === id ? { ...l, [field]: value } : l)
    );
  };

  const getMaterial = (id: string) => materials.find((m) => m.id === id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedJob) {
      toast.error('Select a job');
      return;
    }

    // Get valid materials lines
    const validLines = lines.filter(line => line.materialId && line.dispatchQty);

    // Get valid custom items
    const validCustomItems = customItems.filter(item => item.name.trim());

    // Validation: either have materials, or have custom items (if skipping materials), or both
    if (skipMaterialDispatch) {
      // If skipping materials, at least need custom items
      if (validCustomItems.length === 0) {
        toast.error('Add at least one custom item');
        return;
      }
    } else {
      // Normal mode: need at least one material
      if (validLines.length === 0) {
        toast.error('Add at least one material or enable "Custom Items Only"');
        return;
      }
    }

    // Validate material quantities (skip if skipping material dispatch)
    if (!skipMaterialDispatch) {
      for (const line of validLines) {
        let qty = parseFloat(line.dispatchQty);
        const mat = getMaterial(line.materialId);

        if (!mat) {
          toast.error(`Material not found: ${line.materialId}`);
          return;
        }

        if (isNaN(qty) || qty <= 0) {
          toast.error(`Invalid dispatch quantity for ${mat.name}`);
          return;
        }

        const currentStock = typeof mat.currentStock === 'number' ? mat.currentStock : parseFloat(String(mat.currentStock));
        if (isNaN(currentStock) || currentStock < qty) {
          toast.error(`Insufficient stock for ${mat.name}. Available: ${currentStock.toFixed(3)} ${mat.unit}`);
          return;
        }

        const ret = line.returnQty ? parseFloat(line.returnQty) : 0;
        if (ret > 0) {
          const jobMatSummary = jobMaterials.find((jm: any) => jm.materialId === line.materialId);
          if (jobMatSummary) {
            const totalReturnAfter = jobMatSummary.returned + ret;
            if (totalReturnAfter > jobMatSummary.dispatched) {
              const maxCanReturn = jobMatSummary.dispatched - jobMatSummary.returned;
              toast.error(`Cannot return ${ret} ${mat.unit}. Only ${maxCanReturn.toFixed(3)} can be returned`);
              return;
            }
          }
        }
      }
    }

    setSubmitting(true);
    try {
      // If editing, delete the old transaction first
      if (editingTransactionId) {
        const deleteRes = await fetch(`/api/transactions/${editingTransactionId}`, { method: 'DELETE' });
        if (!deleteRes.ok) {
          const deleteData = await deleteRes.json();
          throw new Error(deleteData.error || 'Failed to delete old delivery note');
        }
      }

      // Build notes with delivery note header and custom items
      let finalNotes = notes?.trim() || '';

      if (deliveryNoteNumber) {
        const deliveryNoteHeader = `--- DELIVERY NOTE #${deliveryNoteNumber}`;

        if (validCustomItems.length > 0) {
          const customItemsText = '\n--- DELIVERY NOTE ITEMS (For Printing) ---\n' +
            validCustomItems.map(item =>
              `• ${item.name}${item.description ? ' - ' + item.description : ''} | ${item.qty} ${item.unit}`
            ).join('\n');
          finalNotes = finalNotes ? finalNotes + '\n' + deliveryNoteHeader + customItemsText : (deliveryNoteHeader + customItemsText);
        } else {
          finalNotes = finalNotes ? finalNotes + '\n' + deliveryNoteHeader : deliveryNoteHeader;
        }
      }

      // Submit as a batch transaction
      const linesToSubmit = skipMaterialDispatch ? [] : validLines.map((l) => ({
        materialId: l.materialId,
        quantity: parseFloat(l.dispatchQty),
        returnQty: l.returnQty ? parseFloat(l.returnQty) : undefined,
      }));

      await addBatchTransaction({
        type: 'STOCK_OUT',
        jobId: selectedJob,
        notes: finalNotes || undefined,
        date,
        isDeliveryNote: true,
        lines: linesToSubmit,
      }).unwrap();

      const actionText = editingTransactionId ? 'updated' : 'created';
      const materialsText = skipMaterialDispatch ? '0 material(s) (custom items only)' : `${validLines.length} material(s)`;
      toast.success(`Delivery Note #${deliveryNoteNumber} ${actionText} with ${materialsText} and ${validCustomItems.length} custom item(s)`);
      setSelectedJob('');
      setNotes('');
      setSkipMaterialDispatch(false);
      setCustomItems([{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);
      setLines(Array.from({ length: 3 }, () => ({
        id: generateId(),
        jobId: '',
        materialId: '',
        dispatchQty: '',
        returnQty: '',
      })));
      setEditingTransactionId(null);
      setDeliveryNoteNumber(null);

      // Refetch next number for create mode
      if (!editingTransactionId) {
        const res = await fetch('/api/delivery-notes/next-number');
        const data = await res.json();
        if (res.ok && data.data) {
          setDeliveryNoteNumber(data.data.nextNumber);
        }
      }

      router.push('/dispatch');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to save delivery note');
      setSubmitting(false);
    }
  };

  if (isLoadingEdit) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 py-8">
        <div className="text-center">
          <p className="text-slate-400">Loading delivery note...</p>
        </div>
      </div>
    );
  }

  const pageTitle = editingTransactionId ? 'Edit Delivery Note' : 'Create Delivery Note';
  const pageDescription = editingTransactionId
    ? 'Update the delivery note details and custom items'
    : 'Dispatch materials and add custom items for the delivery note';
  const submitButtonText = editingTransactionId ? 'Update Delivery Note' : 'Create Delivery Note';

  const handleDuplicate = async () => {
    if (!selectedJob) {
      toast.error('Select a job first');
      return;
    }

    const validCustomItems = customItems.filter(item => item.name.trim());
    const validLines = lines.filter(line => line.materialId && line.dispatchQty);

    if (skipMaterialDispatch) {
      if (validCustomItems.length === 0) {
        toast.error('Add at least one custom item first');
        return;
      }
    } else {
      if (validLines.length === 0) {
        toast.error('Add at least one material first');
        return;
      }
    }

    // Duplicate the current form state to a new delivery note
    const newCustomItems = validCustomItems.map(item => ({
      ...item,
      id: generateId(),
    }));

    const newLines = validLines.map(line => ({
      ...line,
      id: generateId(),
    }));

    setCustomItems(newCustomItems.length > 0 ? newCustomItems : [{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);
    setLines(newLines.length > 0 ? newLines : Array.from({ length: 3 }, () => ({
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
    })));

    // Clear editing state immediately so save creates a new entry instead of updating
    setEditingTransactionId(null);
    setDeliveryNoteNumber(null);

    // Fetch a fresh delivery note number for the new entry
    try {
      const res = await fetch('/api/delivery-notes/next-number');
      const data = await res.json();
      if (res.ok && data.data) {
        setDeliveryNoteNumber(data.data.nextNumber);
      }
    } catch (err) {
      console.error('Failed to fetch next delivery note number');
    }

    // Replace URL without transactionId param (so URL matches the new create mode)
    window.history.replaceState(null, '', '/dispatch/delivery-note');

    toast.success('Delivery note duplicated. Click save to create as a new entry.');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dispatch" className="text-slate-500 hover:text-slate-300 text-sm">
              ← Dispatch
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{pageDescription}</p>
        </div>
        <div className="flex gap-3">
          {editingTransactionId && (
            <button
              type="button"
              onClick={handleDuplicate}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              📋 Duplicate
            </button>
          )}
          <Link href="/dispatch">
            <Button variant="ghost">Cancel</Button>
          </Link>
          <button
            onClick={() => {
              if (formRef.current) {
                formRef.current.dispatchEvent(new Event('submit', { bubbles: true }));
              }
            }}
            disabled={submitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {submitting ? 'Saving...' : submitButtonText}
          </button>
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-0">
        {/* Header */}
        <div className="rounded-t-xl bg-slate-800 border border-slate-700 border-b-0 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <SearchSelect
                label="Job"
                required
                value={selectedJob}
                onChange={(id) => handleJobChange(id)}
                placeholder="Search jobs by number or customer..."
                items={jobs
                  .filter((j) => j.status !== 'COMPLETED' && j.status !== 'CANCELLED')
                  .map((j) => ({
                    id: j.id,
                    label: j.jobNumber,
                    searchText: customers.find((c) => c.id === j.customerId)?.name || 'Unknown',
                  }))}
                renderItem={(item) => (
                  <div>
                    <div className="font-medium">{item.label}</div>
                    <div className="text-xs text-slate-400">{item.searchText}</div>
                  </div>
                )}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Delivery Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Delivery Note #
              </label>
              <div className="px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm flex items-center">
                <span className="font-semibold text-blue-400">
                  {deliveryNoteNumber ? `DN #${deliveryNoteNumber}` : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="border border-slate-700 border-b-0 bg-slate-900 border-t-0 p-6">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional general notes"
            rows={2}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Skip Materials Toggle */}
        <div className="border border-slate-700 border-b-0 bg-slate-900 border-t-0 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300 mb-1">
                Custom Items Only
              </p>
              <p className="text-xs text-slate-400">
                Skip actual dispatch, create delivery note for printing purposes only
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSkipMaterialDispatch(!skipMaterialDispatch)}
              className={`relative inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                skipMaterialDispatch ? 'bg-blue-600' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  skipMaterialDispatch ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Materials Section */}
        {!skipMaterialDispatch && (
        <div className="border border-slate-700 border-b-0 bg-slate-900 overflow-x-auto">
          <div className="bg-slate-800 border-b border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-white">Materials for Dispatch</h3>
            <p className="text-xs text-slate-400 mt-1">Add materials to be dispatched (affects inventory)</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[200px]">Material</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-20">Unit</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-28">In Stock</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Dispatch Qty</th>
                <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-32">Return Qty</th>
                <th className="px-2 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500 text-sm">
                    No materials added yet. Click "+ Add Material" to start.
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const mat = getMaterial(line.materialId);
                  return (
                    <tr key={line.id} className="border-b border-slate-700/60 hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>

                      <td className="px-4 py-2">
                        <SearchSelect
                          value={line.materialId}
                          onChange={(id) => updateLine(line.id, 'materialId', id)}
                          placeholder="Search materials..."
                          disabled={!selectedJob}
                          items={materials
                            .filter((m) => m.isActive)
                            .map((m) => ({
                              id: m.id,
                              label: m.name,
                              searchText: `${m.currentStock} ${m.unit}`,
                            }))}
                          renderItem={(item) => (
                            <div className="flex items-center justify-between w-full">
                              <div className="font-medium text-white">{item.label}</div>
                              <Badge label={item.searchText} variant="blue" />
                            </div>
                          )}
                        />
                      </td>

                      <td className="px-3 py-2 text-center text-slate-400 text-xs">
                        {mat?.unit ?? '—'}
                      </td>

                      <td className="px-3 py-2 text-right text-emerald-400 font-mono text-sm">
                        {mat?.currentStock ?? '—'}
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          disabled={!selectedJob || !mat}
                          value={line.dispatchQty}
                          onChange={(e) => updateLine(line.id, 'dispatchQty', e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 text-right bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={line.returnQty}
                          onChange={(e) => updateLine(line.id, 'returnQty', e.target.value)}
                          placeholder="0.00"
                          disabled={!selectedJob}
                          className="w-full px-2.5 py-1.5 text-right bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </td>

                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <div className="bg-slate-800 border-t border-slate-700 p-4">
            <button
              type="button"
              onClick={addLine}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              + Add Material
            </button>
          </div>
        </div>
        )}

        {/* Custom Items Section */}
        <div className="border border-slate-700 border-b-0 bg-slate-900">
          <div className="bg-slate-800 border-b border-slate-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                </svg>
                Custom Items (For Printing)
              </h3>
              {deliveryNoteNumber && (
                <span className="px-3 py-1 bg-blue-600/30 border border-blue-500/50 rounded-full text-xs font-semibold text-blue-300">
                  Delivery Note #{deliveryNoteNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">Add custom items to appear on the printed delivery note (does not affect inventory)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[200px]">Item Name *</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[200px]">Description</th>
                  <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide w-20">Unit</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide w-24">Qty</th>
                  <th className="px-2 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {customItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                      No custom items yet. Click "+ Add Item" to start.
                    </td>
                  </tr>
                ) : (
                  customItems.map((item, idx) => (
                    <tr key={item.id} className="border-b border-slate-700/60 hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateCustomItem(item.id, 'name', e.target.value)}
                          placeholder="e.g., Steel Pipe"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateCustomItem(item.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateCustomItem(item.id, 'unit', e.target.value)}
                          placeholder="Unit"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none text-center"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.qty}
                          onChange={(e) => updateCustomItem(item.id, 'qty', e.target.value)}
                          placeholder="Qty"
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none text-right"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeCustomItem(item.id)}
                          disabled={customItems.length === 1}
                          className="text-slate-500 hover:text-red-400 p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-800 border-t border-slate-700 p-4">
            <button
              type="button"
              onClick={addCustomItem}
              className="px-4 py-2 bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 text-blue-300 text-sm font-medium rounded-lg transition-colors"
            >
              + Add Item
            </button>
          </div>
        </div>

        {/* Signed Copy Upload — Edit mode only */}
        {editingTransactionId && (
          <div className="border border-slate-700 border-b-0 bg-slate-900">
            <div className="bg-slate-800 border-b border-slate-700 p-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Signed Copy
              </h3>
              <p className="text-xs text-slate-400 mt-1">Upload the signed physical copy (stored in Google Drive)</p>
            </div>
            <div className="p-6">
              {signedCopyUrl ? (
                <div className="flex items-center justify-between bg-green-900/20 border border-green-500/50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-green-300">Signed copy uploaded</p>
                      <a href={signedCopyUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-green-400 hover:text-green-300 underline">
                        View in Google Drive →
                      </a>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignedCopyUrl(null)}
                    className="text-green-400 hover:text-green-300 p-1"
                    disabled={uploadingSignedCopy}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={uploadingSignedCopy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        setUploadingSignedCopy(true);
                        try {
                          const formData = new FormData();
                          formData.append('file', file);
                          formData.append('transactionId', editingTransactionId);

                          const res = await fetch('/api/upload/signed-copy', {
                            method: 'POST',
                            body: formData,
                          });

                          if (res.ok) {
                            const data = await res.json();
                            setSignedCopyUrl(data.data.signedCopyUrl);
                            toast.success('Signed copy uploaded successfully');
                          } else {
                            const errData = await res.json();
                            toast.error(errData.error || 'Upload failed');
                          }
                        } catch (err) {
                          console.error('Upload error:', err);
                          toast.error('Upload failed');
                        } finally {
                          setUploadingSignedCopy(false);
                          if (e.target) e.target.value = '';
                        }
                      }}
                      className="sr-only"
                      id="signed-copy-input"
                    />
                    <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-slate-500 hover:bg-slate-800/50 transition-colors"
                         onDragOver={(e) => {
                           e.preventDefault();
                           e.currentTarget.classList.add('border-blue-500', 'bg-blue-500/10');
                         }}
                         onDragLeave={(e) => {
                           e.currentTarget.classList.remove('border-blue-500', 'bg-blue-500/10');
                         }}
                         onDrop={(e) => {
                           e.preventDefault();
                           e.currentTarget.classList.remove('border-blue-500', 'bg-blue-500/10');
                           const file = e.dataTransfer.files?.[0];
                           if (file) {
                             const input = document.getElementById('signed-copy-input') as HTMLInputElement;
                             const dt = new DataTransfer();
                             dt.items.add(file);
                             input.files = dt.files;
                             input.dispatchEvent(new Event('change', { bubbles: true }));
                           }
                         }}>
                      <svg className="mx-auto h-12 w-12 text-slate-500 mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8l-6.586-6.586A2 2 0 0028.172 2H28a2 2 0 00-2 2v6a2 2 0 002 2h6zm-4 6H12m0 8h16m-6 6H12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-sm font-medium text-slate-300 mb-1">
                        {uploadingSignedCopy ? 'Uploading...' : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Images (JPEG, PNG, WebP) or PDF, max 20 MB
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

      </form>

      {/* Change Warning Modal */}
      {changeWarningModal.open && changeWarningModal.pendingChange && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setChangeWarningModal({ open: false, pendingChange: null })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Unsaved Changes</h2>
            <p className="text-slate-300 text-sm mb-4">
              You have items added. Changing the {changeWarningModal.pendingChange.type} will clear all unsaved items.
            </p>

            <div className="bg-amber-600/15 border border-amber-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-amber-300">
                ⚠️ <strong>Save first</strong> to keep your changes, or continue to discard them.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setChangeWarningModal({ open: false, pendingChange: null })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmChange}
                className="px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 text-sm font-medium transition-colors"
              >
                Discard & Change
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
