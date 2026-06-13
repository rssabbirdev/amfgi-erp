'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/shadcn/badge';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import Modal from '@/components/ui/Modal';
import { canAccessSettingsApi } from '@/lib/auth/settingsAccess';
import { cn } from '@/lib/utils';

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

function RevokedBadge() {
  return (
    <Badge
      variant="outline"
      className="text-[10px] font-semibold uppercase tracking-wide border-destructive/40 bg-destructive/10 text-destructive"
    >
      Revoked
    </Badge>
  );
}

function SummaryStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

const textareaClass = cn(
  'mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground',
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

export default function SettingsApiPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = canAccessSettingsApi({
    isSuperAdmin: Boolean(session?.user?.isSuperAdmin),
    permissions: perms,
  });

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
    [logFilterFrom, logFilterStatus, logFilterTo],
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

  const closeDomainModal = () => {
    if (domainModalSaving) return;
    setDomainModal({ open: false, id: null, label: '', text: '' });
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
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>API Center</CardTitle>
            <CardDescription>You do not have permission to manage API credentials.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selectedLog = selectedLogId ? integrationLogs.find((log) => log.id === selectedLogId) : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-4 border-b border-border pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">API Center</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Manage external API credentials, allowed domains, and sync logs from one place. Job, customer, and supplier
            upserts are live now; future application APIs can be added as separate route cards.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-border shadow-sm">
          <div className="grid divide-y divide-border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              {
                label: 'Credentials',
                value: String(apiCredentials.filter((cred) => !cred.revokedAt).length),
                note: 'active keys',
              },
              { label: 'Available routes', value: '3', note: 'job + party upserts' },
              {
                label: 'Logs',
                value: String(integrationLogs.length),
                note: logsNextCursor ? 'more available' : 'loaded',
              },
            ].map((item) => (
              <SummaryStat key={item.label} label={item.label} value={item.value} note={item.note} />
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <main className="flex flex-col gap-5">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">API credentials</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Keys apply only to <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/api/integrations/*</code>.
              Normal ERP routes still require a signed-in user session.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <label htmlFor="api-cred-label" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Label
                </label>
                <Input
                  id="api-cred-label"
                  value={apiLabel}
                  onChange={(e) => setApiLabel(e.target.value)}
                  placeholder="Credential label (e.g. PM production)"
                />
              </div>
              <Button type="button" className="shrink-0" onClick={() => void handleCreateApiCredential()}>
                Generate key
              </Button>
            </div>
            <label className="mt-4 block text-sm font-medium text-foreground">
              Allowed domains (optional)
              <textarea
                value={apiAllowedDomainsCreate}
                onChange={(e) => setApiAllowedDomainsCreate(e.target.value)}
                rows={3}
                placeholder={'One hostname per line or comma-separated, e.g.\npartner.com\napp.partner.com'}
                className={cn(textareaClass, 'font-mono text-xs')}
              />
            </label>
            {newApiKey ? (
              <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Copy now: this key will not be shown again.</p>
                <code className="mt-2 block break-all text-sm text-foreground">{newApiKey}</code>
                <Button type="button" className="mt-3" size="sm" variant="secondary" onClick={() => void copyNewApiKey()}>
                  Copy API key
                </Button>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Existing credentials</h2>
            <div className="mt-4 space-y-3">
              {apiLoading ? (
                <p className="text-sm text-muted-foreground">Loading credentials…</p>
              ) : apiCredentials.length === 0 ? (
                <p className="text-sm text-muted-foreground">No API credentials created yet.</p>
              ) : (
                apiCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{cred.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Prefix: <code className="font-mono">{cred.keyPrefix}</code> | Last used:{' '}
                        {cred.lastUsedAt ? new Date(cred.lastUsedAt).toLocaleString() : 'Never'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Domains:{' '}
                        {cred.allowedDomains && cred.allowedDomains.length > 0
                          ? cred.allowedDomains.join(', ')
                          : 'any (no allowlist)'}
                      </p>
                    </div>
                    {cred.revokedAt ? (
                      <RevokedBadge />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => openDomainModal(cred)}>
                          Domains
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleRevokeApiCredential(cred.id)}
                        >
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent logs</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review inbound integration activity directly under the credential list.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void loadIntegrationLogs()}
                disabled={logsLoading}
              >
                {logsLoading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <Select value={logFilterStatus} onChange={(e) => setLogFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="success">success</option>
                <option value="error">error</option>
                <option value="validation_error">validation_error</option>
                <option value="forbidden">forbidden</option>
                <option value="retry_success">retry_success</option>
                <option value="retry_error">retry_error</option>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="md:justify-self-end"
                onClick={() => void loadIntegrationLogs()}
                disabled={logsLoading}
              >
                Apply filters
              </Button>
              <Input type="datetime-local" value={logFilterFrom} onChange={(e) => setLogFilterFrom(e.target.value)} />
              <Input type="datetime-local" value={logFilterTo} onChange={(e) => setLogFilterTo(e.target.value)} />
            </div>
            <div className="mt-4 space-y-3">
              {logsLoading ? (
                <p className="text-sm text-muted-foreground">Loading logs…</p>
              ) : integrationLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No integration logs yet.</p>
              ) : (
                integrationLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()} | {log.status.toUpperCase()} | HTTP{' '}
                      {log.httpStatus ?? '-'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{log.entityKey || '-'}</p>
                    {log.errorMessage ? (
                      <p className="mt-1 break-all text-xs text-destructive">{log.errorMessage}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedLogId(log.id)}>
                        Details
                      </Button>
                      {log.status !== 'success' && log.status !== 'retry_success' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void retryIntegrationLog(log.id)}
                          disabled={retryingLogId === log.id}
                        >
                          {retryingLogId === log.id ? 'Retrying…' : 'Retry'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
              {logsNextCursor ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void loadIntegrationLogs({ append: true, cursor: logsNextCursor })}
                  disabled={logsLoading}
                >
                  Load more
                </Button>
              ) : null}
            </div>
          </section>
        </main>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-lg border border-primary/25 bg-primary/5 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">Docs</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Open the private API catalog for full request examples, auth headers, and integration payload references.
            </p>
            <Link href="/docs/api" className="mt-4 inline-flex text-xs font-semibold text-primary underline-offset-4 hover:underline">
              Open private route catalog
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Available API routes</h2>
            {[
              {
                title: 'Job upsert',
                body: 'Creates/updates parent jobs and variations. customerExternalId resolves against stored customer external IDs.',
                path: 'POST /api/integrations/jobs/upsert',
              },
              {
                title: 'Customer upsert',
                body: 'Creates/updates customers and stores externalPartyId for future job assignment.',
                path: 'POST /api/integrations/customers/upsert',
              },
              {
                title: 'Supplier upsert',
                body: 'Creates/updates suppliers and stores externalPartyId for future stock and purchasing flows.',
                path: 'POST /api/integrations/suppliers/upsert',
              },
            ].map((route) => (
              <div key={route.path} className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">Live</p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">{route.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{route.body}</p>
                <code className="mt-3 block rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-foreground">
                  {route.path}
                </code>
              </div>
            ))}
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Future</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Materials, stock, customers, HR, and reporting APIs can be added here as separate route cards.
              </p>
            </div>
          </section>
        </aside>
      </div>

      {selectedLog ? (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">Log details</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
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
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedLogId(null)}>
                Close
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Idempotency: {selectedLog.idempotencyKey || '-'}</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Request
              <textarea
                readOnly
                rows={10}
                value={JSON.stringify(selectedLog.requestBody ?? null, null, 2)}
                className={cn(textareaClass, 'font-mono text-xs')}
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Response
              <textarea
                readOnly
                rows={10}
                value={JSON.stringify(selectedLog.responseBody ?? null, null, 2)}
                className={cn(textareaClass, 'font-mono text-xs')}
              />
            </label>
          </div>
        </section>
      ) : null}

      <Modal
        isOpen={domainModal.open}
        onClose={closeDomainModal}
        title={domainModal.label ? `Allowed domains — ${domainModal.label}` : 'Allowed domains'}
        size="lg"
        actions={
          <>
            <Button type="button" variant="ghost" size="sm" disabled={domainModalSaving} onClick={closeDomainModal}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={domainModalSaving} onClick={() => void saveDomainModal()}>
              {domainModalSaving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          Add one hostname per line. When the list is empty, the API key is not restricted by Origin or Referer host.
        </p>
        <textarea
          value={domainModal.text}
          onChange={(e) => setDomainModal((current) => ({ ...current, text: e.target.value }))}
          rows={8}
          className={cn(textareaClass, 'mt-0 font-mono text-sm')}
          placeholder={'partner.com\napp.partner.com'}
        />
      </Modal>
    </div>
  );
}
