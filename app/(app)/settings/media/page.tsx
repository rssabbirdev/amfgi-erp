'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
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

function formatBytes(n: number | null): string {
  if (n == null || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function usageSummary(row: MediaRow): string {
  if (row.linkCount === 0) return 'Unused';
  return row.links
    .map((l) => LINK_KIND_LABEL[l.kind] ?? l.kind)
    .join(', ');
}

export default function SettingsMediaPage() {
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
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setRows(json.data ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [category, orphansOnly, qApplied]);

  useEffect(() => {
    if (status !== 'authenticated' || !canManage) return;
    load();
  }, [status, canManage, load]);

  const onCleanupOrphans = async () => {
    if (
      !window.confirm(
        'Delete every unused file (no links) for this company from Google Drive and the database? This cannot be undone.'
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
      toast.success(`Removed ${deleted} unused file(s) from the library.`);
      if (errs.length) console.warn('Drive cleanup warnings:', errs);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cleanup failed');
    } finally {
      setCleanupBusy(false);
    }
  };

  const onDeleteOne = async (row: MediaRow) => {
    if (row.linkCount > 0) {
      toast.error('This file is still linked to a user or record.');
      return;
    }
    if (!window.confirm(`Delete unused file “${row.fileName}” from Drive and the library?`)) return;
    try {
      const res = await fetch(`/api/media/${row.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Delete failed');
      toast.success('File removed');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const columns: Column<MediaRow>[] = [
    {
      key: 'preview',
      header: '',
      render: (r) =>
        r.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.previewUrl}
            alt=""
            className="h-10 w-10 rounded object-cover border border-neutral-200 bg-neutral-50"
          />
        ) : (
          <span className="text-neutral-400">—</span>
        ),
    },
    { key: 'fileName', header: 'File' },
    { key: 'category', header: 'Category' },
    {
      key: 'bytes',
      header: 'Size',
      render: (r) => formatBytes(r.bytes),
    },
    {
      key: 'uploadedBy',
      header: 'Uploaded by',
      render: (r) => (r.uploadedBy ? r.uploadedBy.name || r.uploadedBy.email : '—'),
    },
    {
      key: 'usage',
      header: 'Usage',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          {r.linkCount === 0 ? (
            <Badge label="Unused" variant="yellow" />
          ) : (
            <span className="text-sm text-neutral-700">{usageSummary(r)}</span>
          )}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Uploaded',
      render: (r) => new Date(r.createdAt).toLocaleString(),
    },
    {
      key: 'actions',
      header: '',
      render: (r) =>
        r.linkCount === 0 ? (
          <Button type="button" variant="outline" className="text-red-600 border-red-300" onClick={() => onDeleteOne(r)}>
            Delete
          </Button>
        ) : null,
    },
  ];

  if (status === 'loading') {
    return (
      <div className="p-6">
        <p className="text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="p-6 max-w-lg">
        <h1 className="text-lg font-semibold text-neutral-900">Media library</h1>
        <p className="mt-2 text-neutral-600">You do not have permission to manage settings for this company.</p>
        <Link href="/settings" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to settings
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Media library</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Files uploaded for this company. Unused rows have no links and can be bulk-deleted from Drive.
          </p>
        </div>
        <Link href="/settings" className="text-sm text-blue-600 hover:underline">
          ← Settings
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Search file name</span>
          <input
            className="border rounded px-2 py-1.5 min-w-[200px]"
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Contains…"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600">Category</span>
          <input
            className="border rounded px-2 py-1.5 w-40"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. profile_image"
          />
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={orphansOnly}
            onChange={(e) => setOrphansOnly(e.target.checked)}
          />
          Unused only
        </label>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setQApplied(qDraft.trim())}
          disabled={loading}
        >
          Apply search
        </Button>
        <Button type="button" variant="danger" onClick={onCleanupOrphans} disabled={cleanupBusy || loading}>
          {cleanupBusy ? 'Cleaning…' : 'Delete all unused'}
        </Button>
      </div>

      <DataTable columns={columns} data={rows} loading={loading} emptyText="No media matches these filters." />
    </div>
  );
}
