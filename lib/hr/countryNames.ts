/** Canonical country names stored on employee nationality. */
export const COUNTRY_NAMES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Argentina',
  'Australia',
  'Austria',
  'Bahrain',
  'Bangladesh',
  'Belgium',
  'Bhutan',
  'Brazil',
  'Bulgaria',
  'Cambodia',
  'Cameroon',
  'Canada',
  'China',
  'Colombia',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Egypt',
  'Eritrea',
  'Ethiopia',
  'Finland',
  'France',
  'Germany',
  'Ghana',
  'Greece',
  'Hungary',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Italy',
  'Japan',
  'Jordan',
  'Kenya',
  'Kuwait',
  'Lebanon',
  'Libya',
  'Malaysia',
  'Maldives',
  'Morocco',
  'Myanmar',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nigeria',
  'Norway',
  'Oman',
  'Pakistan',
  'Palestine',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Romania',
  'Russia',
  'Rwanda',
  'Saudi Arabia',
  'Serbia',
  'Singapore',
  'Somalia',
  'South Africa',
  'South Korea',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Sweden',
  'Switzerland',
  'Syria',
  'Tanzania',
  'Thailand',
  'Tunisia',
  'Turkey',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uzbekistan',
  'Vietnam',
  'Yemen',
  'Zimbabwe',
] as const;

export type CountryName = (typeof COUNTRY_NAMES)[number];

/** @deprecated Use COUNTRY_NAMES — kept for existing imports. */
export const NATIONALITY_OPTIONS = COUNTRY_NAMES;

const COUNTRY_BY_LOWER = new Map(COUNTRY_NAMES.map((name) => [name.toLowerCase(), name]));

const LEGACY_NATIONALITY_ALIASES: Record<string, CountryName> = {
  uae: 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  emirati: 'United Arab Emirates',
  uk: 'United Kingdom',
  british: 'United Kingdom',
  usa: 'United States',
  us: 'United States',
  american: 'United States',
  afghan: 'Afghanistan',
  albanian: 'Albania',
  algerian: 'Algeria',
  argentinian: 'Argentina',
  australian: 'Australia',
  austrian: 'Austria',
  bahraini: 'Bahrain',
  bangladeshi: 'Bangladesh',
  belgian: 'Belgium',
  bhutanese: 'Bhutan',
  brazilian: 'Brazil',
  bulgarian: 'Bulgaria',
  canadian: 'Canada',
  chinese: 'China',
  croatian: 'Croatia',
  cypriot: 'Cyprus',
  czech: 'Czech Republic',
  danish: 'Denmark',
  dutch: 'Netherlands',
  egyptian: 'Egypt',
  ethiopian: 'Ethiopia',
  filipino: 'Philippines',
  finnish: 'Finland',
  french: 'France',
  german: 'Germany',
  ghanaian: 'Ghana',
  greek: 'Greece',
  hungarian: 'Hungary',
  indian: 'India',
  indonesian: 'Indonesia',
  iranian: 'Iran',
  iraqi: 'Iraq',
  irish: 'Ireland',
  italian: 'Italy',
  japanese: 'Japan',
  jordanian: 'Jordan',
  kenyan: 'Kenya',
  korean: 'South Korea',
  kuwaiti: 'Kuwait',
  lebanese: 'Lebanon',
  malaysian: 'Malaysia',
  moroccan: 'Morocco',
  nepalese: 'Nepal',
  'new zealander': 'New Zealand',
  nigerian: 'Nigeria',
  norwegian: 'Norway',
  omani: 'Oman',
  pakistani: 'Pakistan',
  palestinian: 'Palestine',
  polish: 'Poland',
  portuguese: 'Portugal',
  qatari: 'Qatar',
  romanian: 'Romania',
  russian: 'Russia',
  saudi: 'Saudi Arabia',
  serbian: 'Serbia',
  singaporean: 'Singapore',
  'south african': 'South Africa',
  spanish: 'Spain',
  'sri lankan': 'Sri Lanka',
  sudanese: 'Sudan',
  swedish: 'Sweden',
  swiss: 'Switzerland',
  syrian: 'Syria',
  thai: 'Thailand',
  tunisian: 'Tunisia',
  turkish: 'Turkey',
  ugandan: 'Uganda',
  ukrainian: 'Ukraine',
  yemeni: 'Yemen',
  zimbabwean: 'Zimbabwe',
};

export function normalizeNationalityCountryName(
  value: string | null | undefined
): { value: string | null; error?: string } {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { value: null };

  const direct = COUNTRY_BY_LOWER.get(trimmed.toLowerCase());
  if (direct) return { value: direct };

  const alias = LEGACY_NATIONALITY_ALIASES[trimmed.toLowerCase()];
  if (alias) return { value: alias };

  return {
    value: null,
    error: `Invalid nationality "${trimmed}" (use a country name, e.g. India or United Arab Emirates)`,
  };
}

export function displayNationalityCountryName(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const normalized = normalizeNationalityCountryName(trimmed);
  return normalized.value ?? trimmed;
}

export function parseNationalityInput(
  value: string | null | undefined
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || !String(value).trim()) {
    return { ok: true, value: null };
  }
  const normalized = normalizeNationalityCountryName(value);
  if (!normalized.value) {
    return { ok: false, error: normalized.error ?? 'Invalid nationality' };
  }
  return { ok: true, value: normalized.value };
}
