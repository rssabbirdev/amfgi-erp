'use client';

import { useEffect, useState } from 'react';
import { Button }              from '@/components/ui/Button';
import { Badge }               from '@/components/ui/Badge';
import Modal                   from '@/components/ui/Modal';
import toast                   from 'react-hot-toast';

interface Profile {
  _id:         string;
  name:        string;
  slug:        string;
  description?: string;
  isActive:    boolean;
}

export default function AdminProfilesPage() {
  const [profiles,    setProfiles]    = useState<Profile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [name,        setName]        = useState('');
  const [slug,        setSlug]        = useState('');
  const [description, setDescription] = useState('');

  const fetchProfiles = () => {
    setLoading(true);
    fetch('/api/company-profiles').then((r) => r.json()).then((j) => { setProfiles(j.data ?? []); setLoading(false); });
  };

  useEffect(() => { fetchProfiles(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    const res = await fetch('/api/company-profiles', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, slug, description: description || undefined }),
    });
    setFormLoading(false);
    if (res.ok) {
      toast.success('Division created');
      setModal(false);
      setName(''); setSlug(''); setDescription('');
      fetchProfiles();
    } else {
      const err = await res.json();
      toast.error(err.error ?? 'Failed to create');
    }
  };

  const autoSlug = (value: string) =>
    value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Company Divisions</h1>
          <p className="text-slate-400 text-sm mt-1">Manage the internal company profiles that partition data</p>
        </div>
        <Button onClick={() => setModal(true)}>+ Add Division</Button>
      </div>

      {loading ? (
        <p className="text-slate-500 text-center py-12">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((p) => (
            <div key={p._id} className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-white">{p.name}</h3>
                  <code className="text-xs text-slate-500 font-mono">{p.slug}</code>
                </div>
                <Badge label={p.isActive ? 'Active' : 'Inactive'} variant={p.isActive ? 'green' : 'gray'} />
              </div>
              {p.description && <p className="text-sm text-slate-400">{p.description}</p>}
            </div>
          ))}
          {profiles.length === 0 && (
            <div className="col-span-2 text-center py-12 text-slate-500">
              No divisions created yet.
            </div>
          )}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Create Division">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Division Name *</label>
            <input
              required
              value={name}
              onChange={(e) => { setName(e.target.value); setSlug(autoSlug(e.target.value)); }}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="Fiber Glass Work"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Slug (URL-safe) *</label>
            <input
              required
              pattern="^[a-z0-9-]+$"
              value={slug}
              onChange={(e) => setSlug(autoSlug(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm font-mono focus:ring-2 focus:ring-emerald-500"
              placeholder="fiber-glass-work"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-emerald-500 resize-none"
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModal(false)} fullWidth>Cancel</Button>
            <Button type="submit" loading={formLoading} fullWidth>Create Division</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
