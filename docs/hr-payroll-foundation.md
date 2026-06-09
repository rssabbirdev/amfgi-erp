# HR payroll foundation — operations guide

This document describes how to use the payroll **foundation** features (pay types, compensation, leave, attendance snapshots). **Pay runs** snapshot a month from preview; payslip PDF and WPS export are a later phase.

## Recommended daily order

1. **Employee type timings** (`/hr/settings/employee-types`) — set `basicHoursPerDay` and duty windows *before* creating attendance for a period (e.g. Ramadan 7h, then back to 9h).
2. **Schedule** — publish the day; mark **day absences** on the schedule screen if needed.
3. **Attendance day sheet** — create or edit rows; save; **Submit day** then **Approve day** when ready.
4. **Leave** — employees submit via `/me/leave`; HR approves at `/hr/leave` (syncs to attendance as DRAFT leave rows).

## Pay types and compensation

- **Pay types** (`/hr/settings/pay-types`, requires `hr.payroll.settings`): four seeded **system** templates (read-only). Use **Add pay type** or **Clone to customize** for company-specific types; **Edit** / **Delete** custom types only (not assigned to any employee compensation).
- **Employee compensation** (employee profile → Compensation tab): assign pay type, monthly basic, allowance, daily rate, effective from date.

## Attendance fields used by payroll (later)

| Field | Purpose |
|-------|---------|
| `basicHours` | Snapshotted per row when created/saved |
| `leaveType` | ANNUAL, SICK, EMERGENCY, ONE_DAY when status is LEAVE |
| `workflowStatus` | Only APPROVED rows should count in pay runs |
| `status` | ABSENT = unpaid deduction (office scheme); paid leave types do not deduct |

## Leave balance

HR sets annual entitlement per employee/year under **Leave → Annual balances**. Approving annual or one-day leave consumes balance unless HR uses override approve.

## Payroll preview

- **Route:** `/hr/payroll/preview` (requires `hr.payroll.compensation`).
- Uses **approved** attendance rows only for the selected month; draft rows are shown as a warning.
- Resolves the compensation record effective during that month and runs `calculatePayLine`.
- **Export CSV** downloads all rows (included and skipped) for the selected month.
- **Finalize pay run** saves an immutable snapshot for that month (one run per company per month).

## Pay runs

- **List:** `/hr/payroll/runs`
- **Detail:** `/hr/payroll/runs/[id]` — read-only lines with breakdown and CSV export.
- Created from preview via `POST /api/hr/payroll/runs` with `{ month, note? }`.
- **Delete** (pilot corrections): pay run detail → Delete, then re-finalize after fixing attendance.
- **Check month:** `GET /api/hr/payroll/runs?month=YYYY-MM` returns `[]` or one row.
- **Payslips:** Pay run detail → **Print all payslips** or per-employee **Payslip** → `/hr-payroll-payslip-print?runId=…` → browser Print / Save as PDF.

## WPS export (later)

Bank transfer (WPS) files need employee IBAN and bank fields on the employee profile — not in scope yet.

## Calculator library (developers)

`lib/hr/payroll/calculatePayLine.ts` implements the four seeded pay type modes. Preview builder: `lib/hr/payroll/buildPayPreview.ts`. Unit tests: `__tests__/lib/hr/payroll/calculatePayLine.test.ts`.

## Backfill script

After migrating schema, run:

```bash
npx tsx scripts/backfill-attendance-basic-hours.ts
```

Requires `DATABASE_URL` in the environment.
