'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSession, signIn } from 'next-auth/react';
import { resolveEmployeePortalPath } from '@/lib/auth/selfService';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { resolveLoginErrorMessage, type LoginErrorMessage } from '@/lib/auth/loginErrors';

type AuthView = 'loading' | 'setup' | 'signin' | 'forgot' | 'reset';
type SignInMode = 'google' | 'credentials';

function LoginErrorBanner({ error, onDismiss }: { error: LoginErrorMessage; onDismiss: () => void }) {
  return (
    <Alert
      variant="destructive"
      className="select-text"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex w-full gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <AlertTitle className="text-destructive">{error.title}</AlertTitle>
          <AlertDescription className="!text-destructive/90">
            {error.description}
          </AlertDescription>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </Alert>
  );
}

/** Build /login URL keeping only safe params (no auth error codes). */
function cleanLoginPath(params: URLSearchParams) {
  const next = new URLSearchParams();
  const callbackUrl = params.get('callbackUrl');
  const reset = params.get('reset');
  if (callbackUrl) next.set('callbackUrl', callbackUrl);
  if (reset) next.set('reset', reset);
  const q = next.toString();
  return q ? `/login?${q}` : '/login';
}

function labelClass() {
  return 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const resetTokenFromUrl = params.get('reset')?.trim() ?? '';

  const [view, setView] = useState<AuthView>('loading');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<LoginErrorMessage | null>(null);
  const consumedUrlError = useRef(false);

  // Sign in
  const [googleSignInEnabled, setGoogleSignInEnabled] = useState(false);
  const [signInMode, setSignInMode] = useState<SignInMode>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Setup
  const [setupName, setSetupName] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');

  // Forgot / reset
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const loadSetupStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/setup-status');
      const json = await res.json();
      const needsSetup = Boolean(json?.data?.needsSetup);
      const googleEnabled = Boolean(json?.data?.googleSignInEnabled);
      setGoogleSignInEnabled(googleEnabled);
      setSignInMode(googleEnabled ? 'google' : 'credentials');
      if (resetTokenFromUrl) {
        setView('reset');
        setResetToken(resetTokenFromUrl);
      } else if (needsSetup) {
        setView('setup');
      } else {
        setView('signin');
      }
    } catch {
      setView('signin');
    }
  }, [resetTokenFromUrl]);

  useEffect(() => {
    void loadSetupStatus();
  }, [loadSetupStatus]);

  /** Read auth error from URL once, then remove it so retries are not stuck with ?error= */
  useEffect(() => {
    if (consumedUrlError.current) return;
    const code = params.get('error');
    if (!code) return;
    consumedUrlError.current = true;
    setAuthError(resolveLoginErrorMessage(code));
    if (
      code === 'GoogleNotRegistered' ||
      code === 'NotRegistered' ||
      code.startsWith('OAuth')
    ) {
      setSignInMode('credentials');
    }
    router.replace(cleanLoginPath(params), { scroll: false });
  }, [params, router]);

  const clearAuthError = () => setAuthError(null);

  const suggestedSlug = useMemo(() => {
    return companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }, [companyName]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setAuthError(resolveLoginErrorMessage('CredentialsSignin'));
    } else {
      await router.refresh();
      const session = await getSession();
      router.push(resolveEmployeePortalPath(callbackUrl, session?.user ?? null));
    }
  };

  const handleGoogle = () => {
    clearAuthError();
    void signIn('google', { callbackUrl });
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassword !== setupPasswordConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (setupPassword.length < 12) {
      toast.error('Password must be at least 12 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setupName,
          email: setupEmail,
          password: setupPassword,
          companyName,
          companySlug: companySlug.trim() || suggestedSlug || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json?.error === 'string' ? json.error : 'Setup failed');
        return;
      }
      toast.success('Administrator account created. Signing you in…');
      const signInResult = await signIn('credentials', {
        email: setupEmail.trim().toLowerCase(),
        password: setupPassword,
        redirect: false,
      });
      if (signInResult?.error) {
        setView('signin');
        setEmail(setupEmail);
        toast.success('Account created. Sign in with your new password.');
        return;
      }
      router.refresh();
      router.push(callbackUrl);
    } catch {
      toast.error('Setup failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json?.error === 'string' ? json.error : 'Request failed');
        return;
      }
      setForgotSent(true);
      toast.success(json?.data?.message ?? 'Check your email for reset instructions.');
    } catch {
      toast.error('Request failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== newPasswordConfirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(typeof json?.error === 'string' ? json.error : 'Reset failed');
        return;
      }
      toast.success('Password updated. Sign in with your new password.');
      setView('signin');
      setEmail('');
      setPassword('');
      clearAuthError();
      router.replace(cleanLoginPath(new URLSearchParams()));
    } catch {
      toast.error('Reset failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'loading') {
    return (
      <AuthShell>
        <Card>
          <CardContent className="flex justify-center py-12">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell className={view === 'setup' ? 'max-w-lg' : undefined}>
      <Card className="border-border/80 bg-card/95 shadow-xl backdrop-blur-sm">
        {view === 'setup' ? (
          <>
            <CardHeader className="space-y-1 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">First-time setup</p>
              <CardTitle className="text-lg">Create your administrator</CardTitle>
              <CardDescription>
                No users exist yet. Set up your company and the first super-admin account to start using AMFGI ERP.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleSetup(e)} className="space-y-5">
                <fieldset className="space-y-3">
                  <legend className={labelClass()}>Administrator</legend>
                  <Input
                    required
                    placeholder="Full name"
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    autoComplete="name"
                  />
                  <Input
                    required
                    type="email"
                    placeholder="Email address"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <PasswordInput
                    required
                    placeholder="Password (min. 12 characters)"
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <PasswordInput
                    required
                    placeholder="Confirm password"
                    value={setupPasswordConfirm}
                    onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </fieldset>
                <fieldset className="space-y-3 border-t border-border pt-4">
                  <legend className={labelClass()}>Company</legend>
                  <Input
                    required
                    placeholder="Company name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                  <Input
                    placeholder={suggestedSlug ? `URL slug (optional) — e.g. ${suggestedSlug}` : 'URL slug (optional)'}
                    value={companySlug}
                    onChange={(e) => setCompanySlug(e.target.value)}
                  />
                </fieldset>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Creating…' : 'Create administrator & company'}
                </Button>
              </form>
            </CardContent>
          </>
        ) : null}

        {view === 'signin' ? (
          <>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Sign in</CardTitle>
              <CardDescription>
                {signInMode === 'google' && googleSignInEnabled
                  ? 'Sign in with your company Google account.'
                  : 'Enter your work email and password.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {authError ? <LoginErrorBanner error={authError} onDismiss={clearAuthError} /> : null}

              {signInMode === 'google' && googleSignInEnabled ? (
                <>
                  <Button type="button" className="w-full" size="lg" onClick={handleGoogle}>
                    <GoogleIcon />
                    <span className="ml-2">Continue with Google</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      clearAuthError();
                      setSignInMode('credentials');
                    }}
                  >
                    Sign in with email and password
                  </Button>
                </>
              ) : (
                <>
              <form onSubmit={(e) => void handleSignIn(e)} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="login-email" className={labelClass()}>
                    Email
                  </label>
                  <Input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="login-password" className={labelClass()}>
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => {
                        clearAuthError();
                        setForgotEmail(email);
                        setForgotSent(false);
                        setView('forgot');
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <PasswordInput
                    id="login-password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>

                  {googleSignInEnabled ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => {
                        clearAuthError();
                        setSignInMode('google');
                      }}
                    >
                      Continue with Google
                    </Button>
                  ) : null}
                </>
              )}
            </CardContent>
          </>
        ) : null}

        {view === 'forgot' ? (
          <>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Reset password</CardTitle>
              <CardDescription>
                {forgotSent
                  ? 'If an account exists for that email, we sent instructions. The link expires in one hour.'
                  : 'Enter your email and we will send a reset link when mail is configured for this server.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!forgotSent ? (
                <form onSubmit={(e) => void handleForgot(e)} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="forgot-email" className={labelClass()}>
                      Email
                    </label>
                    <Input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending…' : 'Send reset link'}
                  </Button>
                </form>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  clearAuthError();
                  setView('signin');
                  setForgotSent(false);
                }}
              >
                Back to sign in
              </Button>
            </CardContent>
          </>
        ) : null}

        {view === 'reset' ? (
          <>
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-lg">Choose a new password</CardTitle>
              <CardDescription>Enter a new password for your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleReset(e)} className="space-y-4">
                {!resetTokenFromUrl ? (
                  <div className="space-y-2">
                    <label htmlFor="reset-token" className={labelClass()}>
                      Reset code
                    </label>
                    <Input
                      id="reset-token"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      placeholder="Paste the code from your email"
                    />
                  </div>
                ) : null}
                <PasswordInput
                  required
                  placeholder="New password (min. 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <PasswordInput
                  required
                  placeholder="Confirm new password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <Button type="submit" className="w-full" size="lg" disabled={loading || !resetToken.trim()}>
                  {loading ? 'Updating…' : 'Update password'}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setView('signin')}>
                  Back to sign in
                </Button>
              </form>
            </CardContent>
          </>
        ) : null}
      </Card>
    </AuthShell>
  );
}
