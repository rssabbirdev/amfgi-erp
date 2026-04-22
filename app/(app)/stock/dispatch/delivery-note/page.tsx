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
  useUpdateJobMutation,
  type MaterialUomDto,
} from '@/store/hooks';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function qtyInBase(uoms: MaterialUomDto[] | undefined, quantityUomId: string, qty: number): number {
  if (!uoms?.length || !quantityUomId?.trim()) return qty;
  const u = uoms.find((x) => x.id === quantityUomId);
  if (!u) return qty;
  return qty * u.factorToBase;
}

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
  quantityUomId: string;
  originalDispatchQty?: number;
}

interface PendingChange {
  type: 'job' | 'date';
  newValue: string;
}

interface JobContactOption {
  id: string;
  name: string;
  label: string;
  phone?: string;
  email?: string;
  designation?: string;
  contactLabel?: string;
  searchText: string;
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
  const [updateJob] = useUpdateJobMutation();

  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [selectedJob, setSelectedJob] = useState('');
  const [selectedContactPerson, setSelectedContactPerson] = useState('');
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
      quantityUomId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [signedCopyUrl, setSignedCopyUrl] = useState<string | null>(null);
  const [uploadingSignedCopy, setUploadingSignedCopy] = useState(false);
  const [changeWarningModal, setChangeWarningModal] = useState<{ open: boolean; pendingChange: PendingChange | null }>({
    open: false,
    pendingChange: null,
  });
  const [addContactModal, setAddContactModal] = useState<{
    open: boolean;
    name: string;
    number: string;
    email: string;
    designation: string;
    label: string;
    saving: boolean;
  }>({
    open: false,
    name: '',
    number: '',
    email: '',
    designation: '',
    label: '',
    saving: false,
  });

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canCreate = isSA || perms.includes('job.create');

  const { data: jobMaterials = [] } = useGetJobMaterialsQuery(selectedJob, { skip: !selectedJob });

  useEffect(() => {
    if (!selectedJob) {
      setSelectedContactPerson('');
      return;
    }
    if (selectedContactPerson.trim()) return;
    const contacts = getJobContactOptions(selectedJob);
    if (contacts.length > 0) {
      setSelectedContactPerson(contacts[0].name);
    }
  }, [selectedJob, selectedContactPerson, jobs]);

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

  const parseDeliveryContactPerson = (notesText: string): string => {
    const match = notesText.match(/--- DELIVERY CONTACT PERSON:([^\n\r]+)/);
    return match ? match[1].trim() : '';
  };

  function getJobContactOptions(jobId: string): JobContactOption[] {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return [];

    const options: JobContactOption[] = [];
    const pushUnique = (
      name: string,
      details?: {
        extraLabel?: string;
        phone?: string;
        email?: string;
        designation?: string;
        contactLabel?: string;
      }
    ) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (options.some((x) => x.name.toLowerCase() === trimmed.toLowerCase())) return;
      const searchBits = [
        trimmed,
        details?.phone?.trim() || '',
        details?.email?.trim() || '',
        details?.designation?.trim() || '',
        details?.contactLabel?.trim() || '',
        details?.extraLabel?.trim() || '',
      ].filter(Boolean);
      options.push({
        id: `${trimmed}-${options.length}`,
        name: trimmed,
        label: details?.extraLabel ? `${trimmed} (${details.extraLabel})` : trimmed,
        phone: details?.phone?.trim() || undefined,
        email: details?.email?.trim() || undefined,
        designation: details?.designation?.trim() || undefined,
        contactLabel: details?.contactLabel?.trim() || undefined,
        searchText: searchBits.join(' '),
      });
    };

    if (Array.isArray(job.contactsJson)) {
      for (const row of job.contactsJson as Array<Record<string, unknown>>) {
        const name = typeof row?.name === 'string' ? row.name : '';
        const designation = typeof row?.designation === 'string' ? row.designation : '';
        const number = typeof row?.number === 'string' ? row.number : '';
        const email = typeof row?.email === 'string' ? row.email : '';
        const contactLabel = typeof row?.label === 'string' ? row.label : '';
        pushUnique(name, {
          extraLabel: designation.trim() || undefined,
          phone: number,
          email,
          designation,
          contactLabel,
        });
      }
    }

    if (job.contactPerson?.trim()) {
      pushUnique(job.contactPerson.trim(), { extraLabel: 'Primary' });
    }

    return options;
  }

  const selectedContactOption = getJobContactOptions(selectedJob).find(
    (c) => c.name === selectedContactPerson
  );

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
            setSelectedContactPerson(parseDeliveryContactPerson(txn.notes || ''));
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
              .replace(/--- DELIVERY CONTACT PERSON:[^\n\r]*\r?\n?/g, '')
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
                  quantityUomId: '',
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
            router.push('/stock/dispatch');
          }
        } catch (err) {
          console.error('Failed to load transaction:', err);
          toast.error('Failed to load delivery note');
          router.push('/stock/dispatch');
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
      setSelectedContactPerson('');
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
    if (type === 'job') setSelectedContactPerson('');
    setCustomItems([{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);
    setLines(Array.from({ length: 3 }, () => ({
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
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

  const duplicateCustomItem = (id: string) => {
    setCustomItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx < 0) return prev;
      const source = prev[idx];
      const clone = { ...source, id: generateId() };
      return [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)];
    });
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
      quantityUomId: '',
    }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, [field]: value, ...(field === 'materialId' ? { quantityUomId: '' } : {}) }
          : l
      )
    );
  };

  const getMaterial = (id: string) => materials.find((m) => m.id === id);

  const handleCreateContactPerson = async () => {
    if (!selectedJob) {
      toast.error('Select a job first');
      return;
    }
    const name = addContactModal.name.trim();
    if (!name) {
      toast.error('Contact name is required');
      return;
    }
    const currentJob = jobs.find((j) => j.id === selectedJob);
    if (!currentJob) {
      toast.error('Selected job not found');
      return;
    }

    const currentContacts = Array.isArray(currentJob.contactsJson)
      ? [...(currentJob.contactsJson as Array<Record<string, unknown>>)]
      : [];
    if (
      currentContacts.some(
        (x) => typeof x?.name === 'string' && x.name.trim().toLowerCase() === name.toLowerCase()
      )
    ) {
      toast.error('Contact with this name already exists on the selected job');
      return;
    }

    const newContact: Record<string, string> = { name };
    if (addContactModal.label.trim()) newContact.label = addContactModal.label.trim();
    if (addContactModal.number.trim()) newContact.number = addContactModal.number.trim();
    if (addContactModal.email.trim()) newContact.email = addContactModal.email.trim();
    if (addContactModal.designation.trim()) newContact.designation = addContactModal.designation.trim();

    const nextContacts = [...currentContacts, newContact];
    const nextPrimary =
      (currentJob.contactPerson && currentJob.contactPerson.trim()) || name;

    try {
      setAddContactModal((prev) => ({ ...prev, saving: true }));
      await updateJob({
        id: selectedJob,
        data: {
          contactsJson: nextContacts,
          contactPerson: nextPrimary,
        },
      }).unwrap();
      setSelectedContactPerson(name);
      setAddContactModal({
        open: false,
        name: '',
        number: '',
        email: '',
        designation: '',
        label: '',
        saving: false,
      });
      toast.success('Contact person added to selected job');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to add contact person');
      setAddContactModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedJob) {
      toast.error('Select a job');
      return;
    }

    const contactOptions = getJobContactOptions(selectedJob);
    if (contactOptions.length > 0 && !selectedContactPerson.trim()) {
      toast.error('Select a contact person');
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
        const baseQty = qtyInBase(mat.materialUoms, line.quantityUomId, qty);
        if (isNaN(currentStock) || currentStock < baseQty) {
          toast.error(
            `Insufficient stock for ${mat.name}. Need ${baseQty.toFixed(3)} ${mat.unit} (from entry). Available: ${currentStock.toFixed(3)} ${mat.unit}`
          );
          return;
        }

        const ret = line.returnQty ? parseFloat(line.returnQty) : 0;
        if (ret > 0) {
          const retBase = qtyInBase(mat.materialUoms, line.quantityUomId, ret);
          const jobMatSummary = jobMaterials.find((jm: any) => jm.materialId === line.materialId);
          if (jobMatSummary) {
            const totalReturnAfter = jobMatSummary.returned + retBase;
            if (totalReturnAfter > jobMatSummary.dispatched) {
              const maxCanReturn = jobMatSummary.dispatched - jobMatSummary.returned;
              toast.error(
                `Cannot return ${retBase.toFixed(3)} ${mat.unit} (from entry). Only ${maxCanReturn.toFixed(3)} can be returned`
              );
              return;
            }
          }
        }
      }
    }

    setSubmitting(true);
    try {
      // Build notes with delivery note header and custom items
      let finalNotes = notes?.trim() || '';

      if (deliveryNoteNumber) {
        const deliveryNoteHeader = `--- DELIVERY NOTE #${deliveryNoteNumber}`;
        const contactLine = selectedContactPerson.trim()
          ? `\n--- DELIVERY CONTACT PERSON: ${selectedContactPerson.trim()}`
          : '';

        if (validCustomItems.length > 0) {
          const customItemsText = `${contactLine}\n--- DELIVERY NOTE ITEMS (For Printing) ---\n` +
            validCustomItems.map(item =>
              `• ${item.name}${item.description ? ' - ' + item.description : ''} | ${item.qty} ${item.unit}`
            ).join('\n');
          finalNotes = finalNotes ? finalNotes + '\n' + deliveryNoteHeader + customItemsText : (deliveryNoteHeader + customItemsText);
        } else {
          finalNotes = finalNotes
            ? finalNotes + '\n' + deliveryNoteHeader + contactLine
            : deliveryNoteHeader + contactLine;
        }
      }

      // Submit as a batch transaction
      const linesToSubmit = skipMaterialDispatch ? [] : validLines.map((l) => ({
        materialId: l.materialId,
        quantity: parseFloat(l.dispatchQty),
        quantityUomId: l.quantityUomId.trim() || undefined,
        returnQty: l.returnQty ? parseFloat(l.returnQty) : undefined,
      }));

      await addBatchTransaction({
        type: 'STOCK_OUT',
        jobId: selectedJob,
        notes: finalNotes || undefined,
        date,
        isDeliveryNote: true,
        existingTransactionIds: editingTransactionId ? [editingTransactionId] : undefined,
        lines: linesToSubmit,
      }).unwrap();

      const actionText = editingTransactionId ? 'updated' : 'created';
      const materialsText = skipMaterialDispatch ? '0 material(s) (custom items only)' : `${validLines.length} material(s)`;
      toast.success(`Delivery Note #${deliveryNoteNumber} ${actionText} with ${materialsText} and ${validCustomItems.length} custom item(s)`);
      setSelectedJob('');
      setSelectedContactPerson('');
      setNotes('');
      setSkipMaterialDispatch(false);
      setCustomItems([{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);
      setLines(Array.from({ length: 3 }, () => ({
        id: generateId(),
        jobId: '',
        materialId: '',
        dispatchQty: '',
        returnQty: '',
        quantityUomId: '',
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

      router.push('/stock/dispatch');
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
      quantityUomId: '',
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
    window.history.replaceState(null, '', '/stock/dispatch/delivery-note');

    toast.success('Delivery note duplicated. Click save to create as a new entry.');
  };

  return (
    <div className="mx-auto max-w-[1240px] space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
        <div className="flex items-center justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link href="/stock/dispatch" className="text-[11px] font-semibold uppercase tracking-[0.28em] text-blue-700 transition-colors hover:text-blue-600 dark:text-blue-300/80 dark:hover:text-blue-200">
              ← Dispatch
            </Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[2rem]">{pageTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">{pageDescription}</p>
        </div>
        <div className="flex gap-3">
          {editingTransactionId && (
            <button
              type="button"
              onClick={handleDuplicate}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              📋 Duplicate
            </button>
          )}
          <Link href="/stock/dispatch">
            <Button variant="ghost">Cancel</Button>
          </Link>
          <button
            onClick={() => {
              if (formRef.current) {
                formRef.current.dispatchEvent(new Event('submit', { bubbles: true }));
              }
            }}
            disabled={submitting}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:bg-slate-400 dark:disabled:bg-slate-700"
          >
            {submitting ? 'Saving...' : submitButtonText}
          </button>
        </div>
      </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-0">
        {/* Header */}
        <div className="rounded-t-3xl border border-slate-200 border-b-0 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Delivery Note #
              </label>
                <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                  {deliveryNoteNumber ? `DN #${deliveryNoteNumber}` : 'Loading...'}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5">
                Contact Person
              </label>
              {(() => {
                const options = getJobContactOptions(selectedJob);
                const selectedContactId = options.find((opt) => opt.name === selectedContactPerson)?.id || '';
                return (
                  <div className="space-y-2">
                    <SearchSelect
                      value={selectedContactId}
                      onChange={(id) => {
                        const picked = options.find((opt) => opt.id === id);
                        setSelectedContactPerson(picked?.name || '');
                      }}
                      placeholder={
                        selectedJob
                          ? options.length > 0
                            ? 'Search contact by name / phone / email / designation'
                            : 'No contacts found on this job'
                          : 'Select a job first'
                      }
                      disabled={!selectedJob || options.length === 0}
                      items={options.map((opt) => ({
                        id: opt.id,
                        label: opt.label,
                        searchText: opt.searchText,
                      }))}
                      renderItem={(item) => {
                        const full = options.find((x) => x.id === item.id);
                        return (
                          <div className="flex flex-col">
                            <span className="font-medium">{item.label}</span>
                            {(full?.phone || full?.email) && (
                              <span className="text-xs text-slate-400">
                                {[full.phone, full.email].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        );
                      }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-500">
                        Can&apos;t find contact? Add under this job.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setAddContactModal((prev) => ({
                            ...prev,
                            open: true,
                            name: '',
                            number: '',
                            email: '',
                            designation: '',
                            label: '',
                            saving: false,
                          }))
                        }
                        disabled={!selectedJob}
                        className="rounded-md border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        + Add Contact
                      </button>
                    </div>
                    {selectedContactOption && (
                      <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
                        <p className="text-sm font-semibold text-white">{selectedContactOption.name}</p>
                        {(selectedContactOption.designation || selectedContactOption.contactLabel) && (
                          <p className="text-slate-400">
                            {selectedContactOption.designation || selectedContactOption.contactLabel}
                          </p>
                        )}
                        {selectedContactOption.phone && <p>{selectedContactOption.phone}</p>}
                        {selectedContactOption.email && (
                          <p className="break-all text-slate-400">{selectedContactOption.email}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="border border-slate-200 border-b-0 border-t-0 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/70">
          <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional general notes"
            rows={2}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        {/* Skip Materials Toggle */}
        <div className="border border-slate-200 border-b-0 border-t-0 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-1 text-sm font-medium text-slate-900 dark:text-slate-200">
                Custom Items Only
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Skip actual dispatch, create delivery note for printing purposes only
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSkipMaterialDispatch(!skipMaterialDispatch)}
              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                skipMaterialDispatch ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
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
        <div className="overflow-x-auto border border-slate-200 border-b-0 bg-white dark:border-slate-800 dark:bg-slate-950/70">
          <div className="border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Materials for Dispatch</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Add materials to be dispatched. This section affects inventory.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[200px]">Material</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide min-w-[128px]">UOM</th>
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
                    <tr key={line.id} className="border-b border-slate-200 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-500">{idx + 1}</td>

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

                      <td className="px-3 py-2 text-center text-slate-400 text-xs min-w-[120px]">
                        {mat?.materialUoms && mat.materialUoms.length > 0 ? (
                          <select
                            value={line.quantityUomId}
                            onChange={(e) => updateLine(line.id, 'quantityUomId', e.target.value)}
                            className="w-full max-w-44 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                          >
                            {mat.materialUoms.map((u) => (
                              <option key={u.id} value={u.isBase ? '' : u.id}>
                                {u.unitName}
                                {u.isBase ? ' (base)' : ` (=${u.factorToBase} ${mat.unit})`}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>{mat?.unit ?? '—'}</span>
                        )}
                      </td>

                      <td className="px-3 py-2 text-right font-mono text-sm text-emerald-700 dark:text-emerald-300">
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
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
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
                          className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>

                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="p-1 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
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
          <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <button
              type="button"
              onClick={addLine}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              + Add Material
            </button>
          </div>
        </div>
        )}

        {/* Custom Items Section */}
        <div className="border border-slate-200 border-b-0 bg-white dark:border-slate-800 dark:bg-slate-950/70">
          <div className="border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/80">
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
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Add custom items to appear on the printed delivery note. This section does not affect inventory.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80">
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
                    <tr key={item.id} className="border-b border-slate-200 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateCustomItem(item.id, 'name', e.target.value)}
                          placeholder="e.g., Steel Pipe"
                          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateCustomItem(item.id, 'description', e.target.value)}
                          placeholder="Optional description"
                          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateCustomItem(item.id, 'unit', e.target.value)}
                          placeholder="Unit"
                          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-center text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.qty}
                          onChange={(e) => updateCustomItem(item.id, 'qty', e.target.value)}
                          placeholder="Qty"
                          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-right text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => duplicateCustomItem(item.id)}
                          className="p-1 text-slate-400 hover:text-blue-500 dark:text-slate-500 dark:hover:text-blue-400"
                          title="Duplicate item row"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M8 7V5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2h-2M8 7h10a2 2 0 012 2v10" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCustomItem(item.id)}
                          disabled={customItems.length === 1}
                          className="p-1 text-slate-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-500 dark:hover:text-red-400"
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
          <div className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
            <button
              type="button"
              onClick={addCustomItem}
              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-500/20 dark:text-blue-300"
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

      {addContactModal.open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => {
              if (addContactModal.saving) return;
              setAddContactModal((prev) => ({ ...prev, open: false }));
            }}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Add Contact Person</h2>
            <p className="text-xs text-slate-400 mb-4">This contact will be saved under the selected job.</p>
            <div className="space-y-3">
              <input
                value={addContactModal.name}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Name *"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm"
              />
              <input
                value={addContactModal.number}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, number: e.target.value }))}
                placeholder="Phone number"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm"
              />
              <input
                value={addContactModal.email}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm"
              />
              <input
                value={addContactModal.designation}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, designation: e.target.value }))}
                placeholder="Designation"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm"
              />
              <input
                value={addContactModal.label}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Label (e.g. Site / Procurement)"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-white text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={addContactModal.saving}
                onClick={() => setAddContactModal((prev) => ({ ...prev, open: false }))}
                className="px-3 py-2 rounded-md bg-slate-700 text-slate-200 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addContactModal.saving}
                onClick={handleCreateContactPerson}
                className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-60"
              >
                {addContactModal.saving ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </div>
        </>
      )}

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
