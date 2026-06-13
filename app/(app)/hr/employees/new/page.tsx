'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { Select } from '@/components/ui/shadcn/select';
import { EmployeeMetaSelect } from '@/components/hr/EmployeeMetaSelect';
import { NationalitySearchSelect } from '@/components/hr/NationalitySearchSelect';
import {
  WORKFORCE_EMPLOYEE_TYPE_OPTIONS,
  WORKFORCE_VISA_HOLDING_OPTIONS,
  buildWorkforceProfileExtension,
} from '@/lib/hr/workforceProfile';

function generateEmployeeCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  return `EMP-${stamp.slice(-6)}`;
}

export default function NewEmployeePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nationality, setNationality] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [employeeType, setEmployeeType] = useState<'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER'>('LABOUR_WORKER');
  const [visaHolding, setVisaHolding] = useState<'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA'>('COMPANY_PROVIDED');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const labelClass = 'text-xs font-medium uppercase tracking-wider text-muted-foreground';
  const fieldGrid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  const metaSelectClass =
    'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';
  const proposedCode = useMemo(() => generateEmployeeCode(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const legalName = fullName.trim() || preferredName.trim();
      const displayName = preferredName.trim() || legalName;
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: generateEmployeeCode(),
          fullName: legalName,
          preferredName: displayName || null,
          nationality: nationality || null,
          phone: phone.trim() || null,
          designation: designation.trim() || null,
          department: department.trim() || null,
          employmentType: employmentType.trim() || null,
          profileExtension: buildWorkforceProfileExtension({
            employeeType,
            visaHolding,
            expertises: [],
          }),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Save failed');
        return;
      }
      toast.success('Employee created');
      router.push(`/hr/employees/${json.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-5">
        <Alert>
          <AlertDescription>You do not have permission to create employee records.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Employee setup</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create employee record</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Capture core identity and workforce setup, then complete the full profile after create.
          </p>
        </div>
        <p className="shrink-0 font-mono text-sm text-emerald-600 dark:text-emerald-300">Code: {proposedCode}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Employee details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className={fieldGrid}>
              <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                <span className={labelClass}>Full legal name</span>
                <Input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter employee full name"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Preferred name</span>
                <Input
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="Optional display name"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Mobile number</span>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +971…"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Nationality</span>
                <NationalitySearchSelect
                  value={nationality}
                  onChange={setNationality}
                  inputClassName="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Designation</span>
                <EmployeeMetaSelect
                  kind="DESIGNATION"
                  name="designation"
                  value={designation}
                  onValueChange={setDesignation}
                  fieldClass={metaSelectClass}
                  emptyLabel="Select designation…"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Department</span>
                <EmployeeMetaSelect
                  kind="DEPARTMENT"
                  name="department"
                  value={department}
                  onValueChange={setDepartment}
                  fieldClass={metaSelectClass}
                  emptyLabel="Select department…"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Employment type</span>
                <EmployeeMetaSelect
                  kind="EMPLOYMENT_TYPE"
                  name="employmentType"
                  value={employmentType}
                  onValueChange={setEmploymentType}
                  fieldClass={metaSelectClass}
                  emptyLabel="Select employment type…"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Employee type</span>
                <Select
                  value={employeeType}
                  onChange={(e) =>
                    setEmployeeType(e.target.value as 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER')
                  }
                >
                  {WORKFORCE_EMPLOYEE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Visa holding</span>
                <Select
                  value={visaHolding}
                  onChange={(e) =>
                    setVisaHolding(e.target.value as 'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA')
                  }
                >
                  {WORKFORCE_VISA_HOLDING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating employee…' : 'Create employee'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push('/hr/employees')}>
                Back to employees
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
