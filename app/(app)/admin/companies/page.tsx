'use client';

import { useEffect, useState }  from 'react';
import { Button }               from '@/components/ui/Button';
import DataTable                from '@/components/ui/DataTable';
import { Badge }                from '@/components/ui/Badge';
import Modal                    from '@/components/ui/Modal';
import toast                    from 'react-hot-toast';
import type { Column }          from '@/components/ui/DataTable';

interface Company {
  _id:         string;
  name:        string;
  slug:        string;
  dbName:      string;
  description: string;
  isActive:    boolean;
  createdAt:   string;
}

export default function AdminCompaniesPage() {
  const [companies,   setCompanies]   = useState<Company[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [editing,     setEditing]     = useState<Company | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');

  const fetchCompanies = () => {
    setLoading(true);
    fetch('/api/companies')
      .then((r) => r.json())
      .then((j) => { setCompanies(j.data ?? []); setLoading(false); });
  };

  useEffect(() => { fetchCompanies(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName(''); setDescription('');
    setModal(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setName(c.name); setDescription(c.description ?? '');
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    const body = { name, description };

    const url    = editing ? `/api/companies/${editing._id}` : '/api/companies';
    const method = editing ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    setFormLoading(false);
    if (res.ok) {
      toast.success(editing ? 'Company updated' : 'Company created');
      setModal(false);
      fetchCompanies();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Save failed');
    }
  };

  const handleToggleActive = async (c: Company) => {
    const res = await fetch(`/api/companies/${c._id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !c.isActive }),
    });
    if (res.ok) {
      toast.success(c.isActive ? 'Company deactivated' : 'Company activated');
      fetchCompanies();
    } else {
      toast.error('Failed to update company');
    }
  };

  const columns: Column<Company>[] = [
    { key: 'name',   header: 'Company Name', sortable: true },
    { key: 'slug',   header: 'Slug',         render: (c) => <code className="text-xs text-emerald-400 bg-slate-900 px-2 py-0.5 rounded">{c.slug}</code> },
    { key: 'dbName', header: 'Database',     render: (c) => <code className="text-xs text-blue-400 bg-slate-900 px-2 py-0.5 rounded">{c.dbName}</code> },
    {
      key: 'description', header: 'Description',
      render: (c) => <span className="text-slate-400 text-sm">{c.description || '—'}</span>,
    },
    {
      key: 'isActive', header: 'Status',
      render: (c) => <Badge label={c.isActive ? 'Active' : 'Inactive'} variant={c.isActive ? 'green' : 'red'} />,
    },
    {
      key: 'actions', header: '',
      render: (c) => (
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
          <Button
            size="sm"
            variant={c.isActive ? 'danger' : 'secondary'}
            onClick={() => handleToggleActive(c)}
          >
            {c.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Company Management</h1>
          <p className="text-slate-400 text-sm mt-1">
            Each company has its own isolated database. {companies.length} {companies.length === 1 ? 'company' : 'companies'} registered.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Company</Button>
      </div>

      <DataTable
        columns={columns}
        data={companies}
        loading={loading}
        emptyText="No companies registered yet."
        searchKeys={['name', 'slug']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Edit Company' : 'Create Company'}>
        <form onSubmit={handleSave} className="space-y-4">
          {editing && (
            <div className="p-3 bg-slate-900 rounded-lg text-xs text-slate-400 space-y-1">
              <p>Slug: <code className="text-emerald-400">{editing.slug}</code></p>
              <p>Database: <code className="text-blue-400">{editing.dbName}</code></p>
            </div>
          )}
          {!editing && (
            <div className="p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-xs text-amber-300">
              A unique database will be automatically created for this company.
              The slug and database name are derived from the company name and cannot be changed later.
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Company Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Almuraqib Fiber Glass Industry"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>
              {editing ? 'Update Company' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
