import {
  materialSearchRelevanceScore,
  sortMaterialsBySearchRelevance,
} from '@/lib/pagination/materialSearchRelevance';

describe('materialSearchRelevance', () => {
  it('ranks word-start matches above later substring matches', () => {
    expect(materialSearchRelevanceScore('cutting blade', 'cutting')).toBeGreaterThan(
      materialSearchRelevanceScore('bosch cutting disc', 'cutting')
    );
  });

  it('sorts cutting blade before bosch cutting disc for query cutting', () => {
    const sorted = sortMaterialsBySearchRelevance(
      [{ name: 'bosch cutting disc' }, { name: 'cutting blade' }],
      'cutting'
    );
    expect(sorted.map((item) => item.name)).toEqual(['cutting blade', 'bosch cutting disc']);
  });
});
