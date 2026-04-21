import type { DocumentTemplate } from '@/lib/types/documentTemplate';
import type { WorkScheduleContext } from '@/lib/utils/templateData';

/** Session draft when creating a template from Settings (name + item type before editor). */
export const NEW_PRINT_TEMPLATE_SESSION_KEY = 'amfgi-new-print-template-v1';
export const WORK_SCHEDULE_PREVIEW_SESSION_KEY = 'amfgi-work-schedule-preview-v1';
export const WORK_SCHEDULE_PRINT_PAYLOAD_KEY = 'amfgi-work-schedule-print-payload-v1';
export const WORK_SCHEDULE_PRINT_CHANNEL = 'amfgi-work-schedule-print-channel-v1';

export type NewPrintTemplateDraft = {
  template: DocumentTemplate;
  /** Index in `printTemplates` where the new row belongs (usually `templates.length`). */
  insertIndex: number;
};

export type WorkSchedulePrintPayload = {
  printJobId: string;
  previewData: WorkScheduleContext;
  companyId: string;
  workDate: string;
  savedAt: string;
};
