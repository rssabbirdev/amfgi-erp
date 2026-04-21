import type { AssignmentLocationType } from '@prisma/client';

export interface ParsedDriverRouteRow {
  driverName: string;
  routeText: string;
}

export interface ParsedColumn {
  columnIndex: number;
  label: string;
  jobNumberRaw: string;
  locationType: AssignmentLocationType;
  jobNumberSnapshot?: string;
  factoryCode?: string;
  factoryLabel?: string;
  teamLeaderName?: string;
  workerNames: string[];
  shiftStart?: string;
  shiftEnd?: string;
  breakWindow?: string;
  driver1Name?: string;
  driver2Name?: string;
}

export interface ParsedDailySheet {
  clientDisplayName?: string;
  /** YYYY-MM-DD */
  workDateYmd: string;
  columns: ParsedColumn[];
  onLeaveNames: string[];
  driverRoutes: ParsedDriverRouteRow[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseUsDateCell(cell: string): string | null {
  const t = cell.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mo = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const mm = mo < 10 ? `0${mo}` : String(mo);
  const dd = d < 10 ? `0${d}` : String(d);
  return `${y}-${mm}-${dd}`;
}

function rowLabel(cells: string[]) {
  return (cells[0] ?? '').trim();
}

function isFactoryJobNumber(s: string) {
  return /^FACTORY/i.test(s.trim());
}

/**
 * Parses the "Daily Work Schedule - Worker Assign" CSV layout (row labels in column A).
 */
export function parseDailyWorkScheduleCsv(csvText: string): ParsedDailySheet {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  const rows = lines.map(splitCsvLine);
  if (rows.length < 3) throw new Error('CSV too short');

  const r0 = rows[0];
  const clientDisplayName = (r0[0] ?? '').trim() || undefined;
  const workDateYmd = parseUsDateCell(r0[1] ?? '') ?? '';
  if (!workDateYmd) throw new Error('Could not parse work date from column B on row 1 (e.g. 4/15/2026)');

  const labelRow = rows.find((r) => rowLabel(r).toLowerCase() === 'teams');
  if (!labelRow) throw new Error('Missing Teams row');

  let maxCol = 1;
  for (let i = 1; i < labelRow.length; i++) {
    const c = (labelRow[i] ?? '').trim();
    if (!c || !/^Team#/i.test(c)) break;
    maxCol = i;
  }
  if (maxCol < 1) throw new Error('No team columns found');

  const findRow = (label: string) =>
    rows.find((r) => rowLabel(r).toLowerCase() === label.toLowerCase());

  const jobRow = findRow('Job Number');
  const leaderRow = findRow('Team Leader');
  const inRow = findRow('In Time');
  const breakRow = findRow('Break');
  const outRow = findRow('Out Time');
  const d1Row = findRow('Driver 1');
  const d2Row = findRow('Driver 2');
  const onLeaveRow = findRow('ON LEAVE');

  const workerRows = rows.filter((r) => /^Worker\s+\d+$/i.test(rowLabel(r)));

  const columns: ParsedColumn[] = [];
  for (let col = 1; col <= maxCol; col++) {
    const label = (labelRow[col] ?? '').trim() || `Team#${col}`;
    const jobNumberRaw = (jobRow?.[col] ?? '').trim();
    const factory = !jobNumberRaw || isFactoryJobNumber(jobNumberRaw);
    const locationType: AssignmentLocationType = factory ? 'FACTORY' : 'SITE_JOB';
    let factoryCode: string | undefined;
    let factoryLabel: string | undefined;
    let jobNumberSnapshot: string | undefined;
    if (factory) {
      factoryCode = jobNumberRaw || undefined;
      factoryLabel = jobNumberRaw || undefined;
    } else {
      jobNumberSnapshot = jobNumberRaw;
    }

    const workerNames: string[] = [];
    for (const wr of workerRows) {
      const name = (wr[col] ?? '').trim();
      if (name) workerNames.push(name);
    }

    columns.push({
      columnIndex: col,
      label,
      jobNumberRaw,
      locationType,
      jobNumberSnapshot,
      factoryCode,
      factoryLabel,
      teamLeaderName: (leaderRow?.[col] ?? '').trim() || undefined,
      workerNames,
      shiftStart: (inRow?.[col] ?? '').trim() || undefined,
      shiftEnd: (outRow?.[col] ?? '').trim() || undefined,
      breakWindow: (breakRow?.[col] ?? '').trim() || undefined,
      driver1Name: (d1Row?.[col] ?? '').trim() || undefined,
      driver2Name: (d2Row?.[col] ?? '').trim() || undefined,
    });
  }

  const onLeaveNames: string[] = [];
  if (onLeaveRow) {
    for (let col = 1; col < onLeaveRow.length; col++) {
      const v = (onLeaveRow[col] ?? '').trim();
      if (v) onLeaveNames.push(v);
    }
  }

  const onLeaveIdx = onLeaveRow ? rows.indexOf(onLeaveRow) : -1;
  const driverRoutes: ParsedDriverRouteRow[] = [];
  if (onLeaveIdx >= 0) {
    for (let i = onLeaveIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      const a = (r[0] ?? '').trim();
      const b = (r[1] ?? '').trim();
      if (!a) continue;
      const lower = a.toLowerCase();
      if (
        [
          'teams',
          'work location',
          'job number',
          'team leader',
          'worker 1',
          'in time',
          'break',
          'out time',
          'driver 1',
          'driver 2',
          'on leave',
        ].includes(lower)
      ) {
        continue;
      }
      if (b) driverRoutes.push({ driverName: a, routeText: b });
    }
  }

  return {
    clientDisplayName,
    workDateYmd,
    columns,
    onLeaveNames,
    driverRoutes,
  };
}
