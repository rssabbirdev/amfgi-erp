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
import { withBlockInputWheelChange } from '@/lib/utils/blockInputWheelChange';
import {
  formatDeliveryNoteCustomItemBullet,
  inferCustomItemsLineNoAuto,
  parseDeliveryNoteCustomItemsFromNotes,
  resolveCustomItemLineNoForSave,
} from '@/lib/utils/deliveryNoteCustomItems';
import toast from 'react-hot-toast';
import {
  useGetJobsQuery,
  useGetCustomersQuery,
  useGetSuppliersQuery,
  useGetDispatchBudgetWarningMutation,
  useGetMaterialsQuery,
  useGetWarehousesQuery,
  useGetJobMaterialsQuery,
  useAddBatchTransactionMutation,
  useDeleteDeliveryNoteMutation,
  useDeleteTransactionMutation,
  useReceiveDeliveryNoteMutation,
  useUpdateJobMutation,
  useUpdateSupplierMutation,
  type DispatchBudgetWarningResult,
  type MaterialUomDto,
  type Material,
} from '@/store/hooks';
import {
  getSupplierContactOptions,
  resolveSupplierContactIdByName,
  type SupplierContactOption,
} from '@/lib/utils/supplierContactOptions';

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
  targetWarehouseId?: string;
  materialLineId?: string;
  issuedQty?: number;
  receivedQty?: number;
  outstandingQty?: number;
  receiveQty?: string;
  receiveDestWarehouseId?: string;
  originalDispatchQty?: number;
  originalWarehouseId?: string;
}

const MIN_VISIBLE_ROWS = 5;
const MIN_EMPTY_ROWS = 3;
const MIN_VISIBLE_CUSTOM_ITEM_ROWS = 5;
const MIN_EMPTY_CUSTOM_ITEM_ROWS = 3;

function emptyLine(jobId = ''): Line {
  return {
    id: generateId(),
    jobId,
    materialId: '',
    dispatchQty: '',
    returnQty: '',
    quantityUomId: '',
    warehouseId: '',
  };
}

function isLineEmpty(line: Line) {
  return (
    !line.materialId &&
    !line.dispatchQty &&
    !line.returnQty &&
    !line.quantityUomId &&
    !line.warehouseId &&
    !(line.receiveQty?.trim()) &&
    !(line.targetWarehouseId?.trim())
  );
}

function normalizeLines(lines: Line[], jobId = '') {
  const nonEmptyLines = lines.filter((line) => !isLineEmpty(line));
  const requiredEmptyRows = Math.max(MIN_EMPTY_ROWS, MIN_VISIBLE_ROWS - nonEmptyLines.length);
  return [...nonEmptyLines, ...Array.from({ length: requiredEmptyRows }, () => emptyLine(jobId))];
}

function emptyCustomItem(): DeliveryNoteCustomItem {
  return { id: generateId(), lineNo: '', name: '', description: '', unit: '', qty: '' };
}

function isCustomItemEmpty(item: DeliveryNoteCustomItem, lineNoAuto = true) {
  if (item.name.trim() || item.description.trim() || item.unit.trim() || item.qty.trim()) {
    return false;
  }
  if (!lineNoAuto && item.lineNo.trim()) {
    return false;
  }
  return true;
}

function normalizeCustomItems(items: DeliveryNoteCustomItem[], lineNoAuto = true) {
  const nonEmptyItems = items.filter((item) => !isCustomItemEmpty(item, lineNoAuto));
  const requiredEmptyRows = Math.max(
    MIN_EMPTY_CUSTOM_ITEM_ROWS,
    MIN_VISIBLE_CUSTOM_ITEM_ROWS - nonEmptyItems.length
  );
  return [...nonEmptyItems, ...Array.from({ length: requiredEmptyRows }, () => emptyCustomItem())];
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

type LoadedJobParty = {
  customerId?: string | null;
  customer?: { id?: string; name?: string } | null;
} | null | undefined;

function customerIdFromLoadedJob(job: LoadedJobParty): string {
  if (!job) return '';
  return job.customerId?.trim() || job.customer?.id?.trim() || '';
}

function customerNameFromLoadedJob(job: LoadedJobParty): string {
  if (!job) return '';
  return job.customer?.name?.trim() || '';
}

const DELIVERY_TYPE_OPTIONS = [
  { id: 'DISPATCH' as const, label: 'Customer Delivery Note' },
  { id: 'SUBCONTRACT' as const, label: 'Send for Processing' },
];

export default function DeliveryNoteCreatePage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const appliedUrlJobDatePresetKey = useRef<string | null>(null);
  const appliedDeliveryNoteLoadKeyRef = useRef<string | null>(null);
  const { data: jobs = [] } = useGetJobsQuery();
  const { data: customers = [] } = useGetCustomersQuery();
  const { data: suppliers = [] } = useGetSuppliersQuery();
  const { data: materials = [] } = useGetMaterialsQuery();
  const { data: warehouses = [] } = useGetWarehousesQuery();
  const [addBatchTransaction] = useAddBatchTransactionMutation();
  const [deleteDeliveryNote] = useDeleteDeliveryNoteMutation();
  const [deleteTransaction] = useDeleteTransactionMutation();
  const [receiveDeliveryNote] = useReceiveDeliveryNoteMutation();
  const [getDispatchBudgetWarning, { isLoading: budgetWarningLoading }] = useGetDispatchBudgetWarningMutation();
  const [updateJob] = useUpdateJobMutation();
  const [updateSupplier] = useUpdateSupplierMutation();
  const showWarehouseColumn = true;

  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingTransactionIds, setEditingTransactionIds] = useState<string[]>([]);
  const [editingDeliveryNoteId, setEditingDeliveryNoteId] = useState<string | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [selectedJob, setSelectedJob] = useState('');
  const [selectedContactId, setSelectedContactId] = useState('');
  const contactJobRef = useRef('');
  const contactSupplierRef = useRef('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState<number | null>(null);
  const [loadedDeliveryNoteNumber, setLoadedDeliveryNoteNumber] = useState<number | null>(null);
  const [deliveryNoteNumberOverride, setDeliveryNoteNumberOverride] = useState(false);
  const [notes, setNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [skipMaterialDispatch, setSkipMaterialDispatch] = useState(false);
  const [customItems, setCustomItems] = useState<DeliveryNoteCustomItem[]>(() =>
    normalizeCustomItems([], true)
  );
  const [customItemsLineNoAuto, setCustomItemsLineNoAuto] = useState(true);
  const [deliveryType, setDeliveryType] = useState<'DISPATCH' | 'SUBCONTRACT'>('DISPATCH');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [pinnedCustomer, setPinnedCustomer] = useState<{ id: string; name: string } | null>(null);
  const [pinnedSupplier, setPinnedSupplier] = useState<{ id: string; name: string } | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [referenceJobId, setReferenceJobId] = useState('');
  const [transitStatus, setTransitStatus] = useState<string | null>(null);
  const [receivingSubcontract, setReceivingSubcontract] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    step: 1 | 2;
    confirmText: string;
    loading: boolean;
  }>({ open: false, step: 1, confirmText: '', loading: false });
  const [lines, setLines] = useState<Line[]>(() => normalizeLines([], ''));
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
  const canDelete = isSA || perms.includes('transaction.stock_out');

  const { data: jobMaterials = [] } = useGetJobMaterialsQuery(selectedJob, { skip: !selectedJob });
  const isSubcontract = deliveryType === 'SUBCONTRACT';
  const subcontractHasReceived = lines.some((line) => (line.receivedQty ?? 0) > 0.0005);
  const subcontractMaterialsReadOnly =
    isSubcontract &&
    Boolean(editingDeliveryNoteId && subcontractHasReceived);
  const subcontractLocked = subcontractMaterialsReadOnly;
  const subcontractGridEnabled = Boolean(supplierId) && !subcontractMaterialsReadOnly;
  const showSubcontractReceive =
    isSubcontract && Boolean(editingDeliveryNoteId && lines.some((line) => line.materialLineId));

  useEffect(() => {
    if (!isSubcontract) return;
    setLines((prev) =>
      prev.map((line) => ({
        ...line,
        ...(sourceWarehouseId && !line.warehouseId ? { warehouseId: sourceWarehouseId } : {}),
        ...(targetWarehouseId && !line.targetWarehouseId ? { targetWarehouseId } : {}),
        ...(line.warehouseId && !line.receiveDestWarehouseId
          ? { receiveDestWarehouseId: line.warehouseId }
          : {}),
      }))
    );
  }, [sourceWarehouseId, targetWarehouseId, isSubcontract]);

  const selectableJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !job.parentJobId &&
          job.status !== 'COMPLETED' &&
          job.status !== 'CANCELLED' &&
          (!selectedCustomerId || job.customerId === selectedCustomerId),
      ),
    [jobs, selectedCustomerId],
  );

  const customerSelectItems = useMemo(() => {
    const items = customers.map((c) => ({
      id: c.id,
      label: c.name,
      searchText: c.name,
    }));
    if (pinnedCustomer && !items.some((item) => item.id === pinnedCustomer.id)) {
      items.unshift({
        id: pinnedCustomer.id,
        label: pinnedCustomer.name,
        searchText: pinnedCustomer.name,
      });
    }
    return items;
  }, [customers, pinnedCustomer]);

  const supplierSelectItems = useMemo(() => {
    const items = suppliers
      .filter((s) => s.isActive !== false)
      .map((s) => ({
        id: s.id,
        label: s.name,
        searchText: `${s.name} ${s.contactPerson ?? ''}`,
      }));
    if (pinnedSupplier && !items.some((item) => item.id === pinnedSupplier.id)) {
      items.unshift({
        id: pinnedSupplier.id,
        label: pinnedSupplier.name,
        searchText: pinnedSupplier.name,
      });
    }
    return items;
  }, [suppliers, pinnedSupplier]);

  useEffect(() => {
    if (!selectedJob || selectedCustomerId) return;
    const job = jobs.find((entry) => entry.id === selectedJob);
    if (!job?.customerId) return;
    setSelectedCustomerId(job.customerId);
    const customerName = customers.find((c) => c.id === job.customerId)?.name;
    if (customerName) {
      setPinnedCustomer({ id: job.customerId, name: customerName });
    }
  }, [selectedJob, selectedCustomerId, jobs, customers]);
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

  const materialRowsHaveData = useMemo(
    () => lines.some((line) => Boolean(line.materialId?.trim())),
    [lines]
  );

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
    if (isSubcontract) return;
    if (!selectedJob) {
      setSelectedContactId('');
      contactJobRef.current = '';
      return;
    }

    const contacts = getJobContactOptions(selectedJob);
    if (contactJobRef.current !== selectedJob) {
      contactJobRef.current = selectedJob;
      setSelectedContactId(contacts[0]?.id ?? '');
      return;
    }

    if (selectedContactId && contacts.some((contact) => contact.id === selectedContactId)) {
      return;
    }

    setSelectedContactId(contacts[0]?.id ?? '');
  }, [isSubcontract, selectedJob, jobs, selectedContactId]);

  const supplierContactOptions = useMemo(
    () => getSupplierContactOptions(suppliers.find((supplier) => supplier.id === supplierId)),
    [supplierId, suppliers]
  );

  const selectedSupplierContactOption = useMemo(
    () => supplierContactOptions.find((contact) => contact.id === selectedContactId) ?? null,
    [supplierContactOptions, selectedContactId]
  );

  useEffect(() => {
    if (!isSubcontract) return;
    if (!supplierId) {
      setSelectedContactId('');
      contactSupplierRef.current = '';
      return;
    }

    if (contactSupplierRef.current !== supplierId) {
      contactSupplierRef.current = supplierId;
      setSelectedContactId(supplierContactOptions[0]?.id ?? '');
      return;
    }

    if (selectedContactId && supplierContactOptions.some((contact) => contact.id === selectedContactId)) {
      return;
    }

    setSelectedContactId(supplierContactOptions[0]?.id ?? '');
  }, [isSubcontract, supplierId, supplierContactOptions, selectedContactId]);

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

  const parseCustomItems = (notesText: string): DeliveryNoteCustomItem[] => {
    const parsed = parseDeliveryNoteCustomItemsFromNotes(notesText);
    if (parsed.length === 0) {
      return [{ id: generateId(), lineNo: '', name: '', description: '', unit: '', qty: '' }];
    }
    return parsed.map((item) => ({ ...item, id: generateId() }));
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
        id: `contact-${options.length}`,
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

  const jobContactOptions = useMemo(
    () => getJobContactOptions(selectedJob),
    [selectedJob, jobs]
  );

  const selectedContactOption = useMemo(
    () => jobContactOptions.find((contact) => contact.id === selectedContactId) ?? null,
    [jobContactOptions, selectedContactId]
  );

  const selectedContactPerson = isSubcontract
    ? (selectedSupplierContactOption?.name ?? '')
    : (selectedContactOption?.name ?? '');

  function resolveContactIdByName(options: JobContactOption[], name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return options[0]?.id ?? '';
    const exact = options.find((contact) => contact.name === trimmed);
    if (exact) return exact.id;
    const caseInsensitive = options.find(
      (contact) => contact.name.toLowerCase() === trimmed.toLowerCase()
    );
    return caseInsensitive?.id ?? options[0]?.id ?? '';
  }

  // Load existing delivery note if editing or duplicating
  useEffect(() => {
    const transactionId = searchParams.get('transactionId');
    const duplicateFromId = searchParams.get('duplicateFrom');
    const deliveryNoteIdParam = searchParams.get('deliveryNoteId');
    const duplicateDeliveryNoteId = searchParams.get('duplicateDeliveryNoteId');
    const loadKey = [
      transactionId ?? '',
      duplicateFromId ?? '',
      deliveryNoteIdParam ?? '',
      duplicateDeliveryNoteId ?? '',
    ].join('::');
    const needsJobs = Boolean(transactionId || duplicateFromId || deliveryNoteIdParam || duplicateDeliveryNoteId);

    if (needsJobs && jobs.length === 0) return;
    if (appliedDeliveryNoteLoadKeyRef.current === loadKey) return;
    appliedDeliveryNoteLoadKeyRef.current = loadKey;

    const emptyLineTemplate = (): Line[] => normalizeLines([], '');

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
          deliveryType?: 'DISPATCH' | 'SUBCONTRACT';
          jobId: string | null;
          date: string;
          documentNotes: string | null;
          customItemsJson: unknown;
          materialDispatchSkipped: boolean;
          contactPerson?: string | null;
          supplierId?: string | null;
          supplier?: {
            id?: string;
            name?: string;
            contactPerson?: string | null;
            phone?: string | null;
            email?: string | null;
            contactsJson?: unknown;
          } | null;
          sourceWarehouseId?: string | null;
          targetWarehouseId?: string | null;
          referenceJobId?: string | null;
          transitStatus?: string | null;
          materialLines?: Array<{
            id: string;
            materialId: string;
            materialName: string;
            materialUnit: string;
            issuedQty: number;
            receivedQty: number;
            outstandingQty: number;
            sourceWarehouseId: string;
            sourceWarehouseName: string;
            targetWarehouseId?: string | null;
            quantityUomId?: string | null;
          }>;
          job: {
            contactPerson?: string | null;
            customerId?: string;
            customer?: { id?: string; name?: string } | null;
          } | null;
          referenceJob?: {
            customerId?: string;
            customer?: { id?: string; name?: string } | null;
          } | null;
          firstStockOutTransactionId: string | null;
          transactionIds?: string[];
        };

        setDeliveryType(d.deliveryType ?? 'DISPATCH');
        setTransitStatus(d.transitStatus ?? null);
        setSupplierId(d.supplierId ?? '');
        setSourceWarehouseId(d.sourceWarehouseId ?? '');
        setTargetWarehouseId(d.targetWarehouseId ?? '');
        setReferenceJobId(d.referenceJobId ?? '');
        const canonicalJobId = resolveParentJobIdForDeliveryNote(d.jobId || '', jobs);
        setSelectedJob(canonicalJobId);
        const loadedCustomerId =
          customerIdFromLoadedJob(d.job) || customerIdFromLoadedJob(d.referenceJob);
        const loadedCustomerName =
          customerNameFromLoadedJob(d.job) || customerNameFromLoadedJob(d.referenceJob);
        if (loadedCustomerId) setSelectedCustomerId(loadedCustomerId);
        if (loadedCustomerId && loadedCustomerName) {
          setPinnedCustomer({ id: loadedCustomerId, name: loadedCustomerName });
        } else {
          setPinnedCustomer(null);
        }
        if (d.supplierId && d.supplier?.name) {
          setPinnedSupplier({ id: d.supplierId, name: d.supplier.name });
        } else {
          setPinnedSupplier(null);
        }
        contactJobRef.current = canonicalJobId;
        let loadedContactName = d.contactPerson?.trim() || '';
        setDate(
          opts.duplicate ? new Date().toISOString().split('T')[0] : new Date(d.date).toISOString().split('T')[0]
        );
        setNotes(d.documentNotes?.trim() || '');
        setOverrideReason('');
        setSignedCopyUrl(null);

        const rows = Array.isArray(d.customItemsJson)
          ? (d.customItemsJson as Array<Record<string, unknown>>).map((row) => ({
              id: generateId(),
              lineNo:
                typeof row.lineNo === 'string'
                  ? row.lineNo
                  : typeof row.slno === 'string'
                    ? row.slno
                    : row.lineNo != null
                      ? String(row.lineNo)
                      : row.slno != null
                        ? String(row.slno)
                        : '',
              name: String(row.name ?? ''),
              description: String(row.description ?? ''),
              unit: String(row.unit ?? ''),
              qty: String(row.qty ?? ''),
            }))
          : [];
        const loadedCustomItems =
          rows.length > 0 ? rows : [];
        const loadedLineNoAuto = inferCustomItemsLineNoAuto(
          loadedCustomItems.length > 0 ? loadedCustomItems : [{ id: generateId(), lineNo: '', name: '', description: '', unit: '', qty: '' }]
        );
        setCustomItemsLineNoAuto(loadedLineNoAuto);
        setCustomItems(normalizeCustomItems(loadedCustomItems, loadedLineNoAuto));

        setSkipMaterialDispatch(Boolean(d.materialDispatchSkipped));

        if (d.deliveryType === 'SUBCONTRACT' && d.materialLines && d.materialLines.length > 0) {
          setLines(
            normalizeLines(
              d.materialLines.map((line) => ({
                id: generateId(),
                jobId: '',
                materialId: line.materialId,
                dispatchQty: String(line.issuedQty),
                returnQty: '',
                quantityUomId: line.quantityUomId ?? '',
                warehouseId: line.sourceWarehouseId,
                targetWarehouseId: line.targetWarehouseId ?? d.targetWarehouseId ?? '',
                materialLineId: line.id,
                issuedQty: line.issuedQty,
                receivedQty: line.receivedQty,
                outstandingQty: line.outstandingQty,
                receiveQty: '',
                receiveDestWarehouseId: line.sourceWarehouseId,
              })),
              ''
            )
          );
        } else if (!d.materialDispatchSkipped && d.transactionIds && d.transactionIds.length > 0) {
          const txnResults = await Promise.all(
            d.transactionIds.map(async (txnId) => {
              const txnRes = await fetch(`/api/transactions/${txnId}`);
              const txnJson = await txnRes.json();
              return txnRes.ok ? txnJson.data : null;
            })
          );
          const validTxns = txnResults.filter(Boolean) as Array<{
            notes?: string | null;
            material?: { id: string };
            quantity: number;
            warehouseId?: string | null;
            quantityUomId?: string | null;
          }>;
          if (validTxns[0] && !loadedContactName) {
            loadedContactName =
              parseDeliveryContactPerson(validTxns[0].notes || '') || d.job?.contactPerson?.trim() || '';
          }
          if (validTxns.length > 0) {
            setLines(
              normalizeLines(
                validTxns
                  .filter((txn) => txn.material)
                  .map((txn) => ({
                    id: generateId(),
                    jobId: canonicalJobId,
                    materialId: txn.material!.id,
                    dispatchQty: String(txn.quantity),
                    returnQty: '',
                    quantityUomId: txn.quantityUomId ?? '',
                    warehouseId: txn.warehouseId ?? '',
                    originalDispatchQty: txn.quantity,
                    originalWarehouseId: txn.warehouseId ?? '',
                  })),
                canonicalJobId
              )
            );
          } else {
            setLines(emptyLineTemplate());
          }
        } else {
          setLines(emptyLineTemplate());
        }

        if (d.deliveryType === 'SUBCONTRACT') {
          if (!loadedContactName) {
            loadedContactName = d.contactPerson?.trim() || '';
          }
          contactSupplierRef.current = d.supplierId ?? '';
          const supplierSource =
            (d.supplier as { contactPerson?: string; phone?: string; email?: string; contactsJson?: unknown } | null) ??
            suppliers.find((supplier) => supplier.id === d.supplierId);
          setSelectedContactId(
            resolveSupplierContactIdByName(
              getSupplierContactOptions(supplierSource ?? undefined),
              loadedContactName
            )
          );
        } else {
          if (!loadedContactName) {
            loadedContactName = d.job?.contactPerson?.trim() || '';
          }
          setSelectedContactId(
            resolveContactIdByName(getJobContactOptions(canonicalJobId), loadedContactName)
          );
        }

        if (opts.duplicate) {
          setEditingTransactionId(null);
          setEditingTransactionIds([]);
          setEditingDeliveryNoteId(null);
          const nextNumber = await fetchNextDeliveryNoteNumber();
          if (nextNumber != null) {
            setDeliveryNoteNumber(nextNumber);
          }
          setLoadedDeliveryNoteNumber(null);
          setDeliveryNoteNumberOverride(false);
        } else {
          setEditingDeliveryNoteId(d.id);
          setEditingTransactionIds(d.transactionIds ?? []);
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
            const linkedDeliveryNoteId =
              (txn.deliveryNoteId as string | null | undefined) ??
              (txn.deliveryNote as { id?: string } | null | undefined)?.id ??
              null;
            if (linkedDeliveryNoteId) {
              await loadFromDeliveryNoteRecord(linkedDeliveryNoteId, { duplicate: isDuplicating });
              return;
            }

            const canonicalJobId = resolveParentJobIdForDeliveryNote(txn.jobId || '', jobs);
            setSelectedJob(canonicalJobId);
            const loadedCustomerId = customerIdFromLoadedJob(txn.job);
            const loadedCustomerName = customerNameFromLoadedJob(txn.job);
            if (loadedCustomerId) setSelectedCustomerId(loadedCustomerId);
            if (loadedCustomerId && loadedCustomerName) {
              setPinnedCustomer({ id: loadedCustomerId, name: loadedCustomerName });
            }
            const contactName = parseDeliveryContactPerson(txn.notes || '');
            contactJobRef.current = canonicalJobId;
            setSelectedContactId(
              resolveContactIdByName(getJobContactOptions(canonicalJobId), contactName)
            );
            // Duplicates default to today's date; edits keep the original date
            setDate(isDuplicating
              ? new Date().toISOString().split('T')[0]
              : new Date(txn.date).toISOString().split('T')[0]);

            // Parse custom items from notes
            const customItemsParsed = parseCustomItems(txn.notes || '');
            const parsedLineNoAuto = inferCustomItemsLineNoAuto(
              customItemsParsed.length > 0
                ? customItemsParsed
                : [{ id: generateId(), lineNo: '', name: '', description: '', unit: '', qty: '' }]
            );
            setCustomItemsLineNoAuto(parsedLineNoAuto);
            setCustomItems(normalizeCustomItems(customItemsParsed, parsedLineNoAuto));
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
              setLines(
                normalizeLines(
                  [
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
                  ],
                  canonicalJobId
                )
              );
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

    if (type === 'date') {
      setDate(newValue);
      setChangeWarningModal({ open: false, pendingChange: null });
      return;
    }

    if (type === 'job') setSelectedJob(newValue);
    setCustomItemsLineNoAuto(true);
    setCustomItems(normalizeCustomItems([], true));
    setLines(normalizeLines([], ''));
    setNotes('');
    setSkipMaterialDispatch(false);
    setChangeWarningModal({ open: false, pendingChange: null });
  };

  const lineJobId = isSubcontract ? referenceJobId : selectedJob;

  const addCustomItem = () => {
    setCustomItems((prev) => normalizeCustomItems([...prev, emptyCustomItem()], customItemsLineNoAuto));
  };

  const removeCustomItem = (id: string) => {
    setCustomItems((prev) => normalizeCustomItems(prev.filter((item) => item.id !== id), customItemsLineNoAuto));
  };

  const duplicateCustomItem = (id: string) => {
    setCustomItems((prev) => {
      const idx = prev.findIndex((item) => item.id === id);
      if (idx < 0) return prev;
      const source = prev[idx];
      const clone = { ...source, id: generateId() };
      return normalizeCustomItems(
        [...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)],
        customItemsLineNoAuto
      );
    });
  };

  const updateCustomItem = (
    id: string,
    field: keyof Omit<DeliveryNoteCustomItem, 'id'>,
    value: string
  ) => {
    setCustomItems((prev) =>
      normalizeCustomItems(
        prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
        customItemsLineNoAuto
      )
    );
  };

  const handleCustomItemsLineNoAutoChange = (auto: boolean) => {
    if (!auto) {
      setCustomItems((prev) =>
        normalizeCustomItems(
          prev.map((item, idx) => ({
            ...item,
            lineNo: item.lineNo.trim() || String(idx + 1),
          })),
          false
        )
      );
    } else {
      setCustomItems((prev) => normalizeCustomItems(prev, true));
    }
    setCustomItemsLineNoAuto(auto);
  };

  const addLine = () => {
    setLines((prev) => normalizeLines([...prev, emptyLine(lineJobId)], lineJobId));
  };

  const reloadSubcontractLines = async () => {
    if (!editingDeliveryNoteId) return;
    const res = await fetch(`/api/delivery-notes/${encodeURIComponent(editingDeliveryNoteId)}`);
    const json = await res.json();
    if (!res.ok || !json.data) {
      toast.error(json.error || 'Failed to refresh delivery note');
      return;
    }
    const d = json.data as {
      transitStatus?: string | null;
      materialLines?: Array<{
        id: string;
        materialId: string;
        issuedQty: number;
        receivedQty: number;
        outstandingQty: number;
        sourceWarehouseId: string;
        targetWarehouseId?: string | null;
        quantityUomId?: string | null;
      }>;
    };
    setTransitStatus(d.transitStatus ?? null);
    if (d.materialLines?.length) {
      setLines(
        normalizeLines(
          d.materialLines.map((line) => ({
            id: generateId(),
            jobId: '',
            materialId: line.materialId,
            dispatchQty: String(line.issuedQty),
            returnQty: '',
            quantityUomId: line.quantityUomId ?? '',
            warehouseId: line.sourceWarehouseId,
            targetWarehouseId: line.targetWarehouseId ?? '',
            materialLineId: line.id,
            issuedQty: line.issuedQty,
            receivedQty: line.receivedQty,
            outstandingQty: line.outstandingQty,
            receiveQty: '',
            receiveDestWarehouseId: line.sourceWarehouseId,
          })),
          ''
        )
      );
    }
  };

  const handleReceiveFromGrid = async () => {
    if (!editingDeliveryNoteId) {
      toast.error('Save the delivery note before receiving material');
      return;
    }
    const payload = lines
      .filter((line) => line.materialLineId && Number.parseFloat(line.receiveQty ?? '') > 0)
      .map((line) => ({
        lineId: line.materialLineId!,
        receiveQty: Number.parseFloat(line.receiveQty!),
        destinationWarehouseId: line.receiveDestWarehouseId || line.warehouseId,
      }));
    if (payload.length === 0) {
      toast.error('Enter receive quantity for at least one line');
      return;
    }
    setReceivingSubcontract(true);
    try {
      await receiveDeliveryNote({
        id: editingDeliveryNoteId,
        lines: payload,
      }).unwrap();
      toast.success('Material received');
      await reloadSubcontractLines();
    } catch (err: unknown) {
      const rtkErr = err as { data?: { error?: string } };
      toast.error(rtkErr?.data?.error ?? 'Failed to receive material');
    } finally {
      setReceivingSubcontract(false);
    }
  };

  const fillAllOutstandingReceive = () => {
    setLines((prev) =>
      prev.map((line) =>
        line.materialLineId && (line.outstandingQty ?? 0) > 0.0005
          ? { ...line, receiveQty: String(line.outstandingQty) }
          : line
      )
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => normalizeLines(prev.filter((l) => l.id !== id), lineJobId));
  };

  const updateLine = (id: string, field: keyof Line, value: string) => {
    setLines((prev) =>
      normalizeLines(
        prev.map((l) => {
          if (l.id !== id) return l;
          if (field === 'materialId') {
            if (!value.trim()) {
              return {
                ...l,
                materialId: '',
                dispatchQty: '',
                returnQty: '',
                quantityUomId: '',
                warehouseId: '',
                targetWarehouseId: '',
              };
            }
            const defaultWarehouse = materials.find((m) => m.id === value)?.warehouseId ?? '';
            return {
              ...l,
              materialId: value,
              quantityUomId: '',
              warehouseId: l.warehouseId || sourceWarehouseId || defaultWarehouse,
              targetWarehouseId: l.targetWarehouseId || targetWarehouseId || '',
              receiveDestWarehouseId:
                l.receiveDestWarehouseId || l.warehouseId || sourceWarehouseId || defaultWarehouse,
            };
          }
          if (field === 'warehouseId' && isSubcontract && !l.receiveDestWarehouseId) {
            return { ...l, [field]: value, receiveDestWarehouseId: value };
          }
          return { ...l, [field]: value };
        }),
        lineJobId
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
      setSelectedContactId(resolveContactIdByName(getJobContactOptions(selectedJob), name));
      contactJobRef.current = selectedJob;
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

  const handleCreateSupplierContact = async () => {
    if (!supplierId) {
      toast.error('Select a supplier first');
      return;
    }
    const name = addContactModal.name.trim();
    if (!name) {
      toast.error('Contact name is required');
      return;
    }
    const currentSupplier = suppliers.find((supplier) => supplier.id === supplierId);
    if (!currentSupplier) {
      toast.error('Selected supplier not found');
      return;
    }

    const currentContacts = Array.isArray(currentSupplier.contactsJson)
      ? [...(currentSupplier.contactsJson as Array<Record<string, unknown>>)]
      : [];
    if (
      currentContacts.some((row) => {
        const contactName =
          (typeof row.contact_name === 'string' ? row.contact_name : '') ||
          (typeof row.name === 'string' ? row.name : '');
        return contactName.trim().toLowerCase() === name.toLowerCase();
      })
    ) {
      toast.error('Contact with this name already exists on the selected supplier');
      return;
    }

    const newContact: Record<string, string | number> = {
      contact_name: name,
      sort_order: currentContacts.length,
    };
    if (addContactModal.number.trim()) newContact.phone = addContactModal.number.trim();
    if (addContactModal.email.trim()) newContact.email = addContactModal.email.trim();

    const nextContacts = [...currentContacts, newContact];
    const nextPrimary =
      (currentSupplier.contactPerson && currentSupplier.contactPerson.trim()) || name;

    try {
      setAddContactModal((prev) => ({ ...prev, saving: true }));
      await updateSupplier({
        id: supplierId,
        data: {
          contactsJson: nextContacts,
          contactPerson: nextPrimary,
        },
      }).unwrap();
      setSelectedContactId(
        resolveSupplierContactIdByName(getSupplierContactOptions(currentSupplier), name)
      );
      contactSupplierRef.current = supplierId;
      setAddContactModal({
        open: false,
        name: '',
        number: '',
        email: '',
        designation: '',
        label: '',
        saving: false,
      });
      toast.success('Contact person added to selected supplier');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data?: { error?: string } }).data?.error ?? 'Failed to add contact person')
          : 'Failed to add contact person';
      toast.error(message);
      setAddContactModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (deliveryType === 'DISPATCH') {
      if (!selectedJob) {
        toast.error('Select a job');
        return;
      }
      if (jobContactOptions.length > 0 && !selectedContactId) {
        toast.error('Select a contact person');
        return;
      }
    } else if (!supplierId) {
      toast.error('Select a supplier');
      return;
    } else if (supplierContactOptions.length > 0 && !selectedContactId) {
      toast.error('Select a supplier contact person');
      return;
    }

    // Get valid materials lines
    const validLines = lines.filter(line => line.materialId && line.dispatchQty);

    // Get valid custom items
    const validCustomItems = customItems.filter(item => item.name.trim());

    // Validation: either have materials, or have custom items (if skipping materials), or both
    if (subcontractLocked) {
      toast.error('This subcontract delivery note cannot be edited after material has been received');
      return;
    }

    if (skipMaterialDispatch) {
      if (validCustomItems.length === 0) {
        toast.error('Add at least one custom item');
        return;
      }
    } else {
      if (validLines.length === 0) {
        toast.error(
          deliveryType === 'SUBCONTRACT'
            ? 'Add at least one material line or enable custom items only'
            : 'Add at least one material or enable "Custom Items Only"'
        );
        return;
      }
      if (deliveryType === 'SUBCONTRACT') {
        for (const line of validLines) {
          const src = line.warehouseId || sourceWarehouseId;
          const tgt = line.targetWarehouseId || targetWarehouseId;
          if (!src || !tgt) {
            toast.error('Each material line needs source and transit warehouse');
            return;
          }
          if (src === tgt) {
            toast.error('Source and transit warehouse must differ on each line');
            return;
          }
        }
      }
    }

    if (!skipMaterialDispatch && deliveryType === 'DISPATCH') {
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
            validCustomItems.map((item) => formatDeliveryNoteCustomItemBullet(item)).join('\n');
          finalNotes = finalNotes ? finalNotes + '\n' + deliveryNoteHeader + customItemsText : (deliveryNoteHeader + customItemsText);
        } else {
          finalNotes = finalNotes
            ? finalNotes + '\n' + deliveryNoteHeader + contactLine
            : deliveryNoteHeader + contactLine;
        }
      }

      // Submit as a batch transaction
      const linesToSubmit = skipMaterialDispatch
        ? []
        : validLines.map((l) => ({
            materialId: l.materialId,
            quantity: parseFloat(l.dispatchQty),
            quantityUomId: l.quantityUomId.trim() || undefined,
            returnQty: deliveryType === 'DISPATCH' && l.returnQty ? parseFloat(l.returnQty) : undefined,
            warehouseId:
              (l.warehouseId || (deliveryType === 'SUBCONTRACT' ? sourceWarehouseId : '')) || undefined,
            targetWarehouseId:
              deliveryType === 'SUBCONTRACT'
                ? l.targetWarehouseId || targetWarehouseId || undefined
                : undefined,
          }));

      const batchResult = await addBatchTransaction({
        type: 'STOCK_OUT',
        jobId: deliveryType === 'DISPATCH' ? selectedJob : undefined,
        notes: finalNotes || undefined,
        baseNotes: notes?.trim() ? notes.trim() : '',
        deliveryNoteCustomItems: validCustomItems.map((item, idx) => ({
          lineNo: resolveCustomItemLineNoForSave(item, idx, customItemsLineNoAuto),
          name: item.name.trim(),
          description: item.description?.trim() || undefined,
          unit: item.unit.trim(),
          qty: item.qty.trim(),
        })),
        overrideReason: overrideReason.trim() || undefined,
        date,
        isDeliveryNote: true,
        deliveryType,
        deliveryContactPerson: selectedContactPerson.trim() || undefined,
        supplierId: deliveryType === 'SUBCONTRACT' ? supplierId || undefined : undefined,
        sourceWarehouseId:
          deliveryType === 'SUBCONTRACT' ? sourceWarehouseId.trim() || undefined : undefined,
        targetWarehouseId:
          deliveryType === 'SUBCONTRACT' ? targetWarehouseId.trim() || undefined : undefined,
        referenceJobId: deliveryType === 'SUBCONTRACT' && referenceJobId ? referenceJobId : undefined,
        ...(deliveryNoteNumberOverride && deliveryNoteNumber != null
          ? { deliveryNoteNumber }
          : {}),
        existingTransactionIds:
          deliveryType === 'DISPATCH' && editingTransactionIds.length > 0
            ? editingTransactionIds
            : deliveryType === 'DISPATCH' && editingTransactionId
              ? [editingTransactionId]
              : undefined,
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
      setSelectedContactId('');
      contactJobRef.current = '';
      setNotes('');
      setOverrideReason('');
      setSkipMaterialDispatch(false);
      setDeliveryType('DISPATCH');
      setSelectedCustomerId('');
      setSupplierId('');
      setSourceWarehouseId('');
      setTargetWarehouseId('');
      setReferenceJobId('');
      setTransitStatus(null);
      setCustomItemsLineNoAuto(true);
      setCustomItems(normalizeCustomItems([], true));
      setLines(normalizeLines([], ''));
      setEditingTransactionId(null);
      setEditingTransactionIds([]);
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
      <div className="flex w-full min-w-0 flex-col items-center justify-center py-8 text-sm text-muted-foreground">
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

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, step: 1, confirmText: '', loading: false });
  };

  const confirmDeleteDeliveryNote = async () => {
    if (deleteModal.step === 1) {
      setDeleteModal((prev) => ({ ...prev, step: 2 }));
      return;
    }
    if (deleteModal.confirmText.trim().toUpperCase() !== 'DELETE') {
      toast.error('Type DELETE to confirm');
      return;
    }
    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      if (editingDeliveryNoteId) {
        await deleteDeliveryNote(editingDeliveryNoteId).unwrap();
      } else {
        const txnIds =
          editingTransactionIds.length > 0
            ? editingTransactionIds
            : editingTransactionId
              ? [editingTransactionId]
              : [];
        for (const txnId of txnIds) {
          await deleteTransaction(txnId).unwrap();
        }
      }
      toast.success('Delivery note deleted');
      closeDeleteModal();
      router.push('/stock/dispatch');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data?: { error?: string } }).data?.error ?? 'Failed to delete')
          : 'Failed to delete';
      toast.error(message);
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

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

    setCustomItems(normalizeCustomItems(newCustomItems, customItemsLineNoAuto));
    setLines(normalizeLines(newLines, lineJobId));

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
    <div className="flex w-full min-w-0 flex-col gap-2 overflow-x-hidden">
      <header className="flex w-full min-w-0 flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <Link
              href="/stock/dispatch"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              ← Dispatch
            </Link>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{pageTitle}</h1>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{pageDescription}</p>
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
          {canDelete && (editingDeliveryNoteId || editingTransactionId || editingTransactionIds.length > 0) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300"
              onClick={() => setDeleteModal({ open: true, step: 1, confirmText: '', loading: false })}
            >
              Delete
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
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs font-medium text-foreground">
              Budget warning: this delivery may exceed the variation job material budget.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {budgetWarning.rows.slice(0, 4).map((row) => (
                <div key={row.materialId} className="rounded border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground">
                  <span className="font-semibold">{row.materialName}</span>
                  {' · '}
                  {row.projectedIssuedBaseQuantity.toFixed(3)} / {row.estimatedBaseQuantity.toFixed(3)} {row.baseUnit}
                  {row.quantityOverrun > 0.0005 ? ` · +${row.quantityOverrun.toFixed(3)}` : ''}
                </div>
              ))}
              {budgetWarning.warningCount > 4 && (
                <span className="self-center text-[11px] text-muted-foreground">+{budgetWarning.warningCount - 4} more</span>
              )}
            </div>
          </div>
        ) : null}

        {overrideSignals.negativeStockLineCount > 0 && (
          <div className="border-b border-destructive/40 bg-destructive/10 px-3 py-2">
            <p className="text-xs font-medium text-destructive">
              Override required: {overrideSignals.negativeStockLineCount} line(s) exceed available warehouse FIFO stock.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-muted/30 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
            {DELIVERY_TYPE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={Boolean(editingDeliveryNoteId || editingTransactionId)}
                onClick={() => {
                  if (hasData()) {
                    toast.error('Clear the form before changing delivery type');
                    return;
                  }
                  setDeliveryType(option.id);
                }}
                className={cn(
                  'rounded border px-2.5 py-1 text-xs font-medium transition-colors',
                  deliveryType === option.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 text-right">
              <p className="text-xs font-medium text-foreground">Custom items only</p>
              {materialRowsHaveData && !skipMaterialDispatch ? (
                <p className="text-[10px] text-amber-700 dark:text-amber-200">Clears material lines</p>
              ) : (
                <p className="text-[10px] text-muted-foreground">No stock movement</p>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={skipMaterialDispatch}
              onClick={() => {
                const next = !skipMaterialDispatch;
                if (next) {
                  setLines((prev) =>
                    normalizeLines(
                      prev.map((line) => ({
                        ...line,
                        materialId: '',
                        dispatchQty: '',
                        returnQty: '',
                        quantityUomId: '',
                        warehouseId: '',
                        originalDispatchQty: undefined,
                        originalWarehouseId: undefined,
                      })),
                      lineJobId
                    )
                  );
                }
                setSkipMaterialDispatch(next);
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background ${
                skipMaterialDispatch ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  skipMaterialDispatch ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Job / subcontract header */}
        <div className="border-b border-border p-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {!isSubcontract ? (
              <>
                <div>
                  <SearchSelect
                    label="Customer name"
                    required
                    value={selectedCustomerId}
                    onChange={(id) => {
                      setSelectedCustomerId(id);
                      const customer = customers.find((c) => c.id === id);
                      setPinnedCustomer(customer ? { id: customer.id, name: customer.name } : null);
                      if (selectedJob) {
                        const job = jobs.find((j) => j.id === selectedJob);
                        if (job && job.customerId !== id) {
                          setSelectedJob('');
                          setSelectedContactId('');
                        }
                      }
                    }}
                    placeholder="Search customer…"
                    items={customerSelectItems}
                  />
                </div>
                <div>
                  <SearchSelect
                    label="Job"
                    required
                    value={selectedJob}
                    onChange={(id) => handleJobChange(id)}
                    placeholder={selectedCustomerId ? 'Search by job number…' : 'Select customer first'}
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
              </>
            ) : (
              <>
                <div>
                  <SearchSelect
                    label="Supplier name"
                    required
                    value={supplierId}
                    onChange={(id) => {
                      setSupplierId(id);
                      const supplier = suppliers.find((s) => s.id === id);
                      setPinnedSupplier(supplier ? { id: supplier.id, name: supplier.name } : null);
                    }}
                    placeholder="Search supplier…"
                    items={supplierSelectItems}
                  />
                </div>
                <div>
                  <SearchSelect
                    label="Reference job (optional)"
                    value={referenceJobId}
                    onChange={(id) => {
                      setReferenceJobId(id);
                      if (!id) return;
                      const job = jobs.find((entry) => entry.id === id);
                      if (!job?.customerId) return;
                      const customerName = customers.find((c) => c.id === job.customerId)?.name;
                      if (customerName) {
                        setPinnedCustomer({ id: job.customerId, name: customerName });
                      }
                    }}
                    placeholder="Planning reference only"
                    items={selectableJobs.map((j) => ({
                      id: j.id,
                      label: j.jobNumber,
                      searchText: j.jobNumber,
                    }))}
                  />
                </div>
              </>
            )}
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Delivery date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-bold text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
                {...withBlockInputWheelChange({
                  className: cn(
                    'w-full rounded-md border border-border px-2.5 py-1.5 font-mono text-sm font-bold text-red-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring dark:text-red-400',
                    deliveryNoteNumberOverride ? 'bg-background' : 'cursor-default bg-muted/40'
                  ),
                })}
              />
              <label className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
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
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {isSubcontract ? (
              <>
                <div>
                  <SearchSelect
                    label="Default source warehouse (optional)"
                    value={sourceWarehouseId}
                    onChange={setSourceWarehouseId}
                    placeholder="Auto-fill empty rows…"
                    items={warehouses.map((w) => ({ id: w.id, label: w.name, searchText: w.name }))}
                  />
                </div>
                <div>
                  <SearchSelect
                    label="Default transit warehouse (optional)"
                    value={targetWarehouseId}
                    onChange={setTargetWarehouseId}
                    placeholder="Auto-fill empty rows…"
                    items={warehouses.map((w) => ({ id: w.id, label: w.name, searchText: w.name }))}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Supplier contact person
                  </label>
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
                    <div className="min-w-0 flex-1">
                      <SearchSelect
                        key={supplierId || 'no-supplier'}
                        value={selectedContactId}
                        onChange={setSelectedContactId}
                        allowClearButton={false}
                        placeholder={
                          supplierId
                            ? supplierContactOptions.length > 0
                              ? 'Search supplier contact…'
                              : 'No contacts on supplier'
                            : 'Select supplier first'
                        }
                        disabled={!supplierId || supplierContactOptions.length === 0}
                        items={supplierContactOptions.map((opt) => ({
                          id: opt.id,
                          label: opt.label,
                          searchText: opt.searchText,
                        }))}
                        renderItem={(item) => {
                          const full = supplierContactOptions.find((x) => x.id === item.id);
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
                    </div>
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
                      disabled={!supplierId}
                      className="shrink-0 rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1.5 text-[11px] text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      + Contact
                    </button>
                    {selectedSupplierContactOption ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground sm:max-w-xs">
                        <span className="font-semibold text-foreground">{selectedSupplierContactOption.name}</span>
                        {selectedSupplierContactOption.phone ? <span>{selectedSupplierContactOption.phone}</span> : null}
                        {selectedSupplierContactOption.email ? (
                          <span className="truncate">{selectedSupplierContactOption.email}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="sm:col-span-2 lg:col-span-4">
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Contact person
                </label>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2">
                  <div className="min-w-0 flex-1">
                    <SearchSelect
                      key={selectedJob || 'no-job'}
                      value={selectedContactId}
                      onChange={setSelectedContactId}
                      allowClearButton={false}
                      placeholder={
                        selectedJob
                          ? jobContactOptions.length > 0
                            ? 'Search contact…'
                            : 'No contacts on job'
                          : 'Select job first'
                      }
                      disabled={!selectedJob || jobContactOptions.length === 0}
                      items={jobContactOptions.map((opt) => ({
                        id: opt.id,
                        label: opt.label,
                        searchText: opt.searchText,
                      }))}
                      renderItem={(item) => {
                        const full = jobContactOptions.find((x) => x.id === item.id);
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
                  </div>
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
                    className="shrink-0 rounded border border-blue-500/40 bg-blue-500/10 px-2 py-1.5 text-[11px] text-blue-300 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Contact
                  </button>
                  {selectedContactOption ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground sm:max-w-xs">
                      <span className="font-semibold text-foreground">{selectedContactOption.name}</span>
                      {(selectedContactOption.designation || selectedContactOption.contactLabel) && (
                        <span>{selectedContactOption.designation || selectedContactOption.contactLabel}</span>
                      )}
                      {selectedContactOption.phone ? <span>{selectedContactOption.phone}</span> : null}
                      {selectedContactOption.email ? (
                        <span className="truncate">{selectedContactOption.email}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notes & override */}
        <div className="border-b border-border px-3 py-2">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional general notes"
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Override reason
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={overrideSignals.requiresReason ? 'Required for this delivery note' : 'Only needed for exceptions'}
                rows={2}
                className={`w-full rounded-md border px-2.5 py-1.5 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${
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
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
              <h3 className="text-xs font-semibold text-foreground">
                {isSubcontract ? 'Materials to send' : 'Materials for dispatch'}
              </h3>
              {isSubcontract && transitStatus ? (
                <Badge variant="outline" className="text-[9px] uppercase">
                  {transitStatus.replace(/_/g, ' ')}
                </Badge>
              ) : null}
              <span className="text-[10px] text-muted-foreground">
                {isSubcontract
                  ? 'Source/transit per line · receive in grid after issue'
                  : 'Affects inventory'}
              </span>
              {subcontractMaterialsReadOnly ? (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  Issue locked after receive started
                </span>
              ) : null}
            </div>
            <DispatchLineGrid
              lines={lines}
              materials={materials}
              warehouses={warehouses}
              selectedJob={isSubcontract ? referenceJobId || 'subcontract' : selectedJob}
              showWarehouseColumn={showWarehouseColumn}
              variant={isSubcontract ? 'subcontract' : 'dispatch'}
              showSubcontractReceive={showSubcontractReceive}
              subcontractIssueReadOnly={subcontractMaterialsReadOnly}
              gridEnabled={isSubcontract ? Boolean(supplierId) : Boolean(selectedJob)}
              emptyMessage={
                isSubcontract
                  ? 'No materials added yet. Select supplier, then add rows with source/transit warehouses.'
                  : 'No materials added yet. Click + Add row below to start.'
              }
              onUpdateLine={updateLine}
              persistScope="delivery-note"
              budgetWarningMaterialIds={isSubcontract ? undefined : budgetWarningMaterialIds}
            />
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-3 py-1.5">
              {showSubcontractReceive ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fillAllOutstandingReceive}
                  >
                    Fill all outstanding
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleReceiveFromGrid()}
                    disabled={receivingSubcontract}
                  >
                    {receivingSubcontract ? 'Receiving…' : 'Receive'}
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                disabled={isSubcontract ? !subcontractGridEnabled : !selectedJob}
              >
                + Add row
              </Button>
            </div>
          </div>
        )}

        {/* Custom Items Section */}
        <div className="border-b border-border bg-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary/10 px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground">Custom items (for printing)</h3>
              <span className="text-[10px] text-muted-foreground">No stock movement</span>
            </div>
            {deliveryNoteNumber != null ? (
              <span className="rounded border border-red-500/30 bg-background/80 px-2 py-0.5 font-mono text-[11px] font-bold text-red-600 dark:text-red-400">
                #{deliveryNoteNumber}
              </span>
            ) : null}
          </div>
          <div className="border-b border-border bg-primary/5">
            <DeliveryNoteCustomItemsGrid
              items={customItems}
              lineNoAuto={customItemsLineNoAuto}
              onLineNoAutoChange={handleCustomItemsLineNoAutoChange}
              onUpdateItem={updateCustomItem}
              onDuplicateItem={duplicateCustomItem}
              onRemoveItem={removeCustomItem}
            />
          </div>
          <div className="flex justify-end border-t border-border bg-primary/5 px-3 py-1.5">
            <Button type="button" variant="outline" size="sm" onClick={addCustomItem}>
              + Add row
            </Button>
          </div>
        </div>

        {/* Signed Copy Upload — Edit mode only */}
        {editingTransactionId && (
          <div className="border border-border border-b-0 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
              <div>
                <h3 className="text-xs font-semibold text-foreground">Signed copy</h3>
                <p className="text-[10px] text-muted-foreground">Upload signed physical copy (Google Drive)</p>
              </div>
            </div>
            <div className="p-3">
              {signedCopyUrl ? (
                <div className="mb-2 flex items-center justify-between rounded border border-green-500/50 bg-green-900/20 p-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <svg className="h-4 w-4 shrink-0 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-green-300">Uploaded</p>
                      <a href={signedCopyUrl} target="_blank" rel="noopener noreferrer" className="truncate text-[10px] text-green-400 hover:text-green-300 underline">
                        View in Drive →
                      </a>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignedCopyUrl(null)}
                    className="p-1 text-green-400 hover:text-green-300"
                    disabled={uploadingSignedCopy}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div>
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
                    <div className="cursor-pointer rounded border-2 border-dashed border-border p-4 text-center transition-colors hover:border-muted-foreground/40 hover:bg-muted/40"
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
                      <svg className="mx-auto mb-1 h-8 w-8 text-muted-foreground" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20a4 4 0 004 4h24a4 4 0 004-4V20m-8-8l-6.586-6.586A2 2 0 0028.172 2H28a2 2 0 00-2 2v6a2 2 0 002 2h6zm-4 6H12m0 8h16m-6 6H12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-xs font-medium text-foreground">
                        {uploadingSignedCopy ? 'Uploading…' : 'Click or drag to upload'}
                      </p>
                      <p className="text-[10px] text-muted-foreground">JPEG, PNG, WebP or PDF · max 20 MB</p>
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
                onClick={() => void (isSubcontract ? handleCreateSupplierContact() : handleCreateContactPerson())}
                className="px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-60"
              >
                {addContactModal.saving ? 'Saving...' : 'Save Contact'}
              </button>
            </div>
          </div>
        </>
      )}

      {deleteModal.open ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={closeDeleteModal} />
          <div className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              {deleteModal.step === 1 ? 'Delete this delivery note?' : 'Confirm deletion'}
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              This removes the delivery note and reverses all linked stock movements (dispatch or warehouse transfers).
              {isSubcontract && transitStatus && transitStatus !== 'ON_TRANSIT'
                ? ' Received material will be unwound from destination/transit warehouses.'
                : ''}
            </p>
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-600/15 p-3 text-xs text-red-800 dark:text-red-300">
              <ul className="list-inside list-disc space-y-1">
                <li>Deletes all related stock transactions</li>
                <li>Cannot be undone</li>
              </ul>
            </div>
            {deleteModal.step === 2 ? (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Type <span className="font-mono font-semibold text-foreground">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteModal.confirmText}
                  onChange={(e) => setDeleteModal((prev) => ({ ...prev, confirmText: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteModal.loading}
                className="rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteDeliveryNote()}
                disabled={
                  deleteModal.loading ||
                  (deleteModal.step === 2 && deleteModal.confirmText.trim().toUpperCase() !== 'DELETE')
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleteModal.loading ? 'Deleting…' : deleteModal.step === 1 ? 'Continue' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* Change Warning Modal */}
      {changeWarningModal.open && changeWarningModal.pendingChange && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setChangeWarningModal({ open: false, pendingChange: null })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-sm rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {changeWarningModal.pendingChange.type === 'date' ? 'Change entry date?' : 'Unsaved changes'}
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
              {changeWarningModal.pendingChange.type === 'date' ? (
                <>
                  You have lines on this delivery note. The entry date will change to{' '}
                  <strong>{changeWarningModal.pendingChange.newValue}</strong>. Material lines, custom items, and notes
                  will be kept. Budget warnings may update for the new date.
                </>
              ) : (
                <>You have items added. Changing the job will clear all unsaved items.</>
              )}
            </p>

            <div className="bg-amber-600/15 border border-amber-500/30 rounded-lg p-3 mb-6">
              <p className="text-xs text-amber-300">
                {changeWarningModal.pendingChange.type === 'date' ? (
                  <>
                    ⚠️ <strong>Entry date affects posting.</strong> Confirm only if this date is correct for dispatch or
                    subcontract issue.
                  </>
                ) : (
                  <>
                    ⚠️ <strong>Save first</strong> to keep your changes, or continue to discard them.
                  </>
                )}
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
                {changeWarningModal.pendingChange.type === 'date' ? 'Change date' : 'Discard & change job'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


