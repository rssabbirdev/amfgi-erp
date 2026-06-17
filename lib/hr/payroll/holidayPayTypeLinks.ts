export type HolidayPayTypeLink = {
  payTypeId: string;
  payWorkedHoursAtOt: boolean;
  holidayOtPercent: number | null;
};

export type HolidayPayTypeLinkInput = {
  payTypeId: string;
  payWorkedHoursAtOt?: boolean;
  holidayOtPercent?: number | null;
};

export function normalizeHolidayPayTypeLinkInput(
  link: HolidayPayTypeLinkInput
): HolidayPayTypeLink {
  return {
    payTypeId: link.payTypeId,
    payWorkedHoursAtOt: link.payWorkedHoursAtOt ?? false,
    holidayOtPercent:
      link.holidayOtPercent != null && link.holidayOtPercent > 0
        ? Math.round(link.holidayOtPercent)
        : null,
  };
}

export function resolveHolidayOtSettingsForEmployee(params: {
  payTypeLinks: HolidayPayTypeLink[];
  resolvedPayTypeId: string | null;
  employeePayTypeId: string | null;
  /** When unset, fixed monthly defaults to no holiday worked OT unless explicitly configured. */
  employeePayMode?: string;
}): { payWorkedHoursAtOt: boolean; holidayOtPercent: number | null } {
  const { payTypeLinks, employeePayTypeId, employeePayMode } = params;

  // OT rules are per employee salary structure — match the employee's pay type first.
  if (employeePayTypeId) {
    const employeeLink = payTypeLinks.find((row) => row.payTypeId === employeePayTypeId);
    if (employeeLink) {
      return {
        payWorkedHoursAtOt: employeeLink.payWorkedHoursAtOt,
        holidayOtPercent: employeeLink.holidayOtPercent,
      };
    }
  }

  const defaultWorkedOt =
    employeePayMode === 'MONTHLY_CALENDAR_DEDUCT' || employeePayMode === 'MONTHLY_FIXED'
      ? false
      : true;
  return { payWorkedHoursAtOt: defaultWorkedOt, holidayOtPercent: null };
}
