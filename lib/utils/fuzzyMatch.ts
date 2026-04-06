/**
 * Fuzzy match algorithm - finds similarity score between search term and target
 * Returns score 0-1 where 1 is exact match
 */
export function fuzzyMatch(searchTerm: string, target: string): number {
  const search = searchTerm.toLowerCase().trim();
  const text = target.toLowerCase().trim();

  if (!search) return 0;
  if (search === text) return 1;
  if (text.includes(search)) return 0.9;

  let searchIdx = 0;
  let textIdx = 0;
  let score = 0;
  const maxScore = search.length;

  while (searchIdx < search.length && textIdx < text.length) {
    if (search[searchIdx] === text[textIdx]) {
      score += 1;
      searchIdx++;
    }
    textIdx++;
  }

  // Didn't match all characters
  if (searchIdx !== search.length) return 0;

  // Higher score for matches at the beginning
  const startBonus = text.startsWith(search) ? 0.5 : 0;

  return (score / maxScore) * 0.5 + startBonus;
}

export interface SearchableItem {
  id: string;
  label: string;
  searchText?: string; // Additional text to search
}

export function searchItems<T extends SearchableItem>(
  items: T[],
  searchTerm: string,
  minScore: number = 0.3
): T[] {
  if (!searchTerm.trim()) return items;

  return items
    .map((item) => {
      const searchableText = item.searchText
        ? `${item.label} ${item.searchText}`
        : item.label;
      const score = fuzzyMatch(searchTerm, searchableText);
      return { item, score };
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}
