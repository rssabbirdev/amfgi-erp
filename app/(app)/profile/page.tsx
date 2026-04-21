'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/Button';
import { ContextMenu } from '@/components/ui/ContextMenu';
import toast from 'react-hot-toast';
import { convertGoogleDriveUrl } from '@/lib/utils/googleDriveUrl';

function previewSrc(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  const converted = convertGoogleDriveUrl(url.trim());
  return converted || url.trim();
}

function EmptyAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-emerald-500/20 to-sky-500/20 text-3xl font-semibold text-slate-700 dark:text-slate-200">
      {initial}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState<{ x: number; y: number } | null>(null);
  const [signatureMenu, setSignatureMenu] = useState<{ x: number; y: number } | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/profile', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load profile');
      const user = json.data as {
        name: string;
        email: string;
        image: string | null;
        signatureUrl: string | null;
      };
      setName(user.name);
      setImageUrl(user.image);
      setSignatureUrl(user.signatureUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void loadProfile();
  }, [status, loadProfile]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name cannot be empty');
      return;
    }

    setSavingName(true);
    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setName(json.data.name);
      await update({ name: json.data.name });
      toast.success('Name updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingName(false);
    }
  };

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/upload/user-profile-image', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const url = json.data.url as string;
      const driveId = json.data.driveId as string | undefined;
      setImageUrl(url);
      await update(driveId !== undefined ? { image: url, imageDriveId: driveId } : { image: url });
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const onSignatureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingSig(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/upload/user-signature', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      const url = json.data.url as string;
      const driveId = json.data.driveId as string | undefined;
      setSignatureUrl(url);
      await update(
        driveId !== undefined ? { signatureUrl: url, signatureDriveId: driveId } : { signatureUrl: url }
      );
      toast.success('Signature updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingSig(false);
    }
  };

  const avatarPreview = previewSrc(imageUrl);
  const signaturePreview = previewSrc(signatureUrl);
  const sessionName = session?.user?.name ?? name;
  const sessionEmail = session?.user?.email ?? '';
  const avatarMenuOptions = useMemo(
    () => [
      {
        label: uploadingAvatar ? 'Uploading photo...' : 'Update photo',
        action: uploadingAvatar ? undefined : () => avatarInputRef.current?.click(),
        disabled: uploadingAvatar,
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 7h4l2-2h6l2 2h4v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm9 9a4 4 0 100-8 4 4 0 000 8z"
            />
          </svg>
        ),
      },
    ],
    [uploadingAvatar]
  );
  const signatureMenuOptions = useMemo(
    () => [
      {
        label: uploadingSig ? 'Uploading signature...' : 'Upload signature',
        action: uploadingSig ? undefined : () => signatureInputRef.current?.click(),
        disabled: uploadingSig,
        icon: (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
        ),
      },
    ],
    [uploadingSig]
  );

  if (status === 'loading' || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        Loading profile...
      </div>
    );
  }

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
        <div className="bg-linear-to-r from-emerald-500/10 via-transparent to-sky-500/10 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex flex-col items-start gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onAvatarChange}
                  disabled={uploadingAvatar}
                />
                <button
                  type="button"
                  onClick={(event) => setAvatarMenu({ x: event.clientX, y: event.clientY })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setAvatarMenu({ x: event.clientX, y: event.clientY });
                  }}
                  className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-left transition hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-500"
                  aria-label="Open profile photo menu"
                >
                  {avatarPreview ? (
                    <Image src={avatarPreview} alt="" fill className="object-cover" sizes="80px" />
                  ) : (
                    <EmptyAvatar name={sessionName} />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-2 py-1 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-white opacity-0 transition group-hover:opacity-100">
                    Photo menu
                  </div>
                </button>
                {uploadingAvatar && (
                  <div className="rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Uploading photo...
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-300/80">
                  My Profile
                </p>
                <h1 className="mt-1 truncate text-2xl font-semibold text-slate-900 dark:text-white">
                  {sessionName}
                </h1>
                <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">{sessionEmail}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Identity</p>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">Account profile</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Photo</p>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                  {avatarPreview ? 'Configured' : 'Not uploaded'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Signature</p>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                  {signaturePreview ? 'Ready for print' : 'Not uploaded'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Account details</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Keep your display identity up to date across the application.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Session account
            </span>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Current identity</p>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Name</p>
                  <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{sessionName}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Email</p>
                  <p className="mt-1 break-all text-sm text-slate-700 dark:text-slate-300">{sessionEmail}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Display name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">
                  This name is shown in the app and used for account context.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={saveName} loading={savingName} disabled={savingName}>
                  Save name
                </Button>
                <span className="text-xs text-slate-500 dark:text-slate-500">
                  Changes update your current session after save.
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Print assets</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Your signature is stored on Google Drive and can be used in print templates.
          </p>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-500">
            Signature path for templates: <code className="text-slate-700 dark:text-slate-300">user.signatureUrl</code>
          </div>

          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex flex-col gap-4">
                <input
                  ref={signatureInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onSignatureChange}
                  disabled={uploadingSig}
                />
                <div className="flex flex-col gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Signature</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      Best uploaded as transparent PNG | JPEG, PNG, or WebP | up to 3 MB
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => setSignatureMenu({ x: event.clientX, y: event.clientY })}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setSignatureMenu({ x: event.clientX, y: event.clientY });
                  }}
                  className="group relative min-h-[170px] overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(45deg,rgba(148,163,184,0.15)_25%,transparent_25%,transparent_50%,rgba(148,163,184,0.15)_50%,rgba(148,163,184,0.15)_75%,transparent_75%,transparent)] bg-[length:18px_18px] text-left transition hover:border-emerald-400 dark:border-slate-600 dark:hover:border-emerald-500"
                  aria-label="Open signature menu"
                >
                  {signaturePreview ? (
                    <div className="relative h-[170px] w-full">
                      <Image
                        src={signaturePreview}
                        alt="Signature preview"
                        fill
                        className="object-contain p-4"
                        sizes="(max-width: 768px) 100vw, 520px"
                      />
                    </div>
                  ) : (
                    <div className="flex h-[170px] items-center justify-center text-sm text-slate-500 dark:text-slate-500">
                      No signature uploaded yet
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 px-3 py-2 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-white opacity-0 transition group-hover:opacity-100">
                    Signature menu
                  </div>
                </button>
                {uploadingSig && (
                  <div className="w-fit rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Uploading signature...
                  </div>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-500">
                  Click or right-click the signature preview
                </p>
                </div>
            </div>
          </div>
        </section>
      </div>
      {avatarMenu && (
        <ContextMenu
          x={avatarMenu.x}
          y={avatarMenu.y}
          options={avatarMenuOptions}
          onClose={() => setAvatarMenu(null)}
        />
      )}
      {signatureMenu && (
        <ContextMenu
          x={signatureMenu.x}
          y={signatureMenu.y}
          options={signatureMenuOptions}
          onClose={() => setSignatureMenu(null)}
        />
      )}
    </div>
  );
}
