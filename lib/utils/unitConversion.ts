/**
 * Unit conversion utilities for materials with multiple measurement units.
 * All functions are pure and side-effect-free.
 */

export interface UnitConversionDef {
  unit: string;
  factor: number;
  label?: string;
}

/**
 * Convert a quantity entered in `enteredUnit` to the material's base unit.
 * @param qty - The number the user typed
 * @param enteredUnit - The unit the user selected (e.g. "cm")
 * @param baseUnit - The material's native unit (e.g. "meter")
 * @param conversions - The material's conversions array
 * @returns Quantity in base unit
 * @throws Error if enteredUnit is unknown
 */
export function toBaseUnit(
  qty: number,
  enteredUnit: string,
  baseUnit: string,
  conversions: UnitConversionDef[]
): number {
  if (enteredUnit === baseUnit || !enteredUnit) {
    return qty;
  }

  const conversion = conversions.find(
    (c) => c.unit.toLowerCase() === enteredUnit.toLowerCase()
  );

  if (!conversion) {
    throw new Error(`Unknown unit "${enteredUnit}"`);
  }

  return qty * conversion.factor;
}

/**
 * Convert a quantity stored in base unit to a display quantity in `targetUnit`.
 * Used for display-only purposes (materials page, stock labels).
 * @param qty - Quantity in base unit
 * @param baseUnit - Material's native unit
 * @param targetUnit - The unit to express the quantity in
 * @param conversions - The material's conversions array
 * @returns Quantity in targetUnit
 * @throws Error if targetUnit is unknown
 */
export function fromBaseUnit(
  qty: number,
  baseUnit: string,
  targetUnit: string,
  conversions: UnitConversionDef[]
): number {
  if (targetUnit === baseUnit || !targetUnit) {
    return qty;
  }

  const conversion = conversions.find(
    (c) => c.unit.toLowerCase() === targetUnit.toLowerCase()
  );

  if (!conversion) {
    throw new Error(`Unknown unit "${targetUnit}"`);
  }

  return qty / conversion.factor;
}

/**
 * Build a flat options list suitable for a <select> element.
 * Always includes the base unit first.
 * @param baseUnit - Material's native unit
 * @param conversions - The material's conversions array
 * @returns Array of { value: unitString, label: displayLabel }
 */
export function buildUnitOptions(
  baseUnit: string,
  conversions: UnitConversionDef[]
): Array<{ value: string; label: string }> {
  return [
    { value: baseUnit, label: baseUnit },
    ...conversions.map((c) => ({
      value: c.unit,
      label: c.label ?? c.unit,
    })),
  ];
}

/**
 * Validate a conversions array for a material definition.
 * Checks for:
 * - No duplicate unit strings (case-insensitive)
 * - No unit string equal to baseUnit
 * - All factors > 0
 * @param baseUnit - Material's native unit
 * @param conversions - The conversions array to validate
 * @returns Array of error strings (empty if valid)
 */
export function validateConversions(
  baseUnit: string,
  conversions: UnitConversionDef[]
): string[] {
  const errors: string[] = [];
  const seenUnits = new Set<string>();

  for (const conv of conversions) {
    const unitLower = conv.unit.toLowerCase();

    // Check for duplicate
    if (seenUnits.has(unitLower)) {
      errors.push(`Duplicate unit: "${conv.unit}"`);
    }
    seenUnits.add(unitLower);

    // Check if unit equals base unit
    if (unitLower === baseUnit.toLowerCase()) {
      errors.push(
        `Conversion unit "${conv.unit}" cannot be the same as base unit "${baseUnit}"`
      );
    }

    // Check factor validity
    if (conv.factor <= 0) {
      errors.push(
        `Factor for "${conv.unit}" must be greater than 0, got ${conv.factor}`
      );
    }
  }

  return errors;
}
