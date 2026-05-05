import type { DocumentSection, ImageSection, SectionBuilderMeta } from '@/lib/types/documentTemplate';

type LegacyLetterhead = {
  type: 'letterhead';
  height: number;
  opacity: number;
  imageUrl?: string;
} & SectionBuilderMeta;

function letterheadToImage(s: LegacyLetterhead): DocumentSection {
  const hasTemplateUrl = Boolean(s.imageUrl?.trim());
  const meta: SectionBuilderMeta = {
    style: s.style,
    customBlockName: s.customBlockName,
    blockName: s.blockName,
    locked: s.locked,
    groupId: s.groupId,
  };
  const img: ImageSection = {
    type: 'image',
    heightMm: s.height,
    opacity: s.opacity,
    imageUrl: s.imageUrl,
    source: hasTemplateUrl ? 'url' : 'field',
    url: hasTemplateUrl ? s.imageUrl : undefined,
    field: hasTemplateUrl ? undefined : 'company.letterheadUrl',
    objectFit: 'contain',
    objectPosition: 'center',
    align: 'center',
    layout: 'fill',
    useCompanyLetterheadFallback: true,
    marginBottomMm: 2,
  };
  return { ...img, ...meta };
}

/**
 * Converts deprecated `letterhead` sections to unified `image` blocks.
 */
export function migrateLegacyDocumentSections(sections: DocumentSection[]): DocumentSection[] {
  return sections.map((sec) => {
    if ((sec as { type?: string }).type === 'letterhead') {
      return letterheadToImage(sec as unknown as LegacyLetterhead);
    }
    return sec;
  });
}
