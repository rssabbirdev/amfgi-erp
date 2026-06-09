/**
 * Ranks material names for typeahead search. Earlier word matches and prefix
 * matches rank above substring matches later in the name.
 */
export function materialSearchRelevanceScore(name: string, search: string): number {
  const normalizedName = name.toLowerCase().trim();
  const normalizedSearch = search.toLowerCase().trim();
  if (!normalizedSearch) return 0;

  if (normalizedName === normalizedSearch) return 1000;
  if (normalizedName.startsWith(normalizedSearch)) return 900;

  const words = normalizedName.split(/\s+/);
  const wordIndex = words.findIndex((word) => word.startsWith(normalizedSearch));
  if (wordIndex >= 0) {
    return 800 - wordIndex * 10;
  }

  const index = normalizedName.indexOf(normalizedSearch);
  if (index >= 0) {
    return 700 - index;
  }

  return 0;
}

export function sortMaterialsBySearchRelevance<T extends { name: string }>(
  items: T[],
  search: string
): T[] {
  const normalizedSearch = search.trim();
  if (!normalizedSearch) return items;

  return [...items].sort((a, b) => {
    const scoreA = materialSearchRelevanceScore(a.name, normalizedSearch);
    const scoreB = materialSearchRelevanceScore(b.name, normalizedSearch);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
