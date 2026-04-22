'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import toast from 'react-hot-toast';
import type { Column } from '@/components/ui/DataTable';

const LINK_KIND_LABEL: Record<string, string> = {
  USER_PROFILE_IMAGE: 'Profile photo',
  USER_SIGNATURE: 'Signature',
};

type MediaRow = {
  id: string;
  driveId: string;
  previewUrl: string | null;
  mimeType: string;
  fileName: string;
  category: string;
  bytes: number | null;
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string } | null;
  linkCount: number;
  links: { kind: string; entityId: string }[];
};

function formatBytes(value: number | null): string {
  if (value == null || value < 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function usageSummary(row: MediaRow): string {
  if (row.linkCount === 0) return 'Unused';
  return row.links.map((link) => LINK_KIND_LABEL[link.kind] ?? link.kind).join(', ');
}

export function SettingsMediaPanel() {
  const { data: session, status } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const isSA = session?.user?.isSuperAdmin ?? false;
  const canManage = isSA || perms.includes('settings.manage');

  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [orphansOnly, setOrphansOnly] = useState(false);
  const [qDraft, setQDraft] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      if (category.trim()) sp.set('category', category.trim());
      if (orphansOnly) sp.set('orphansOnly', '1');
      if (qApplied.trim()) sp.set('q', qApplied.trim());
      const res = await fetch(`/api/media?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load media');
      setRows(json.data ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load media');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [category, orphansOnly, qApplied]);

  useEffect(() => {
    if (status !== 'authenticated' || !canManage) return;
    void load();
  }, [status, canManage, load]);

  const onCleanupOrphans = async () => {
    if (
      !window.confirm(
        'Delete every unused file for this company from Google Drive and the library? This cannot be undone.'
      )
    ) {
      return;
    }
    setCleanupBusy(true);
    try {
      const res = await fetch('/api/media/cleanup', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Cleanup failed');
      const deleted = json.data?.deleted ?? 0;
      const errs: string[] = json.data?.driveErrors ?? [];
      toast.success(`Removed ${deleted} unused file(s).`);
      if (errs.length) console.warn('Drive cleanup warnings:', errs);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cleanup failed');
    } finally {
      setCleanupBusy(false);
    }
  };

  const onDeleteOne = async (row: MediaRow) => {
    if (row.linkCount > 0) {
      toast.error('This file is still linked to a user or record.');
      return;
    }
    if (!window.confirm(`Delete unused file "${row.fileName}" from Drive and the library?`)) return;
    try {
      const res = await fetch(`/api/media/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      toast.success('File removed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const columns: Column<MediaRow>[] = [
    {
      key: 'preview',
      header: '',
      render: (row) =>
        row.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.previewUrl}
            alt=""
            className="h-11 w-11 rounded-xl border border-slate-700 bg-slate-900 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950 text-[11px] text-slate-500">
            N/A
          </div>
        ),
    },
    {
      key: 'fileName',
      header: 'File',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{row.fileName}</p>
          <p className="mt-1 text-xs text-slate-500">{row.mimeType}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span className="text-sm text-slate-300">{row.category || '-'}</span>,
    },
    {
      key: 'bytes',
      header: 'Size',
      render: (row) => <span className="text-sm text-slate-300">{formatBytes(row.bytes)}</span>,
    },
    {
      key: 'uploadedBy',
      header: 'Uploaded by',
      render: (row) => (
        <span className="text-sm text-slate-300">{row.uploadedBy ? row.uploadedBy.name || row.uploadedBy.email : '-'}</span>
      ),
    },
    {
      key: 'usage',
      header: 'Usage',
      render: (row) =>
        row.linkCount === 0 ? (
          <Badge label="Unused" variant="yellow" />
        ) : (
          <span className="text-sm text-slate-300">{usageSummary(row)}</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      render: (row) => <span className="text-sm text-slate-400">{new Date(row.createdAt).toLocaleString()}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.linkCount === 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-300 hover:bg-red-500/10"
            onClick={() => onDeleteOne(row)}
          >
            Delete
          </Button>
        ) : null,
    },
  ];

  if (status === 'loading') {
    return <p className="text-sm text-slate-400">Loading media library...</p>;
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-950/40 px-5 py-6">
        <h2 className="text-lg font-semibold text-white">Media library</h2>
        <p className="mt-2 text-sm text-slate-400">You do not have permission to manage settings for this company.</p>
      </div>
    );
  }

  const unusedCount = rows.filter((row) => row.linkCount === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-950/40 p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-white">Media library</h2>
          <p className="mt-1 text-sm text-slate-400">
            Review uploaded company files, filter by category, and clear unused items without leaving settings.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[15rem]">
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Files</p>
            <p className="mt-2 text-xl font-semibold text-white">{rows.length}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Unused</p>
            <p className="mt-2 text-xl font-semibold text-white">{unusedCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-950/30 p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_13rem_auto_auto]">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Search</span>
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/60"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="Find by file name"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Category</span>
            <input
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500/60"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="profile_image"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 xl:self-end">
            <input type="checkbox" checked={orphansOnly} onChange={(e) => setOrphansOnly(e.target.checked)} />
            Unused only
          </label>
          <div className="flex flex-wrap gap-2 xl:justify-end xl:self-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setQApplied(qDraft.trim())} disabled={loading}>
              Apply
            </Button>
            <Button type="button" variant="danger" size="sm" onClick={onCleanupOrphans} disabled={cleanupBusy || loading}>
              {cleanupBusy ? 'Cleaning...' : 'Delete unused'}
            </Button>
          </div>
        </div>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} emptyText="No media matches these filters." />
    </div>
  );
}
