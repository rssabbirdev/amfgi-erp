'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DocumentRenderer } from '@/components/print-builder/DocumentRenderer';
import type { WorkScheduleContext } from '@/lib/utils/templateData';
import type { DocumentTemplate } from '@/lib/types/documentTemplate';
import {
  WORK_SCHEDULE_PRINT_CHANNEL,
  WORK_SCHEDULE_PRINT_PAYLOAD_KEY,
  type WorkSchedulePrintPayload,
} from '@/lib/utils/printTemplateSession';
import { createWorkScheduleTemplateDraft } from '@/lib/utils/documentDefaults';
import { readCompanyDocumentTemplates } from '@/lib/utils/companyPrintTemplates';

type PrintState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; payload: WorkSchedulePrintPayload; template: DocumentTemplate };

export default function WorkSchedulePrintPage() {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') === 'download' ? 'download' : 'print';
  const requestedJobId = searchParams.get('job') ?? '';
  const [state, setState] = useState<PrintState>({ status: 'loading' });
  const pageSize =
    state.status === 'ready' && state.template.pageStyle?.pageOrientation === 'landscape'
      ? 'A4 landscape'
      : 'A4 portrait';

  const resolveTemplateForCompany = async (companyId: string, workDate: string): Promise<DocumentTemplate | null> => {
    try {
      const companyRes = await fetch(`/api/companies/${companyId}`, { cache: 'no-store' });
      if (!companyRes.ok) return null;
      const companyJson = await companyRes.json();
      const company = companyJson.data ?? companyJson;
      const templates = (() => {
        const parsed = readCompanyDocumentTemplates(company?.printTemplates);
        if (parsed.length > 0) return parsed;
        if (company?.printTemplate && typeof company.printTemplate === 'object') {
          return [company.printTemplate as DocumentTemplate];
        }
        return [];
      })();
      return (
        templates.find((template) => template.itemType === 'work-schedule' && template.isDefault) ??
        templates.find((template) => template.itemType === 'work-schedule') ??
        createWorkScheduleTemplateDraft(`template-${Date.now()}`, `Work Schedule PDF - ${workDate}`)
      );
    } catch {
      return null;
    }
  };

  useEffect(() => {
    let broadcastChannel: BroadcastChannel | null = null;
    const timer = window.setTimeout(() => {
      const loadPayload = async () => {
        try {
        const raw = localStorage.getItem(WORK_SCHEDULE_PRINT_PAYLOAD_KEY);
        if (!raw) {
          try {
            broadcastChannel = new BroadcastChannel(WORK_SCHEDULE_PRINT_CHANNEL);
            broadcastChannel.onmessage = async (event: MessageEvent<{ type?: string; payload?: WorkSchedulePrintPayload }>) => {
              if (event.data?.type !== 'work-schedule-print-payload' || !event.data.payload) return;
              if (requestedJobId && event.data.payload.printJobId !== requestedJobId) return;
              const template = await resolveTemplateForCompany(
                event.data.payload.companyId,
                event.data.payload.workDate,
              );
              if (!template) {
                setState({ status: 'missing' });
                broadcastChannel?.close();
                return;
              }
              setState({
                status: 'ready',
                payload: event.data.payload,
                template,
              });
              broadcastChannel?.close();
            };
          } catch {
            setState({ status: 'missing' });
          }
          return;
        }
        const payload = JSON.parse(raw) as Partial<WorkSchedulePrintPayload>;
        if (
          !payload?.previewData ||
          !payload?.companyId ||
          !payload?.workDate ||
          (requestedJobId && payload.printJobId !== requestedJobId)
        ) {
          try {
            broadcastChannel = new BroadcastChannel(WORK_SCHEDULE_PRINT_CHANNEL);
            broadcastChannel.onmessage = async (event: MessageEvent<{ type?: string; payload?: WorkSchedulePrintPayload }>) => {
              if (event.data?.type !== 'work-schedule-print-payload' || !event.data.payload) return;
              if (requestedJobId && event.data.payload.printJobId !== requestedJobId) return;
              const template = await resolveTemplateForCompany(
                event.data.payload.companyId,
                event.data.payload.workDate,
              );
              if (!template) {
                setState({ status: 'missing' });
                broadcastChannel?.close();
                return;
              }
              setState({
                status: 'ready',
                payload: event.data.payload,
                template,
              });
              broadcastChannel?.close();
            };
          } catch {
            setState({ status: 'missing' });
          }
          return;
        }
        const template = await resolveTemplateForCompany(
          String(payload.companyId),
          String(payload.workDate),
        );
        if (!template) {
          setState({ status: 'missing' });
          return;
        }
        setState({
          status: 'ready',
          payload: {
            printJobId: String(payload.printJobId ?? ''),
            previewData: payload.previewData as WorkScheduleContext,
            companyId: String(payload.companyId),
            workDate: String(payload.workDate),
            savedAt: String(payload.savedAt ?? new Date().toISOString()),
          },
          template,
        });
      } catch {
        setState({ status: 'missing' });
      }
      };
      void loadPayload();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      broadcastChannel?.close();
    };
  }, [requestedJobId]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    const title = `Work Schedule - ${state.payload.workDate}`;
    document.title = title;
    const timer = window.setTimeout(() => {
      window.print();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [state]);

  const helperText = useMemo(
    () =>
      mode === 'download'
        ? 'Choose "Save as PDF" in the browser print dialog to download the file.'
        : 'The browser print dialog should open automatically.',
    [mode]
  );

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-white px-6 py-10 text-slate-700">
        <p className="text-sm">Preparing schedule print preview...</p>
      </div>
    );
  }

  if (state.status === 'missing') {
    return (
      <div className="min-h-screen bg-white px-6 py-10 text-slate-700">
        <h1 className="text-lg font-semibold">No schedule print data found</h1>
        <p className="mt-2 text-sm text-slate-600">
          Return to the schedule page and use the Print or Download button again.
        </p>
      </div>
    );
  }

  return (
    <div className="schedule-print-root min-h-screen bg-white text-slate-900">
      <style jsx global>{`
        @page {
          size: ${pageSize};
          margin: 0;
        }

        html,
        body,
        .schedule-print-root,
        .schedule-print-root * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        html,
        body,
        .schedule-print-root {
          background: #ffffff !important;
          color: #0f172a !important;
          color-scheme: light !important;
        }

        @media print {
          html,
          body,
          .schedule-print-root {
            background: #fff !important;
            color: #0f172a !important;
            color-scheme: light !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          .schedule-print-toolbar {
            display: none !important;
          }
        }
      `}</style>

      <div className="schedule-print-toolbar sticky top-0 z-20 border-b border-slate-300 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Work Schedule - {state.payload.previewData.schedule.workDateLabel}
            </p>
            <p className="text-xs text-slate-600">{helperText}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {mode === 'download' ? 'Open Save as PDF' : 'Print'}
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl justify-center px-4 py-6 print:px-0 print:py-0">
        <DocumentRenderer
          template={state.template}
          data={state.payload.previewData}
          mode="print"
        />
      </div>
    </div>
  );
}
