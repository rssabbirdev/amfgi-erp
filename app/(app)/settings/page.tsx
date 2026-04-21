'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { TableSkeleton } from '@/components/ui/skeleton/TableSkeleton';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';
import type { ContextMenuOption } from '@/components/ui/ContextMenu';
import type { DocumentTemplate, ItemType } from '@/lib/types/documentTemplate';
import { ITEM_TYPE_LABELS, getItemTypeLabel } from '@/lib/utils/itemTypeFields';
import { KNOWN_ITEM_TYPES } from '@/lib/types/documentTemplate';
import { useGlobalContextMenu } from '@/providers/ContextMenuProvider';
import {
  useGetUnitsQuery,
  useCreateUnitMutation,
  useUpdateUnitMutation,
  useDeleteUnitMutation,
  useGetCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useUpdateWarehouseMutation,
  useDeleteWarehouseMutation,
  type Unit,
  type Category,
  type Warehouse,
} from '@/store/hooks';
import { NEW_PRINT_TEMPLATE_SESSION_KEY } from '@/lib/utils/printTemplateSession';
import {
  readCompanyDocumentTemplates,
  writeCompanyDocumentTemplates,
} from '@/lib/utils/companyPrintTemplates';
import { createWorkScheduleTemplateDraft } from '@/lib/utils/documentDefaults';

const SETTINGS_TABS = [
  { id: 'units', label: 'Units', description: 'Material measurement labels' },
  { id: 'categories', label: 'Categories', description: 'Material master groupings' },
  { id: 'warehouses', label: 'Warehouses', description: 'Stock holding locations' },
  { id: 'company', label: 'Company', description: 'Business profile and sync setup' },
  { id: 'template', label: 'Print formats', description: 'Document layouts and defaults' },
  { id: 'api', label: 'API & Credentials', description: 'Integration keys and audit logs' },
] as const;

function SettingsPageContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openMenu: openContextMenu } = useGlobalContextMenu();

  // Permission checks
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canManage = isSA || perms.includes('settings.manage');

  // Active tab
  const [activeTab, setActiveTab] = useState<'units' | 'categories' | 'warehouses' | 'company' | 'template' | 'api'>('units');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'template') setActiveTab('template');
    if (tab === 'api') setActiveTab('api');
  }, [searchParams]);

  // Company Profile state
  const [companyData, setCompanyData] = useState<Record<string, unknown> | null>(null);
  const [companyForm, setCompanyForm] = useState({
    address: '',
    phone: '',
    email: '',
    externalCompanyId: '',
    jobSourceMode: 'HYBRID' as 'HYBRID' | 'EXTERNAL_ONLY',
  });
  const [driveStatus, setDriveStatus] = useState<{
    connected: boolean;
    connectedAt: string | null;
    connectedEmail: string | null;
    rootFolderConfigured: boolean;
    oauthClientConfigured: boolean;
    companyName?: string;
  } | null>(null);
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [driveDisconnecting, setDriveDisconnecting] = useState(false);

  // API & Credentials state
  const [apiCredentials, setApiCredentials] = useState<Array<{
    id: string;
    label: string;
    keyPrefix: string;
    allowedDomains?: string[];
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }>>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiLabel, setApiLabel] = useState('');
  const [apiAllowedDomainsCreate, setApiAllowedDomainsCreate] = useState('');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [playgroundKey, setPlaygroundKey] = useState('');
  const [playgroundOrigin, setPlaygroundOrigin] = useState('');
  const [playgroundCompanyExternalId, setPlaygroundCompanyExternalId] = useState('');
  const [playgroundIdempotencyKey, setPlaygroundIdempotencyKey] = useState('');
  const [playgroundPayload, setPlaygroundPayload] = useState(
    JSON.stringify(
      {
        job: {
          externalJobId: 'PM-JOB-001',
          jobNumber: 'JOB-2026-001',
          customerExternalId: 10001,
          customerName: 'Demo Customer',
          description: 'Synced from PM',
          site: 'Demo Site',
          projectName: 'Demo Project',
          projectDetails: 'Phase 1',
          status: 'ACTIVE',
          startDate: new Date().toISOString().slice(0, 10),
          quotationNumber: 'QTN-001',
          lpoNumber: 'LPO-001',
          lpoValue: 10000,
          contactPerson: 'John Smith',
          contacts: [
            {
              label: 'site',
              name: 'John Smith',
              number: '+971500000000',
              email: 'john@example.com',
              designation: 'Site Engineer',
            },
          ],
          salesPerson: 'Ali',
        },
      },
      null,
      2
    )
  );
  const [playgroundResponse, setPlaygroundResponse] = useState('');
  const [playgroundLoading, setPlaygroundLoading] = useState(false);
  const [integrationLogs, setIntegrationLogs] = useState<Array<{
    id: string;
    status: string;
    entityKey: string | null;
    errorMessage: string | null;
    createdAt: string;
    httpStatus?: number | null;
    idempotencyKey?: string | null;
    requestBody?: unknown;
    responseBody?: unknown;
  }>>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsNextCursor, setLogsNextCursor] = useState<string | null>(null);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [logFilterStatus, setLogFilterStatus] = useState('');
  const [logFilterFrom, setLogFilterFrom] = useState('');
  const [logFilterTo, setLogFilterTo] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [domainModal, setDomainModal] = useState<{
    open: boolean;
    id: string | null;
    label: string;
    text: string;
  }>({ open: false, id: null, label: '', text: '' });
  const [domainModalSaving, setDomainModalSaving] = useState(false);

  // Template Management state
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [newTplModal, setNewTplModal] = useState(false);
  const [newTplForm, setNewTplForm] = useState({
    name: '',
    itemType: 'delivery-note' as ItemType,
    customItemKind: '',
  });
  const [tplSaving, setTplSaving] = useState(false);

  // Units state
  const { data: units = [], isFetching: unitsFetching } = useGetUnitsQuery();
  const [createUnit] = useCreateUnitMutation();
  const [updateUnit] = useUpdateUnitMutation();
  const [deleteUnit] = useDeleteUnitMutation();
  const [unitModal, setUnitModal] = useState<{ open: boolean; item: Unit | null }>({ open: false, item: null });
  const [unitForm, setUnitForm] = useState({ name: '' });
  const [unitDeleteModal, setUnitDeleteModal] = useState<{ open: boolean; item: Unit | null; linkedCount: number }>({
    open: false,
    item: null,
    linkedCount: 0,
  });

  // Categories state
  const { data: categories = [], isFetching: categoriesFetching } = useGetCategoriesQuery();
  const [createCategory] = useCreateCategoryMutation();
  const [updateCategory] = useUpdateCategoryMutation();
  const [deleteCategory] = useDeleteCategoryMutation();
  const [categoryModal, setCategoryModal] = useState<{ open: boolean; item: Category | null }>({ open: false, item: null });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [categoryDeleteModal, setCategoryDeleteModal] = useState<{ open: boolean; item: Category | null; linkedCount: number }>({
    open: false,
    item: null,
    linkedCount: 0,
  });

  // Warehouses state
  const { data: warehouses = [], isFetching: warehousesFetching } = useGetWarehousesQuery();
  const [createWarehouse] = useCreateWarehouseMutation();
  const [updateWarehouse] = useUpdateWarehouseMutation();
  const [deleteWarehouse] = useDeleteWarehouseMutation();
  const [warehouseModal, setWarehouseModal] = useState<{ open: boolean; item: Warehouse | null }>({ open: false, item: null });
  const [warehouseForm, setWarehouseForm] = useState({ name: '', location: '' });
  const [warehouseDeleteModal, setWarehouseDeleteModal] = useState<{ open: boolean; item: Warehouse | null; linkedCount: number }>({
    open: false,
    item: null,
    linkedCount: 0,
  });

  const extractMutationErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: unknown }).data;
      if (data && typeof data === 'object' && 'error' in data) {
        const message = (data as { error?: unknown }).error;
        if (typeof message === 'string' && message.trim()) return message;
      }
    }
    if (error instanceof Error && error.message.trim()) return error.message;
    return fallback;
  };

  // Load company profile data
  useEffect(() => {
    if (!session?.user?.activeCompanyId) return;
    const loadCompanyData = async () => {
      try {
        const res = await fetch(`/api/companies/${session.user.activeCompanyId}`);
        if (res.ok) {
          const data = await res.json();
          const company = data.data;
          setCompanyData(company);
          setCompanyForm({
            address: company.address || '',
            phone: company.phone || '',
            email: company.email || '',
            externalCompanyId: company.externalCompanyId || '',
            jobSourceMode: company.jobSourceMode || 'HYBRID',
          });
          const parsedTemplates = readCompanyDocumentTemplates(company.printTemplates);
          if (parsedTemplates.length > 0) {
            setTemplates(parsedTemplates);
          } else if (company.printTemplate) {
            // Legacy migration: convert single template to array
            setTemplates([company.printTemplate]);
          } else {
            setTemplates([]);
          }
        }
      } catch (err) {
        console.error('Failed to load company data:', err);
      }
    };
    loadCompanyData();
  }, [session?.user?.activeCompanyId]);

  const loadDriveStatus = useCallback(async () => {
    setDriveStatusLoading(true);
    try {
      const res = await fetch('/api/settings/google-drive/status', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load Google Drive status');
      setDriveStatus(json.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Google Drive status');
      setDriveStatus(null);
    } finally {
      setDriveStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'company') return;
    void loadDriveStatus();
  }, [activeTab, loadDriveStatus]);

  useEffect(() => {
    const driveResult = searchParams.get('googleDrive');
    const driveMessage = searchParams.get('googleDriveMessage');
    if (!driveResult) return;
    if (driveResult === 'connected') {
      toast.success(driveMessage || 'Google Drive connected');
      void loadDriveStatus();
    } else if (driveResult === 'error') {
      toast.error(driveMessage || 'Google Drive connection failed');
    }
  }, [searchParams, loadDriveStatus]);

  const loadApiCredentials = useCallback(async () => {
    setApiLoading(true);
    try {
      const res = await fetch('/api/settings/api-credentials', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load credentials');
      setApiCredentials(json.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load credentials');
      setApiCredentials([]);
    } finally {
      setApiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'api') return;
    void loadApiCredentials();
  }, [activeTab, loadApiCredentials]);

  const loadIntegrationLogs = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      const append = opts?.append ?? false;
      const pageCursor = append ? opts?.cursor ?? null : null;
      if (append && !pageCursor) return;
      setLogsLoading(true);
      try {
        const sp = new URLSearchParams();
        sp.set('limit', '50');
        if (logFilterStatus) sp.set('status', logFilterStatus);
        if (logFilterFrom) sp.set('from', logFilterFrom);
        if (logFilterTo) sp.set('to', logFilterTo);
        if (pageCursor) sp.set('cursor', pageCursor);
        const res = await fetch(`/api/settings/integration-logs?${sp.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load integration logs');
        const payload = json.data as { items?: typeof integrationLogs; nextCursor?: string | null } | typeof integrationLogs;
        const items = Array.isArray(payload) ? payload : (payload.items ?? []);
        const nextCursor = Array.isArray(payload) ? null : (payload.nextCursor ?? null);
        if (append) {
          setIntegrationLogs((prev) => [...prev, ...items]);
        } else {
          setIntegrationLogs(items);
          setSelectedLogId(null);
        }
        setLogsNextCursor(nextCursor);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load integration logs');
        if (!append) {
          setIntegrationLogs([]);
          setLogsNextCursor(null);
          setSelectedLogId(null);
        }
      } finally {
        setLogsLoading(false);
      }
    },
    [logFilterStatus, logFilterFrom, logFilterTo]
  );

  useEffect(() => {
    if (activeTab !== 'api') return;
    void loadIntegrationLogs();
  }, [activeTab, loadIntegrationLogs]);

  // â”€â”€â”€ TEMPLATE HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleTemplateDelete = async (index: number) => {
    if (!session?.user?.activeCompanyId) return;
    if (!window.confirm('Delete this template?')) return;

    setTplSaving(true);
    try {
      const newTemplates = templates.filter((_, i) => i !== index);
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyData?.printTemplates, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyData((prev: unknown) => {
          const current = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {};
          return {
            ...current,
            printTemplates: writeCompanyDocumentTemplates(current.printTemplates, newTemplates),
          };
        });
        toast.success('Template deleted');
      } else {
        toast.error('Failed to delete template');
      }
    } catch {
      toast.error('Failed to delete template');
    } finally {
      setTplSaving(false);
    }
  };

  const handleTemplateDuplicate = async (index: number) => {
    const original = templates[index];
    const duplicated: DocumentTemplate = {
      ...original,
      id: `template-${Date.now()}`,
      name: `${original.name} (Copy)`,
      isDefault: false,
    };

    if (!session?.user?.activeCompanyId) return;
    setTplSaving(true);
    try {
      const newTemplates = [...templates, duplicated];
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyData?.printTemplates, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyData((prev: unknown) => {
          const current = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {};
          return {
            ...current,
            printTemplates: writeCompanyDocumentTemplates(current.printTemplates, newTemplates),
          };
        });
        toast.success('Template duplicated');
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch {
      toast.error('Failed to duplicate template');
    } finally {
      setTplSaving(false);
    }
  };

  const handleSetDefault = async (index: number) => {
    const itemType = templates[index].itemType;
    const newTemplates = templates.map((t, i) => ({
      ...t,
      isDefault: t.itemType === itemType && i === index,
    }));

    if (!session?.user?.activeCompanyId) return;
    setTplSaving(true);
    try {
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printTemplates: writeCompanyDocumentTemplates(companyData?.printTemplates, newTemplates),
        }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        setCompanyData((prev: unknown) => {
          const current = prev && typeof prev === 'object' ? (prev as Record<string, unknown>) : {};
          return {
            ...current,
            printTemplates: writeCompanyDocumentTemplates(current.printTemplates, newTemplates),
          };
        });
        toast.success('Default template set');
      } else {
        toast.error('Failed to set default');
      }
    } catch {
      toast.error('Failed to set default');
    } finally {
      setTplSaving(false);
    }
  };

  const handleCreateApiCredential = async () => {
    if (!apiLabel.trim()) {
      toast.error('Credential label is required');
      return;
    }
    const allowedDomains = apiAllowedDomainsCreate
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch('/api/settings/api-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: apiLabel.trim(),
          ...(allowedDomains.length > 0 ? { allowedDomains } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to generate API key');
      setNewApiKey(json.data?.key || null);
      setApiLabel('');
      setApiAllowedDomainsCreate('');
      toast.success('API key generated');
      await loadApiCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate API key');
    }
  };

  const copyNewApiKey = async () => {
    if (!newApiKey) return;
    try {
      await navigator.clipboard.writeText(newApiKey);
      toast.success('API key copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const openDomainModal = (cred: (typeof apiCredentials)[number]) => {
    setDomainModal({
      open: true,
      id: cred.id,
      label: cred.label,
      text: (cred.allowedDomains ?? []).join('\n'),
    });
  };

  const saveDomainModal = async () => {
    if (!domainModal.id) return;
    const allowedDomains = domainModal.text
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setDomainModalSaving(true);
    try {
      const res = await fetch(`/api/settings/api-credentials/${domainModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedDomains }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update domains');
      toast.success('Allowed domains updated');
      setDomainModal({ open: false, id: null, label: '', text: '' });
      await loadApiCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update domains');
    } finally {
      setDomainModalSaving(false);
    }
  };

  const handleRevokeApiCredential = async (id: string) => {
    if (!window.confirm('Revoke this API key? External sync using this key will stop immediately.')) return;
    try {
      const res = await fetch(`/api/settings/api-credentials/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to revoke');
      toast.success('Credential revoked');
      await loadApiCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke credential');
    }
  };

  const runIntegrationPlayground = async () => {
    if (!playgroundKey.trim()) {
      toast.error('Enter API key');
      return;
    }
    if (!playgroundCompanyExternalId.trim()) {
      toast.error('Enter company external ID');
      return;
    }
    setPlaygroundLoading(true);
    try {
      const parsed = JSON.parse(playgroundPayload || '{}');
      const reqBody = {
        companyExternalId: playgroundCompanyExternalId.trim(),
        ...parsed,
      };
      const bodyStr = JSON.stringify(reqBody);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': playgroundKey.trim(),
      };
      if (playgroundIdempotencyKey.trim()) {
        headers['x-idempotency-key'] = playgroundIdempotencyKey.trim();
      }
      if (playgroundOrigin.trim()) {
        headers['Origin'] = playgroundOrigin.trim();
      }
      const res = await fetch('/api/integrations/jobs/upsert', {
        method: 'POST',
        headers,
        body: bodyStr,
      });
      const json = await res.json();
      setPlaygroundResponse(JSON.stringify({ status: res.status, ...json }, null, 2));
      if (res.ok && json.success) {
        toast.success('Playground request succeeded');
        await loadApiCredentials();
        await loadIntegrationLogs();
      } else {
        toast.error(json.error || 'Playground request failed');
        await loadIntegrationLogs();
      }
    } catch (err) {
      setPlaygroundResponse(
        JSON.stringify(
          {
            error: err instanceof Error ? err.message : 'Invalid JSON payload',
          },
          null,
          2
        )
      );
      toast.error('Invalid payload JSON');
    } finally {
      setPlaygroundLoading(false);
    }
  };

  const retryIntegrationLog = async (logId: string) => {
    setRetryingLogId(logId);
    try {
      const res = await fetch(`/api/settings/integration-logs/${logId}/retry`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Retry failed');
      toast.success('Retry succeeded');
      await loadIntegrationLogs();
      await loadApiCredentials();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
      await loadIntegrationLogs();
    } finally {
      setRetryingLogId(null);
    }
  };

  // â”€â”€â”€ UNITS HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleUnitContextMenu = useCallback((unit: Unit, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const options: ContextMenuOption[] = [
      {
        label: 'Edit',
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        action: () => {
          setUnitForm({ name: unit.name });
          setUnitModal({ open: true, item: unit });
        },
      },
      { divider: true },
      {
        label: 'Delete',
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        action: () => setUnitDeleteModal({ open: true, item: unit, linkedCount: 0 }),
        danger: true,
      },
    ];

    openContextMenu(e.clientX, e.clientY, options);
  }, [openContextMenu]);

  const handleUnitSave = async () => {
    if (!unitForm.name.trim()) {
      toast.error('Unit name is required');
      return;
    }

    try {
      if (unitModal.item) {
        await updateUnit({ id: unitModal.item.id, name: unitForm.name.trim() }).unwrap();
        toast.success('Unit updated successfully');
      } else {
        await createUnit({ name: unitForm.name.trim() }).unwrap();
        toast.success('Unit created successfully');
      }
      setUnitModal({ open: false, item: null });
      setUnitForm({ name: '' });
    } catch (err: unknown) {
      toast.error(extractMutationErrorMessage(err, 'Operation failed'));
    }
  };

  const handleUnitDelete = async () => {
    if (!unitDeleteModal.item) return;
    try {
      await deleteUnit(unitDeleteModal.item.id).unwrap();
      toast.success('Unit deleted successfully');
      setUnitDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: unknown) {
      const error = extractMutationErrorMessage(err, 'Failed to delete unit');
      if (error.includes('material')) {
        setUnitDeleteModal((prev) => ({
          ...prev,
          linkedCount: parseInt(error.match(/\d+/)?.[0] ?? '0'),
        }));
        toast.error(error);
      } else {
        toast.error(error);
      }
    }
  };

  // â”€â”€â”€ CATEGORIES HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleCategoryContextMenu = useCallback((category: Category, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const options: ContextMenuOption[] = [
      {
        label: 'Edit',
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        action: () => {
          setCategoryForm({ name: category.name });
          setCategoryModal({ open: true, item: category });
        },
      },
      { divider: true },
      {
        label: 'Delete',
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        action: () => setCategoryDeleteModal({ open: true, item: category, linkedCount: 0 }),
        danger: true,
      },
    ];

    openContextMenu(e.clientX, e.clientY, options);
  }, [openContextMenu]);

  const handleCategorySave = async () => {
    if (!categoryForm.name.trim()) {
      toast.error('Category name is required');
      return;
    }

    try {
      if (categoryModal.item) {
        await updateCategory({ id: categoryModal.item.id, name: categoryForm.name.trim() }).unwrap();
        toast.success('Category updated successfully');
      } else {
        await createCategory({ name: categoryForm.name.trim() }).unwrap();
        toast.success('Category created successfully');
      }
      setCategoryModal({ open: false, item: null });
      setCategoryForm({ name: '' });
    } catch (err: unknown) {
      toast.error(extractMutationErrorMessage(err, 'Operation failed'));
    }
  };

  const handleCategoryDelete = async () => {
    if (!categoryDeleteModal.item) return;
    try {
      await deleteCategory(categoryDeleteModal.item.id).unwrap();
      toast.success('Category deleted successfully');
      setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: unknown) {
      const error = extractMutationErrorMessage(err, 'Failed to delete category');
      if (error.includes('material')) {
        setCategoryDeleteModal((prev) => ({
          ...prev,
          linkedCount: parseInt(error.match(/\d+/)?.[0] ?? '0'),
        }));
        toast.error(error);
      } else {
        toast.error(error);
      }
    }
  };

  // â”€â”€â”€ WAREHOUSES HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleWarehouseContextMenu = useCallback((warehouse: Warehouse, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const options: ContextMenuOption[] = [
      {
        label: 'Edit',
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        action: () => {
          setWarehouseForm({ name: warehouse.name, location: warehouse.location || '' });
          setWarehouseModal({ open: true, item: warehouse });
        },
      },
      { divider: true },
      {
        label: 'Delete',
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        action: () => setWarehouseDeleteModal({ open: true, item: warehouse, linkedCount: 0 }),
        danger: true,
      },
    ];

    openContextMenu(e.clientX, e.clientY, options);
  }, [openContextMenu]);

  const handleWarehouseSave = async () => {
    if (!warehouseForm.name.trim()) {
      toast.error('Warehouse name is required');
      return;
    }

    try {
      if (warehouseModal.item) {
        await updateWarehouse({
          id: warehouseModal.item.id,
          name: warehouseForm.name.trim(),
          location: warehouseForm.location.trim() || undefined,
        }).unwrap();
        toast.success('Warehouse updated successfully');
      } else {
        await createWarehouse({
          name: warehouseForm.name.trim(),
          location: warehouseForm.location.trim() || undefined,
        }).unwrap();
        toast.success('Warehouse created successfully');
      }
      setWarehouseModal({ open: false, item: null });
      setWarehouseForm({ name: '', location: '' });
    } catch (err: unknown) {
      toast.error(extractMutationErrorMessage(err, 'Operation failed'));
    }
  };

  const handleWarehouseDelete = async () => {
    if (!warehouseDeleteModal.item) return;
    try {
      await deleteWarehouse(warehouseDeleteModal.item.id).unwrap();
      toast.success('Warehouse deleted successfully');
      setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: unknown) {
      const error = extractMutationErrorMessage(err, 'Failed to delete warehouse');
      if (error.includes('material')) {
        setWarehouseDeleteModal((prev) => ({
          ...prev,
          linkedCount: parseInt(error.match(/\d+/)?.[0] ?? '0'),
        }));
        toast.error(error);
      } else {
        toast.error(error);
      }
    }
  };

  // â”€â”€â”€ TABLE COLUMNS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const unitColumns: Column<Unit>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (unit) => <span className="font-mono text-emerald-400">{unit.name}</span>,
    },
  ];

  const categoryColumns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (category) => <span className="font-mono text-emerald-400">{category.name}</span>,
    },
  ];

  const warehouseColumns: Column<Warehouse>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (warehouse) => <span className="font-mono text-emerald-400">{warehouse.name}</span>,
    },
    {
      key: 'location',
      header: 'Location',
      render: (warehouse) => warehouse.location || '-',
    },
  ];

  return (
    <div className="space-y-6">
      {!canManage ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-6 py-12 text-center">
          <h1 className="text-2xl font-semibold text-white">Settings</h1>
          <p className="mt-3 text-sm text-slate-400">You do not have permission to manage settings.</p>
        </div>
      ) : (
        <>
      <section className="rounded-3xl border border-slate-700 bg-slate-900/70 p-6 shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/80">Administration</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Settings workspace</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Manage company master data, document layouts, and integration controls from one shared workspace.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[28rem] xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Units</p>
              <p className="mt-2 text-2xl font-semibold text-white">{units.length}</p>
              <p className="mt-1 text-xs text-slate-500">Material measurement labels</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Categories</p>
              <p className="mt-2 text-2xl font-semibold text-white">{categories.length}</p>
              <p className="mt-1 text-xs text-slate-500">Master data groupings</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Warehouses</p>
              <p className="mt-2 text-2xl font-semibold text-white">{warehouses.length}</p>
              <p className="mt-1 text-xs text-slate-500">Stock locations</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Print formats</p>
              <p className="mt-2 text-2xl font-semibold text-white">{templates.length}</p>
              <p className="mt-1 text-xs text-slate-500">Saved document layouts</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                activeTab === tab.id
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-700 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-800/60'
              }`}
            >
              <p className={`text-sm font-medium ${activeTab === tab.id ? 'text-white' : 'text-slate-200'}`}>
                {tab.label}
              </p>
              <p className="mt-1 text-xs text-slate-400">{tab.description}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">

      {/* Units Tab */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Units</h2>
            <Button onClick={() => { setUnitForm({ name: '' }); setUnitModal({ open: true, item: null }); }}>
              + Add Unit
            </Button>
          </div>
          <p className="text-sm text-slate-400 -mt-2 mb-2">
            Create labels like kg, drum, pallet here. On each material, set the <span className="text-slate-300">base unit</span>{' '}
            (stock unit), then add conversions (e.g. 1 drum = 190 kg, 1 pallet = 6 drums) under Materials / edit item.
          </p>
          {unitsFetching && units.length === 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full">
                <tbody>
                  <TableSkeleton rows={5} columns={unitColumns.length} />
                </tbody>
              </table>
            </div>
          ) : (
            <DataTable
              columns={unitColumns}
              data={units}
              loading={unitsFetching && units.length === 0}
              emptyText="No units found. Create one to get started."
              searchKeys={['name']}
              onRowContextMenu={handleUnitContextMenu}
            />
          )}
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Categories</h2>
            <Button onClick={() => { setCategoryForm({ name: '' }); setCategoryModal({ open: true, item: null }); }}>
              + Add Category
            </Button>
          </div>
          {categoriesFetching && categories.length === 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full">
                <tbody>
                  <TableSkeleton rows={5} columns={categoryColumns.length} />
                </tbody>
              </table>
            </div>
          ) : (
            <DataTable
              columns={categoryColumns}
              data={categories}
              loading={categoriesFetching && categories.length === 0}
              emptyText="No categories found. Create one to get started."
              searchKeys={['name']}
              onRowContextMenu={handleCategoryContextMenu}
            />
          )}
        </div>
      )}

      {/* Warehouses Tab */}
      {activeTab === 'warehouses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Warehouses</h2>
            <Button onClick={() => { setWarehouseForm({ name: '', location: '' }); setWarehouseModal({ open: true, item: null }); }}>
              + Add Warehouse
            </Button>
          </div>
          {warehousesFetching && warehouses.length === 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full">
                <tbody>
                  <TableSkeleton rows={5} columns={warehouseColumns.length} />
                </tbody>
              </table>
            </div>
          ) : (
            <DataTable
              columns={warehouseColumns}
              data={warehouses}
              loading={warehousesFetching && warehouses.length === 0}
              emptyText="No warehouses found. Create one to get started."
              searchKeys={['name', 'location']}
              onRowContextMenu={handleWarehouseContextMenu}
            />
          )}
        </div>
      )}

      {/* Company Profile Tab */}
      {activeTab === 'company' && (
        <div className="space-y-6">
          {/* Contact Info Card */}
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Company Information</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch(`/api/companies/${session?.user?.activeCompanyId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(companyForm),
                  });
                  if (res.ok) {
                    toast.success('Company information saved');
                    const data = await res.json();
                    setCompanyData(data.data);
                  } else {
                    const err = await res.json();
                    toast.error(err.error || 'Failed to save');
                  }
                } catch {
                  toast.error('Error saving company information');
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Address</label>
                <textarea
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  placeholder="Your company address"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    placeholder="Phone number"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    placeholder="Email address"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              {isSA && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      External Company ID (for Project Management sync)
                    </label>
                    <input
                      type="text"
                      value={companyForm.externalCompanyId}
                      onChange={(e) => setCompanyForm({ ...companyForm, externalCompanyId: e.target.value })}
                      placeholder="e.g. PM-COMPANY-001"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      Parent Job Source Mode
                    </label>
                    <select
                      value={companyForm.jobSourceMode}
                      onChange={(e) =>
                        setCompanyForm({
                          ...companyForm,
                          jobSourceMode: e.target.value as 'HYBRID' | 'EXTERNAL_ONLY',
                        })
                      }
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      <option value="HYBRID">Hybrid (local + external parent jobs)</option>
                      <option value="EXTERNAL_ONLY">External only (block local parent jobs)</option>
                    </select>
                    <p className="text-xs text-slate-400 mt-1">
                      Variations remain local in both modes.
                    </p>
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-2 border-t border-slate-700">
                <Button type="submit" fullWidth>
                  Save Information
                </Button>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-400">
            <p>
              Letterhead images are set per print template: open{' '}
              <span className="text-slate-300">Settings / Print formats / Edit</span>, select the{' '}
              <span className="text-slate-300">Letterhead</span> block, then paste an image URL or upload.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Google Drive connection</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Connect a personal Google Drive account from inside the app. The refresh token is stored for the active company,
                  and uploads are organized into nested folders under your root Drive folder.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void loadDriveStatus()}
                  disabled={driveStatusLoading}
                >
                  Refresh
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    window.location.href = '/api/settings/google-drive/oauth/start';
                  }}
                >
                  Connect Google Drive
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Status</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {driveStatusLoading ? 'Checking...' : driveStatus?.connected ? 'Connected' : 'Not connected'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Account</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {driveStatus?.connectedEmail || '-'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Root folder</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {driveStatus?.rootFolderConfigured ? 'Configured' : 'Missing .env value'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300 space-y-2">
              <p>
                Upload structure:
                <span className="text-slate-400"> Users / User Name - User ID</span> and
                <span className="text-slate-400"> Employees / Employee Name - Employee ID</span>
              </p>
              <p>
                Media URLs are saved directly in database fields using the
                <code className="mx-1 text-emerald-400">lh3.googleusercontent.com</code>
                viewer format for easier access.
              </p>
              {!driveStatus?.oauthClientConfigured && (
                <p className="text-amber-300">
                  GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing.
                </p>
              )}
            </div>

            {driveStatus?.connected && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={driveDisconnecting}
                  onClick={async () => {
                    if (!window.confirm('Disconnect Google Drive for this company? Existing uploaded files will stay in Drive.')) return;
                    setDriveDisconnecting(true);
                    try {
                      const res = await fetch('/api/settings/google-drive/status', { method: 'DELETE' });
                      const json = await res.json();
                      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to disconnect');
                      toast.success('Google Drive disconnected');
                      await loadDriveStatus();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to disconnect');
                    } finally {
                      setDriveDisconnecting(false);
                    }
                  }}
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* API & Credentials Tab */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Integration API Key</h2>
            <p className="text-sm text-slate-400">
              Generate a key for your external Project Management system to upsert parent jobs. Keys only apply to{' '}
              <code className="text-emerald-400/90">/api/integrations/*</code> - not the rest of the ERP (those routes still
              need a normal signed-in user).
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={apiLabel}
                onChange={(e) => setApiLabel(e.target.value)}
                placeholder="Credential label (e.g. PM production)"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <Button onClick={handleCreateApiCredential}>Generate Key</Button>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Allowed domains (optional)
              </label>
              <textarea
                value={apiAllowedDomainsCreate}
                onChange={(e) => setApiAllowedDomainsCreate(e.target.value)}
                rows={3}
                placeholder={'One hostname per line or comma-separated, e.g.\npartner.com\napp.partner.com'}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">
                If set, requests must send <code className="text-slate-400">Origin</code> or{' '}
                <code className="text-slate-400">Referer</code> matching these hosts. Leave empty for no restriction.
              </p>
            </div>
            {newApiKey && (
              <div className="rounded-lg border border-amber-600/60 bg-amber-950/30 p-3 space-y-2">
                <p className="text-xs text-amber-200">Copy now: this key will not be shown again.</p>
                <code className="block break-all text-amber-100 text-sm">{newApiKey}</code>
                <Button size="sm" variant="ghost" onClick={() => void copyNewApiKey()}>
                  Copy API key
                </Button>
              </div>
            )}
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-400 space-y-2">
              <p>
                Use header <code>x-api-key: &lt;your_key&gt;</code> (or <code>Authorization: Bearer ...</code>) and call{' '}
                <code>POST /api/integrations/jobs/upsert</code>. See <code>API-job-sync.md</code> for the JSON schema.
              </p>
              <p>
                Public route catalog and examples:{' '}
                <Link href="/docs/api" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">
                  /docs/api
                </Link>
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
            <h3 className="text-white font-medium mb-3">Existing credentials</h3>
            <div className="space-y-2">
              {apiLoading ? (
                <p className="text-sm text-slate-400">Loading credentials...</p>
              ) : apiCredentials.length === 0 ? (
                <p className="text-sm text-slate-400">No API credentials created yet.</p>
              ) : (
                apiCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white">{cred.label}</p>
                      <p className="text-xs text-slate-400">
                        Prefix: <code>{cred.keyPrefix}</code> | Last used:{' '}
                        {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleString() : 'Never'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Domains:{' '}
                        {cred.allowedDomains && cred.allowedDomains.length > 0
                          ? cred.allowedDomains.join(', ')
                          : 'any (no allowlist)'}
                      </p>
                    </div>
                    {cred.revokedAt ? (
                      <Badge label="Revoked" variant="red" />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button size="sm" variant="ghost" onClick={() => openDomainModal(cred)}>
                          Domains
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleRevokeApiCredential(cred.id)}>
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-3">
            <h3 className="text-white font-medium">Integration Playground</h3>
            <p className="text-xs text-slate-400">
              Quick local test for <code>POST /api/integrations/jobs/upsert</code>.
            </p>
            <input
              value={playgroundKey}
              onChange={(e) => setPlaygroundKey(e.target.value)}
              placeholder="API key (amfgi_...)"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <input
              value={playgroundOrigin}
              onChange={(e) => setPlaygroundOrigin(e.target.value)}
              placeholder="Origin header (optional - e.g. https://partner.com if credential has allowed domains)"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <input
              value={playgroundCompanyExternalId}
              onChange={(e) => setPlaygroundCompanyExternalId(e.target.value)}
              placeholder="Company external ID"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <input
              value={playgroundIdempotencyKey}
              onChange={(e) => setPlaygroundIdempotencyKey(e.target.value)}
              placeholder="Idempotency key (optional, recommended)"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <textarea
              value={playgroundPayload}
              onChange={(e) => setPlaygroundPayload(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            <div className="flex gap-2">
              <Button onClick={runIntegrationPlayground} loading={playgroundLoading}>
                Run Test
              </Button>
              <Button
                variant="ghost"
                onClick={() => setPlaygroundResponse('')}
                disabled={!playgroundResponse}
              >
                Clear Response
              </Button>
            </div>
            <textarea
              value={playgroundResponse}
              readOnly
              rows={10}
              placeholder="Response appears here..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-emerald-300 text-xs font-mono"
            />
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-medium">Recent Integration Logs</h3>
              <Button size="sm" variant="ghost" onClick={() => loadIntegrationLogs()} disabled={logsLoading}>
                Refresh
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
              >
                <option value="">All statuses</option>
                <option value="success">success</option>
                <option value="error">error</option>
                <option value="validation_error">validation_error</option>
                <option value="forbidden">forbidden</option>
                <option value="retry_success">retry_success</option>
                <option value="retry_error">retry_error</option>
              </select>
              <input
                type="datetime-local"
                value={logFilterFrom}
                onChange={(e) => setLogFilterFrom(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
              />
              <input
                type="datetime-local"
                value={logFilterTo}
                onChange={(e) => setLogFilterTo(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
              />
              <Button size="sm" variant="secondary" onClick={() => loadIntegrationLogs()} disabled={logsLoading}>
                Apply Filters
              </Button>
            </div>
            {logsLoading ? (
              <p className="text-sm text-slate-400">Loading logs...</p>
            ) : integrationLogs.length === 0 ? (
              <p className="text-sm text-slate-400">No integration logs yet.</p>
            ) : (
              <div className="space-y-2">
                {integrationLogs.map((log) => (
                  <div key={log.id} className="rounded border border-slate-700 bg-slate-800/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-300">
                        {new Date(log.createdAt).toLocaleString()} | {log.status.toUpperCase()} | {log.entityKey || '-'} | HTTP {log.httpStatus ?? '-'}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedLogId(log.id)}>
                          Details
                        </Button>
                        {log.status !== 'success' && log.status !== 'retry_success' ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => retryIntegrationLog(log.id)}
                            loading={retryingLogId === log.id}
                          >
                            Retry
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {log.errorMessage ? (
                      <p className="text-xs text-red-300 mt-1 break-all">{log.errorMessage}</p>
                    ) : null}
                  </div>
                ))}
                {logsNextCursor ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => void loadIntegrationLogs({ append: true, cursor: logsNextCursor })}
                    disabled={logsLoading}
                  >
                    Load more
                  </Button>
                ) : null}
              </div>
            )}
            {selectedLogId ? (
              (() => {
                const log = integrationLogs.find((x) => x.id === selectedLogId);
                if (!log) return null;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-white">Log Details</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `integration-log-${log.id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download JSON
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedLogId(null)}>
                          Close
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">Idempotency: {log.idempotencyKey || '-'}</p>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Request</p>
                      <textarea
                        value={JSON.stringify(log.requestBody ?? null, null, 2)}
                        readOnly
                        rows={8}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-emerald-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Response</p>
                      <textarea
                        value={JSON.stringify(log.responseBody ?? null, null, 2)}
                        readOnly
                        rows={8}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-emerald-300 text-xs font-mono"
                      />
                    </div>
                  </div>
                );
              })()
            ) : null}
          </div>
        </div>
      )}

      {/* Print Template Tab */}
      {activeTab === 'template' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Print formats</h2>
              <p className="mt-1 text-sm text-slate-400">
                Create, edit, and assign default document layouts for delivery notes and other print outputs.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setNewTplModal(true)}
              disabled={tplSaving}
            >
              + New Template
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-950/40 py-12 text-center">
              <p className="mb-4 text-slate-400">No print formats saved yet.</p>
              <Button onClick={() => setNewTplModal(true)}>+ New Template</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((tpl, idx) => (
                <div
                  key={tpl.id || `tpl-${idx}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-950/40 p-4 transition hover:border-slate-600"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const options: ContextMenuOption[] = [
                      {
                        label: 'Edit',
                        icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                        action: () =>
                          router.push(
                            `/settings/print-template/edit?id=${encodeURIComponent(tpl.id)}`
                          ),
                      },
                      { divider: true },
                      {
                        label: 'Duplicate',
                        icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                        action: () => handleTemplateDuplicate(idx),
                      },
                      {
                        label: tpl.isDefault ? 'Unset as Default' : 'Set as Default',
                        icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.381-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>,
                        action: () => handleSetDefault(idx),
                      },
                      { divider: true },
                      {
                        label: 'Delete',
                        icon: <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                        action: () => handleTemplateDelete(idx),
                        danger: true,
                      },
                    ];
                    openContextMenu(e.clientX, e.clientY, options);
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">{tpl.name}</h3>
                      <Badge
                        label={tpl.isDefault ? 'Default' : getItemTypeLabel(String(tpl.itemType))}
                        variant={tpl.isDefault ? 'green' : 'gray'}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{tpl.itemType}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      router.push(
                        `/settings/print-template/edit?id=${encodeURIComponent(tpl.id)}`
                      )
                    }
                    disabled={tplSaving}
                  >
                    Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </div>
        </>
      )}

      {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ MODALS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

      <Modal
        isOpen={domainModal.open}
        onClose={() => {
          if (domainModalSaving) return;
          setDomainModal({ open: false, id: null, label: '', text: '' });
        }}
        title={domainModal.label ? `Allowed domains - ${domainModal.label}` : 'Allowed domains'}
        size="lg"
        actions={
          <>
            <Button
              variant="ghost"
              disabled={domainModalSaving}
              onClick={() => setDomainModal({ open: false, id: null, label: '', text: '' })}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveDomainModal()} loading={domainModalSaving}>
              Save
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-400 mb-3">
          One hostname per line or comma-separated. Save empty to remove the allowlist (requests allowed from any origin
          that can reach the API).
        </p>
        <textarea
          value={domainModal.text}
          onChange={(e) => setDomainModal((m) => ({ ...m, text: e.target.value }))}
          rows={8}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none"
        />
      </Modal>

      {/* New Template Modal */}
      <Modal
        isOpen={newTplModal}
        onClose={() => {
          setNewTplModal(false);
          setNewTplForm({ name: '', itemType: 'delivery-note', customItemKind: '' });
        }}
        title="Create New Template"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTplForm.name.trim()) {
              toast.error('Template name is required');
              return;
            }
            const kind =
              newTplForm.customItemKind.trim().replace(/\s+/g, '-') || newTplForm.itemType;
            // Create and immediately open editor
            const newTemplate: DocumentTemplate =
              kind === 'work-schedule'
                ? createWorkScheduleTemplateDraft(`template-${Date.now()}`, newTplForm.name)
                : {
                    id: `template-${Date.now()}`,
                    name: newTplForm.name,
                    itemType: kind as ItemType,
                    isDefault: false,
                    pageMargins: { top: 10, right: 12, bottom: 10, left: 12 },
                    sections: [],
                    canvasMode: true,
                    canvasRects: [],
                  };
            try {
              sessionStorage.setItem(
                NEW_PRINT_TEMPLATE_SESSION_KEY,
                JSON.stringify({
                  template: newTemplate,
                  insertIndex: templates.length,
                })
              );
            } catch {
              toast.error('Could not start editor (storage blocked).');
              return;
            }
            setNewTplModal(false);
            setNewTplForm({ name: '', itemType: 'delivery-note', customItemKind: '' });
            router.push('/settings/print-template/edit?new=1');
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Template Name *</label>
            <input
              type="text"
              value={newTplForm.name}
              onChange={(e) => setNewTplForm({ ...newTplForm, name: e.target.value })}
              placeholder="e.g., Delivery Note - Standard"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">Document Type *</label>
            <div className="grid grid-cols-2 gap-3">
              {KNOWN_ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewTplForm({ ...newTplForm, itemType: type, customItemKind: '' })}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition ${
                    newTplForm.itemType === type && !newTplForm.customItemKind.trim()
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-slate-600 bg-slate-800 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {ITEM_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Or enter a custom document kind (slug, e.g. <code className="text-slate-400">work-order</code>).
              Register fields in code with <code className="text-slate-400">registerPrintItemTypeFields</code>, or the
              builder will show the merged field catalog.
            </p>
            <input
              type="text"
              value={newTplForm.customItemKind}
              onChange={(e) => setNewTplForm({ ...newTplForm, customItemKind: e.target.value })}
              placeholder="Custom kind (optional)..."
              className="w-full mt-2 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setNewTplModal(false);
                setNewTplForm({ name: '', itemType: 'delivery-note', customItemKind: '' });
              }}
              fullWidth
            >
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              Create & Edit
            </Button>
          </div>
        </form>
      </Modal>

      {/* Unit Modal */}
      <Modal
        isOpen={unitModal.open}
        onClose={() => setUnitModal({ open: false, item: null })}
        title={unitModal.item ? 'Edit Unit' : 'Create Unit'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleUnitSave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Unit Name *</label>
            <input
              type="text"
              value={unitForm.name}
              onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
              placeholder="e.g., kilogram, piece, meter"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUnitModal({ open: false, item: null })}
              fullWidth
            >
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              {unitModal.item ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal
        isOpen={categoryModal.open}
        onClose={() => setCategoryModal({ open: false, item: null })}
        title={categoryModal.item ? 'Edit Category' : 'Create Category'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCategorySave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Category Name *</label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="e.g., Raw Materials, Finished Goods"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCategoryModal({ open: false, item: null })}
              fullWidth
            >
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              {categoryModal.item ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Warehouse Modal */}
      <Modal
        isOpen={warehouseModal.open}
        onClose={() => setWarehouseModal({ open: false, item: null })}
        title={warehouseModal.item ? 'Edit Warehouse' : 'Create Warehouse'}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleWarehouseSave();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Warehouse Name *</label>
            <input
              type="text"
              value={warehouseForm.name}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
              placeholder="e.g., Main Warehouse, Branch Office"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Location</label>
            <input
              type="text"
              value={warehouseForm.location}
              onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })}
              placeholder="Optional location address"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setWarehouseModal({ open: false, item: null })}
              fullWidth
            >
              Cancel
            </Button>
            <Button type="submit" fullWidth>
              {warehouseModal.item ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Unit Delete Modal */}
      {unitDeleteModal.open && unitDeleteModal.item && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setUnitDeleteModal({ open: false, item: null, linkedCount: 0 })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Unit</h2>
            <p className="text-slate-300 text-sm mb-4">
              Are you sure you want to delete <strong>{unitDeleteModal.item.name}</strong>?
            </p>
            {unitDeleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">
                  Warning: {unitDeleteModal.linkedCount} material{unitDeleteModal.linkedCount !== 1 ? 's' : ''} {unitDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this unit.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setUnitDeleteModal({ open: false, item: null, linkedCount: 0 })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUnitDelete}
                disabled={unitDeleteModal.linkedCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Category Delete Modal */}
      {categoryDeleteModal.open && categoryDeleteModal.item && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Category</h2>
            <p className="text-slate-300 text-sm mb-4">
              Are you sure you want to delete <strong>{categoryDeleteModal.item.name}</strong>?
            </p>
            {categoryDeleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">
                  Warning: {categoryDeleteModal.linkedCount} material{categoryDeleteModal.linkedCount !== 1 ? 's' : ''} {categoryDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this category.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCategoryDelete}
                disabled={categoryDeleteModal.linkedCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}

      {/* Warehouse Delete Modal */}
      {warehouseDeleteModal.open && warehouseDeleteModal.item && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 })}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-2">Delete Warehouse</h2>
            <p className="text-slate-300 text-sm mb-4">
              Are you sure you want to delete <strong>{warehouseDeleteModal.item.name}</strong>?
            </p>
            {warehouseDeleteModal.linkedCount > 0 && (
              <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 mb-6">
                <p className="text-sm text-red-300">
                  Warning: {warehouseDeleteModal.linkedCount} material{warehouseDeleteModal.linkedCount !== 1 ? 's' : ''} {warehouseDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this warehouse.
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 })}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWarehouseDelete}
                disabled={warehouseDeleteModal.linkedCount > 0}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-slate-400 p-6">Loading settings...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
