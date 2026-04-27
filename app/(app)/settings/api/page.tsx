'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

type ApiCredential = {
  id: string;
  label: string;
  keyPrefix: string;
  allowedDomains?: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type IntegrationLog = {
  id: string;
  status: string;
  entityKey: string | null;
  errorMessage: string | null;
  createdAt: string;
  httpStatus?: number | null;
  idempotencyKey?: string | null;
  requestBody?: unknown;
  responseBody?: unknown;
};

export default function SettingsApiPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = Boolean(session?.user?.isSuperAdmin) || perms.includes('settings.manage');

  const [apiCredentials, setApiCredentials] = useState<ApiCredential[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiLabel, setApiLabel] = useState('');
  const [apiAllowedDomainsCreate, setApiAllowedDomainsCreate] = useState('');
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const [integrationLogs, setIntegrationLogs] = useState<IntegrationLog[]>([]);
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

  const loadIntegrationLogs = useCallback(
    async (opts?: { append?: boolean; cursor?: string | null }) => {
      setLogsLoading(true);
      try {
        const sp = new URLSearchParams();
        if (logFilterStatus) sp.set('status', logFilterStatus);
        if (logFilterFrom) sp.set('from', logFilterFrom);
        if (logFilterTo) sp.set('to', logFilterTo);
        if (opts?.cursor) sp.set('cursor', opts.cursor);
        const res = await fetch(`/api/settings/integration-logs?${sp.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load integration logs');
        const payload = json.data as { items?: IntegrationLog[]; nextCursor?: string | null } | IntegrationLog[];
        const items = Array.isArray(payload) ? payload : payload.items ?? [];
        setIntegrationLogs((prev) => (opts?.append ? [...prev, ...items] : items));
        setLogsNextCursor(Array.isArray(payload) ? null : payload.nextCursor ?? null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load integration logs');
        if (!opts?.append) setIntegrationLogs([]);
      } finally {
        setLogsLoading(false);
      }
    },
    [logFilterFrom, logFilterStatus, logFilterTo]
  );

  useEffect(() => {
    if (!canManage) return;
    void loadApiCredentials();
    void loadIntegrationLogs();
  }, [canManage, loadApiCredentials, loadIntegrationLogs]);

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

  const openDomainModal = (cred: ApiCredential) => {
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

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
        <h1 className="text-xl font-semibold text-slate-950 dark:text-white">API Center</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">You do not have permission to manage API credentials.</p>
      </div>
    );
  }

  const selectedLog = selectedLogId ? integrationLogs.find((log) => log.id === selectedLogId) : null;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_35%),linear-gradient(135deg,#f8fafc,#ecfdf5)] p-6 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.24),transparent_34%),linear-gradient(135deg,#020617,#0f172a)] sm:p-8">
          <Link href="/settings" className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200">
            Settings
          </Link>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">API Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Manage external API credentials, allowed domains, and sync logs from one place. Job, customer,
            and supplier upserts are live now; future application APIs can be added as separate route cards.
          </p>
        </div>
        <div className="grid gap-px bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
          {[
            { label: 'Credentials', value: String(apiCredentials.filter((cred) => !cred.revokedAt).length), note: 'active keys' },
            { label: 'Available routes', value: '3', note: 'job + party upserts' },
            { label: 'Logs', value: String(integrationLogs.length), note: logsNextCursor ? 'more available' : 'loaded' },
          ].map((item) => (
            <div key={item.label} className="bg-white px-5 py-4 dark:bg-slate-900">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{item.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <main className="space-y-6">
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">API Credentials</h2>
            <p className="mt-1 text-sm text-slate-400">
              Keys apply only to <code className="text-emerald-300">/api/integrations/*</code>. Normal ERP routes still require a signed-in user session.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={apiLabel}
                onChange={(e) => setApiLabel(e.target.value)}
                placeholder="Credential label (e.g. PM production)"
                className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Button onClick={handleCreateApiCredential}>Generate Key</Button>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-300">
              Allowed domains (optional)
              <textarea
                value={apiAllowedDomainsCreate}
                onChange={(e) => setApiAllowedDomainsCreate(e.target.value)}
                rows={3}
                placeholder={'One hostname per line or comma-separated, e.g.\npartner.com\napp.partner.com'}
                className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            {newApiKey ? (
              <div className="mt-4 rounded-lg border border-amber-600/60 bg-amber-950/30 p-3">
                <p className="text-xs text-amber-200">Copy now: this key will not be shown again.</p>
                <code className="mt-2 block break-all text-sm text-amber-100">{newApiKey}</code>
                <Button className="mt-2" size="sm" variant="ghost" onClick={() => void copyNewApiKey()}>
                  Copy API key
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">Existing Credentials</h2>
            <div className="mt-4 space-y-2">
              {apiLoading ? (
                <p className="text-sm text-slate-400">Loading credentials...</p>
              ) : apiCredentials.length === 0 ? (
                <p className="text-sm text-slate-400">No API credentials created yet.</p>
              ) : (
                apiCredentials.map((cred) => (
                  <div key={cred.id} className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm text-white">{cred.label}</p>
                      <p className="text-xs text-slate-400">
                        Prefix: <code>{cred.keyPrefix}</code> | Last used: {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleString() : 'Never'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Domains: {cred.allowedDomains && cred.allowedDomains.length > 0 ? cred.allowedDomains.join(', ') : 'any (no allowlist)'}
                      </p>
                    </div>
                    {cred.revokedAt ? (
                      <Badge label="Revoked" variant="red" />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openDomainModal(cred)}>
                          Domains
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => void handleRevokeApiCredential(cred.id)}>
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Recent Logs</h2>
                <p className="mt-1 text-sm text-slate-400">Review inbound integration activity directly under the credential list.</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void loadIntegrationLogs()} disabled={logsLoading}>
                Refresh
              </Button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <select value={logFilterStatus} onChange={(e) => setLogFilterStatus(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white">
                <option value="">All statuses</option>
                <option value="success">success</option>
                <option value="error">error</option>
                <option value="validation_error">validation_error</option>
                <option value="forbidden">forbidden</option>
                <option value="retry_success">retry_success</option>
                <option value="retry_error">retry_error</option>
              </select>
              <Button size="sm" variant="secondary" onClick={() => void loadIntegrationLogs()} disabled={logsLoading} className="md:justify-self-end">
                Apply Filters
              </Button>
              <input type="datetime-local" value={logFilterFrom} onChange={(e) => setLogFilterFrom(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
              <input type="datetime-local" value={logFilterTo} onChange={(e) => setLogFilterTo(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white" />
            </div>
            <div className="mt-4 space-y-2">
              {logsLoading ? (
                <p className="text-sm text-slate-400">Loading logs...</p>
              ) : integrationLogs.length === 0 ? (
                <p className="text-sm text-slate-400">No integration logs yet.</p>
              ) : (
                integrationLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
                    <p className="text-xs text-slate-300">
                      {new Date(log.createdAt).toLocaleString()} | {log.status.toUpperCase()} | HTTP {log.httpStatus ?? '-'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{log.entityKey || '-'}</p>
                    {log.errorMessage ? <p className="mt-1 break-all text-xs text-red-300">{log.errorMessage}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedLogId(log.id)}>
                        Details
                      </Button>
                      {log.status !== 'success' && log.status !== 'retry_success' ? (
                        <Button size="sm" variant="secondary" onClick={() => void retryIntegrationLog(log.id)} loading={retryingLogId === log.id}>
                          Retry
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {logsNextCursor ? (
                <Button size="sm" variant="secondary" onClick={() => void loadIntegrationLogs({ append: true, cursor: logsNextCursor })} disabled={logsLoading}>
                  Load more
                </Button>
              ) : null}
            </div>
          </section>

        </main>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Docs</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Open the private API catalog for full request examples, auth headers, and integration payload references.
            </p>
            <Link href="/docs/api" className="mt-4 inline-flex text-xs font-semibold text-emerald-300 underline underline-offset-4">
              Open private route catalog
            </Link>
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-white">Available API Routes</h2>
            {[
              {
                title: 'Job Upsert',
                body: 'Creates/updates parent jobs and variations. customerExternalId resolves against stored customer external IDs.',
                path: 'POST /api/integrations/jobs/upsert',
              },
              {
                title: 'Customer Upsert',
                body: 'Creates/updates customers and stores externalPartyId for future job assignment.',
                path: 'POST /api/integrations/customers/upsert',
              },
              {
                title: 'Supplier Upsert',
                body: 'Creates/updates suppliers and stores externalPartyId for future stock and purchasing flows.',
                path: 'POST /api/integrations/suppliers/upsert',
              },
            ].map((route) => (
              <div key={route.path} className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Live</p>
                <h3 className="mt-1 text-sm font-semibold text-white">{route.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">{route.body}</p>
                <code className="mt-3 block rounded-lg bg-slate-950 px-3 py-2 text-xs text-emerald-300">{route.path}</code>
              </div>
            ))}
            <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Future</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Materials, stock, customers, HR, and reporting APIs can be added here as separate route cards.
              </p>
            </div>
          </section>
        </aside>
      </div>

      {selectedLog ? (
        <section className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Log Details</p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(selectedLog, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `integration-log-${selectedLog.id}.json`;
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
          <p className="mt-2 text-xs text-slate-400">Idempotency: {selectedLog.idempotencyKey || '-'}</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="text-xs text-slate-400">
              Request
              <textarea value={JSON.stringify(selectedLog.requestBody ?? null, null, 2)} readOnly rows={10} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-emerald-300" />
            </label>
            <label className="text-xs text-slate-400">
              Response
              <textarea value={JSON.stringify(selectedLog.responseBody ?? null, null, 2)} readOnly rows={10} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-emerald-300" />
            </label>
          </div>
        </section>
      ) : null}

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
            <Button variant="ghost" disabled={domainModalSaving} onClick={() => setDomainModal({ open: false, id: null, label: '', text: '' })}>
              Cancel
            </Button>
            <Button onClick={() => void saveDomainModal()} loading={domainModalSaving}>
              Save
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-400">
          Add one hostname per line. When the list is empty, the API key is not restricted by Origin or Referer host.
        </p>
        <textarea
          value={domainModal.text}
          onChange={(e) => setDomainModal((current) => ({ ...current, text: e.target.value }))}
          rows={8}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={'partner.com\napp.partner.com'}
        />
      </Modal>
    </div>
  );
}
