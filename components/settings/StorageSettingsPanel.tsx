'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { useSession } from 'next-auth/react';
import {
  canAccessSettingsStorage,
  type SettingsAccessUser,
} from '@/lib/auth/settingsAccess';

function toSettingsUser(session: ReturnType<typeof useSession>['data']): SettingsAccessUser {
  return {
    isSuperAdmin: session?.user?.isSuperAdmin ?? false,
    permissions: (session?.user?.permissions ?? []) as string[],
  };
}

export function StorageSettingsPanel() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();

  const canAccess = canAccessSettingsStorage(toSettingsUser(session));

  const [driveStatus, setDriveStatus] = useState<{
    connected: boolean;
    connectedAt: string | null;
    connectedEmail: string | null;
    rootFolderId: string | null;
    rootFolderConfigured: boolean;
    rootFolderSource: 'global' | 'env' | 'none';
    oauthClientConfigured: boolean;
  } | null>(null);
  const [driveRootFolderIdDraft, setDriveRootFolderIdDraft] = useState('');
  const [driveStatusLoading, setDriveStatusLoading] = useState(false);
  const [driveSaving, setDriveSaving] = useState(false);
  const [driveDisconnecting, setDriveDisconnecting] = useState(false);
  const [driveFieldUnlocked, setDriveFieldUnlocked] = useState(false);

  const loadDriveStatus = useCallback(async () => {
    setDriveStatusLoading(true);
    try {
      const res = await fetch('/api/settings/google-drive/status', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load Google Drive status');
      setDriveStatus(json.data);
      setDriveRootFolderIdDraft(typeof json.data?.rootFolderId === 'string' ? json.data.rootFolderId : '');
      setDriveFieldUnlocked(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Google Drive status');
      setDriveStatus(null);
    } finally {
      setDriveStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    void loadDriveStatus();
  }, [canAccess, loadDriveStatus]);

  useEffect(() => {
    if (!canAccess) return;
    const driveResult = searchParams.get('driveConnected');
    const driveMessage = searchParams.get('driveMessage');
    if (!driveResult) return;
    if (driveResult === 'connected') {
      toast.success(driveMessage || 'Google Drive connected');
      void loadDriveStatus();
    } else if (driveResult === 'error') {
      toast.error(driveMessage || 'Google Drive connection failed');
    }
  }, [canAccess, searchParams, loadDriveStatus]);

  if (!canAccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Storage</CardTitle>
          <CardDescription>You do not have permission to manage storage settings.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Google Drive (Global)</h2>
            <p className="text-sm text-muted-foreground">
              Shared Drive connection and root folder used by all companies.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void loadDriveStatus()}
              disabled={driveStatusLoading}
            >
              {driveStatusLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                window.location.href = '/api/settings/google-drive/oauth/start';
              }}
            >
              Connect Google Drive
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Connection</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {driveStatusLoading ? 'Checking…' : driveStatus?.connected ? 'Connected' : 'Not connected'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Google account</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{driveStatus?.connectedEmail || '-'}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Root folder</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {driveStatus?.rootFolderConfigured
                ? driveStatus.rootFolderSource === 'global'
                  ? 'Configured (global setting)'
                  : 'Configured (.env fallback)'
                : 'Not configured'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">OAuth client</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {driveStatus?.oauthClientConfigured ? 'Configured' : 'Missing'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground">Global Drive root folder ID</label>
              <p className="text-xs text-muted-foreground">Leave empty to use `.env` fallback.</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDriveFieldUnlocked((prev) => !prev)}
            >
              {driveFieldUnlocked ? 'Lock' : 'Edit'}
            </Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="text"
              value={driveRootFolderIdDraft}
              onChange={(e) => setDriveRootFolderIdDraft(e.target.value)}
              placeholder="e.g. 1AbCdEfGhIjKlMnOpQrStUvWxYz"
              disabled={!driveFieldUnlocked}
              className="font-mono text-xs"
            />
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!driveFieldUnlocked || driveSaving}
                onClick={async () => {
                  try {
                    setDriveSaving(true);
                    const res = await fetch('/api/settings/google-drive/status', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rootFolderId: driveRootFolderIdDraft.trim() }),
                    });
                    const json = await res.json();
                    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save Drive config');
                    toast.success('Global Drive root folder saved');
                    await loadDriveStatus();
                    setDriveFieldUnlocked(false);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to save Drive config');
                  } finally {
                    setDriveSaving(false);
                  }
                }}
              >
                {driveSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!driveFieldUnlocked || driveSaving}
                onClick={() => setDriveRootFolderIdDraft('')}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        {!driveStatus?.oauthClientConfigured ? (
          <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
            OAuth client is not configured. Add Google OAuth environment variables first, then reconnect.
          </div>
        ) : null}

        {driveStatus?.connected ? (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={driveDisconnecting}
              onClick={async () => {
                if (
                  !window.confirm(
                    'Disconnect global Google Drive connection? Existing uploaded files will stay in Drive.',
                  )
                )
                  return;
                try {
                  setDriveDisconnecting(true);
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
              {driveDisconnecting ? 'Disconnecting…' : 'Disconnect Google Drive'}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
