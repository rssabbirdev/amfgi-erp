# Lib HR

> 24 nodes · cohesion 0.15

## Key Concepts

- **attendanceReports.ts** (27 connections) — `lib/hr/attendanceReports.ts`
- **route.ts** (22 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **getMonthlyAttendanceReports()** (15 connections) — `lib/hr/attendanceReports.ts`
- **GET()** (10 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **employeeTypeFromProfileExtension()** (8 connections) — `lib/hr/employeeTypeSettings.ts`
- **attendanceReportStatusLabel()** (4 connections) — `lib/hr/attendanceReportFormatting.ts`
- **serializeAttendanceRow()** (3 connections) — `app/api/hr/attendance/route.ts`
- **normalizeAttendanceReportBuilderSchema()** (3 connections) — `lib/hr/attendanceReportBuilder.ts`
- **normalizeAttendanceReportColumns()** (3 connections) — `lib/hr/attendanceReportFormatting.ts`
- **normalizeAttendanceReportFormats()** (3 connections) — `lib/hr/attendanceReportFormatting.ts`
- **formatHoursFromMinutes()** (3 connections) — `lib/hr/attendanceReports.ts`
- **exportStatusLabel()** (3 connections) — `lib/hr/attendanceReports.ts`
- **exportWorkLocation()** (3 connections) — `lib/hr/attendanceReports.ts`
- **sanitizeSheetName()** (2 connections) — `app/api/hr/attendance/monthly-report/route.ts`
- **monthBounds()** (2 connections) — `lib/hr/attendanceReports.ts`
- **diffMinutes()** (2 connections) — `lib/hr/attendanceReports.ts`
- **minutesOfDay()** (2 connections) — `lib/hr/attendanceReports.ts`
- **isoDay()** (2 connections) — `lib/hr/attendanceReports.ts`
- **locationLabel()** (2 connections) — `lib/hr/attendanceReports.ts`
- **findMonthlyAttendanceRows()** (2 connections) — `lib/hr/attendanceReports.ts`
- **AttendanceReportRow** (1 connections) — `lib/hr/attendanceReports.ts`
- **AttendanceEmployeeReport** (1 connections) — `lib/hr/attendanceReports.ts`
- **attendanceReportEmployeeSelect** (1 connections) — `lib/hr/attendanceReports.ts`
- **attendanceReportWorkAssignmentSelect** (1 connections) — `lib/hr/attendanceReports.ts`

## Relationships

- [[API HR, Stock Exception Approvals, and Warehouses]] (9 shared connections)
- [[Lib HR]] (9 shared connections)
- [[API, Lib, and Scripts]] (8 shared connections)
- [[Lib and HR]] (8 shared connections)
- [[API HR, Stock, and Transactions]] (4 shared connections)
- [[API Materials, Transactions, and Me]] (4 shared connections)
- [[Components, Lib, and HR]] (1 shared connections)

## Source Files

- `app/api/hr/attendance/monthly-report/route.ts`
- `app/api/hr/attendance/route.ts`
- `lib/hr/attendanceReportBuilder.ts`
- `lib/hr/attendanceReportFormatting.ts`
- `lib/hr/attendanceReports.ts`
- `lib/hr/employeeTypeSettings.ts`

## Audit Trail

- EXTRACTED: 125 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*