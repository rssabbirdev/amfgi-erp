'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { canAccessSettingsEmail } from '@/lib/auth/settingsAccess';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { cn } from '@/lib/utils';

const SECRET_UNCHANGED = '__UNCHANGED__';

type MaskedSecret = { configured: boolean; last4: string | null };

type EmailSettingsView = {
  provider: 'env' | 'resend' | 'smtp' | 'webhook';
  envConfigured?: boolean;
  resend?: { from: string; apiKey: MaskedSecret };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    password: MaskedSecret;
  };
  webhook?: {
    url: string;
    bearerToken: MaskedSecret;
    headers: Record<string, string>;
  };
};

const textareaClass = cn(
  'mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground font-mono',
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

export default function SettingsEmailPage() {
  const { data: session } = useSession();
  const perms = (session?.user?.permissions ?? []) as string[];
  const canManage = canAccessSettingsEmail({
    isSuperAdmin: Boolean(session?.user?.isSuperAdmin),
    permissions: perms,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [mailReady, setMailReady] = useState(false);

  const [provider, setProvider] = useState<EmailSettingsView['provider']>('env');
  const [resendFrom, setResendFrom] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');
  const [resendKeyConfigured, setResendKeyConfigured] = useState(false);

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpPassConfigured, setSmtpPassConfigured] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState('');

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookToken, setWebhookToken] = useState('');
  const [webhookTokenConfigured, setWebhookTokenConfigured] = useState(false);
  const [webhookHeaders, setWebhookHeaders] = useState('{}');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/email', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load email settings');
      const s = json.data.settings as EmailSettingsView;
      setMailReady(Boolean(json.data.mailReady));
      setProvider(s.provider);
      setResendFrom(s.resend?.from ?? '');
      setResendKeyConfigured(Boolean(s.resend?.apiKey?.configured));
      setResendApiKey('');
      setSmtpHost(s.smtp?.host ?? '');
      setSmtpPort(String(s.smtp?.port ?? 587));
      setSmtpSecure(Boolean(s.smtp?.secure));
      setSmtpUser(s.smtp?.user ?? '');
      setSmtpFrom(s.smtp?.from ?? '');
      setSmtpPassConfigured(Boolean(s.smtp?.password?.configured));
      setSmtpPass('');
      setWebhookUrl(s.webhook?.url ?? '');
      setWebhookTokenConfigured(Boolean(s.webhook?.bearerToken?.configured));
      setWebhookToken('');
      setWebhookHeaders(JSON.stringify(s.webhook?.headers ?? {}, null, 2));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void load();
  }, [canManage, load]);

  const buildPayload = () => {
    if (provider === 'env') {
      return { provider: 'env' };
    }
    if (provider === 'resend') {
      return {
        provider: 'resend',
        resend: {
          from: resendFrom,
          apiKey: resendApiKey.trim() || (resendKeyConfigured ? SECRET_UNCHANGED : ''),
        },
      };
    }
    if (provider === 'smtp') {
      return {
        provider: 'smtp',
        smtp: {
          host: smtpHost,
          port: Number(smtpPort) || 587,
          secure: smtpSecure,
          user: smtpUser || undefined,
          from: smtpFrom,
          password: smtpPass.trim() || (smtpPassConfigured ? SECRET_UNCHANGED : ''),
        },
      };
    }
    let headers: Record<string, string> = {};
    try {
      const parsed = JSON.parse(webhookHeaders) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        headers = Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>;
      }
    } catch {
      throw new Error('Webhook headers must be valid JSON');
    }
    return {
      provider: 'webhook',
      webhook: {
        url: webhookUrl,
        bearerToken: webhookToken.trim() || (webhookTokenConfigured ? SECRET_UNCHANGED : undefined),
        headers,
      },
    };
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = await fetch('/api/settings/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setMailReady(Boolean(json.data.mailReady));
      toast.success('Email settings saved');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/settings/email/test', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Test failed');
      toast.success(json.data?.message ?? 'Test sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>You do not have permission to manage email settings.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-1 border-b border-border pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Email delivery</h1>
          <p className="text-sm text-muted-foreground">
            Configure how the system sends password reset and other transactional email.
          </p>
        </div>
      </header>

      {mailReady ? (
        <Alert>
          <AlertDescription>Email provider is configured and ready to send.</AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>
            Email is not fully configured. Password reset requests will not send mail until a provider is set up (or
            use environment variables with the &quot;Environment (.env)&quot; provider).
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider</CardTitle>
            <CardDescription>
              Choose Resend, SMTP, a custom HTTPS webhook, or fall back to <code className="text-xs">RESEND_API_KEY</code>{' '}
              and <code className="text-xs">MAIL_FROM</code> in the server environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email-provider" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Provider
              </label>
              <Select
                id="email-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as EmailSettingsView['provider'])}
              >
                <option value="env">Environment (.env)</option>
                <option value="resend">Resend</option>
                <option value="smtp">SMTP</option>
                <option value="webhook">Custom webhook</option>
              </Select>
            </div>

            {provider === 'env' ? (
              <p className="text-sm text-muted-foreground">
                Uses <strong className="text-foreground">RESEND_API_KEY</strong> and{' '}
                <strong className="text-foreground">MAIL_FROM</strong> from the server environment. No secrets are stored
                in the database.
              </p>
            ) : null}

            {provider === 'resend' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From address</label>
                  <Input value={resendFrom} onChange={(e) => setResendFrom(e.target.value)} placeholder="AMFGI <noreply@yourdomain.com>" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">API key</label>
                  <Input
                    type="password"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder={resendKeyConfigured ? 'Leave blank to keep existing key' : 're_…'}
                    autoComplete="off"
                  />
                  {resendKeyConfigured ? (
                    <p className="text-xs text-muted-foreground">A key is already saved. Leave empty to keep it.</p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {provider === 'smtp' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Host</label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Port</label>
                  <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} type="number" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
                    Use TLS (secure)
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Username</label>
                  <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Password</label>
                  <Input
                    type="password"
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={smtpPassConfigured ? 'Leave blank to keep' : ''}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From address</label>
                  <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
                </div>
              </div>
            ) : null}

            {provider === 'webhook' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Webhook URL</label>
                  <Input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://…" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Bearer token (optional)</label>
                  <Input
                    type="password"
                    value={webhookToken}
                    onChange={(e) => setWebhookToken(e.target.value)}
                    placeholder={webhookTokenConfigured ? 'Leave blank to keep' : ''}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Extra headers (JSON)</label>
                  <textarea
                    className={textareaClass}
                    rows={4}
                    value={webhookHeaders}
                    onChange={(e) => setWebhookHeaders(e.target.value)}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    POST body: <code className="rounded bg-muted px-1">{`{ "to", "subject", "html", "text" }`}</code>
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              <Button type="button" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void sendTest()} disabled={testing}>
                {testing ? 'Sending…' : 'Send test to my email'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
