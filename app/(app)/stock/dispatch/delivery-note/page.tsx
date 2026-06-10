'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/shadcn/button';
import { Badge } from '@/components/ui/shadcn/badge';
import SearchSelect from '@/components/ui/SearchSelect';
import DeliveryNoteCustomItemsGrid, {
  type DeliveryNoteCustomItem,
} from '@/components/stock/DeliveryNoteCustomItemsGrid';
import DispatchLineGrid from '@/components/stock/DispatchLineGrid';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  useGetJobsQuery,
  useGetCustomersQuery,
  useGetDispatchBudgetWarningMutation,
  useGetMaterialsQuery,
  useGetWarehousesQuery,
  useGetJobMaterialsQuery,
  useAddBatchTransactionMutation,
  useUpdateJobMutation,
  type DispatchBudgetWarningResult,
  type MaterialUomDto,
  type Material,
} from '@/store/hooks';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

async function fetchNextDeliveryNoteNumber(): Promise<number | null> {
  try {
    const res = await fetch('/api/delivery-notes/next-number');
    const data = await res.json();
    if (res.ok && data.data?.nextNumber) {
      return data.data.nextNumber as number;
    }
  } catch {
    // ignore
  }
  return null;
}

function qtyInBase(uoms: MaterialUomDto[] | undefined, quantityUomId: string, qty: number): number {
  if (!uoms?.length || !quantityUomId?.trim()) return qty;
  const u = uoms.find((x) => x.id === quantityUomId);
  if (!u) return qty;
  return qty * u.factorToBase;
}

interface Line {
  id: string;
  jobId: string;
  materialId: string;
  dispatchQty: string;
  returnQty: string;
  quantityUomId: string;
  warehouseId: string;
  originalDispatchQty?: number;
  originalWarehouseId?: string;
}

function getWarehouseBaseStock(material: Material | undefined, warehouseId: string) {
  if (!material || !warehouseId) return 0;
  return material.materialWarehouseStocks?.find((stock) => stock.warehouseId === warehouseId)?.currentStock ?? 0;
}

function parseOverrideReason(notesText: string) {
  const match = notesText.match(/\[OVERRIDE_REASON:([^\]]+)\]/);
  return match?.[1]?.trim() ?? '';
}

function stripOverrideReason(notesText: string) {
  return notesText.replace(/\[OVERRIDE_REASON:[^\]]+\]\n?/g, '').trim();
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

/** Delivery notes are always keyed to the parent job (never a variation/child job id). */
function resolveParentJobIdForDeliveryNote(
  jobId: string,
  jobList: { id: string; parentJobId?: string | null }[],
): string {
  if (!jobId) return '';
  const job = jobList.find((j) => j.id === jobId);
  if (!job) return jobId;
  return job.parentJobId ?? job.id;
}

export default function DeliveryNoteCreatePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const appliedUrlJobDatePresetKey = useRef<string | null>(null);
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: materials = [] } = useGetMaterialsQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();
  const [getDispatchBudgetWarning, { isLoading: budgetWarningLoading }] = useGetDispatchBudgetWarningMutation();
  const [updateJob] = useUpdateJobMutation();
  const showWarehouseColumn = true;

  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingDeliveryNoteId, setEditingDeliveryNoteId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [selectedJob, setSelectedJob] = useState('');
  const [selectedContactPerson, setSelectedContactPerson] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState<number | null>(null);
  const [loadedDeliveryNoteNumber, setLoadedDeliveryNoteNumber] = useState<number | null>(null);
  const [deliveryNoteNumberOverride, setDeliveryNoteNumberOverride] = useState(false);
  const [notes, setNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [skipMaterialDispatch, setSkipMaterialDispatch] = useState(false);
  const [customItems, setCustomItems] = useState<DeliveryNoteCustomItem[]>([
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
      warehouseId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
      warehouseId: '',
    },
    {
      id: generateId(),
      jobId: '',
      materialId: '',
      dispatchQty: '',
      returnQty: '',
      quantityUomId: '',
      warehouseId: '',
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState<DispatchBudgetWarningResult | null>(null);
  const [budgetWarningValidatedForKey, setBudgetWarningValidatedForKey] = useState<string | null>(null);
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
  const selectableJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !job.parentJobId && job.status !== 'COMPLETED' && job.status !== 'CANCELLED',
      ),
    [jobs],
  );
  const budgetWarningLines = useMemo(
    () =>
      skipMaterialDispatch
        ? []
        : lines
            .filter((line) => line.materialId && line.dispatchQty)
            .map((line) => ({
              materialId: line.materialId,
              quantity: Number.parseFloat(line.dispatchQty) || 0,
              quantityUomId: line.quantityUomId || undefined,
              returnQty: line.returnQty ? Number.parseFloat(line.returnQty) || 0 : undefined,
            }))
            .filter((line) => line.quantity > 0),
    [lines, skipMaterialDispatch]
  );

  /** Any non-empty material grid field blocks enabling "custom items only" until the user clears rows. */
  const materialRowsHaveData = useMemo(
    () =>
      lines.some(
        (l) =>
          Boolean(l.materialId?.trim()) ||
          Boolean(l.dispatchQty?.trim()) ||
          Boolean(l.returnQty?.trim()) ||
          Boolean(l.warehouseId?.trim()) ||
          Boolean(l.quantityUomId?.trim())
      ),
    [lines]
  );

  const cannotEnableSkipMaterialOnly = materialRowsHaveData && !skipMaterialDispatch;

  const budgetWarningLinesKey = useMemo(() => JSON.stringify(budgetWarningLines), [budgetWarningLines]);

  const budgetWarningScopeKey = useMemo(
    () => `${selectedJob}::${date}::${budgetWarningLinesKey}`,
    [selectedJob, date, budgetWarningLinesKey]
  );

  const budgetWarningAppliesToCurrentLines = useMemo(
    () =>
      !skipMaterialDispatch &&
      Boolean(
        budgetWarning &&
          budgetWarningValidatedForKey === budgetWarningScopeKey &&
          budgetWarning.applicable === true &&
          (budgetWarning.warningCount ?? 0) > 0
      ),
    [budgetWarning, budgetWarningScopeKey, budgetWarningValidatedForKey, skipMaterialDispatch]
  );

  const overrideSignals = useMemo(() => {
    if (skipMaterialDispatch) {
      return {
        negativeStockLineCount: 0,
        budgetWarningCount: 0,
        requiresReason: false,
      };
    }

    let negativeStockLineCount = 0;
    for (const line of lines) {
      if (!line.materialId || !line.dispatchQty || !line.warehouseId) continue;
      const qty = Number.parseFloat(line.dispatchQty);
      const mat = materials.find((entry) => entry.id === line.materialId);
      if (!mat || !mat.allowNegativeConsumption || !Number.isFinite(qty) || qty <= 0) continue;
      const baseQty = qtyInBase(mat.materialUoms, line.quantityUomId, qty);
      const originalQty = line.originalDispatchQty ? parseFloat(String(line.originalDispatchQty)) : 0;
      const originalWarehouseMatches = line.originalWarehouseId && line.originalWarehouseId === line.warehouseId;
      const availableStock = getWarehouseBaseStock(mat, line.warehouseId) + (originalWarehouseMatches ? originalQty : 0);
      if (availableStock + 0.0005 < baseQty) {
        negativeStockLineCount += 1;
      }
    }

    const budgetWarningCount = budgetWarningAppliesToCurrentLines ? (budgetWarning?.warningCount ?? 0) : 0;
    return {
      negativeStockLineCount,
      budgetWarningCount,
      requiresReason: negativeStockLineCount > 0 || budgetWarningCount > 0,
    };
  }, [budgetWarning, budgetWarningAppliesToCurrentLines, lines, materials, skipMaterialDispatch]);

  const budgetWarningMaterialIds = useMemo(
    () => (budgetWarningAppliesToCurrentLines ? budgetWarning?.rows.map((row) => row.materialId) ?? [] : []),
    [budgetWarning, budgetWarningAppliesToCurrentLines]
  );

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

  useEffect(() => {
    if (!selectedJob || jobs.length === 0) return;
    const j = jobs.find((x) => x.id === selectedJob);
    if (j?.parentJobId) {
      const parentId = j.parentJobId;
      setSelectedJob(parentId);
      setLines((prev) => prev.map((l) => ({ ...l, jobId: parentId })));
    }
  }, [jobs, selectedJob]);

  // Parse delivery note number from notes
  const parseDeliveryNoteNumber = (notesText: string): number | null => {
    const match = notesText.match(/--- DELIVERY NOTE #(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Parse custom items from notes
  const parseCustomItems = (notesText: string): DeliveryNoteCustomItem[] => {
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
    const deliveryNoteIdParam = searchParams.get('deliveryNoteId');
    const duplicateDeliveryNoteId = searchParams.get('duplicateDeliveryNoteId');

    const emptyLineTemplate = (): Line[] =>
      Array.from({ length: 3 }, () => ({
        id: generateId(),
        jobId: '',
        materialId: '',
        dispatchQty: '',
        returnQty: '',
        quantityUomId: '',
        warehouseId: '',
      }));

    const loadFromDeliveryNoteRecord = async (dnId: string, opts: { duplicate: boolean }) => {
      setIsLoadingEdit(true);
      try {
        const res = await fetch(`/api/delivery-notes/${encodeURIComponent(dnId)}`);
        const json = await res.json();
        if (!res.ok || !json.data) {
          toast.error(json.error || 'Failed to load delivery note');
          router.push('/stock/dispatch');
          return;
        }
        const d = json.data as {
          id: string;
          number: number;
          jobId: string | null;
          date: string;
          documentNotes: string | null;
          customItemsJson: unknown;
          materialDispatchSkipped: boolean;
          job: { contactPerson?: string | null } | null;
          firstStockOutTransactionId: string | null;
        };

        const canonicalJobId = resolveParentJobIdForDeliveryNote(d.jobId || '', jobs);
        setSelectedJob(canonicalJobId);
        setSelectedContactPerson(d.job?.contactPerson?.trim() || '');
        setDate(
          opts.duplicate ? new Date().toISOString().split('T')[0] : new Date(d.date).toISOString().split('T')[0]
        );
        setNotes(d.documentNotes?.trim() || '');
        setOverrideReason('');
        setSignedCopyUrl(null);

        const rows = Array.isArray(d.customItemsJson)
          ? (d.customItemsJson as Array<Record<string, unknown>>).map((row) => ({
              id: generateId(),
              name: String(row.name ?? ''),
              description: String(row.description ?? ''),
              unit: String(row.unit ?? ''),
              qty: String(row.qty ?? ''),
            }))
          : [];
        setCustomItems(rows.length > 0 ? rows : [{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);

        setSkipMaterialDispatch(Boolean(d.materialDispatchSkipped));

        if (!d.materialDispatchSkipped && d.firstStockOutTransactionId) {
          const txnRes = await fetch(`/api/transactions/${d.firstStockOutTransactionId}`);
          const txnJson = await txnRes.json();
          if (txnRes.ok && txnJson.data) {
            const txn = txnJson.data as {
              material?: { id: string };
              quantity: number;
              warehouseId?: string | null;
            };
            if (txn.material) {
              setLines([
                {
                  id: generateId(),
                  jobId: canonicalJobId,
                  materialId: txn.material.id,
                  dispatchQty: String(txn.quantity),
                  returnQty: '',
                  quantityUomId: '',
                  warehouseId: txn.warehouseId ?? '',
                  originalDispatchQty: txn.quantity,
                  originalWarehouseId: txn.warehouseId ?? '',
                },
              ]);
            } else {
              setLines(emptyLineTemplate());
            }
          } else {
            setLines(emptyLineTemplate());
          }
        } else {
          setLines(emptyLineTemplate());
        }

        if (opts.duplicate) {
          setEditingTransactionId(null);
          setEditingDeliveryNoteId(null);
          const nextNumber = await fetchNextDeliveryNoteNumber();
          if (nextNumber != null) {
            setDeliveryNoteNumber(nextNumber);
          }
          setLoadedDeliveryNoteNumber(null);
          setDeliveryNoteNumberOverride(false);
        } else {
          setEditingDeliveryNoteId(d.id);
          setEditingTransactionId(d.firstStockOutTransactionId);
          setDeliveryNoteNumber(d.number);
          setLoadedDeliveryNoteNumber(d.number);
          setDeliveryNoteNumberOverride(false);
        }
      } catch (err) {
        console.error('Failed to load delivery note:', err);
        toast.error('Failed to load delivery note');
        router.push('/stock/dispatch');
      } finally {
        setIsLoadingEdit(false);
      }
    };

    if (duplicateDeliveryNoteId) {
      void loadFromDeliveryNoteRecord(duplicateDeliveryNoteId, { duplicate: true });
      return;
    }

    const sourceId = transactionId || duplicateFromId;
    const isDuplicating = !!duplicateFromId;

    if (sourceId) {
      setEditingDeliveryNoteId(null);
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
            const canonicalJobId = resolveParentJobIdForDeliveryNote(txn.jobId || '', jobs);
            setSelectedJob(canonicalJobId);
            setSelectedContactPerson(parseDeliveryContactPerson(txn.notes || ''));
            // Duplicates default to today's date; edits keep the original date
            setDate(isDuplicating
              ? new Date().toISOString().split('T')[0]
              : new Date(txn.date).toISOString().split('T')[0]);

            // Parse custom items from notes
            const customItemsParsed = parseCustomItems(txn.notes || '');
            setCustomItems(customItemsParsed);
            setOverrideReason(parseOverrideReason(txn.notes || ''));

            // Extract base notes (without delivery note headers)
            let baseNotes = stripOverrideReason((txn.notes || ''))
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
                  jobId: canonicalJobId,
                  materialId: txn.material.id,
                  dispatchQty: txn.quantity.toString(),
                  returnQty: '',
                  quantityUomId: '',
                  warehouseId: txn.warehouseId ?? '',
                  originalDispatchQty: txn.quantity,
                  originalWarehouseId: txn.warehouseId ?? '',
                },
              ]);
            }

            if (isDuplicating) {
              const nextNumber = await fetchNextDeliveryNoteNumber();
              if (nextNumber != null) {
                setDeliveryNoteNumber(nextNumber);
              }
              setLoadedDeliveryNoteNumber(null);
              setDeliveryNoteNumberOverride(false);
            } else {
              const dnNumber = parseDeliveryNoteNumber(txn.notes || '');
              if (dnNumber) {
                setDeliveryNoteNumber(dnNumber);
                setLoadedDeliveryNoteNumber(dnNumber);
              }
              setDeliveryNoteNumberOverride(false);
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
    } else if (deliveryNoteIdParam) {
      setEditingDeliveryNoteId(deliveryNoteIdParam);
      void loadFromDeliveryNoteRecord(deliveryNoteIdParam, { duplicate: false });
    } else {
      // Create mode: load next delivery note number
      void fetchNextDeliveryNoteNumber().then((nextNumber) => {
        if (nextNumber != null) {
          setDeliveryNoteNumber(nextNumber);
        }
      });
      setLoadedDeliveryNoteNumber(null);
      setDeliveryNoteNumberOverride(false);
    }
  }, [searchParams, router, jobs]);

  // Load from query params if provided (create mode)
  useEffect(() => {
    if (editingTransactionId || editingDeliveryNoteId) return;
    if (searchParams.get('duplicateFrom')) return;
    if (searchParams.get('duplicateDeliveryNoteId')) return;

    const jobId = searchParams.get('jobId');
    const dateParam = searchParams.get('date');

    if (!jobId || !dateParam) {
      appliedUrlJobDatePresetKey.current = null;
      return;
    }
    if (jobs.length === 0) return;

    const key = `${jobId}::${dateParam}`;
    if (appliedUrlJobDatePresetKey.current === key) return;
    appliedUrlJobDatePresetKey.current = key;

    setSelectedJob(resolveParentJobIdForDeliveryNote(jobId, jobs));
    setDate(dateParam);
  }, [searchParams, editingTransactionId, editingDeliveryNoteId, jobs]);

  useEffect(() => {
    setBudgetWarning(null);
    setBudgetWarningValidatedForKey(null);
  }, [selectedJob, date]);

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

  useEffect(() => {
    if (!selectedJob || budgetWarningLines.length === 0) {
      setBudgetWarning(null);
      setBudgetWarningValidatedForKey(null);
      return;
    }

    setBudgetWarningValidatedForKey(null);

    let cancelled = false;
    const requestScopeKey = budgetWarningScopeKey;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await getDispatchBudgetWarning({
            jobId: selectedJob,
            postingDate: date,
            lines: budgetWarningLines,
          }).unwrap();
          if (!cancelled) {
            setBudgetWarningValidatedForKey(requestScopeKey);
            setBudgetWarning(result.warningCount > 0 ? result : null);
          }
        } catch {
          if (!cancelled) {
            setBudgetWarning(null);
            setBudgetWarningValidatedForKey(null);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [budgetWarningLines, budgetWarningScopeKey, date, getDispatchBudgetWarning, selectedJob]);

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
      warehouseId: '',
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

  const updateCustomItem = (
    id: string,
    field: keyof Omit<DeliveryNoteCustomItem, 'id'>,
    value: string
  ) => {
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
      warehouseId: '',
    }]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              [field]: value,
              ...(field === 'materialId'
                ? {
                    quantityUomId: '',
                    warehouseId: materials.find((m) => m.id === value)?.warehouseId ?? '',
                  }
                : {}),
            }
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
      if (validLines.some((line) => !line.warehouseId)) {
        toast.error('Select a warehouse for each delivery line');
        return;
      }
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

        const baseQty = qtyInBase(mat.materialUoms, line.quantityUomId, qty);
        const selectedWarehouseStock = getWarehouseBaseStock(mat, line.warehouseId);
        if (!mat.allowNegativeConsumption && selectedWarehouseStock < 0) {
          toast.error(`Invalid warehouse stock value for ${mat.name}`);
          return;
        }

        const originalQty = line.originalDispatchQty ? parseFloat(String(line.originalDispatchQty)) : 0;
        const originalWarehouseMatches = line.originalWarehouseId && line.originalWarehouseId === line.warehouseId;
        const availableStock = selectedWarehouseStock + (originalWarehouseMatches ? originalQty : 0);
        if (!mat.allowNegativeConsumption && availableStock < baseQty) {
          const warehouseName = warehouses.find((warehouse) => warehouse.id === line.warehouseId)?.name || 'selected warehouse';
          toast.error(
            `Insufficient stock for ${mat.name} in ${warehouseName}. Need ${baseQty.toFixed(3)} ${mat.unit} (from entry). Available: ${availableStock.toFixed(3)} ${mat.unit}`
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

    if (overrideSignals.requiresReason && !overrideReason.trim()) {
      toast.error('Enter an override reason before saving this delivery note');
      return;
    }

    if (deliveryNoteNumberOverride) {
      if (deliveryNoteNumber == null || !Number.isInteger(deliveryNoteNumber) || deliveryNoteNumber < 1) {
        toast.error('Enter a valid delivery note number');
        return;
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
        warehouseId: l.warehouseId || undefined,
      }));

      const batchResult = await addBatchTransaction({
        type: 'STOCK_OUT',
        jobId: selectedJob,
        notes: finalNotes || undefined,
        baseNotes: notes?.trim() ? notes.trim() : '',
        deliveryNoteCustomItems: validCustomItems.map((item) => ({
          name: item.name.trim(),
          description: item.description?.trim() || undefined,
          unit: item.unit.trim(),
          qty: item.qty.trim(),
        })),
        overrideReason: overrideReason.trim() || undefined,
        date,
        isDeliveryNote: true,
        ...(deliveryNoteNumberOverride && deliveryNoteNumber != null
          ? { deliveryNoteNumber }
          : {}),
        existingTransactionIds: editingTransactionId ? [editingTransactionId] : undefined,
        existingDeliveryNoteId: editingDeliveryNoteId ?? undefined,
        lines: linesToSubmit,
      }).unwrap();

      const savedDeliveryNoteNumber = batchResult.deliveryNoteNumber ?? deliveryNoteNumber;

      const wasEditing = Boolean(editingTransactionId || editingDeliveryNoteId);
      const actionText = wasEditing ? 'updated' : 'created';
      const materialsText = skipMaterialDispatch ? '0 material(s) (custom items only)' : `${validLines.length} material(s)`;
      toast.success(
        `Delivery note ${savedDeliveryNoteNumber ?? '—'} ${actionText} with ${materialsText} and ${validCustomItems.length} custom item(s)`
      );
      setSelectedJob('');
      setSelectedContactPerson('');
      setNotes('');
      setOverrideReason('');
      setSkipMaterialDispatch(false);
      setCustomItems([{ id: generateId(), name: '', description: '', unit: '', qty: '' }]);
      setLines(Array.from({ length: 3 }, () => ({
        id: generateId(),
        jobId: '',
        materialId: '',
        dispatchQty: '',
        returnQty: '',
        quantityUomId: '',
        warehouseId: '',
      })));
      setEditingTransactionId(null);
      setEditingDeliveryNoteId(null);
      setDeliveryNoteNumber(null);

      // Refetch next number for create mode
      if (!wasEditing) {
        const nextNumber = await fetchNextDeliveryNoteNumber();
        if (nextNumber != null) {
          setDeliveryNoteNumber(nextNumber);
        }
      }
      setDeliveryNoteNumberOverride(false);
      setLoadedDeliveryNoteNumber(null);

      router.push('/stock/dispatch');
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Failed to save delivery note');
      setSubmitting(false);
    }
  };

  if (isLoadingEdit) {
    return (
      <div className="flex w-full min-w-0 flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        Loading delivery note…
      </div>
    );
  }

  const pageTitle = editingTransactionId || editingDeliveryNoteId ? 'Edit Delivery Note' : 'Create Delivery Note';
  const pageDescription =
    editingTransactionId || editingDeliveryNoteId
    ? 'Update the delivery note details and custom items'
    : 'Dispatch materials and add custom items for the delivery note';
  const submitButtonText =
    editingTransactionId || editingDeliveryNoteId ? 'Update Delivery Note' : 'Create Delivery Note';

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
      warehouseId: '',
    })));

    // Clear editing state immediately so save creates a new entry instead of updating
    setEditingTransactionId(null);
    setEditingDeliveryNoteId(null);
    setDeliveryNoteNumber(null);

    // Fetch a fresh delivery note number for the new entry
    const nextNumber = await fetchNextDeliveryNoteNumber();
    if (nextNumber != null) {
      setDeliveryNoteNumber(nextNumber);
    }
    setLoadedDeliveryNoteNumber(null);
    setDeliveryNoteNumberOverride(false);

    // Replace URL without transactionId param (so URL matches the new create mode)
    window.history.replaceState(null, '', '/stock/dispatch/delivery-note');

    toast.success('Delivery note duplicated. Click save to create as a new entry.');
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 overflow-x-hidden">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Link
            href="/stock/dispatch"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Dispatch
          </Link>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{pageTitle}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {budgetWarningLoading ? (
            <span className="text-xs tabular-nums text-muted-foreground">Checking budget…</span>
          ) : budgetWarningAppliesToCurrentLines && budgetWarning ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
              title="Variation job material budget — see breakdown below the job fields"
            >
              {budgetWarning.warningCount} budget warning{budgetWarning.warningCount === 1 ? '' : 's'}
            </Badge>
          ) : null}
          {editingTransactionId || editingDeliveryNoteId ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void handleDuplicate()}>
              Duplicate
            </Button>
          ) : null}
          <Link href="/stock/dispatch" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Cancel
          </Link>
          <Button
            type="button"
            size="sm"
            disabled={submitting}
            onClick={() => {
              if (formRef.current) {
                formRef.current.dispatchEvent(new Event('submit', { bubbles: true }));
              }
            }}
          >
            {submitting ? 'Saving…' : submitButtonText}
          </Button>
        </div>
      </header>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      >
        {budgetWarningAppliesToCurrentLines && budgetWarning ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-foreground">
              Budget warning: this delivery may exceed the variation job material budget.
            </p>
            <div className="mt-3 space-y-2">
              {budgetWarning.rows.slice(0, 4).map((row) => (
                <div key={row.materialId} className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground">
                  <span className="font-semibold">{row.materialName}</span>
                  {' · '}
                  projected {row.projectedIssuedBaseQuantity.toFixed(3)} {row.baseUnit}
                  {' vs budget '}
                  {row.estimatedBaseQuantity.toFixed(3)} {row.baseUnit}
                  {row.quantityOverrun > 0.0005 ? ` · over by ${row.quantityOverrun.toFixed(3)} ${row.baseUnit}` : ''}
                </div>
              ))}
              {budgetWarning.warningCount > 4 && (
                <p className="text-xs text-muted-foreground">+{budgetWarning.warningCount - 4} more material warning(s)</p>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Enter an override reason below if this extra issue is intentional.
            </p>
          </div>
        ) : null}

        {overrideSignals.negativeStockLineCount > 0 && (
          <div className="border-b border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">
              Override required: {overrideSignals.negativeStockLineCount} line(s) exceed available warehouse FIFO stock on a negative-consumption material.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Saving will be blocked unless you capture the reason for this stock exception.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Custom items only</p>
            <p className="text-xs text-muted-foreground">
              Skip material dispatch — delivery note for printing only (no stock movement)
              {cannotEnableSkipMaterialOnly ? (
                <span className="mt-1 block text-amber-700 dark:text-amber-200">
                  Clear material lines above to turn this on.
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={skipMaterialDispatch}
            aria-disabled={cannotEnableSkipMaterialOnly}
            title={
              cannotEnableSkipMaterialOnly
                ? 'Clear all material line fields before enabling custom items only'
                : undefined
            }
            onClick={() => {
              if (!skipMaterialDispatch && materialRowsHaveData) {
                toast.error('Clear all material line fields before enabling custom items only.');
                return;
              }
              setSkipMaterialDispatch(!skipMaterialDispatch);
            }}
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background ${
              skipMaterialDispatch ? 'bg-primary' : 'bg-muted'
            } ${cannotEnableSkipMaterialOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                skipMaterialDispatch ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Job & delivery */}
        <div className="border-b border-border p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <SearchSelect
                label="Job"
                required
                value={selectedJob}
                onChange={(id) => handleJobChange(id)}
                placeholder="Search by job number…"
                items={selectableJobs.map((j) => ({
                  id: j.id,
                  label: j.jobNumber,
                  searchText: `${j.jobNumber} ${customers.find((c) => c.id === j.customerId)?.name || 'Unknown'}`,
                }))}
                renderItem={(item) => {
                  const j = selectableJobs.find((x) => x.id === item.id);
                  const customerName = j
                    ? customers.find((c) => c.id === j.customerId)?.name || 'Unknown'
                    : '';
                  return (
                    <div>
                      <div className="font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{customerName}</div>
                    </div>
                  );
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Delivery Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Delivery note number
              </label>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={deliveryNoteNumber ?? ''}
                readOnly={!deliveryNoteNumberOverride}
                onChange={(e) => {
                  const parsed = Number.parseInt(e.target.value, 10);
                  setDeliveryNoteNumber(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                }}
                placeholder={deliveryNoteNumber == null ? 'Loading…' : undefined}
                className={cn(
                  'w-full rounded-md border border-border px-3 py-2.5 font-mono text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
                  deliveryNoteNumberOverride ? 'bg-background' : 'cursor-default bg-muted/40'
                )}
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={deliveryNoteNumberOverride}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setDeliveryNoteNumberOverride(enabled);
                    if (!enabled) {
                      if (loadedDeliveryNoteNumber != null) {
                        setDeliveryNoteNumber(loadedDeliveryNoteNumber);
                      } else {
                        void fetchNextDeliveryNoteNumber().then((nextNumber) => {
                          if (nextNumber != null) {
                            setDeliveryNoteNumber(nextNumber);
                          }
                        });
                      }
                    }
                  }}
                  className="rounded border-border"
                />
                Override auto number
              </label>
              {!deliveryNoteNumberOverride ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Auto-assigned from last delivery note + 1 on save
                </p>
              ) : null}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                              <span className="text-xs text-muted-foreground">
                                {[full.phone, full.email].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        );
                      }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted-foreground">
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
                      <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                        <p className="text-sm font-semibold text-foreground">{selectedContactOption.name}</p>
                        {(selectedContactOption.designation || selectedContactOption.contactLabel) && (
                          <p className="text-muted-foreground">
                            {selectedContactOption.designation || selectedContactOption.contactLabel}
                          </p>
                        )}
                        {selectedContactOption.phone && <p>{selectedContactOption.phone}</p>}
                        {selectedContactOption.email && (
                          <p className="break-all text-muted-foreground">{selectedContactOption.email}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Notes & override (side by side on md+) */}
        <div className="border-b border-border p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
            <div className="min-w-0">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional general notes"
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Override reason
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={overrideSignals.requiresReason ? 'Required for this delivery note' : 'Only needed for exceptions'}
                rows={3}
                className={`w-full rounded-md border px-3 py-2.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${
                  overrideSignals.requiresReason
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-border bg-background'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Materials Section — same Excel-style grid as /stock/dispatch/entry */}
        {!skipMaterialDispatch && (
          <div className="border-b border-border">
            <div className="border-b border-border bg-muted/40 p-4">
              <h3 className="text-sm font-semibold text-foreground">Materials for Dispatch</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add materials to be dispatched. This section affects inventory (same Excel-style grid as dispatch entry).
              </p>
            </div>
            <DispatchLineGrid
              lines={lines}
              materials={materials}
              warehouses={warehouses}
              selectedJob={selectedJob}
              showWarehouseColumn={showWarehouseColumn}
              emptyMessage="No materials added yet. Click + Add row below to start."
              onUpdateLine={updateLine}
              persistScope="delivery-note"
              budgetWarningMaterialIds={budgetWarningMaterialIds}
            />
            <div className="flex justify-end border-t border-border bg-card px-4 py-3">
              <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={!selectedJob}>
                + Add row
              </Button>
            </div>
          </div>
        )}

        {/* Custom Items Section */}
        <div className="border-b border-border bg-primary/5">
          <div className="border-b border-border bg-primary/10 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Custom items (for printing)</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lines appear on the printed delivery note only — no stock movement.
                </p>
              </div>
              {deliveryNoteNumber != null ? (
                <span className="rounded-full border border-primary/30 bg-background/80 px-3 py-1 font-mono text-xs font-semibold text-primary">
                  {deliveryNoteNumber}
                </span>
              ) : null}
            </div>
          </div>
          <div className="border-b border-border bg-primary/5 px-0">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Excel view</div>
            </div>
            <DeliveryNoteCustomItemsGrid
              items={customItems}
              onUpdateItem={updateCustomItem}
              onDuplicateItem={duplicateCustomItem}
              onRemoveItem={removeCustomItem}
            />
          </div>
          <div className="flex justify-end border-t border-border bg-primary/5 px-4 py-3">
            <Button type="button" variant="outline" size="sm" onClick={addCustomItem}>
              + Add row
            </Button>
          </div>
        </div>

        {/* Signed Copy Upload — Edit mode only */}
        {editingTransactionId && (
          <div className="border border-border border-b-0 bg-card">
            <div className="border-b border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Signed Copy
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Upload the signed physical copy (stored in Google Drive)</p>
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
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/40 hover:bg-muted/40 transition-colors"
                         onDragOver={(e) => {
                           e.preventDefault();
                           e.currentTarget.classList.add('border-primary', 'bg-primary/10');
                         }}
                         onDragLeave={(e) => {
                           e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                         }}
                         onDrop={(e) => {
                           e.preventDefault();
                           e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                           const file = e.dataTransfer.files?.[0];
                           if (file) {
                             const input = document.getElementById('signed-copy-input') as HTMLInputElement;
                             const dt = new DataTransfer();
                             dt.items.add(file);
                             input.files = dt.files;
                             input.dispatchEvent(new Event('change', { bubbles: true }));
                           }
                         }}>
                      <svg className="mx-auto h-12 w-12 text-muted-foreground mb-2" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8l-6.586-6.586A2 2 0 0028.172 2H28a2 2 0 00-2 2v6a2 2 0 002 2h6zm-4 6H12m0 8h16m-6 6H12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-sm font-medium text-foreground mb-1">
                        {uploadingSignedCopy ? 'Uploading...' : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-1">Add Contact Person</h2>
            <p className="text-xs text-muted-foreground mb-4">This contact will be saved under the selected job.</p>
            <div className="space-y-3">
              <input
                value={addContactModal.name}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Name *"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={addContactModal.number}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, number: e.target.value }))}
                placeholder="Phone number"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={addContactModal.email}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={addContactModal.designation}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, designation: e.target.value }))}
                placeholder="Designation"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                value={addContactModal.label}
                onChange={(e) => setAddContactModal((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="Label (e.g. Site / Procurement)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={addContactModal.saving}
                onClick={() => setAddContactModal((prev) => ({ ...prev, open: false }))}
                className="px-3 py-2 rounded-md bg-muted text-foreground text-sm hover:bg-muted/80"
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-2">Unsaved Changes</h2>
            <p className="text-muted-foreground text-sm mb-4">
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
                className="px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium transition-colors"
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


