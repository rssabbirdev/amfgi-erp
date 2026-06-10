# Lib HR

> 31 nodes · cohesion 0.15

## Key Concepts

- **route.ts** (30 connections) — `app/api/hr/attendance/bulk-upsert/route.ts`
- **employeeTypeSettings.ts** (25 connections) — `lib/hr/employeeTypeSettings.ts`
- **readEmployeeTypeSettingsFromCompanyData()** (19 connections) — `lib/hr/employeeTypeSettings.ts`
- **POST()** (16 connections) — `app/api/hr/attendance/bulk-upsert/route.ts`
- **basicHoursForProfileExtension()** (15 connections) — `lib/hr/employeeTypeSettings.ts`
- **generateAttendanceFromSchedule.ts** (13 connections) — `lib/hr/generateAttendanceFromSchedule.ts`
- **attendanceBasicHours.ts** (12 connections) — `lib/hr/attendanceBasicHours.ts`
- **regenerateAttendanceBoilerplate()** (10 connections) — `lib/hr/generateAttendanceFromSchedule.ts`
- **resolveBasicHoursForEmployee()** (9 connections) — `lib/hr/attendanceBasicHours.ts`
- **employeeTypeFromProfileExtension()** (8 connections) — `lib/hr/employeeTypeSettings.ts`
- **calculateOvertimeMinutes()** (6 connections) — `lib/hr/attendanceBasicHours.ts`
- **backfill-attendance-basic-hours.ts** (6 connections) — `scripts/backfill-attendance-basic-hours.ts`
- **resolveBasicHoursFromCompany()** (5 connections) — `lib/hr/attendanceBasicHours.ts`
- **dubaiWallTimeToUtc()** (5 connections) — `lib/hr/dubaiShift.ts`
- **normalizeEmployeeTypeSettings()** (5 connections) — `lib/hr/employeeTypeSettings.ts`
- **dubaiShift.ts** (4 connections) — `lib/hr/dubaiShift.ts`
- **parseTimeCell()** (4 connections) — `lib/hr/dubaiShift.ts`
- **writeEmployeeTypeSettingsIntoCompanyField()** (4 connections) — `lib/hr/employeeTypeSettings.ts`
- **parseBreakWindow()** (4 connections) — `lib/hr/generateAttendanceFromSchedule.ts`
- **serializeAttendanceRow()** (3 connections) — `app/api/hr/attendance/route.ts`
- **EmployeeTypeSettingsMap** (3 connections) — `lib/hr/employeeTypeSettings.ts`
- **parseDt()** (2 connections) — `app/api/hr/attendance/bulk-upsert/route.ts`
- **diffMinutes()** (2 connections) — `app/api/hr/attendance/bulk-upsert/route.ts`
- **basicHoursToMinutes()** (2 connections) — `lib/hr/attendanceBasicHours.ts`
- **atDubaiStartOfDayUtc()** (2 connections) — `lib/hr/dubaiShift.ts`
- *... and 6 more nodes in this community*

## Relationships

- [[API HR, Users, and Stock Exception Approvals]] (33 shared connections)
- [[Lib HR]] (16 shared connections)
- [[API HR, Stock, and Me]] (13 shared connections)
- [[Components, Lib, and HR]] (6 shared connections)
- [[API and Lib]] (4 shared connections)
- [[API Materials, Settings, and Media]] (3 shared connections)
- [[HR Schedule]] (2 shared connections)
- [[Lib, Scripts, and API]] (2 shared connections)
- [[Reports, Components, and Settings]] (1 shared connections)
- [[Scripts Seed]] (1 shared connections)
- [[API Transactions, Stock, and Reports]] (1 shared connections)

## Source Files

- `app/api/hr/attendance/bulk-upsert/route.ts`
- `app/api/hr/attendance/route.ts`
- `lib/hr/attendanceBasicHours.ts`
- `lib/hr/dubaiShift.ts`
- `lib/hr/employeeTypeSettings.ts`
- `lib/hr/generateAttendanceFromSchedule.ts`
- `scripts/backfill-attendance-basic-hours.ts`

## Audit Trail

- EXTRACTED: 219 (98%)
- INFERRED: 5 (2%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*