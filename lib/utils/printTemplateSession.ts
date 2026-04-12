import type { DocumentTemplate } from '@/lib/types/documentTemplate';

/** Session draft when creating a template from Settings (name + item type before editor). */
export const NEW_PRINT_TEMPLATE_SESSION_KEY = 'amfgi-new-print-template-v1';

export type NewPrintTemplateDraft = {
  template: DocumentTemplate;
  /** Index in `printTemplates` where the new row belongs (usually `templates.length`). */
  insertIndex: number;
};
