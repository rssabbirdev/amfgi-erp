import {
  displayNationalityCountryName,
  normalizeNationalityCountryName,
  parseNationalityInput,
} from '@/lib/hr/countryNames';

describe('countryNames', () => {
  it('accepts canonical country names', () => {
    expect(normalizeNationalityCountryName('India').value).toBe('India');
    expect(normalizeNationalityCountryName('united arab emirates').value).toBe('United Arab Emirates');
  });

  it('maps legacy demonyms and aliases', () => {
    expect(normalizeNationalityCountryName('Indian').value).toBe('India');
    expect(normalizeNationalityCountryName('UAE').value).toBe('United Arab Emirates');
    expect(normalizeNationalityCountryName('Emirati').value).toBe('United Arab Emirates');
    expect(normalizeNationalityCountryName('British').value).toBe('United Kingdom');
  });

  it('rejects unknown values', () => {
    expect(normalizeNationalityCountryName('Atlantis').value).toBeNull();
  });

  it('parses empty input as null', () => {
    expect(parseNationalityInput('')).toEqual({ ok: true, value: null });
    expect(parseNationalityInput(null)).toEqual({ ok: true, value: null });
  });

  it('displays legacy stored values as country names when possible', () => {
    expect(displayNationalityCountryName('Pakistani')).toBe('Pakistan');
    expect(displayNationalityCountryName('India')).toBe('India');
  });
});
