'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import MultiSelectDropdown from '@/components/ui/MultiSelectDropdown';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_EXPERTISE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  buildWorkforceProfileExtension,
  parseWorkforceProfile,
} from '@/lib/hr/workforceProfile';
import { NATIONALITY_OPTIONS } from '@/lib/hr/employeeMeta';
import toast from 'react-hot-toast';
import { driveFileIdToDisplayUrl } from '@/lib/utils/googleDriveUrl';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';

type Tab = 'overview' | 'visa' | 'documents' | 'access';

interface CatalogDocType {
  id: string;
  name: string;
  slug: string;
  requiresVisaPeriod: boolean;
  requiresExpiry: boolean;
  defaultAlertDaysBeforeExpiry: number;
  sortOrder: number;
  isActive: boolean;
}

interface UserLink {
  id: string;
  email: string;
  name: string | null;
}

interface VisaRow {
  id: string;
  label: string;
  sponsorType: string | null;
  visaType: string | null;
  startDate: string;
  endDate: string;
  status: string;
  notes: string | null;
}

interface DocRow {
  id: string;
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingAuthority: string | null;
  notes: string | null;
  mediaDriveId: string | null;
  documentType: { id: string; name: string; slug: string };
  visaPeriod: { id: string; label: string } | null;
}

interface EmployeeRecord {
  id: string;
  employeeCode: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  designation: string | null;
  department: string | null;
  employmentType: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  status: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  bloodGroup: string | null;
  photoDriveId: string | null;
  portalEnabled: boolean;
  adminNotes?: string | null;
  profileExtension?: unknown;
  createdAt: string;
  updatedAt: string;
  visaPeriods: VisaRow[];
  documents: DocRow[];
  userLink: UserLink | null;
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Avoid `res.json()` on empty or HTML error bodies (proxy/network quirks). */
async function readApiJson(res: Response): Promise<{ success?: boolean; error?: string; data?: unknown } | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as { success?: boolean; error?: string; data?: unknown };
  } catch {
    return null;
  }
}

function driveFileWebViewUrl(driveId: string | null | undefined): string | null {
  const id = driveId?.trim();
  if (!id) return null;
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

function tenureLabel(hire: string | null | undefined) {
  if (!hire) return null;
  const h = new Date(hire);
  if (Number.isNaN(h.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - h.getFullYear();
  let months = now.getMonth() - h.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return 'Joined this year';
  if (years <= 0) return `${months} mo. with company`;
  if (months === 0) return `${years} yr. with company`;
  return `${years} yr. ${months} mo. with company`;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.floor((target - startOfToday) / dayMs);
}

function validityLabel(days: number | null): string {
  if (days === null) return '-';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d left`;
}

function buildOverviewDraftSignature(form: HTMLFormElement, expertises: string[]) {
  const read = (name: string) => String(form.elements.namedItem(name) && 'value' in (form.elements.namedItem(name) as Element) ? ((form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value ?? '') : '').trim();
  const portalField = form.elements.namedItem('portalEnabled') as HTMLInputElement | null;
  const snapshot = {
    fullName: read('fullName'),
    preferredName: read('preferredName'),
    employeeCode: read('employeeCode'),
    nationality: read('nationality'),
    dateOfBirth: read('dateOfBirth'),
    gender: read('gender'),
    email: read('email'),
    phone: read('phone'),
    designation: read('designation'),
    department: read('department'),
    employmentType: read('employmentType'),
    employeeType: read('employeeType'),
    visaHolding: read('visaHolding'),
    hireDate: read('hireDate'),
    terminationDate: read('terminationDate'),
    status: read('status'),
    emergencyContactName: read('emergencyContactName'),
    emergencyContactPhone: read('emergencyContactPhone'),
    bloodGroup: read('bloodGroup'),
    adminNotes: read('adminNotes'),
    profileExtensionJson: read('profileExtensionJson'),
    portalEnabled: Boolean(portalField?.checked),
    expertises: [...expertises].sort(),
  };
  return JSON.stringify(snapshot);
}

function buildOverviewEmployeeSignature(emp: EmployeeRecord, expertises: string[]) {
  const snapshot = {
    fullName: String(emp.fullName ?? '').trim(),
    preferredName: String(emp.preferredName ?? '').trim(),
    employeeCode: String(emp.employeeCode ?? '').trim(),
    nationality: String(emp.nationality ?? '').trim(),
    dateOfBirth: toInputDate(emp.dateOfBirth),
    gender: String(emp.gender ?? '').trim(),
    email: String(emp.email ?? '').trim(),
    phone: String(emp.phone ?? '').trim(),
    designation: String(emp.designation ?? '').trim(),
    department: String(emp.department ?? '').trim(),
    employmentType: String(emp.employmentType ?? '').trim(),
    employeeType: String(parseWorkforceProfile(emp.profileExtension).employeeType ?? '').trim(),
    visaHolding: String(parseWorkforceProfile(emp.profileExtension).visaHolding ?? '').trim(),
    hireDate: toInputDate(emp.hireDate),
    terminationDate: toInputDate(emp.terminationDate),
    status: String(emp.status ?? '').trim(),
    emergencyContactName: String(emp.emergencyContactName ?? '').trim(),
    emergencyContactPhone: String(emp.emergencyContactPhone ?? '').trim(),
    bloodGroup: String(emp.bloodGroup ?? '').trim(),
    adminNotes: String(emp.adminNotes ?? '').trim(),
    profileExtensionJson:
      emp.profileExtension == null
        ? ''
        : typeof emp.profileExtension === 'string'
          ? emp.profileExtension.trim()
          : JSON.stringify(emp.profileExtension, null, 2),
    portalEnabled: Boolean(emp.portalEnabled),
    expertises: [...expertises].sort(),
  };
  return JSON.stringify(snapshot);
}

export function EmployeeProfileView({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const { openMenu } = useGlobalContextMenu();
  const [emp, setEmp] = useState<EmployeeRecord | null>(null);
  const [catalogDocTypes, setCatalogDocTypes] = useState<CatalogDocType[]>([]);
  const [expertiseCatalog, setExpertiseCatalog] = useState<string[]>([]);
  const [selectedExpertises, setSelectedExpertises] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [linkUserId, setLinkUserId] = useState('');
  const [showVisaForm, setShowVisaForm] = useState(false);
  const [editingVisa, setEditingVisa] = useState<VisaRow | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocRow | null>(null);
  const [showAddDocumentModal, setShowAddDocumentModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [expandedVisaId, setExpandedVisaId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const overviewFormRef = useRef<HTMLFormElement>(null);
  const [overviewDirty, setOverviewDirty] = useState(false);
  const [overviewInitialSignature, setOverviewInitialSignature] = useState<string | null>(null);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.employee.view');
  const canEdit = isSA || perms.includes('hr.employee.edit');
  const canDoc = isSA || perms.includes('hr.document.edit');
  const canDocView = isSA || perms.includes('hr.document.view');
  const canCatalogTypes = isSA || perms.includes('hr.settings.document_types');
  const isBusy = busyKey !== null;

  const load = useCallback(async () => {
    const res = await fetch(`/api/hr/employees/${employeeId}`, { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && json?.success) setEmp(json.data as EmployeeRecord);
    else setEmp(null);
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canView) {
        if (!cancelled) setLoading(false);
        return;
      }
      await load();
      const tr = await fetch('/api/hr/document-types', { cache: 'no-store' });
      const tj = await tr.json();
      if (!cancelled && tr.ok && tj?.success) setCatalogDocTypes(tj.data as CatalogDocType[]);
      const er = await fetch('/api/hr/expertises', { cache: 'no-store' });
      const ej = await er.json();
      if (!cancelled && er.ok && ej?.success) {
        setExpertiseCatalog((ej.data as Array<{ name: string }>).map((x) => x.name));
      } else if (!cancelled) {
        setExpertiseCatalog([...WORKFORCE_EXPERTISE_OPTIONS]);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, load]);

  const patchEmployee = async (
    payload: Record<string, unknown>,
    opts?: { successMessage?: string; updateLocal?: boolean }
  ) => {
    const res = await fetch(`/api/hr/employees/${employeeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await readApiJson(res);
    if (!json) {
      toast.error(`Update failed (${res.status}): no response body`);
      return false;
    }
    if (!res.ok || !json.success) {
      toast.error(json.error ?? 'Update failed');
      return false;
    }
    toast.success(opts?.successMessage ?? 'Saved');
    if (opts?.updateLocal && json.data) {
      setEmp(json.data as EmployeeRecord);
    } else {
      await load();
    }
    return true;
  };

  const onSaveOverview = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || isBusy) return;
    setBusyKey('overview');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const raw = Object.fromEntries(fd.entries()) as Record<string, string>;
    const nullableDates = ['dateOfBirth', 'hireDate', 'terminationDate'] as const;
    const emptyToNull = [
      'email',
      'phone',
      'preferredName',
      'nationality',
      'gender',
      'designation',
      'department',
      'employmentType',
      'emergencyContactName',
      'emergencyContactPhone',
      'bloodGroup',
      'adminNotes',
    ] as const;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === 'portalEnabled' || k === 'profileExtensionJson') continue;
      if (nullableDates.includes(k as (typeof nullableDates)[number])) {
        body[k] = v === '' ? null : v;
        continue;
      }
      if (emptyToNull.includes(k as (typeof emptyToNull)[number]) && v === '') {
        body[k] = null;
        continue;
      }
      body[k] = v;
    }
    const employeeType = String(fd.get('employeeType') ?? '').trim();
    const visaHolding = String(fd.get('visaHolding') ?? '').trim();
    const expertises = selectedExpertises;
    const extRaw = String(fd.get('profileExtensionJson') ?? '').trim();
    if (extRaw === '') body.profileExtension = null;
    else {
      try {
        body.profileExtension = JSON.parse(extRaw);
      } catch {
        toast.error('Extra profile data (JSON) is invalid');
        setBusyKey(null);
        return;
      }
    }
    const existingExt =
      body.profileExtension && typeof body.profileExtension === 'object'
        ? (body.profileExtension as Record<string, unknown>)
        : {};
    body.profileExtension = {
      ...existingExt,
      ...buildWorkforceProfileExtension({
        employeeType:
          (employeeType as 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER') ||
          'LABOUR_WORKER',
        visaHolding:
          (visaHolding as 'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA') || 'COMPANY_PROVIDED',
        expertises,
      }),
    };
    const portalEl = form.elements.namedItem('portalEnabled') as HTMLInputElement | null;
    body.portalEnabled = Boolean(portalEl?.checked);
    const saved = await patchEmployee(body, { updateLocal: true });
    if (saved) {
      setOverviewDirty(false);
    }
    setBusyKey(null);
  };

  const submitVisa = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit || isBusy) return;
    setBusyKey(editingVisa ? 'visa-update' : 'visa-create');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      label: String(fd.get('label') ?? '').trim(),
      sponsorType: fd.get('sponsorType') || null,
      visaType: fd.get('visaType') || null,
      startDate: String(fd.get('startDate')),
      endDate: String(fd.get('endDate')),
      status: fd.get('status') || 'DRAFT',
      notes: fd.get('notes') || null,
    };
    const url = editingVisa
      ? `/api/hr/visa-periods/${editingVisa.id}`
      : `/api/hr/employees/${employeeId}/visa-periods`;
    const res = await fetch(url, {
      method: editingVisa ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Visa save failed');
    else {
      toast.success(editingVisa ? 'Visa period updated' : 'Visa period added');
      setShowVisaForm(false);
      setEditingVisa(null);
      form.reset();
      await load();
    }
    setBusyKey(null);
  };

  const deleteVisa = async (vid: string) => {
    if (!canEdit || isBusy || !window.confirm('Delete this visa period? Linked documents will keep but lose the visa link.')) return;
    setBusyKey(`visa-delete-${vid}`);
    const res = await fetch(`/api/hr/visa-periods/${vid}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Deleted');
      await load();
    }
    setBusyKey(null);
  };

  const addDocument = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canDoc || isBusy) return;
    setBusyKey('document-create');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const fileEl = form.elements.namedItem('documentFile') as HTMLInputElement | null;
    const file = fileEl?.files?.[0] ?? null;
    const visaPeriodId = fd.get('visaPeriodId');
    const hasVisaPeriods = (emp?.visaPeriods?.length ?? 0) > 0;
    const selectedVisaPeriodId = visaPeriodId && String(visaPeriodId) !== '' ? String(visaPeriodId) : null;
    if (selectedVisaPeriodId && !hasVisaPeriods) {
      toast.error('No visa periods available to link');
      setBusyKey(null);
      return;
    }

    const res = await fetch(`/api/hr/employees/${employeeId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentTypeId: fd.get('documentTypeId'),
        visaPeriodId: selectedVisaPeriodId,
        documentNumber: fd.get('documentNumber') || null,
        issueDate: fd.get('issueDate') || null,
        expiryDate: fd.get('expiryDate') || null,
        issuingAuthority: fd.get('issuingAuthority') || null,
        notes: fd.get('notes') || null,
        mediaDriveId: fd.get('mediaDriveId') || null,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Failed');
    else {
      const newId = json.data?.id as string | undefined;
      if (file && newId) {
        const ufd = new FormData();
        ufd.append('file', file);
        const ur = await fetch(`/api/hr/documents/${newId}/upload-file`, { method: 'POST', body: ufd });
        const uj = await ur.json();
        if (!ur.ok || !uj?.success) toast.error(uj?.error ?? 'Document saved but file upload failed');
        else toast.success('Document added with file');
      } else toast.success('Document added');
      await load();
      form.reset();
      setShowAddDocumentModal(false);
    }
    setBusyKey(null);
  };

  const saveEditedDocument = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canDoc || !editingDoc || isBusy) return;
    setBusyKey('document-update');
    const form = e.currentTarget;
    const fd = new FormData(form);
    const visaPeriodId = fd.get('visaPeriodId');
    const res = await fetch(`/api/hr/documents/${editingDoc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentTypeId: String(fd.get('documentTypeId') ?? ''),
        visaPeriodId: visaPeriodId && String(visaPeriodId) !== '' ? String(visaPeriodId) : null,
        documentNumber: fd.get('documentNumber') || null,
        issueDate: fd.get('issueDate') || null,
        expiryDate: fd.get('expiryDate') || null,
        issuingAuthority: fd.get('issuingAuthority') || null,
        notes: fd.get('notes') || null,
        mediaDriveId: fd.get('mediaDriveId') || null,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Update failed');
    else {
      const fileEl = form.elements.namedItem('documentEditFile') as HTMLInputElement | null;
      const file = fileEl?.files?.[0] ?? null;
      if (file) {
        const ufd = new FormData();
        ufd.append('file', file);
        const ur = await fetch(`/api/hr/documents/${editingDoc.id}/upload-file`, { method: 'POST', body: ufd });
        const uj = await ur.json();
        if (!ur.ok || !uj?.success) toast.error(uj?.error ?? 'Saved metadata but file upload failed');
        else toast.success('Document updated with new file');
      } else toast.success('Document updated');
      form.reset();
      setEditingDoc(null);
      await load();
    }
    setBusyKey(null);
  };

  const uploadPhotoFromInput = async () => {
    const input = photoInputRef.current;
    const file = input?.files?.[0];
    if (!file || !canEdit) return;
    setPhotoUploading(true);
    try {
      const ufd = new FormData();
      ufd.append('file', file);
      const res = await fetch(`/api/hr/employees/${employeeId}/upload-photo`, { method: 'POST', body: ufd });
      const json = await res.json();
      if (!res.ok || !json?.success) toast.error(json?.error ?? 'Photo upload failed');
      else {
        toast.success('Photo uploaded');
        if (input) input.value = '';
        await load();
      }
    } finally {
      setPhotoUploading(false);
    }
  };

  const removeProfilePhoto = async () => {
    if (!canEdit || photoUploading || isBusy) return;
    setPhotoUploading(true);
    try {
      const ok = await patchEmployee({ photoDriveId: null }, { successMessage: 'Profile photo removed' });
      if (!ok) return;
    } finally {
      setPhotoUploading(false);
    }
  };

  const openPhotoContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, [
      {
        label: photoUploading ? 'Uploading...' : 'Upload photo',
        action: () => {
          if (!photoUploading && !isBusy) photoInputRef.current?.click();
        },
      },
      {
        label: 'Remove photo',
        danger: true,
        action: () => {
          if (!photoUploading && !isBusy && emp?.photoDriveId) void removeProfilePhoto();
        },
      },
    ]);
  };

  const provisionLogin = async () => {
    if (!canEdit || isBusy) return;
    setBusyKey('provision-login');
    await patchEmployee(
      { provisionNow: true },
      { successMessage: 'Login account created or linked; portal enabled' },
    );
    await update({});
    setBusyKey(null);
  };

  const deleteDocument = async (docId: string) => {
    if (!canDoc || isBusy || !window.confirm('Remove this document record?')) return;
    setBusyKey(`document-delete-${docId}`);
    const res = await fetch(`/api/hr/documents/${docId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Document removed');
      await load();
    }
    setBusyKey(null);
  };

  const linkPortal = async () => {
    if (!linkUserId.trim() || isBusy) return;
    setBusyKey('portal-link');
    const res = await fetch(`/api/hr/employees/${employeeId}/portal-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: linkUserId.trim() }),
    });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Link failed');
    else {
      toast.success('Portal linked');
      setLinkUserId('');
      await load();
      await update({});
    }
    setBusyKey(null);
  };

  const unlinkPortal = async () => {
    if (isBusy) return;
    setBusyKey('portal-unlink');
    const res = await fetch(`/api/hr/employees/${employeeId}/portal-link`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Unlink failed');
    else {
      toast.success('Portal unlinked');
      await load();
      await update({});
    }
    setBusyKey(null);
  };

  useEffect(() => {
    if (!emp) return;
    const nextExpertises = parseWorkforceProfile(emp.profileExtension).expertises;
    setSelectedExpertises(nextExpertises);
    setOverviewInitialSignature(buildOverviewEmployeeSignature(emp, nextExpertises));
    setOverviewDirty(false);
    const frame = requestAnimationFrame(() => {
      if (!overviewFormRef.current) return;
      const signature = buildOverviewDraftSignature(overviewFormRef.current, nextExpertises);
      setOverviewInitialSignature(signature);
      setOverviewDirty(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [emp]);

  useEffect(() => {
    if (tab !== 'overview' || !emp || overviewInitialSignature !== null) return;
    const nextExpertises = parseWorkforceProfile(emp.profileExtension).expertises;
    setOverviewInitialSignature(buildOverviewEmployeeSignature(emp, nextExpertises));
    setOverviewDirty(false);
    const frame = requestAnimationFrame(() => {
      if (!overviewFormRef.current) return;
      const signature = buildOverviewDraftSignature(overviewFormRef.current, nextExpertises);
      setOverviewInitialSignature(signature);
      setOverviewDirty(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [emp, overviewInitialSignature, tab]);

  const syncOverviewDirty = useCallback(
    (nextExpertises?: string[]) => {
      if (!overviewFormRef.current) return;
      const baseline =
        overviewInitialSignature ??
        (emp ? buildOverviewEmployeeSignature(emp, parseWorkforceProfile(emp.profileExtension).expertises) : null);
      if (baseline === null) return;
      const signature = buildOverviewDraftSignature(
        overviewFormRef.current,
        nextExpertises ?? selectedExpertises,
      );
      setOverviewDirty(signature !== baseline);
    },
    [emp, overviewInitialSignature, selectedExpertises],
  );

  const confirmOverviewLeave = useCallback(() => {
    if (!overviewDirty) return true;
    return window.confirm('You have unsaved changes on this employee profile. Leave without saving?');
  }, [overviewDirty]);

  useEffect(() => {
    if (!overviewDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [overviewDirty]);

  useEffect(() => {
    if (!overviewDirty) return;

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (!confirmOverviewLeave()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPopState = () => {
      if (!confirmOverviewLeave()) {
        window.history.pushState(null, '', window.location.href);
      }
    };

    window.history.pushState(null, '', window.location.href);
    document.addEventListener('click', onDocumentClick, true);
    window.addEventListener('popstate', onPopState);

    return () => {
      document.removeEventListener('click', onDocumentClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, [confirmOverviewLeave, overviewDirty]);


  if (!canView) {
    return (
      <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-panel-soft)] p-8 text-center text-[var(--foreground-muted)] shadow-sm">
        You do not have permission to view this employee profile.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--foreground-muted)]">
        <div className="flex items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          Loading profile...
        </div>
      </div>
    );
  }
  if (!emp) {
    return (
      <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-panel-soft)] p-8 text-center text-[var(--foreground-muted)] shadow-sm">
        Employee not found.
      </div>
    );
  }

  const tenure = tenureLabel(emp.hireDate);
  const photoUrl = driveFileIdToDisplayUrl(emp.photoDriveId);
  const tabs: { id: Tab; label: string; hint: string }[] = [
    { id: 'overview', label: 'Overview', hint: 'Identity, employment, emergency' },
    { id: 'visa', label: 'Visa & authorization', hint: 'Work authorization periods' },
    { id: 'documents', label: 'Documents', hint: 'Files, scans, and expiry tracking' },
    { id: 'access', label: 'Account access', hint: 'Portal login & Google sign-in' },
  ];

  const fieldClass =
    'mt-1 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-600 focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 disabled:opacity-50';
  const labelClass = 'text-xs font-medium uppercase tracking-wider text-slate-500';
  const workforce = parseWorkforceProfile(emp.profileExtension);

  return (
    <div className="space-y-0 pb-12">
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={() => void uploadPhotoFromInput()}
      />
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-slate-900 via-slate-900 to-emerald-950/40">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div
              data-context-menu
              onContextMenu={openPhotoContextMenu}
              title={canEdit ? 'Right-click for photo options' : undefined}
              className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-emerald-600/30 to-slate-800 text-2xl font-semibold tracking-tight text-white ring-1 ring-white/10"
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="relative z-10">{initials(emp.fullName)}</span>
              )}
              {photoUploading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{emp.fullName}</h1>
                <StatusBadge status={emp.status} />
                {emp.portalEnabled && (
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/25">
                    Portal enabled
                  </span>
                )}
              </div>
              {emp.preferredName && <p className="text-sm text-slate-400">Goes by &ldquo;{emp.preferredName}&rdquo;</p>}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                <span className="font-mono text-emerald-200/90">{emp.employeeCode}</span>
                {emp.designation && <span>{emp.designation}</span>}
                {emp.department && <span className="text-slate-500">/ {emp.department}</span>}
              </div>
              {tenure && <p className="text-xs text-slate-500">{tenure}</p>}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!confirmOverviewLeave()) return;
                router.push('/hr/employees');
              }}
            >
              Back to directory
            </Button>
            {tab === 'overview' && canEdit && (
              <Button
                type="button"
                onClick={() => overviewFormRef.current?.requestSubmit()}
                disabled={!overviewDirty || isBusy}
              >
                {busyKey === 'overview' ? 'Saving...' : overviewDirty ? 'Save changes' : 'Saved'}
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 border-t border-white/5 bg-black/20 px-4 py-2 sm:px-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setShowVisaForm(false);
                setEditingVisa(null);
                setEditingDoc(null);
                setShowAddDocumentModal(false);
              }}
              className={[
                'rounded-lg px-4 py-2 text-left text-sm transition-colors',
                tab === t.id
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              ].join(' ')}
            >
              <span className="font-medium">{t.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(12rem,18rem)]">
        <div className="min-w-0 space-y-6">
          {isBusy && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-2 text-xs text-emerald-200">
              Saving changes... please wait.
            </div>
          )}

          {tab === 'overview' && (
            <form
              key={emp.updatedAt}
              ref={overviewFormRef}
              onSubmit={onSaveOverview}
              onInput={() => syncOverviewDirty()}
              onChange={() => syncOverviewDirty()}
              className="space-y-6"
            >
              <section className="rounded-2xl border border-white/10 bg-slate-900/35 p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-400/90">Personal identity</h2>
                <p className="mt-1 text-xs text-slate-500">Legal name and demographics kept for the lifetime of employment.</p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Full legal name</span>
                    <input name="fullName" required defaultValue={emp.fullName} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Preferred name</span>
                    <input name="preferredName" defaultValue={emp.preferredName ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Employee code</span>
                    <input name="employeeCode" required defaultValue={emp.employeeCode} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Nationality</span>
                    <select name="nationality" defaultValue={emp.nationality ?? ''} disabled={!canEdit} className={fieldClass}>
                      <option value="">-</option>
                      {NATIONALITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Date of birth</span>
                    <input name="dateOfBirth" type="date" defaultValue={toInputDate(emp.dateOfBirth)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Gender</span>
                    <select name="gender" defaultValue={emp.gender ?? ''} disabled={!canEdit} className={fieldClass}>
                      <option value="">-</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="X">Prefer not to say</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/35 p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-400/90">Contact</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Work / personal email</span>
                    <input name="email" type="email" defaultValue={emp.email ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Mobile</span>
                    <input name="phone" defaultValue={emp.phone ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/35 p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-400/90">Employment and workforce setup</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Designation</span>
                    <input name="designation" defaultValue={emp.designation ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Department</span>
                    <input name="department" defaultValue={emp.department ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Employment type</span>
                    <input name="employmentType" defaultValue={emp.employmentType ?? ''} disabled={!canEdit} className={fieldClass} placeholder="e.g. Permanent, Contract" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Workforce role type</span>
                    <select
                      name="employeeType"
                      defaultValue={workforce.employeeType}
                      disabled={!canEdit}
                      className={fieldClass}
                    >
                      {WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Visa holding</span>
                    <select
                      name="visaHolding"
                      defaultValue={workforce.visaHolding}
                      disabled={!canEdit}
                      className={fieldClass}
                    >
                      {WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Expertise (multi-select)</span>
                    <div className="mt-1">
                      <MultiSelectDropdown
                        options={(expertiseCatalog.length ? expertiseCatalog : [...WORKFORCE_EXPERTISE_OPTIONS]).map((ex) => ({
                          value: ex,
                          label: ex,
                        }))}
                        value={selectedExpertises}
                        onChange={(next) => {
                          setSelectedExpertises(next);
                          requestAnimationFrame(() => syncOverviewDirty(next));
                        }}
                        placeholder="Select expertise..."
                        disabled={!canEdit}
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Hire date</span>
                    <input name="hireDate" type="date" defaultValue={toInputDate(emp.hireDate)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Termination date</span>
                    <input name="terminationDate" type="date" defaultValue={toInputDate(emp.terminationDate)} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Employment status</span>
                    <select name="status" defaultValue={emp.status} disabled={!canEdit} className={fieldClass}>
                      {['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED'].map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-3 pt-6 sm:col-span-2">
                    <input
                      type="checkbox"
                      name="portalEnabled"
                      defaultChecked={emp.portalEnabled}
                      disabled={!canEdit}
                      className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-600"
                    />
                    <span className="text-sm text-slate-300">
                      Allow employee self-service portal (requires a linked user, auto-created when you save an email and provision login, or link manually on Access)
                    </span>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-slate-900/35 p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-400/90">Emergency & medical</h2>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Emergency contact name</span>
                    <input name="emergencyContactName" defaultValue={emp.emergencyContactName ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Emergency contact phone</span>
                    <input name="emergencyContactPhone" defaultValue={emp.emergencyContactPhone ?? ''} disabled={!canEdit} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Blood group</span>
                    <input name="bloodGroup" defaultValue={emp.bloodGroup ?? ''} disabled={!canEdit} className={fieldClass} placeholder="e.g. O+" />
                  </label>
                </div>
              </section>

              {canEdit && (
                <section className="rounded-2xl border border-amber-500/15 bg-amber-950/10 p-6 shadow-sm">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200/90">HR record & extensions</h2>
                  <p className="mt-1 text-xs text-slate-500">Internal notes and structured extras not shown to the employee in the portal.</p>
                  <div className="mt-5 grid gap-4">
                    <label className="block">
                      <span className={labelClass}>Admin notes</span>
                      <textarea
                        name="adminNotes"
                        rows={4}
                        defaultValue={emp.adminNotes ?? ''}
                        className={fieldClass}
                        placeholder="Onboarding notes, compliance flags..."
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Extra profile (JSON object)</span>
                      <textarea
                        name="profileExtensionJson"
                        rows={6}
                        defaultValue={
                          emp.profileExtension == null
                            ? ''
                            : typeof emp.profileExtension === 'string'
                              ? emp.profileExtension
                              : JSON.stringify(emp.profileExtension, null, 2)
                        }
                        className={`${fieldClass} font-mono text-xs`}
                        placeholder='e.g. { "shiftPreference": "morning" }'
                      />
                    </label>
                  </div>
                </section>
              )}

            </form>
          )}

          {tab === 'visa' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Visa & work authorization</h2>
                  <p className="text-sm text-slate-500">Track residence / employment visa windows and compliance notes.</p>
                </div>
                {canEdit && !showVisaForm && !editingVisa && (
                  <Button
                    type="button"
                    onClick={() => {
                      setEditingVisa(null);
                      setShowVisaForm(true);
                    }}
                  >
                    Add period
                  </Button>
                )}
              </div>

              {(showVisaForm || editingVisa) && canEdit && (
                <form
                  key={editingVisa?.id ?? 'new'}
                  onSubmit={submitVisa}
                  className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-6 space-y-4"
                >
                  <h3 className="text-sm font-medium text-emerald-200">{editingVisa ? 'Edit period' : 'New period'}</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Label</span>
                      <input name="label" required defaultValue={editingVisa?.label} className={fieldClass} placeholder="e.g. Residence visa 2025-2027" />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Sponsor</span>
                      <input name="sponsorType" defaultValue={editingVisa?.sponsorType ?? ''} className={fieldClass} placeholder="Company / spouse..." />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Visa type</span>
                      <input name="visaType" defaultValue={editingVisa?.visaType ?? ''} className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Start</span>
                      <input name="startDate" type="date" required defaultValue={toInputDate(editingVisa?.startDate)} className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>End</span>
                      <input name="endDate" type="date" required defaultValue={toInputDate(editingVisa?.endDate)} className={fieldClass} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Status</span>
                      <select name="status" defaultValue={editingVisa?.status ?? 'DRAFT'} className={fieldClass}>
                        {['DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Notes</span>
                      <textarea name="notes" rows={3} defaultValue={editingVisa?.notes ?? ''} className={fieldClass} />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={isBusy}>
                      {busyKey === 'visa-create' || busyKey === 'visa-update'
                        ? editingVisa
                          ? 'Updating...'
                          : 'Creating...'
                        : editingVisa
                          ? 'Update'
                          : 'Create'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setShowVisaForm(false);
                        setEditingVisa(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-slate-950/80 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Validity</th>
                      <th className="px-4 py-3">Status</th>
                      {canEdit && <th className="px-4 py-3 w-44">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {emp.visaPeriods.length === 0 ? (
                      <tr>
                        <td colSpan={canEdit ? 4 : 3} className="px-4 py-8 text-center text-slate-500">
                          No visa periods recorded yet.
                        </td>
                      </tr>
                    ) : (
                      emp.visaPeriods.map((v) => {
                        const relatedDocs = emp.documents.filter((d) => d.visaPeriod?.id === v.id);
                        const days = daysUntil(v.endDate);
                        const isExpanded = expandedVisaId === v.id;
                        return (
                        <Fragment key={v.id}>
                        <tr className="text-slate-200">
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{v.label}</div>
                            <div className="text-xs text-slate-500">
                              {[v.sponsorType, v.visaType].filter(Boolean).join(' / ') || '-'}
                            </div>
                            <button
                              type="button"
                              className="mt-1 text-[11px] text-slate-400 hover:text-slate-200"
                              onClick={() => setExpandedVisaId((curr) => (curr === v.id ? null : v.id))}
                            >
                              {isExpanded ? 'Hide related documents' : `Show related documents (${relatedDocs.length})`}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-300">
                            <div className="font-medium">{validityLabel(days)}</div>
                            <div className="text-slate-500 font-mono">
                              {toInputDate(v.startDate)} to {toInputDate(v.endDate)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <VisaStatusPill status={v.status} />
                          </td>
                          {canEdit && (
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setEditingVisa(v);
                                    setShowVisaForm(false);
                                  }}
                                >
                                  Edit
                                </button>
                                <button type="button" className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50" disabled={isBusy} onClick={() => deleteVisa(v.id)}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={canEdit ? 4 : 3} className="px-4 pb-4">
                              <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                {relatedDocs.length === 0 ? (
                                  <p className="text-xs text-slate-500">No related documents linked to this visa period.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {relatedDocs.map((d) => (
                                      <div key={d.id} className="flex items-center justify-between gap-2 rounded border border-white/5 bg-slate-900/40 px-3 py-2 text-xs">
                                        <div>
                                          <p className="font-medium text-slate-200">{d.documentType.name}</p>
                                          <p className="text-slate-500">{d.documentNumber ?? 'No number'} / {d.expiryDate ? toInputDate(d.expiryDate) : 'No expiry'}</p>
                                        </div>
                                        {d.mediaDriveId && (
                                          <a
                                            href={driveFileWebViewUrl(d.mediaDriveId) ?? '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-emerald-400 hover:text-emerald-300"
                                          >
                                            Open
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      )})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                <h2 className="text-lg font-semibold text-white">Official documents</h2>
                <p className="text-sm text-slate-500">
                  Passport, Emirates ID, insurance, licences with issue and expiry tracking. Upload PDF or images, or paste a Drive file ID.
                </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canCatalogTypes && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (!confirmOverviewLeave()) return;
                        router.push('/hr/settings/document-types');
                      }}
                    >
                      Manage document types
                    </Button>
                  )}
                  {canDoc && (
                    <Button type="button" disabled={isBusy} onClick={() => setShowAddDocumentModal(true)}>
                      Add document
                    </Button>
                  )}
                </div>
              </div>

              {editingDoc && canDoc && (
                <Modal
                  isOpen
                  onClose={() => {
                    if (!isBusy) setEditingDoc(null);
                  }}
                  title="Edit document"
                  size="lg"
                >
                  <form key={editingDoc.id} onSubmit={saveEditedDocument} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>Type</span>
                      <select name="documentTypeId" required defaultValue={editingDoc.documentType.id} className={fieldClass}>
                        {catalogDocTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {!t.isActive ? ' (inactive)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelClass}>Link to visa period</span>
                      <select name="visaPeriodId" defaultValue={editingDoc.visaPeriod?.id ?? ''} className={fieldClass}>
                        <option value="">- None -</option>
                        {emp.visaPeriods.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelClass}>Document number</span>
                      <input name="documentNumber" defaultValue={editingDoc.documentNumber ?? ''} className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Issuing authority</span>
                      <input name="issuingAuthority" defaultValue={editingDoc.issuingAuthority ?? ''} className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Issue date</span>
                      <input name="issueDate" type="date" defaultValue={toInputDate(editingDoc.issueDate)} className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Expiry date</span>
                      <input name="expiryDate" type="date" defaultValue={toInputDate(editingDoc.expiryDate)} className={fieldClass} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Notes</span>
                      <textarea name="notes" rows={2} defaultValue={editingDoc.notes ?? ''} className={fieldClass} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>File (Drive id)</span>
                      <input name="mediaDriveId" defaultValue={editingDoc.mediaDriveId ?? ''} className={fieldClass} placeholder="Optional - or replace by uploading" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Replace file (PDF / JPEG / PNG / WebP)</span>
                      <input name="documentEditFile" type="file" accept=".pdf,image/jpeg,image/png,image/webp" className={fieldClass} />
                    </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" disabled={isBusy} onClick={() => setEditingDoc(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isBusy}>
                        {busyKey === 'document-update' ? 'Saving...' : 'Save changes'}
                      </Button>
                    </div>
                  </form>
                </Modal>
              )}

              {canDoc && showAddDocumentModal && (
                <Modal
                  isOpen
                  onClose={() => {
                    if (!isBusy) setShowAddDocumentModal(false);
                  }}
                  title="Add document"
                  size="lg"
                >
                  <form onSubmit={addDocument} className="space-y-4">
                    {catalogDocTypes.length === 0 ? (
                      <p className="text-sm text-amber-200/90">No document types yet. Add them from HR Settings {'>'} Document types.</p>
                    ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className={labelClass}>Type</span>
                      <select name="documentTypeId" required className={fieldClass}>
                        {catalogDocTypes.map((t) => (
                          <option key={t.id} value={t.id} disabled={!t.isActive}>
                            {t.name}
                            {!t.isActive ? ' (inactive)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelClass}>Link to visa period</span>
                      <select name="visaPeriodId" className={fieldClass} disabled={emp.visaPeriods.length === 0}>
                        <option value="">- None -</option>
                        {emp.visaPeriods.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={labelClass}>Document number</span>
                      <input name="documentNumber" className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Issuing authority</span>
                      <input name="issuingAuthority" className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Issue date</span>
                      <input name="issueDate" type="date" className={fieldClass} />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Expiry date</span>
                      <input name="expiryDate" type="date" className={fieldClass} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Notes</span>
                      <textarea name="notes" rows={2} className={fieldClass} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>File (Drive id)</span>
                      <input name="mediaDriveId" className={fieldClass} placeholder="Optional - or upload below" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={labelClass}>Upload scan (PDF / JPEG / PNG / WebP)</span>
                      <input name="documentFile" type="file" accept=".pdf,image/jpeg,image/png,image/webp" className={fieldClass} />
                    </label>
                    </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" disabled={isBusy} onClick={() => setShowAddDocumentModal(false)}>
                        Cancel
                      </Button>
                      {catalogDocTypes.length > 0 && (
                        <Button type="submit" disabled={isBusy}>
                          {busyKey === 'document-create' ? 'Saving...' : 'Add document'}
                        </Button>
                      )}
                    </div>
                  </form>
                </Modal>
              )}

              {!canDocView ? (
                <p className="text-slate-500">You cannot view documents.</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/10 bg-slate-950/80 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Document</th>
                        <th className="px-4 py-3">Number</th>
                        <th className="px-4 py-3">Validity</th>
                        <th className="px-4 py-3">Visa link</th>
                        <th className="px-4 py-3">File</th>
                        {canDoc && <th className="px-4 py-3 w-36">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {emp.documents.length === 0 ? (
                        <tr>
                          <td colSpan={canDoc ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                            No documents on file.
                          </td>
                        </tr>
                      ) : (
                        emp.documents.map((d) => (
                          <tr key={d.id} className="text-slate-200">
                            <td className="px-4 py-3 font-medium text-white">{d.documentType.name}</td>
                            <td className="px-4 py-3 font-mono text-xs">{d.documentNumber ?? '-'}</td>
                            <td className="px-4 py-3 text-xs text-slate-400">
                              {d.issueDate ? toInputDate(d.issueDate) : '-'} to {d.expiryDate ? toInputDate(d.expiryDate) : '-'}
                            </td>
                            <td className="px-4 py-3 text-xs">{d.visaPeriod?.label ?? '-'}</td>
                            <td className="px-4 py-3 text-xs">
                              {d.mediaDriveId ? (
                                <a
                                  href={driveFileWebViewUrl(d.mediaDriveId) ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-emerald-400 hover:text-emerald-300"
                                >
                                  Open
                                </a>
                              ) : (
                                '-'
                              )}
                            </td>
                            {canDoc && (
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
                                    onClick={() => setEditingDoc(d)}
                                  >
                                    Edit
                                  </button>
                                  <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => deleteDocument(d.id)}>
                                    Remove
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'access' && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/35 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Employee portal</h2>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  When this employee has an email, you can <strong className="text-slate-200">create or link a User</strong> automatically so they can sign in with{' '}
                  <strong className="text-slate-200">Google</strong> (same email). Self-service still respects the portal toggle above.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  You can still paste a user id below if you need a manual link. New employees created with an email are provisioned by default.
                </p>
              </div>
              {canEdit && emp.email && (
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-sm text-slate-300">
                    Email on file: <span className="font-mono text-emerald-200/90">{emp.email}</span>
                  </p>
                  <Button type="button" className="mt-3" onClick={() => void provisionLogin()}>
                    Create or link login for this email
                  </Button>
                </div>
              )}
              {emp.userLink ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
                  <p className="text-sm text-slate-300">
                    Linked account: <span className="font-medium text-white">{emp.userLink.email}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500 font-mono">{emp.userLink.id}</p>
                  {canEdit && (
                    <Button type="button" variant="danger" className="mt-4" onClick={unlinkPortal}>
                      Unlink account
                    </Button>
                  )}
                </div>
              ) : (
                canEdit && (
                  <div className="space-y-3">
                    <label className="block max-w-md">
                      <span className={labelClass}>User id (from Users admin)</span>
                      <input
                        value={linkUserId}
                        onChange={(e) => setLinkUserId(e.target.value)}
                        placeholder="Paste user cuid..."
                        className={fieldClass}
                      />
                    </label>
                    <Button type="button" onClick={linkPortal}>
                      Link user
                    </Button>
                  </div>
                )
              )}
              {!emp.userLink && !canEdit && <p className="text-sm text-slate-500">No portal link. Contact HR to set up access.</p>}
            </div>
          )}
        </div>

        {/* Sidebar - record metadata */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd className="font-mono text-xs text-slate-300">{new Date(emp.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last updated</dt>
                <dd className="font-mono text-xs text-slate-300">{new Date(emp.updatedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Documents on file</dt>
                <dd className="text-2xl font-semibold text-white">{emp.documents.length}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Visa periods</dt>
                <dd className="text-2xl font-semibold text-white">{emp.visaPeriods.length}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-5 text-xs leading-relaxed text-slate-500">
            Lifetime profile: keep dates accurate for compliance. Document scans can be stored in Drive and referenced by file id.
          </div>
        </aside>
      </div>
    </div>
  );
}

function VisaStatusPill({ status }: { status: string }) {
  const map: Record<string, 'gray' | 'green' | 'yellow' | 'red'> = {
    DRAFT: 'gray',
    ACTIVE: 'green',
    EXPIRED: 'yellow',
    CANCELLED: 'red',
  };
  const variant = map[status] ?? 'gray';
  const c =
    variant === 'green'
      ? 'bg-emerald-900/40 text-emerald-200 ring-emerald-500/25'
      : variant === 'yellow'
        ? 'bg-amber-900/30 text-amber-200 ring-amber-500/25'
        : variant === 'red'
          ? 'bg-red-900/35 text-red-200 ring-red-500/25'
          : 'bg-slate-800 text-slate-300 ring-white/10';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${c}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

