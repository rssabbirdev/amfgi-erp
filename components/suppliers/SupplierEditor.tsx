'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  emptySupplierPartyFormState,
  supplierPartyFormToApiBody,
  supplierToPartyFormState,
  type PartyContactRow,
  type SupplierPartyFormState,
} from '@/lib/partyFormUi';
import {
  useCreateSupplierMutation,
  useGetSupplierByIdQuery,
  useUpdateSupplierMutation,
} from '@/store/hooks';

type SupplierEditorMode = 'create' | 'edit';

const INPUT_CLASS =
  'mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-600 dark:disabled:bg-slate-900';
const LABEL_CLASS =
  'text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500';

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
      <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/55">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className={LABEL_CLASS}>{label}</span>
      {hint ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
      {children}
    </label>
  );
}

function extractApiErrorMessage(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data?: { error?: unknown } }).data?.error === 'string'
  ) {
    return (error as { data: { error: string } }).data.error;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function SupplierEditor({
  mode,
  supplierId,
}: {
  mode: SupplierEditorMode;
  supplierId?: string;
}) {
  const router = useRouter();
  const isEdit = mode === 'edit';
  const { data: supplier, isFetching } = useGetSupplierByIdQuery(supplierId ?? '', {
    skip: !supplierId,
  });
  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation();
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation();
  const baseForm = useMemo(
    () => (isEdit && supplier ? supplierToPartyFormState(supplier) : emptySupplierPartyFormState()),
    [isEdit, supplier],
  );
  const baseIsActive = isEdit && supplier ? supplier.isActive : true;
  const [formDraft, setFormDraft] = useState<SupplierPartyFormState | null>(null);
  const [isActiveDraft, setIsActiveDraft] = useState<boolean | null>(null);
  const form = formDraft ?? baseForm;
  const isActive = isActiveDraft ?? baseIsActive;

  const saving = isCreating || isUpdating;
  const pageTitle = isEdit ? 'Edit supplier' : 'Create supplier';
  const pageDescription = isEdit
    ? 'Update supplier details in a dedicated page that mirrors the third-party party API field structure.'
    : 'Create a supplier using the same core field model used by the third-party supplier integration.';

  const headerBadges = useMemo(() => {
    if (!supplier || !isEdit) return [];
    return [
      supplier.source === 'PARTY_API_SYNC'
        ? { label: 'Synced from API', variant: 'blue' as const }
        : { label: 'Local record', variant: 'gray' as const },
      isActive
        ? { label: 'Active', variant: 'green' as const }
        : { label: 'Inactive', variant: 'yellow' as const },
    ];
  }, [isActive, isEdit, supplier]);

  const updateContactRow = (index: number, patch: Partial<PartyContactRow>) => {
    setFormDraft((prevDraft) => {
      const prev = prevDraft ?? baseForm;
      const contacts = [...prev.contacts];
      contacts[index] = { ...contacts[index], ...patch, sort_order: index };
      return { ...prev, contacts };
    });
  };

  const addContactRow = () => {
    setFormDraft((prevDraft) => {
      const prev = prevDraft ?? baseForm;
      return {
        ...prev,
        contacts: [
          ...prev.contacts,
          { contact_name: '', email: '', phone: '', sort_order: prev.contacts.length },
        ],
      };
    });
  };

  const removeContactRow = (index: number) => {
    setFormDraft((prevDraft) => {
      const prev = prevDraft ?? baseForm;
      return {
        ...prev,
        contacts: prev.contacts
          .filter((_, rowIndex) => rowIndex !== index)
          .map((row, rowIndex) => ({ ...row, sort_order: rowIndex })),
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { ...supplierPartyFormToApiBody(form), isActive };

    try {
      if (isEdit && supplierId) {
        await updateSupplier({ id: supplierId, data: payload }).unwrap();
        toast.success('Supplier updated');
      } else {
        await createSupplier(payload).unwrap();
        toast.success('Supplier created');
      }
      router.push('/suppliers');
      router.refresh();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, isEdit ? 'Failed to update supplier' : 'Failed to create supplier'));
    }
  };

  if (isEdit && isFetching && !supplier) {
    return (
      <div className="space-y-6">
        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
          <div className="h-3 w-32 rounded-full bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 h-10 w-64 rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="mt-3 h-4 w-full max-w-3xl rounded-full bg-slate-200 dark:bg-slate-800" />
        </section>
      </div>
    );
  }

  if (isEdit && !isFetching && !supplier) {
    return (
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Suppliers</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Supplier not found</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          The supplier may have been removed or is not available for the active company.
        </p>
        <Link
          href="/suppliers"
          className="mt-5 inline-flex rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
        >
          Back to suppliers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
        <div className="grid gap-px lg:grid-cols-[minmax(0,1.25fr)_22rem] dark:bg-slate-800/80">
          <div className="bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),linear-gradient(135deg,#ffffff,#f0fdf4)] px-6 py-6 dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_32%),linear-gradient(135deg,#020617,#0f172a)] sm:px-8">
            <Link
              href="/suppliers"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              Suppliers
            </Link>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {pageTitle}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
              {pageDescription}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {headerBadges.map((badge) => (
                <Badge key={badge.label} label={badge.label} variant={badge.variant} />
              ))}
            </div>
          </div>

          <aside className="space-y-4 bg-slate-50/80 px-6 py-6 dark:bg-slate-900/70 sm:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Field model</p>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                The form keeps the third-party naming for compliance fields, while `city` and `address` remain AMFGI-side fields.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/80">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Integration metadata</p>
              <dl className="mt-3 space-y-3">
                <div>
                  <dt className="text-xs text-slate-500">source</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                    {supplier?.source ?? 'LOCAL'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">externalPartyId</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                    {supplier?.externalPartyId ?? 'Not linked'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">externalSyncedAt</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                    {supplier?.externalSyncedAt ? new Date(supplier.externalSyncedAt).toLocaleString() : 'Never'}
                  </dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Section
            eyebrow="Identity"
            title="Basic supplier details"
            description="Core supplier information used in the ERP and in integration matching."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="name" hint="Required supplier name">
                <input
                  required
                  value={form.name}
                  onChange={(event) => setFormDraft((prev) => ({ ...(prev ?? baseForm), name: event.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="e.g. ABC Supplies Ltd"
                />
              </Field>
              <Field label="email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setFormDraft((prev) => ({ ...(prev ?? baseForm), email: event.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="supplier@example.com"
                />
              </Field>
              <Field label="city" hint="AMFGI field">
                <input
                  value={form.city}
                  onChange={(event) => setFormDraft((prev) => ({ ...(prev ?? baseForm), city: event.target.value }))}
                  className={INPUT_CLASS}
                  placeholder="Dubai"
                />
              </Field>
            </div>
            <Field label="address" hint="AMFGI field">
              <textarea
                value={form.address}
                onChange={(event) => setFormDraft((prev) => ({ ...(prev ?? baseForm), address: event.target.value }))}
                rows={3}
                className={`${INPUT_CLASS} resize-none`}
                placeholder="Industrial Area 4, Sharjah"
              />
            </Field>
          </Section>

          <Section
            eyebrow="Compliance"
            title="Third-party API field set"
            description="These fields keep the third-party supplier naming so the ERP and external sync stay aligned."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="trade_license_number">
                <input
                  value={form.trade_license_number}
                  onChange={(event) =>
                    setFormDraft((prev) => ({ ...(prev ?? baseForm), trade_license_number: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="trade_license_authority">
                <input
                  value={form.trade_license_authority}
                  onChange={(event) =>
                    setFormDraft((prev) => ({ ...(prev ?? baseForm), trade_license_authority: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="trade_license_expiry">
                <input
                  type="date"
                  value={form.trade_license_expiry}
                  onChange={(event) =>
                    setFormDraft((prev) => ({ ...(prev ?? baseForm), trade_license_expiry: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="trn_number">
                <input
                  value={form.trn_number}
                  onChange={(event) =>
                    setFormDraft((prev) => ({ ...(prev ?? baseForm), trn_number: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="trn_expiry">
                <input
                  type="date"
                  value={form.trn_expiry}
                  onChange={(event) =>
                    setFormDraft((prev) => ({ ...(prev ?? baseForm), trn_expiry: event.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="isActive" hint="Allows local deactivation without deleting the record">
                <select
                  value={isActive ? 'true' : 'false'}
                  onChange={(event) => setIsActiveDraft(event.target.value === 'true')}
                  className={INPUT_CLASS}
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section
            eyebrow="Contacts"
            title="Structured contact rows"
            description="These rows map to the third-party `contacts[]` payload and preserve sort order."
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Save one or more contacts. Empty rows are ignored on submit.
              </p>
              <button
                type="button"
                onClick={addContactRow}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:border-emerald-400 dark:hover:bg-emerald-500/15"
              >
                Add contact
              </button>
            </div>

            <div className="space-y-3">
              {form.contacts.map((row, index) => (
                <div
                  key={`${index}-${row.id ?? 'new'}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/70"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Contact row {index + 1}
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">sort_order {index}</p>
                    </div>
                    {form.contacts.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeContactRow(index)}
                        className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Field label="contact_name">
                      <input
                        value={row.contact_name}
                        onChange={(event) => updateContactRow(index, { contact_name: event.target.value })}
                        className={INPUT_CLASS}
                      />
                    </Field>
                    <Field label="email">
                      <input
                        type="email"
                        value={row.email}
                        onChange={(event) => updateContactRow(index, { email: event.target.value })}
                        className={INPUT_CLASS}
                      />
                    </Field>
                    <Field label="phone">
                      <input
                        value={row.phone}
                        onChange={(event) => updateContactRow(index, { phone: event.target.value })}
                        className={INPUT_CLASS}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Section
            eyebrow="Actions"
            title="Save supplier"
            description="Review the data shape, then save and return to the supplier list."
          >
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Supplier name</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {form.name.trim() || 'Untitled supplier'}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Contact rows</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {
                    form.contacts.filter(
                      (row) =>
                        row.contact_name.trim() ||
                        row.email.trim() ||
                        row.phone.trim(),
                    ).length
                  }{' '}
                  saved rows
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Button type="submit" loading={saving} fullWidth>
                {isEdit ? 'Update Supplier' : 'Create Supplier'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onClick={() => router.push('/suppliers')}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </Section>
        </aside>
      </form>
    </div>
  );
}
