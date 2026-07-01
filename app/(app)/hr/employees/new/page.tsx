'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { Button } from '@/components/ui/shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/shadcn/card';
import { Input } from '@/components/ui/shadcn/input';
import { EmployeeMetaSelect } from '@/components/hr/EmployeeMetaSelect';
import { NationalitySearchSelect } from '@/components/hr/NationalitySearchSelect';
import { CatalogSearchSelect } from '@/components/hr/CatalogSearchSelect';
import { GENDER_OPTIONS, visaHoldingOptions, workforceRoleTypeOptions } from '@/lib/hr/employeeFieldOptions';
import { createEmployeeRecord } from '@/lib/hr/createEmployeeClient';
import { generateEmployeeCode } from '@/lib/hr/generateEmployeeCode';
import { todayYmdLocal } from '@/lib/hr/employeeLeavePeriod';
import { invalidateEmployeeCaches } from '@/lib/hr/invalidateEmployeeCaches';
import { useAppDispatch } from '@/store/hooks';

export default function NewEmployeePage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nationality, setNationality] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [signatureGroup, setSignatureGroup] = useState('');
  const [hireDate, setHireDate] = useState(() => todayYmdLocal());
  const [employeeType, setEmployeeType] = useState<'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER'>('LABOUR_WORKER');
  const [visaHolding, setVisaHolding] = useState('');

  const isSA = session?.user?.isSuperAdmin ?? false;
  const perms = (session?.user?.permissions ?? []) as string[];
  const canEdit = isSA || perms.includes('hr.employee.edit');

  const labelClass = 'text-xs font-medium uppercase tracking-wider text-muted-foreground';
  const fieldGrid = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
  const metaSelectClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';
  const searchInputClass =
    'border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring';
  const workforceRoleOptions = useMemo(() => workforceRoleTypeOptions(), []);
  const visaHoldingOptionList = useMemo(() => visaHoldingOptions(), []);
  const proposedCode = useMemo(() => generateEmployeeCode(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const employee = await createEmployeeRecord({
        fullName,
        preferredName: preferredName.trim() || null,
        nationality: nationality || null,
        gender: gender || null,
        phone: phone.trim() || null,
        designation: designation.trim() || null,
        department: department.trim() || null,
        employmentType: employmentType.trim() || null,
        signatureGroup: signatureGroup.trim() || null,
        hireDate: hireDate || null,
        employeeType,
        visaHolding: visaHolding
          ? (visaHolding as 'COMPANY_PROVIDED' | 'SELF_OWN' | 'NO_VISA')
          : undefined,
      });
      invalidateEmployeeCaches(dispatch, { entity: 'employee', action: 'created' });
      toast.success('Employee created');
      router.push(`/hr/employees/${employee.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
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
                <span className={labelClass}>Nationality (country)</span>
                <NationalitySearchSelect
                  value={nationality}
                  onChange={setNationality}
                  inputClassName="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Gender</span>
                <CatalogSearchSelect
                  value={gender}
                  onChange={setGender}
                  options={GENDER_OPTIONS}
                  placeholder="Search gender…"
                  inputClassName={searchInputClass}
                  allowLegacyValue={false}
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
                <span className={labelClass}>Signature group</span>
                <EmployeeMetaSelect
                  kind="SIGNATURE_GROUP"
                  name="signatureGroup"
                  value={signatureGroup}
                  onValueChange={setSignatureGroup}
                  fieldClass={metaSelectClass}
                  emptyLabel="Select signature group…"
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Hire date</span>
                <Input
                  type="date"
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Workforce role type</span>
                <CatalogSearchSelect
                  value={employeeType}
                  onChange={(next) =>
                    setEmployeeType(next as 'OFFICE_STAFF' | 'HYBRID_STAFF' | 'DRIVER' | 'LABOUR_WORKER')
                  }
                  options={workforceRoleOptions}
                  placeholder="Search workforce role…"
                  inputClassName={searchInputClass}
                  allowLegacyValue={false}
                />
              </div>
              <div className="space-y-1">
                <span className={labelClass}>Visa holding</span>
                <CatalogSearchSelect
                  value={visaHolding}
                  onChange={setVisaHolding}
                  options={visaHoldingOptionList}
                  placeholder="Search visa holding…"
                  inputClassName={searchInputClass}
                  allowLegacyValue={false}
                />
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
