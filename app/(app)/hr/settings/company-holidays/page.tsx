'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/shadcn/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import Modal from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { formatHolidayCriteriaSummary } from '@/lib/hr/payroll/holidayEmployeeEligibility';
import type { HolidayPayTypeLink } from '@/lib/hr/payroll/holidayPayTypeLinks';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  type WorkforceEmployeeType,
  type WorkforceVisaHolding,
} from '@/lib/hr/workforceProfile';
import { readApiJson } from '@/lib/utils/readApiResponse';

interface PayTypeOption {
  id: string;
  name: string;
  code: string;
  mode?: string;
}

function defaultHolidayWorkedOtForMode(mode?: string): boolean {
  return mode !== 'MONTHLY_CALENDAR_DEDUCT' && mode !== 'MONTHLY_FIXED';
}

interface Row {
  id: string;
  holidayDate: string;
  name: string;
  isPaid: boolean;
  payTypeIds: string[];
  payTypes?: PayTypeOption[];
  payTypeLinks?: HolidayPayTypeLink[];
  employmentTypes: string[];
  workforceRoleTypes: WorkforceEmployeeType[];
  visaHoldings: WorkforceVisaHolding[];
  notes: string | null;
}

type PayTypeLinkForm = {
  selected: boolean;
  payWorkedHoursAtOt: boolean;
  holidayOtPercent: string;
};

type HolidayFormState = {
  holidayDate: string;
  name: string;
  isPaid: boolean;
  notes: string;
  employmentTypes: string[];
  workforceRoleTypes: WorkforceEmployeeType[];
  visaHoldings: WorkforceVisaHolding[];
  payTypeLinks: Record<string, PayTypeLinkForm>;
};

const labelClass = 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground';
const sectionClass = 'rounded-lg border border-border bg-muted/20 p-4 space-y-3';

function formatHolidayDate(value: string): string {
  const ymd = value.slice(0, 10);
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function buildPayTypeLinkForm(
  allPayTypes: PayTypeOption[],
  row?: Row
): Record<string, PayTypeLinkForm> {
  const map: Record<string, PayTypeLinkForm> = {};
  for (const payType of allPayTypes) {
    const link = row?.payTypeLinks?.find((item) => item.payTypeId === payType.id);
    const selected = row
      ? Boolean(link) || (row.payTypeIds?.includes(payType.id) ?? false)
      : false;
    map[payType.id] = {
      selected,
      payWorkedHoursAtOt:
        link != null
          ? link.payWorkedHoursAtOt
          : selected
            ? defaultHolidayWorkedOtForMode(payType.mode)
            : false,
      holidayOtPercent:
        link?.holidayOtPercent != null && link.holidayOtPercent > 0
          ? String(link.holidayOtPercent)
          : '',
    };
  }
  return map;
}

function buildFormState(allPayTypes: PayTypeOption[], row?: Row): HolidayFormState {
  return {
    holidayDate: row?.holidayDate ?? '',
    name: row?.name ?? '',
    isPaid: row?.isPaid ?? true,
    notes: row?.notes ?? '',
    employmentTypes: row?.employmentTypes ?? [],
    workforceRoleTypes: row?.workforceRoleTypes ?? [],
    visaHoldings: row?.visaHoldings ?? [],
    payTypeLinks: buildPayTypeLinkForm(allPayTypes, row),
  };
}

function formStateToBody(form: HolidayFormState) {
  const payTypes = Object.entries(form.payTypeLinks)
    .filter(([, link]) => link.selected)
    .map(([payTypeId, link]) => {
      const raw = link.holidayOtPercent.trim();
      const parsed = raw ? Number(raw) : null;
      return {
        payTypeId,
        payWorkedHoursAtOt: link.payWorkedHoursAtOt,
        holidayOtPercent:
          parsed != null && Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null,
      };
    });

  return {
    holidayDate: form.holidayDate,
    name: form.name.trim(),
    isPaid: form.isPaid,
    payTypes,
    employmentTypes: form.employmentTypes,
    workforceRoleTypes: form.workforceRoleTypes,
    visaHoldings: form.visaHoldings,
    notes: form.notes.trim() || null,
  };
}

function formatPayTypesSummary(row: Row): string {
  if (!row.payTypes?.length && row.payTypeIds.length === 0) return 'Employee default';
  const payTypes = row.payTypes ?? [];
  if (payTypes.length === 0) return `${row.payTypeIds.length} structure(s)`;

  return payTypes
    .map((payType) => {
      const link = row.payTypeLinks?.find((item) => item.payTypeId === payType.id);
      if (!link) return payType.name;
      const otParts: string[] = [];
      if (!link.payWorkedHoursAtOt) otParts.push('no OT');
      else if (link.holidayOtPercent != null) otParts.push(`${link.holidayOtPercent}% OT`);
      else otParts.push('structure OT');
      return otParts.length ? `${payType.name} (${otParts.join(', ')})` : payType.name;
    })
    .join('; ');
}

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function HolidayFormModal({
  title,
  initial,
  payTypes,
  employmentTypes,
  saving,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: HolidayFormState;
  payTypes: PayTypeOption[];
  employmentTypes: string[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: HolidayFormState) => void;
}) {
  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const selectedCount = useMemo(
    () => Object.values(form.payTypeLinks).filter((link) => link.selected).length,
    [form.payTypeLinks]
  );

  const checkboxGroup = (
    label: string,
    values: string[],
    options: Array<{ value: string; label: string }>,
    onChange: (next: string[]) => void,
    hint?: string
  ) => (
    <div className="space-y-2">
      <label className={labelClass}>{label}</label>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No options available.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const checked = values.includes(option.value);
            return (
              <label
                key={option.value}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                  checked ? 'border-primary/50 bg-primary/5' : 'border-border'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(toggleInList(values, option.value))}
                  className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      )}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <Modal isOpen onClose={() => !saving && onClose()} title={title} size="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
        className="space-y-5"
      >
        <section className={sectionClass}>
          <h3 className="text-sm font-semibold text-foreground">Holiday details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className={labelClass}>Date</label>
              <Input
                type="date"
                required
                value={form.holidayDate}
                onChange={(e) => setForm((prev) => ({ ...prev, holidayDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Name</label>
              <Input
                required
                value={form.name}
                placeholder="e.g. Eid Al Fitr"
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isPaid}
              onChange={(e) => setForm((prev) => ({ ...prev, isPaid: e.target.checked }))}
              className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <span className="text-sm text-foreground">Paid holiday</span>
          </label>
          <div className="space-y-2">
            <label className={labelClass}>Notes</label>
            <Input
              value={form.notes}
              placeholder="Optional"
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Salary structure rules</h3>
            <span className="text-xs text-muted-foreground">
              {selectedCount === 0
                ? 'No overrides — employees use their default structure'
                : `${selectedCount} structure(s) selected`}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Select which salary structures receive this holiday&apos;s pay rules. For each selected
            structure, choose whether worked hours earn OT on top of holiday pay and set an optional
            holiday OT percentage.
          </p>
          {payTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No salary structures available.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">Include</th>
                    <th className="px-3 py-2.5">Structure</th>
                    <th className="px-3 py-2.5">Pay worked hours at OT</th>
                    <th className="px-3 py-2.5">Holiday OT %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payTypes.map((payType) => {
                    const link = form.payTypeLinks[payType.id];
                    if (!link) return null;
                    return (
                      <tr key={payType.id} className={cn(!link.selected && 'opacity-60')}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={link.selected}
                            onChange={(e) => {
                              const nowSelected = e.target.checked;
                              setForm((prev) => ({
                                ...prev,
                                payTypeLinks: {
                                  ...prev.payTypeLinks,
                                  [payType.id]: {
                                    ...link,
                                    selected: nowSelected,
                                    payWorkedHoursAtOt: nowSelected
                                      ? !link.selected
                                        ? defaultHolidayWorkedOtForMode(payType.mode)
                                        : link.payWorkedHoursAtOt
                                      : false,
                                  },
                                },
                              }));
                            }}
                            className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-foreground">{payType.name}</div>
                          <div className="text-xs text-muted-foreground">{payType.code}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={link.payWorkedHoursAtOt}
                              disabled={!link.selected || !form.isPaid}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  payTypeLinks: {
                                    ...prev.payTypeLinks,
                                    [payType.id]: { ...link, payWorkedHoursAtOt: e.target.checked },
                                  },
                                }))
                              }
                              className="size-4 rounded border border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
                            />
                            <span className="text-xs text-muted-foreground">
                              {link.payWorkedHoursAtOt ? 'Enabled' : 'Disabled'}
                            </span>
                          </label>
                        </td>
                        <td className="px-3 py-2.5">
                          <Input
                            type="number"
                            min={1}
                            max={500}
                            placeholder="Structure default"
                            value={link.holidayOtPercent}
                            disabled={!link.selected || !form.isPaid || !link.payWorkedHoursAtOt}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                payTypeLinks: {
                                  ...prev.payTypeLinks,
                                  [payType.id]: { ...link, holidayOtPercent: e.target.value },
                                },
                              }))
                            }
                            className="h-8 max-w-[140px] text-sm"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={sectionClass}>
          <h3 className="text-sm font-semibold text-foreground">Who receives this holiday</h3>
          <p className="text-xs text-muted-foreground">
            Leave all groups empty to include every employee. Payroll filters by employment type,
            workforce role, and visa holding.
          </p>
          {checkboxGroup(
            'Employment type',
            form.employmentTypes,
            employmentTypes.map((name) => ({ value: name, label: name })),
            (employmentTypes) => setForm((prev) => ({ ...prev, employmentTypes })),
            'Optional. Empty = all employment types.'
          )}
          {checkboxGroup(
            'Workforce role type',
            form.workforceRoleTypes,
            WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            })),
            (workforceRoleTypes) =>
              setForm((prev) => ({
                ...prev,
                workforceRoleTypes: workforceRoleTypes as WorkforceEmployeeType[],
              })),
            'Optional. Empty = all workforce role types.'
          )}
          {checkboxGroup(
            'Visa holding',
            form.visaHoldings,
            WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            })),
            (visaHoldings) =>
              setForm((prev) => ({
                ...prev,
                visaHoldings: visaHoldings as WorkforceVisaHolding[],
              })),
            'Optional. Empty = all visa holdings.'
          )}
        </section>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function HrCompanyHolidaysPage() {
  const { data: session } = useSession();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [payTypes, setPayTypes] = useState<PayTypeOption[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canView = isSA || perms.includes('hr.payroll.settings');
  const canEdit = canView;

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/hr/company-holidays?year=${year}`, { cache: 'no-store' });
      const json = await readApiJson<Row[]>(res);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Failed to load holidays');
        setList([]);
      } else {
        setList(
          (json.data ?? []).map((row) => ({
            ...row,
            holidayDate: String(row.holidayDate).slice(0, 10),
            payTypeIds: row.payTypeIds ?? row.payTypes?.map((payType) => payType.id) ?? [],
            payTypes: row.payTypes ?? [],
            payTypeLinks: row.payTypeLinks ?? [],
            employmentTypes: row.employmentTypes ?? [],
            workforceRoleTypes: row.workforceRoleTypes ?? [],
            visaHoldings: row.visaHoldings ?? [],
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [canView, year]);

  useEffect(() => {
    if (!canView) return;
    void fetch('/api/hr/pay-types', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          // Hide deprecated fixed monthly pay types from the holiday modal.
          const filtered = json.data.filter((row: { config?: { mode?: string } }) => row?.config?.mode !== 'MONTHLY_FIXED');
          setPayTypes(
            filtered.map((row: PayTypeOption & { config?: { mode?: string } }) => ({
              id: row.id,
              name: row.name,
              code: row.code,
              mode: row.config?.mode,
            }))
          );
        }
      })
      .catch(() => setPayTypes([]));

    void fetch('/api/hr/employee-meta-options?kind=EMPLOYMENT_TYPE&activeOnly=1', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setEmploymentTypes(
            json.data
              .map((row: { name?: string }) => String(row.name ?? '').trim())
              .filter(Boolean)
          );
        }
      })
      .catch(() => setEmploymentTypes([]));
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const createForm = useMemo(
    () => buildFormState(payTypes),
    [payTypes, showCreate]
  );

  const editForm = useMemo(
    () => (editing ? buildFormState(payTypes, editing) : null),
    [payTypes, editing]
  );

  const onCreate = async (form: HolidayFormState) => {
    if (!canEdit || saving) return;
    setSaving(true);
    const res = await fetch('/api/hr/company-holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formStateToBody(form)),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Create failed');
    else {
      toast.success('Holiday created');
      setShowCreate(false);
      await load();
    }
    setSaving(false);
  };

  const onSave = async (form: HolidayFormState) => {
    if (!canEdit || !editing || saving) return;
    setSaving(true);
    const res = await fetch(`/api/hr/company-holidays/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formStateToBody(form)),
    });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Update failed');
    else {
      toast.success('Holiday saved');
      setEditing(null);
      await load();
    }
    setSaving(false);
  };

  const onDelete = async (id: string) => {
    if (!canEdit || saving || !window.confirm('Delete this holiday?')) return;
    setSaving(true);
    const res = await fetch(`/api/hr/company-holidays/${id}`, { method: 'DELETE' });
    const json = await readApiJson(res);
    if (!res.ok || !json?.success) toast.error(json?.error ?? 'Delete failed');
    else {
      toast.success('Holiday deleted');
      if (editing?.id === id) setEditing(null);
      await load();
    }
    setSaving(false);
  };

  if (!canView) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Company holidays</CardTitle>
            <CardDescription>You do not have permission to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <header className="flex w-full min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HR settings</p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Company holidays</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Official public holidays for your company. Payroll uses this calendar separately from attendance
            and leave. Configure holiday pay and OT rules per salary structure.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label className={labelClass}>Year</label>
            <Input
              type="number"
              className="w-24"
              value={year}
              min={2000}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value) || currentYear)}
            />
          </div>
          {canEdit ? (
            <Button type="button" size="sm" onClick={() => setShowCreate(true)}>
              Add holiday
            </Button>
          ) : null}
        </div>
      </header>

      {showCreate && canEdit ? (
        <HolidayFormModal
          title="Add holiday"
          initial={createForm}
          payTypes={payTypes}
          employmentTypes={employmentTypes}
          saving={saving}
          onClose={() => setShowCreate(false)}
          onSubmit={onCreate}
        />
      ) : null}

      {editing && editForm && canEdit ? (
        <HolidayFormModal
          title="Edit holiday"
          initial={editForm}
          payTypes={payTypes}
          employmentTypes={employmentTypes}
          saving={saving}
          onClose={() => setEditing(null)}
          onSubmit={onSave}
        />
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Payroll</th>
                  <th className="px-4 py-3">Applies to</th>
                  <th className="px-4 py-3">Salary structures &amp; OT</th>
                  <th className="px-4 py-3">Notes</th>
                  {canEdit ? <th className="w-36 px-4 py-3">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                      No holidays for {year}.
                    </td>
                  </tr>
                ) : (
                  list.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 tabular-nums text-foreground">{formatHolidayDate(row.holidayDate)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{row.name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.isPaid ? 'Paid' : 'Unpaid'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatHolidayCriteriaSummary({
                          employmentTypes: row.employmentTypes,
                          workforceRoleTypes: row.workforceRoleTypes,
                          visaHoldings: row.visaHoldings,
                        })}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                        {formatPayTypesSummary(row)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{row.notes || '—'}</td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => setEditing(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className={cn('h-auto p-0 text-destructive')}
                              onClick={() => void onDelete(row.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
