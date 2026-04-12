'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  const [activeTab, setActiveTab] = useState<'units' | 'categories' | 'warehouses' | 'company' | 'template'>('units');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'template') setActiveTab('template');
  }, [searchParams]);

  // Company Profile state
  const [companyData, setCompanyData] = useState<any>(null);
  const [companyForm, setCompanyForm] = useState({ address: '', phone: '', email: '' });

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
          });
          // Load templates (handle legacy single printTemplate)
          if (company.printTemplates && Array.isArray(company.printTemplates)) {
            setTemplates(company.printTemplates);
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

  // ─── TEMPLATE HANDLERS ────────────────────────────────────────────────────────

  const handleTemplateDelete = async (index: number) => {
    if (!session?.user?.activeCompanyId) return;
    if (!window.confirm('Delete this template?')) return;

    setTplSaving(true);
    try {
      const newTemplates = templates.filter((_, i) => i !== index);
      const res = await fetch(`/api/companies/${session.user.activeCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printTemplates: newTemplates }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        toast.success('Template deleted');
      } else {
        toast.error('Failed to delete template');
      }
    } catch (error) {
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
        body: JSON.stringify({ printTemplates: newTemplates }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        toast.success('Template duplicated');
      } else {
        toast.error('Failed to duplicate template');
      }
    } catch (error) {
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
        body: JSON.stringify({ printTemplates: newTemplates }),
      });

      if (res.ok) {
        setTemplates(newTemplates);
        toast.success('Default template set');
      } else {
        toast.error('Failed to set default');
      }
    } catch (error) {
      toast.error('Failed to set default');
    } finally {
      setTplSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <div className="text-center py-12">
          <p className="text-slate-400">You do not have permission to manage settings.</p>
        </div>
      </div>
    );
  }

  // ─── UNITS HANDLERS ───────────────────────────────────────────────────────────

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
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Operation failed');
    }
  };

  const handleUnitDelete = async () => {
    if (!unitDeleteModal.item) return;
    try {
      await deleteUnit(unitDeleteModal.item.id).unwrap();
      toast.success('Unit deleted successfully');
      setUnitDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: any) {
      const error = err?.data?.error ?? 'Failed to delete unit';
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

  // ─── CATEGORIES HANDLERS ───────────────────────────────────────────────────────

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
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Operation failed');
    }
  };

  const handleCategoryDelete = async () => {
    if (!categoryDeleteModal.item) return;
    try {
      await deleteCategory(categoryDeleteModal.item.id).unwrap();
      toast.success('Category deleted successfully');
      setCategoryDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: any) {
      const error = err?.data?.error ?? 'Failed to delete category';
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

  // ─── WAREHOUSES HANDLERS ───────────────────────────────────────────────────────

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
    } catch (err: any) {
      toast.error(err?.data?.error ?? 'Operation failed');
    }
  };

  const handleWarehouseDelete = async () => {
    if (!warehouseDeleteModal.item) return;
    try {
      await deleteWarehouse(warehouseDeleteModal.item.id).unwrap();
      toast.success('Warehouse deleted successfully');
      setWarehouseDeleteModal({ open: false, item: null, linkedCount: 0 });
    } catch (err: any) {
      const error = err?.data?.error ?? 'Failed to delete warehouse';
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

  // ─── TABLE COLUMNS ────────────────────────────────────────────────────────────

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
      render: (warehouse) => warehouse.location || '—',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 text-sm mt-1">Manage master data for your company</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-700">
        {[
          { id: 'units', label: 'Units' },
          { id: 'categories', label: 'Categories' },
          { id: 'warehouses', label: 'Warehouses' },
          { id: 'company', label: 'Company Profile' },
          { id: 'template', label: 'Print Template' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as typeof activeTab);
            }}
            className={`px-4 py-3 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-emerald-500 text-white'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
            disabled={tab.id === 'coming'}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Units Tab */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Units</h2>
            <Button onClick={() => { setUnitForm({ name: '' }); setUnitModal({ open: true, item: null }); }}>
              + Add Unit
            </Button>
          </div>
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
                } catch (err) {
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
              <span className="text-slate-300">Settings → Print Templates → Edit</span>, select the{' '}
              <span className="text-slate-300">Letterhead</span> block, then paste an image URL or upload.
            </p>
          </div>
        </div>
      )}

      {/* Print Template Tab */}
      {activeTab === 'template' && (
        <div className="space-y-4">
          {/* Template Manager */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Print Templates</h2>
            <Button
              size="sm"
              onClick={() => setNewTplModal(true)}
              disabled={tplSaving}
            >
              + New Template
            </Button>
          </div>

          {templates.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
              <p className="text-slate-400 mb-4">No templates yet. Create one to get started.</p>
              <Button onClick={() => setNewTplModal(true)}>+ New Template</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((tpl, idx) => (
                <div
                  key={tpl.id || `tpl-${idx}`}
                  className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 rounded-lg hover:border-slate-600 transition"
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
                        label={tpl.isDefault ? '★ Default' : getItemTypeLabel(String(tpl.itemType))}
                        variant={tpl.isDefault ? 'green' : 'gray'}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{tpl.itemType}</p>
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

      {/* ──────────────────── MODALS ──────────────────────────────────── */}

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
            const newTemplate: DocumentTemplate = {
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
              placeholder="Custom kind (optional)…"
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
                  ⚠️ {unitDeleteModal.linkedCount} material{unitDeleteModal.linkedCount !== 1 ? 's' : ''} {unitDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this unit.
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
                  ⚠️ {categoryDeleteModal.linkedCount} material{categoryDeleteModal.linkedCount !== 1 ? 's' : ''} {categoryDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this category.
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
                  ⚠️ {warehouseDeleteModal.linkedCount} material{warehouseDeleteModal.linkedCount !== 1 ? 's' : ''} {warehouseDeleteModal.linkedCount === 1 ? 'uses' : 'use'} this warehouse.
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
    <Suspense fallback={<div className="text-slate-400 p-6">Loading settings…</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
